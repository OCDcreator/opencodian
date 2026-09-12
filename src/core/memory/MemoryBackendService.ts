/**
 * `MemoryBackendService`: orchestrates the memory core against one
 * workspace through the injected filesystem port. All model contact goes
 * through the injected `MemoryModelInvoker` port (per call), which keeps
 * this module free of every agent backend — the product requirement.
 *
 * Every public method is fail-soft by contract: errors are caught and
 * reflected in the returned outcome, never thrown into a user turn.
 */

import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  evaluateExtractionGate,
  extractionSourceTag,
  type ExtractionTranscriptLine,
  formatTranscriptForPrompt,
  parseExtractionResponse,
  toExtractionLines,
} from './memoryExtraction';
import { planMemoryInjection, transcriptHasInjectionThisEpoch } from './memoryInjection';
import {
  forgetMemory,
  lintMemoryBucket,
  type MemoryLintReport,
  type MemoryStatusReport,
  readMemoryStatus,
} from './memoryMaintenance';
import {
  buildTopicManifest,
  type TopicManifestEntry,
} from './memoryManifest';
import {
  MEMORY_STORE_ROOT,
  memoryIndexPath,
  memoryProjectDir,
  modelMemoryRootDisplay,
} from './memoryPaths';
import {
  formatRecalledTopicFile,
  lexicalCandidates,
  type SelectedMemory,
} from './memoryRecall';
import {
  buildReflectionSystemPrompt,
  buildReflectionUserPrompt,
  parseReflectionResponse,
  planReflectionWrites,
} from './memoryReflection';
import {
  planProvenanceWrites,
  writeMemoryWrites,
} from './memoryStore';
import type {
  MemoryFileSystem,
  MemoryMetricEvent,
  MemoryModelInvoker,
  MemorySettingsSnapshot,
  MemoryTranscriptMessage,
} from './memoryTypes';
import { byteLength } from './memoryTypes';

/** How many lexical candidates get their bodies injected (semantic recall on). */
const SEMANTIC_RECALL_TOP_N = 3;

const METRICS_PATH = `${MEMORY_STORE_ROOT}/metrics.jsonl`;

export type MemoryInjectionOutcome = {
  text: string | null;
  skippedReason: string | null;
  indexBytes: number;
  protocolBytes: number;
  recalledPaths: string[];
  skippedSecretGuard: string[];
};

export type MemoryExtractionOutcome = {
  status: 'written' | 'skipped' | 'error';
  skipReason: string | null;
  writtenCount: number;
  writtenFiles: string[];
  modelCalls: number;
  error?: string;
};

export class MemoryBackendService {
  readonly projectDir: string;
  readonly indexPath: string;

  constructor(
    private readonly fs: MemoryFileSystem,
    private readonly workspacePath: string,
  ) {
    this.projectDir = memoryProjectDir(workspacePath);
    this.indexPath = memoryIndexPath(workspacePath);
  }

  /** Native absolute memory dir for protocol text / logging. */
  memoryRootNative(): string {
    return this.fs.nativeAbsolutePath(this.projectDir);
  }

  /** D22 twin: ensure the bucket exists; never auto-create MEMORY.md. */
  async ensureRoot(): Promise<void> {
    try {
      if (!(await this.fs.exists(this.projectDir))) {
        await this.fs.mkdir(this.projectDir);
      }
    } catch {
      // fail-soft: first write will retry the mkdir
    }
  }

  async readIndex(): Promise<string | null> {
    try {
      return await this.fs.readFile(this.indexPath);
    } catch {
      return null;
    }
  }

  async buildManifest(): Promise<TopicManifestEntry[]> {
    try {
      return await buildTopicManifest(this.fs, this.projectDir);
    } catch {
      return [];
    }
  }

  /**
   * Plan the per-epoch injection. `alreadyInjectedThisEpochOverride` lets
   * the runtime coordinator OR its in-memory epoch state into the pure
   * transcript marker scan (backends that do not persist the injected
   * part rely on that state).
   */
  async planInjection(input: {
    conversationId: string;
    messages: ReadonlyArray<MemoryTranscriptMessage>;
    latestUserText: string;
    settings: MemorySettingsSnapshot;
    alreadyInjectedThisEpochOverride?: boolean;
    nowMs?: number;
  }): Promise<MemoryInjectionOutcome> {
    try {
      const settings = input.settings;
      if (!settings.memoryBackendEnabled) {
        return await this.recordInjectionMetric(input.conversationId, {
          text: null,
          skippedReason: 'disabled',
          indexBytes: 0,
          protocolBytes: 0,
          recalledPaths: [],
          skippedSecretGuard: [],
        }, 'memory disabled');
      }

      const already =
        input.alreadyInjectedThisEpochOverride === true ||
        transcriptHasInjectionThisEpoch(input.messages);
      const [indexContent, manifest] = await Promise.all([
        this.readIndex(),
        this.buildManifest(),
      ]);

      let selectorResult: SelectedMemory[] | null = null;
      if (settings.memorySemanticRecallEnabled && input.latestUserText.trim()) {
        selectorResult = await this.selectRecallBodies(
          input.latestUserText,
          manifest,
          [],
          input.nowMs ?? Date.now(),
        );
      }

      const plan = planMemoryInjection({
        messages: input.messages,
        memoryIndexContent: indexContent,
        manifest,
        settings,
        memoryRootDisplay: modelMemoryRootDisplay(this.memoryRootNative()),
        modelMemoryIndexPath: this.fs.nativeAbsolutePath(this.indexPath),
        alreadyInjectedThisEpoch: already,
        selectorResult,
      });

      return await this.recordInjectionMetric(
        input.conversationId,
        {
          text: plan.text,
          skippedReason: plan.skippedReason,
          indexBytes: plan.indexBytes,
          protocolBytes: plan.protocolBytes,
          recalledPaths: plan.recalledPaths,
          skippedSecretGuard: plan.skippedSecretGuard,
        },
        plan.skippedReason ?? `injected ${plan.protocolBytes}B protocol + ${plan.indexBytes}B index`,
      );
    } catch (error) {
      // fail-soft: a broken store must never block a user turn
      return {
        text: null,
        skippedReason: 'error',
        indexBytes: 0,
        protocolBytes: 0,
        recalledPaths: [],
        skippedSecretGuard: [],
        ...(error instanceof Error ? { error: error.message } : {}),
      } as MemoryInjectionOutcome;
    }
  }

  /**
   * Per-turn background extraction (D24–D27). Returns a machine-checkable
   * outcome; never throws.
   */
  async runExtraction(input: {
    conversationId: string;
    messages: ReadonlyArray<MemoryTranscriptMessage>;
    sessionId: string;
    settings: MemorySettingsSnapshot;
    invoker: MemoryModelInvoker;
    /** Message count at the previous extraction for this conversation. */
    lastExtractedMessageCount: number;
  }): Promise<MemoryExtractionOutcome> {
    const skipped = async (reason: string, detail: string): Promise<MemoryExtractionOutcome> => {
      await this.appendMetric({
        ts: Date.now(),
        kind: 'extraction-skipped',
        conversationId: input.conversationId,
        detail: reason,
        bytes: 0,
      });
      return { status: 'skipped', skipReason: reason, writtenCount: 0, writtenFiles: [], modelCalls: 0, ...(detail ? {} : {}) };
    };

    try {
      if (!input.settings.memoryBackendEnabled || !input.settings.memoryExtractionEnabled) {
        return await skipped('extraction-disabled', '');
      }
      const lines = toExtractionLines(input.messages);
      const gate = evaluateExtractionGate({
        lines,
        lastExtractedMessageCount: input.lastExtractedMessageCount,
        projectDir: this.projectDir,
        memoryRootNative: this.memoryRootNative(),
      });
      if (!gate.proceed) {
        return await skipped(gate.skipReason ?? 'gate', '');
      }

      const [indexContent, manifest] = await Promise.all([
        this.readIndex(),
        this.buildManifest(),
      ]);
      const system = buildExtractionSystemPrompt();
      const user = buildExtractionUserPrompt({
        transcript: formatTranscriptForPrompt(lines),
        indexContent,
      });
      const reply = await input.invoker.invoke({
        system,
        user,
        modelRef: input.settings.memoryExtractionModel,
        title: 'opencodian memory extraction',
      });
      const memories = parseExtractionResponse(reply);
      if (memories.length === 0) {
        await this.appendMetric({
          ts: Date.now(),
          kind: 'extraction-skipped',
          conversationId: input.conversationId,
          detail: 'model-returned-empty',
          bytes: 0,
        });
        return { status: 'skipped', skipReason: 'model-returned-empty', writtenCount: 0, writtenFiles: [], modelCalls: 1 };
      }

      const plan = planProvenanceWrites({
        memories,
        projectDir: this.projectDir,
        existingFilenames: manifest.map((e) => e.filename),
        source: extractionSourceTag(input.sessionId),
      });
      if (plan.writes.length === 0) {
        await this.appendMetric({
          ts: Date.now(),
          kind: 'extraction-skipped',
          conversationId: input.conversationId,
          detail: 'filename-conflict',
          bytes: 0,
        });
        return { status: 'skipped', skipReason: 'filename-conflict', writtenCount: 0, writtenFiles: [], modelCalls: 1 };
      }
      await this.ensureRoot();
      const written = await writeMemoryWrites({
        fs: this.fs,
        writes: plan.writes,
        indexPath: this.indexPath,
      });
      await this.appendMetric({
        ts: Date.now(),
        kind: 'extraction',
        conversationId: input.conversationId,
        detail: `wrote ${written} file(s) [${plan.writes.map((w) => w.filename).join(', ')}]`,
        bytes: plan.writes.reduce((n, w) => n + byteLength(w.content), 0),
      });
      return {
        status: 'written',
        skipReason: null,
        writtenCount: written,
        writtenFiles: plan.writes.map((w) => w.filename),
        modelCalls: 1,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.appendMetric({
        ts: Date.now(),
        kind: 'extraction-skipped',
        conversationId: input.conversationId,
        detail: `error: ${message}`,
        bytes: 0,
      }).catch(() => undefined);
      return { status: 'error', skipReason: null, writtenCount: 0, writtenFiles: [], modelCalls: 1, error: message };
    }
  }

  /**
   * Post-compaction reflection (D12/D27): distills ≤3 memories from the
   * full transcript with `compacted <session>` provenance. Never throws.
   */
  async runReflection(input: {
    conversationId: string;
    messages: ReadonlyArray<MemoryTranscriptMessage>;
    sessionId: string;
    settings: MemorySettingsSnapshot;
    invoker: MemoryModelInvoker;
  }): Promise<MemoryExtractionOutcome> {
    try {
      if (!input.settings.memoryBackendEnabled) {
        return { status: 'skipped', skipReason: 'disabled', writtenCount: 0, writtenFiles: [], modelCalls: 0 };
      }
      const lines = toExtractionLines(input.messages);
      if (lines.length === 0) {
        return { status: 'skipped', skipReason: 'empty-transcript', writtenCount: 0, writtenFiles: [], modelCalls: 0 };
      }
      const [indexContent, manifest] = await Promise.all([
        this.readIndex(),
        this.buildManifest(),
      ]);
      const reply = await input.invoker.invoke({
        system: buildReflectionSystemPrompt(),
        user: buildReflectionUserPrompt({
          transcript: formatTranscriptForPrompt(lines),
          indexContent,
        }),
        modelRef: input.settings.memoryExtractionModel,
        title: 'opencodian memory reflection',
      });
      const memories = parseReflectionResponse(reply);
      if (memories.length === 0) {
        await this.appendMetric({
          ts: Date.now(),
          kind: 'reflection-skipped',
          conversationId: input.conversationId,
          detail: 'model-returned-empty',
          bytes: 0,
        });
        return { status: 'skipped', skipReason: 'model-returned-empty', writtenCount: 0, writtenFiles: [], modelCalls: 1 };
      }
      const plan = planReflectionWrites({
        memories,
        projectDir: this.projectDir,
        existingFilenames: manifest.map((e) => e.filename),
        sourceSessionID: input.sessionId,
      });
      await this.ensureRoot();
      const written = await writeMemoryWrites({
        fs: this.fs,
        writes: plan.writes,
        indexPath: this.indexPath,
      });
      await this.appendMetric({
        ts: Date.now(),
        kind: 'reflection',
        conversationId: input.conversationId,
        detail: `wrote ${written} file(s) [${plan.writes.map((w) => w.filename).join(', ')}]`,
        bytes: plan.writes.reduce((n, w) => n + byteLength(w.content), 0),
      });
      return {
        status: 'written',
        skipReason: null,
        writtenCount: written,
        writtenFiles: plan.writes.map((w) => w.filename),
        modelCalls: 1,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.appendMetric({
        ts: Date.now(),
        kind: 'reflection-skipped',
        conversationId: input.conversationId,
        detail: `error: ${message}`,
        bytes: 0,
      }).catch(() => undefined);
      return { status: 'error', skipReason: null, writtenCount: 0, writtenFiles: [], modelCalls: 1, error: message };
    }
  }

  /**
   * Detect that the conversation gained a compaction marker since the last
   * seen marker count (backend-neutral compaction signal, D-O6).
   */
  static compactionMarkerCount(
    messages: ReadonlyArray<MemoryTranscriptMessage>,
  ): number {
    let count = 0;
    for (const m of messages) {
      if (m.summary || m.compactionDivider) count++;
    }
    return count;
  }

  /** Read-only lint report (secret hits, missing importance, stray files). */
  async lint(): Promise<MemoryLintReport> {
    const [indexContent, manifest] = await Promise.all([
      this.readIndex(),
      this.buildManifest(),
    ]);
    return lintMemoryBucket({
      fs: this.fs,
      projectDir: this.projectDir,
      indexPath: this.indexPath,
      indexContent,
      manifest,
    });
  }

  /** Read-only status report for the maintenance command. */
  async status(): Promise<MemoryStatusReport> {
    const [indexContent, manifest] = await Promise.all([
      this.readIndex(),
      this.buildManifest(),
    ]);
    return readMemoryStatus({
      fs: this.fs,
      projectDir: this.projectDir,
      indexContent,
      manifest,
    });
  }

  /** Forget flow: delete the topic file(s) named `name` and their index lines. */
  async forget(name: string): Promise<{ removed: string[] }> {
    const { removed } = await forgetMemory({
      fs: this.fs,
      projectDir: this.projectDir,
      indexPath: this.indexPath,
      name,
    });
    await this.appendMetric({
      ts: Date.now(),
      kind: 'maintenance',
      conversationId: '-',
      detail: `forget ${name}: removed ${removed.join(', ') || 'nothing'}`,
      bytes: 0,
    });
    return { removed };
  }

  private async selectRecallBodies(
    query: string,
    manifest: TopicManifestEntry[],
    alreadyRecalledPaths: string[],
    nowMs: number,
  ): Promise<SelectedMemory[]> {
    const candidates = lexicalCandidates(query, manifest).slice(0, SEMANTIC_RECALL_TOP_N);
    const out: SelectedMemory[] = [];
    for (const entry of candidates) {
      if (alreadyRecalledPaths.includes(entry.filePath)) continue;
      const raw = await this.fs.readFile(entry.filePath).catch(() => null);
      if (raw === null) continue;
      out.push(
        formatRecalledTopicFile({
          filePath: entry.filePath,
          mtimeMs: entry.mtimeMs,
          nowMs,
          rawContent: raw,
        }),
      );
    }
    return out;
  }

  private async recordInjectionMetric(
    conversationId: string,
    outcome: MemoryInjectionOutcome,
    detail: string,
  ): Promise<MemoryInjectionOutcome> {
    const event: MemoryMetricEvent = {
      ts: Date.now(),
      kind: outcome.text ? 'injection' : 'injection-skipped',
      conversationId,
      detail,
      bytes: outcome.protocolBytes + outcome.indexBytes,
    };
    await this.appendMetric(event).catch(() => undefined);
    if (outcome.text) {
      await this.fs.writeFile(
        `${this.projectDir}/.last-injection.json`,
        JSON.stringify(event, null, 2),
      ).catch(() => undefined);
    }
    return outcome;
  }

  /** Append-only metrics journal under the store root. */
  async appendMetric(event: MemoryMetricEvent): Promise<void> {
    try {
      if (!(await this.fs.exists(MEMORY_STORE_ROOT))) {
        await this.fs.mkdir(MEMORY_STORE_ROOT);
      }
      const current = (await this.fs.readFile(METRICS_PATH)) ?? '';
      await this.fs.writeFile(METRICS_PATH, `${current}${JSON.stringify(event)}\n`);
    } catch {
      // metrics are diagnostics; never fail a turn for them
    }
  }

  /** Test/inspection helper: read every metric event. */
  async readMetrics(): Promise<MemoryMetricEvent[]> {
    const raw = await this.fs.readFile(METRICS_PATH).catch(() => null);
    if (!raw) return [];
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as MemoryMetricEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is MemoryMetricEvent => e !== null);
  }

  /** Lines type re-export for callers building transcripts. */
  static toExtractionLines(messages: ReadonlyArray<MemoryTranscriptMessage>): ExtractionTranscriptLine[] {
    return toExtractionLines(messages);
  }
}

/**
 * `MemoryBackendService`: orchestrates the memory core against one
 * workspace through the injected filesystem port. All model contact goes
 * through the injected `MemoryModelInvoker` port (per call), which keeps
 * this module free of every agent backend — the product requirement.
 *
 * Every public method is fail-soft by contract: errors are caught and
 * reflected in the returned outcome, never thrown into a user turn.
 */

import { runMemoryAgent } from './memoryAgentExtraction';
import {
  evaluateExtractionGate,
  extractionSourceTag,
  formatTranscriptForPrompt,
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
  memoryProjectDir,
  modelMemoryRootDisplay,
} from './memoryPaths';
import { assembleRelevantMemory, MemoryRecallSelector, type SelectedMemory } from './memoryRecall';
import {
  buildReflectionSystemPrompt,
  buildReflectionUserPrompt,
  parseReflectionResponse,
  planReflectionWrites,
} from './memoryReflection';
import { scanForSecrets } from './memorySecretScan';
import {
  writeMemoryWrites,
} from './memoryStore';
import type {
  MemoryEmbeddingInvoker,
  MemoryFileSystem,
  MemoryMetricEvent,
  MemoryModelInvoker,
  MemorySettingsSnapshot,
  MemoryTranscriptMessage,
} from './memoryTypes';
import { byteLength } from './memoryTypes';

const METRICS_PATH = `${MEMORY_STORE_ROOT}/metrics.jsonl`;

export type MemoryInjectionOutcome = {
  text: string | null;
  skippedReason: string | null;
  indexBytes: number;
  protocolBytes: number;
  recalledPaths: string[];
  skippedSecretGuard: string[];
  recalledContentCharacters?: number;
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
  private readonly agentKey?: string;
  private readonly selector: MemoryRecallSelector;
  private readonly metricsFs: MemoryFileSystem;

  /**
   * Store-layout overrides for shared-store mode: `projectDir` points the
   * service at an absolute external bucket (opencode-zmem / ZCode layout)
   * while `metricsFs` keeps the metrics journal on a different filesystem —
   * the vault — so diagnostics never pollute the shared tree.
   */
  constructor(
    private readonly fs: MemoryFileSystem,
    private readonly workspacePath: string,
    overrides?: {
      projectDir?: string;
      metricsFs?: MemoryFileSystem;
      agentKey?: string;
    },
  ) {
    this.projectDir = overrides?.projectDir ?? memoryProjectDir(workspacePath);
    this.indexPath = `${this.projectDir}/MEMORY.md`;
    this.metricsFs = overrides?.metricsFs ?? fs;
    this.agentKey = overrides?.agentKey;
    this.selector = new MemoryRecallSelector(fs, this.projectDir);
  }

  /** Native absolute memory dir for protocol text / logging. */
  memoryRootNative(): string {
    return this.fs.nativeAbsolutePath(this.projectDir);
  }

  /** D22 twin: ensure the bucket exists; never auto-create MEMORY.md. */
  async ensureRoot(): Promise<void> {
    try {
      await this.fs.validatePath?.(this.projectDir, this.projectDir);
      if (!(await this.fs.exists(this.projectDir))) {
        await this.fs.mkdir(this.projectDir);
      }
    } catch {
      // fail-soft: first write will retry the mkdir
    }
  }

  async readIndex(): Promise<string | null> {
    try {
      await this.fs.validatePath?.(this.projectDir, this.indexPath);
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
    invoker?: MemoryModelInvoker;
    embedding?: MemoryEmbeddingInvoker | null;
    alreadyRecalledPaths?: string[];
    alreadyRecalledContentCharacters?: number;
  }): Promise<MemoryInjectionOutcome> {
    try {
      const settings = input.settings;
      if (!settings.memoryBackendEnabled) {
        // Disabled is the steady state, not an event: return without a
        // metric so a dark memory backend performs zero vault writes.
        return {
          text: null,
          skippedReason: 'disabled',
          indexBytes: 0,
          protocolBytes: 0,
          recalledPaths: [],
          skippedSecretGuard: [],
        };
      }

      const already =
        input.alreadyInjectedThisEpochOverride === true ||
        transcriptHasInjectionThisEpoch(input.messages, this.memoryRootNative());
      if (already && !settings.memorySemanticRecallEnabled) {
        // Same reasoning as disabled: per-turn epoch skips must not grow
        // the metrics journal.
        return {
          text: null,
          skippedReason: 'already-injected-this-epoch',
          indexBytes: 0,
          protocolBytes: 0,
          recalledPaths: [],
          skippedSecretGuard: [],
        };
      }
      const [indexContent, manifest] = await Promise.all([
        this.readIndex(),
        this.buildManifest(),
      ]);

      let selectorResult: SelectedMemory[] | null = null;
      if (settings.memorySemanticRecallEnabled && input.latestUserText.trim()) {
        selectorResult = await this.selector.select({ query: input.latestUserText, manifest,
          alreadyRecalledPaths: input.alreadyRecalledPaths ?? [], nowMs: input.nowMs ?? Date.now(),
          invoker: input.invoker, embedding: input.embedding });
      }

      if (already) {
        const recall = assembleRelevantMemory({ selected: selectorResult,
          alreadyRecalledPaths: input.alreadyRecalledPaths,
          alreadyRecalledContentCharacters: input.alreadyRecalledContentCharacters });
        return { text: recall.relevantMemory, skippedReason: recall.relevantMemory ? null : 'already-injected-this-epoch',
          indexBytes: 0, protocolBytes: 0, recalledPaths: recall.recalledPaths,
          skippedSecretGuard: recall.skippedSecretGuard, recalledContentCharacters: recall.recalledContentCharacters };
      }
      const plan = planMemoryInjection({
        agentKey: this.agentKey,
        messages: input.messages,
        memoryIndexContent: indexContent,
        manifest,
        settings,
        memoryRootDisplay: modelMemoryRootDisplay(this.memoryRootNative()),
        modelMemoryIndexPath: this.fs.nativeAbsolutePath(this.indexPath),
        alreadyInjectedThisEpoch: already,
        selectorResult,
        alreadyRecalledPaths: input.alreadyRecalledPaths,
        alreadyRecalledContentCharacters: input.alreadyRecalledContentCharacters,
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
          recalledContentCharacters: plan.recalledContentCharacters,
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
    isCurrent?: () => boolean;
  }): Promise<MemoryExtractionOutcome> {
    let modelCalls = 0;
    /**
     * Steady-state skips (disabled, transcript-not-grown, prose threshold)
     * are not events: they must not write metrics on every turn or a dark
     * memory backend performs per-turn disk churn. Eventful outcomes
     * (turn-wrote-memory, model-returned-empty, written, error) persist.
     */
    const steadySkip = (reason: string): MemoryExtractionOutcome => ({
      status: 'skipped',
      skipReason: reason,
      writtenCount: 0,
      writtenFiles: [],
      modelCalls: 0,
    });
    const skipped = async (reason: string): Promise<MemoryExtractionOutcome> => {
      await this.appendMetric({
        ts: Date.now(),
        kind: 'extraction-skipped',
        conversationId: input.conversationId,
        detail: reason,
        bytes: 0,
      });
      return steadySkip(reason);
    };

    try {
      if (!input.settings.memoryBackendEnabled || !input.settings.memoryExtractionEnabled) {
        return steadySkip('extraction-disabled');
      }
      const lines = toExtractionLines(input.messages);
      const watermark = toExtractionLines(input.messages.slice(0, input.lastExtractedMessageCount)).length;
      const gate = evaluateExtractionGate({
        lines,
        lastExtractedMessageCount: watermark,
        projectDir: this.projectDir,
        memoryRootNative: this.memoryRootNative(),
      });
      if (!gate.proceed) {
        const reason = gate.skipReason ?? 'gate';
        if (reason === 'turn-wrote-memory') return await skipped(reason);
        return steadySkip(reason);
      }

      const [indexContent, manifest] = await Promise.all([this.readIndex(), this.buildManifest()]);
      const result = await runMemoryAgent({ fs: this.fs, projectDir: this.projectDir,
        indexContent, manifest, transcript: formatTranscriptForPrompt(lines.slice(watermark)),
        source: extractionSourceTag(input.sessionId), invoker: { invoke: request => {
          modelCalls++;
          return input.invoker.invoke(request);
        } },
        modelRef: input.settings.memoryExtractionModel, isCurrent: input.isCurrent, agentKey: this.agentKey });
      const written = result.writtenFiles.length;
      await this.appendMetric({ ts: Date.now(), kind: written ? 'extraction' : 'extraction-skipped',
        conversationId: input.conversationId, detail: written ? `wrote ${written} file(s)` : 'model-returned-empty', bytes: 0 });
      return { status: written ? 'written' : 'skipped', skipReason: written ? null : 'model-returned-empty',
        writtenCount: written, writtenFiles: result.writtenFiles, modelCalls: result.modelCalls };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.appendMetric({
        ts: Date.now(),
        kind: 'extraction-skipped',
        conversationId: input.conversationId,
        detail: `error: ${message}`,
        bytes: 0,
      }).catch(() => undefined);
      return { status: 'error', skipReason: null, writtenCount: 0, writtenFiles: [], modelCalls, error: message };
    }
  }

  /**
   * Post-compaction reflection (D12/D27): distills ≤3 memories from the
   * full transcript with `compacted <session>` provenance. Never throws.
   */
  async runReflection(input: {
    isCurrent?: () => boolean;
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
        purpose: 'reflection',
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
      plan.writes = plan.writes.filter(write => !scanForSecrets(write.content).hit);
      if (input.isCurrent && !input.isCurrent()) throw new Error('memory-settings-changed');
      await this.ensureRoot();
      for (const write of plan.writes) await this.fs.validatePath?.(this.projectDir, write.filePath);
      await this.fs.validatePath?.(this.projectDir, this.indexPath);
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
      await this.fs.validatePath?.(this.projectDir, `${this.projectDir}/.last-injection.json`);
      await this.fs.writeFile(
        `${this.projectDir}/.last-injection.json`,
        JSON.stringify(event, null, 2),
      ).catch(() => undefined);
    }
    return outcome;
  }

  /** Metrics journal retention cap (append-only, oldest entries dropped). */
  private static readonly METRICS_MAX_ENTRIES = 500;

  /** Append-only metrics journal under the store root (bounded). */
  async appendMetric(event: MemoryMetricEvent): Promise<void> {
    try {
      if (!(await this.metricsFs.exists(MEMORY_STORE_ROOT))) {
        await this.metricsFs.mkdir(MEMORY_STORE_ROOT);
      }
      const current = (await this.metricsFs.readFile(METRICS_PATH)) ?? '';
      const lines = current.split('\n').filter((line) => line.trim().length > 0);
      lines.push(JSON.stringify(event));
      const kept = lines.length > MemoryBackendService.METRICS_MAX_ENTRIES
        ? lines.slice(lines.length - MemoryBackendService.METRICS_MAX_ENTRIES)
        : lines;
      await this.metricsFs.writeFile(METRICS_PATH, `${kept.join('\n')}\n`);
    } catch {
      // metrics are diagnostics; never fail a turn for them
    }
  }

  /** Test/inspection helper: read every metric event. */
  async readMetrics(): Promise<MemoryMetricEvent[]> {
    const raw = await this.metricsFs.readFile(METRICS_PATH).catch(() => null);
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

}

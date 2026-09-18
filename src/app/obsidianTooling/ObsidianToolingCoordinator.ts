/**
 * ObsidianToolingCoordinator — runtime owner of the R-B4 Obsidian native
 * tooling (route A: official desktop CLI through the generated gate wrapper).
 *
 * Responsibilities (composition-free; `main.ts` only constructs/disposes):
 * - lifecycle keyed off `obsidianToolingMode`: when the mode is not `cli`
 *   NOTHING runs (no probe, no watcher, no files written) — zero cost off;
 * - provisioning `.opencodian/obsidian-tooling/` with the generated gate
 *   script (rewritten only when its content changes) and the requests dir;
 * - watching the requests dir (fs.watch + a slow safety sweep) so the gate
 *   wrapper's confirmation requests surface as a real user dialog;
 * - fail-closed request intake: malformed/unknown requests get an `invalid`
 *   decision, unanswered requests expire, modal dismissal counts as deny;
 * - the backend-neutral injection plan (once per context epoch) consumed by
 *   `MessageSendPreparationService` through the same options-bag seam as the
 *   memory injection.
 *
 * Honest capability boundary (requirement §11.3 / §6.7): the gate enforces
 * the sanctioned path by mechanism; a same-user process (including a
 * misbehaving model) can still call the raw CLI or forge decision files.
 * That residual risk is documented, not hidden.
 */

import * as nodeFs from 'fs';
import type { App, DataAdapter } from 'obsidian';
import { Notice, Platform } from 'obsidian';
import { normalizePath } from 'obsidian';
import * as nodePath from 'path';

import {
  buildDecisionDocument,
  buildGateScript,
  buildObsidianToolingBlock,
  OBSIDIAN_GATE_SCRIPT_FILENAME,
  OBSIDIAN_TOOLING_DIR,
  OBSIDIAN_TOOLING_GATE_WAIT_DEFAULT_SECONDS,
  OBSIDIAN_TOOLING_REQUEST_EXPIRY_MS,
  OBSIDIAN_TOOLING_REQUESTS_DIRNAME,
  type ObsidianCliProbeResult,
  type ObsidianToolingDecision,
  type ObsidianToolingRequest,
  type ObsidianToolingStatusSnapshot,
  parseToolingRequest,
  planToolingInjection,
  probeObsidianCli,
  toolingEpochMarkerCount,
  toolingRequestIdFromFilename,
  type ToolingTranscriptMessage,
} from '../../core/obsidianTooling';
import type { ObsidianToolingMode } from '../../core/types';
import { createLogger } from '../../shared';
import { type ObsidianToolingApprovalChoice,ObsidianToolingApprovalModal } from './ObsidianToolingApprovalModal';

const logger = createLogger('ObsidianToolingCoordinator');

/** How often the safety sweep re-scans the requests dir (fs.watch is primary). */
const REQUEST_SWEEP_INTERVAL_MS = 15_000;
/** Grace before processed request/decision files are cleaned up. */
const REQUEST_CLEANUP_DELAY_MS = 30_000;

export class ObsidianToolingCoordinator {
  private readonly app: App;
  private readonly getMode: () => ObsidianToolingMode;
  private readonly probeFn: () => Promise<ObsidianCliProbeResult>;

  private watcher: nodeFs.FSWatcher | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private probeCache: ObsidianCliProbeResult | null = null;
  private probeInFlight: Promise<ObsidianCliProbeResult> | null = null;
  private gateReady = false;
  private disposed = false;

  /** Requests awaiting (or showing) their modal, oldest first. */
  private readonly pendingRequests: ObsidianToolingRequest[] = [];
  private modalOpen = false;
  /** Basenames already decided/handled, so the sweep does not double-answer. */
  private readonly handledRequestIds = new Set<string>();

  /** Per-conversation compaction watermark of the last tooling injection. */
  private readonly injectedEpochs = new Map<string, number>();

  constructor(options: {
    app: App;
    getMode: () => ObsidianToolingMode;
    /** Injectable CLI probe (tests); defaults to the real `obsidian version` probe. */
    probe?: () => Promise<ObsidianCliProbeResult>;
  }) {
    this.app = options.app;
    this.getMode = options.getMode;
    this.probeFn = options.probe ?? (async () => probeObsidianCli({}));
  }

  // --- lifecycle -------------------------------------------------------------

  /**
   * Sync runtime state to the current settings value. Safe to call on every
   * settings save; no-ops when nothing changed (mode off is the steady state).
   */
  async applySettings(): Promise<void> {
    if (this.disposed) return;
    const mode = this.getMode();
    if (mode !== 'cli' || !this.isSupportedPlatform()) {
      this.teardownWatcher();
      this.gateReady = false;
      this.expireAllPending();
      if (mode !== 'cli') {
        // Off (or reserved mcp) is a zero-cost steady state: drop probe state too.
        this.probeCache = null;
        this.probeInFlight = null;
        this.injectedEpochs.clear();
      }
      return;
    }
    try {
      await this.provisionGate();
      this.startWatcher();
      void this.refreshProbe();
    } catch (error) {
      this.gateReady = false;
      logger.warn('obsidian tooling provisioning failed; capability stays unavailable', { error });
      new Notice('OpenCodian: Obsidian tooling provisioning failed (see console)');
    }
  }

  dispose(): void {
    this.disposed = true;
    this.teardownWatcher();
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.pendingRequests.length = 0;
    this.handledRequestIds.clear();
    this.injectedEpochs.clear();
  }

  // --- status / probe ----------------------------------------------------------

  isSupportedPlatform(): boolean {
    return Platform.isDesktopApp && !Platform.isWin;
  }

  getStatus(): ObsidianToolingStatusSnapshot {
    return {
      mode: this.getMode(),
      desktopSupported: Platform.isDesktopApp,
      platformSupported: this.isSupportedPlatform(),
      gateReady: this.gateReady,
      cli: this.probeCache,
      pendingRequests: this.pendingRequests.length,
    };
  }

  /** Re-run the CLI probe (settings "re-check" button). */
  async refreshProbe(): Promise<ObsidianCliProbeResult> {
    if (this.probeInFlight) return this.probeInFlight;
    const promise = this.probeFn()
      .then((result) => {
        this.probeCache = result;
        this.probeInFlight = null;
        return result;
      })
      .catch((error): ObsidianCliProbeResult => {
        this.probeCache = { status: 'error', detail: error instanceof Error ? error.message : String(error) };
        this.probeInFlight = null;
        return this.probeCache;
      });
    this.probeInFlight = promise;
    return promise;
  }

  // --- backend-neutral injection seam -------------------------------------------

  /**
   * Plan the once-per-epoch tooling injection for a conversation. Mirrors the
   * memory runtime port: fail-soft, null when nothing should be injected.
   */
  planInjection(input: {
    conversationId: string;
    messages: ReadonlyArray<ToolingTranscriptMessage>;
  }): { text: string } | null {
    const mode = this.getMode();
    if (mode !== 'cli' || this.disposed) {
      return null;
    }
    const supported = this.isSupportedPlatform();
    const cli = this.probeCache;
    const available = supported && cli?.status === 'available' && this.gateReady;
    const blockText = buildObsidianToolingBlock({
      availability: available ? 'available' : 'unavailable',
      gatePath: this.gateScriptNativePath(),
      cliCommand: 'obsidian',
      ...(cli && !available ? { unavailableReason: describeProbe(cli) } : {}),
    });
    const plan = planToolingInjection({
      blockText,
      messages: input.messages,
      injectedEpochMarkerCount: this.injectedEpochs.get(input.conversationId),
    });
    if (plan.text) {
      this.injectedEpochs.set(
        input.conversationId,
        toolingEpochMarkerCount(input.messages),
      );
    }
    return plan.text ? { text: plan.text } : null;
  }

  // --- gate provisioning ---------------------------------------------------------

  private adapter(): DataAdapter {
    return this.app.vault.adapter;
  }

  private vaultBasePath(): string {
    return (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? '.';
  }

  private toolingDirNativePath(): string {
    return nodePath.join(this.vaultBasePath(), OBSIDIAN_TOOLING_DIR);
  }

  private requestsDirNativePath(): string {
    return nodePath.join(this.toolingDirNativePath(), OBSIDIAN_TOOLING_REQUESTS_DIRNAME);
  }

  private gateScriptNativePath(): string {
    return nodePath.join(this.toolingDirNativePath(), OBSIDIAN_GATE_SCRIPT_FILENAME);
  }

  private gateScriptVaultPath(): string {
    return normalizePath(nodePath.join(OBSIDIAN_TOOLING_DIR, OBSIDIAN_GATE_SCRIPT_FILENAME));
  }

  private async provisionGate(): Promise<void> {
    const adapter = this.adapter();
    for (const dir of [OBSIDIAN_TOOLING_DIR, `${OBSIDIAN_TOOLING_DIR}/${OBSIDIAN_TOOLING_REQUESTS_DIRNAME}`]) {
      if (!(await adapter.exists(normalizePath(dir)))) {
        await adapter.mkdir(normalizePath(dir));
      }
    }
    const script = buildGateScript({ waitSeconds: OBSIDIAN_TOOLING_GATE_WAIT_DEFAULT_SECONDS });
    const vaultPath = this.gateScriptVaultPath();
    let existing: string | null = null;
    try {
      existing = await adapter.read(vaultPath);
    } catch {
      existing = null;
    }
    if (existing !== script) {
      await adapter.write(vaultPath, script);
    }
    try {
      nodeFs.chmodSync(this.gateScriptNativePath(), 0o755);
    } catch (error) {
      logger.warn('failed to chmod gate script executable', { error });
    }
    this.gateReady = true;
  }

  // --- request watcher -----------------------------------------------------------

  private startWatcher(): void {
    if (this.watcher || this.disposed) return;
    const dir = this.requestsDirNativePath();
    try {
      this.watcher = nodeFs.watch(dir, (eventType, filename) => {
        if (eventType === 'rename' && filename && toolingRequestIdFromFilename(filename)) {
          // Defer slightly so the writer's rename completes and the file is readable.
          setTimeout(() => {
            void this.sweepRequests();
          }, 150);
        }
      });
      this.watcher.on('error', (error) => {
        logger.warn('obsidian tooling request watcher failed; falling back to sweep only', { error });
      });
    } catch (error) {
      logger.warn('obsidian tooling request watcher could not start; sweep only', { error });
      this.watcher = null;
    }
    if (!this.sweepTimer) {
      this.sweepTimer = setInterval(() => {
        void this.sweepRequests();
      }, REQUEST_SWEEP_INTERVAL_MS);
    }
  }

  private teardownWatcher(): void {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {
        // best-effort
      }
      this.watcher = null;
    }
  }

  /**
   * Scan the requests dir: surface new requests as confirmation dialogs,
   * expire stale ones, clean up processed files. Fail-soft end to end.
   */
  private async sweepRequests(): Promise<void> {
    if (this.disposed || this.getMode() !== 'cli') return;
    const adapter = this.adapter();
    const requestsVaultPath = normalizePath(`${OBSIDIAN_TOOLING_DIR}/${OBSIDIAN_TOOLING_REQUESTS_DIRNAME}`);
    let listing: string[];
    try {
      listing = (await adapter.list(requestsVaultPath)).files.map((file) => nodePath.basename(file));
    } catch {
      return; // dir missing — nothing to do
    }
    const now = Date.now();
    for (const filename of listing) {
      const requestId = toolingRequestIdFromFilename(filename);
      if (!requestId || this.handledRequestIds.has(requestId)) continue;
      let raw: string | null = null;
      try {
        raw = await adapter.read(normalizePath(`${requestsVaultPath}/${filename}`));
      } catch {
        raw = null; // tmp rename race — next sweep retries
      }
      if (raw === null) continue;
      this.handledRequestIds.add(requestId);
      const parsed = parseToolingRequest(raw);
      if (!parsed.ok) {
        // Fail closed: answer malformed requests so a polling wrapper stops early.
        await this.writeDecision(requestId, 'invalid', now);
        continue;
      }
      this.pendingRequests.push(parsed.request);
    }

    // Expire requests that waited past their wrapper wait + margin.
    for (const request of [...this.pendingRequests]) {
      if (now - request.requestedAt * 1000 > Math.max(request.waitSeconds * 1000, OBSIDIAN_TOOLING_REQUEST_EXPIRY_MS)) {
        this.removeFromPending(request.id);
        await this.writeDecision(request.id, 'expired', now);
      }
    }

    this.pumpModalQueue();
    void this.cleanupProcessedRequests();
  }

  private removeFromPending(requestId: string): void {
    const index = this.pendingRequests.findIndex((request) => request.id === requestId);
    if (index >= 0) this.pendingRequests.splice(index, 1);
  }

  private expireAllPending(): void {
    this.pendingRequests.length = 0;
  }

  private async cleanupProcessedRequests(): Promise<void> {
    if (this.handledRequestIds.size === 0) return;
    const adapter = this.adapter();
    const requestsVaultPath = normalizePath(`${OBSIDIAN_TOOLING_DIR}/${OBSIDIAN_TOOLING_REQUESTS_DIRNAME}`);
    let listing: string[];
    try {
      listing = (await adapter.list(requestsVaultPath)).files.map((file) => nodePath.basename(file));
    } catch {
      return;
    }
    const now = Date.now();
    for (const filename of listing) {
      const requestId = toolingRequestIdFromFilename(filename);
      if (!requestId || !this.handledRequestIds.has(requestId)) continue;
      try {
        const stat = await this.adapter().stat(normalizePath(`${requestsVaultPath}/${filename}`));
        if (stat && now - stat.mtime > REQUEST_CLEANUP_DELAY_MS) {
          await adapter.remove(normalizePath(`${requestsVaultPath}/${filename}`));
        }
      } catch {
        // best-effort cleanup
      }
    }
  }

  // --- modal queue -----------------------------------------------------------------

  private pumpModalQueue(): void {
    if (this.modalOpen || this.pendingRequests.length === 0 || this.disposed) return;
    const request = this.pendingRequests.shift();
    if (!request) return;
    this.modalOpen = true;
    const decide = (choice: ObsidianToolingApprovalChoice): void => {
      this.modalOpen = false;
      void this.writeDecision(request.id, choice === 'allow' ? 'allow' : 'deny', Date.now());
      // Show the next queued request, if any, after this modal fully closes.
      setTimeout(() => this.pumpModalQueue(), 50);
    };
    try {
      new ObsidianToolingApprovalModal(this.app, request, decide).open();
    } catch (error) {
      logger.warn('failed to open tooling approval modal; denying request', { error });
      decide('deny');
    }
  }

  private async writeDecision(requestId: string, decision: ObsidianToolingDecision, decidedAt: number): Promise<void> {
    try {
      await this.adapter().write(
        normalizePath(`${OBSIDIAN_TOOLING_DIR}/${OBSIDIAN_TOOLING_REQUESTS_DIRNAME}/${requestId}.decision.json`),
        buildDecisionDocument(decision, decidedAt),
      );
    } catch (error) {
      logger.warn('failed to write tooling decision', { error, requestId, decision });
    }
  }
}

function describeProbe(result: ObsidianCliProbeResult): string {
  switch (result.status) {
    case 'available':
      return `available (${result.version})`;
    case 'not-found':
      return result.detail ?? 'obsidian CLI not found on PATH';
    case 'timeout':
      return 'obsidian CLI did not answer in time';
    case 'error':
      return result.detail;
  }
}

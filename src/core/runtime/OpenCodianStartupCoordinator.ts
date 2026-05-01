import * as fs from 'fs';
import type { PluginManifest } from 'obsidian';
import * as path from 'path';

import { createLogger, formatDurationMs, getPerformanceTimestampMs, getRecentLogText } from '../../shared';

const logger = createLogger('StartupCoordinator');

const STARTUP_TRACE_AUTO_PERSIST_THRESHOLD_MS = 1200;
const STARTUP_SLOW_PHASE_THRESHOLD_MS = 400;
const STARTUP_DOMINANT_PHASE_RATIO = 0.45;

export type StartupPerfEntry = {
  step: string;
  elapsedMs: number;
  status: 'ok' | 'error';
  depth: number;
  detail?: string;
};

export type StartupPerfTrace = {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  entries: StartupPerfEntry[];
};

export interface StartupExecuteOptions<TManagedServerState> {
  manifest: PluginManifest;
  getVaultBasePath: () => string | null;
  registerAppIcon: () => void;
  onPrepareStartupState: (coordinator: OpenCodianStartupCoordinator) => Promise<TManagedServerState>;
  onBootstrapOpenCodeRuntime: (initialManagedServerState: TManagedServerState) => Promise<void>;
  onRegisterWorkspaceIntegration: () => void;
  onScheduleDeferredRuntimeWarmup: () => void;
}

/**
 * Coordinates the startup bootstrap sequence and performance tracing for OpenCodian.
 *
 * This is a durable runtime owner — not a thin helper — that owns:
 * - Startup preparation sequencing
 * - OpenCode runtime bootstrap sequencing
 * - Workspace integration bootstrap handoff
 * - Startup diagnostics and performance tracing
 *
 * The plugin lifecycle shell (`main.ts`) delegates the bootstrap sequence to this
 * coordinator but retains ownership of `onload`/`onunload` and plugin-facing callbacks.
 */
export class OpenCodianStartupCoordinator {
  private startupPerfTrace: StartupPerfTrace | null = null;
  private startupPerfDepth = 0;

  /**
   * Execute the full startup bootstrap sequence.
   *
   * This is the primary entry point called from `main.ts` `onload()`.
   * It orchestrates the ordered phases and handles perf tracing around them.
   */
  async execute<TManagedServerState>(options: StartupExecuteOptions<TManagedServerState>): Promise<void> {
    this.beginStartupPerfTrace();
    const startupVaultPath = options.getVaultBasePath() ?? 'Unavailable';
    logger.always(`OpenCodian ${options.manifest.version} startup begin (vault=${startupVaultPath})`);

    try {
      await this.measureStartupStep('registerAppIcon', () => {
        options.registerAppIcon();
      });

      const initialManagedServerState = await this.measureStartupStep(
        'prepareStartupState',
        () => options.onPrepareStartupState(this),
      );

      await this.measureStartupStep(
        'bootstrapOpenCodeRuntime',
        () => options.onBootstrapOpenCodeRuntime(initialManagedServerState),
      );

      await this.measureStartupStep('registerWorkspaceIntegration', () => {
        options.onRegisterWorkspaceIntegration();
      });

      logger.info('[startup] deferring runtime warmup until after workspace integration');
      this.completeStartupPerfTrace('completed');
      await this.persistStartupPerfTraceSnapshot(options);
      options.onScheduleDeferredRuntimeWarmup();
    } catch (error) {
      this.completeStartupPerfTrace('failed');
      await this.persistStartupPerfTraceSnapshot(options).catch((persistError) => {
        logger.warn('Failed to persist startup trace after startup failure', persistError);
      });
      throw error;
    }
  }

  /**
   * Measure a single startup step with nested depth tracking.
   *
   * Maintains synchronous depth semantics: depth increments synchronously
   * before the operation and decrements in `finally`, preserving correct
   * nesting even across async boundaries.
   */
  async measureStartupStep<T>(
    step: string,
    operation: () => Promise<T> | T,
    options: { detail?: string | (() => string) } = {},
  ): Promise<T> {
    const shouldTrace = this.startupPerfTrace?.status === 'running';
    const depth = this.startupPerfDepth;
    const startedAt = getPerformanceTimestampMs();
    if (shouldTrace) {
      this.startupPerfDepth = depth + 1;
      logger.debug(`[startup] ${step} started`);
    }

    try {
      const result = await Promise.resolve(operation());
      if (shouldTrace) {
        const elapsedMs = getPerformanceTimestampMs() - startedAt;
        const detail = typeof options.detail === 'function' ? options.detail() : options.detail;
        this.recordStartupPerfEntry({
          step,
          elapsedMs,
          status: 'ok',
          depth,
          detail,
        });
        logger.debug(
          `[startup] ${step} completed in ${formatDurationMs(elapsedMs)}${detail ? ` (${detail})` : ''}`,
        );
      }
      return result;
    } catch (error) {
      if (shouldTrace) {
        const elapsedMs = getPerformanceTimestampMs() - startedAt;
        const detail = typeof options.detail === 'function' ? options.detail() : options.detail;
        this.recordStartupPerfEntry({
          step,
          elapsedMs,
          status: 'error',
          depth,
          detail,
        });
        logger.error(
          `[startup] ${step} failed after ${formatDurationMs(elapsedMs)}${detail ? ` (${detail})` : ''}`,
          error,
        );
      }
      throw error;
    } finally {
      if (shouldTrace) {
        this.startupPerfDepth = depth;
      }
    }
  }

  /** Get summary lines for the startup perf trace. */
  getStartupPerfSummaryLines(): string[] {
    if (!this.startupPerfTrace) {
      return ['(no startup trace captured yet)'];
    }

    const summaryEntries = this.startupPerfTrace.entries.filter((entry) => entry.depth === 0);
    const detailEntries = this.startupPerfTrace.entries
      .filter((entry) => entry.depth > 0)
      .sort((left, right) => right.elapsedMs - left.elapsedMs)
      .slice(0, 6);
    const totalElapsedMs = summaryEntries.reduce((sum, entry) => sum + entry.elapsedMs, 0);

    return [
      `Run ID: ${this.startupPerfTrace.runId}`,
      `Status: ${this.startupPerfTrace.status}`,
      `Started: ${this.startupPerfTrace.startedAt}`,
      `Completed: ${this.startupPerfTrace.completedAt ?? '(running)'}`,
      `Top-level total: ${formatDurationMs(totalElapsedMs)}`,
      `Top-level steps: ${
        summaryEntries.length
          ? summaryEntries.map((entry) => `${entry.step}=${formatDurationMs(entry.elapsedMs)}`).join(', ')
          : '(none)'
      }`,
      `Slowest nested steps: ${
        detailEntries.length
          ? detailEntries
            .map((entry) =>
              `${entry.step}=${formatDurationMs(entry.elapsedMs)}${entry.detail ? ` (${entry.detail})` : ''}`)
            .join(', ')
          : '(none)'
      }`,
    ];
  }

  /** Get automatic diagnosis lines for the startup perf trace. */
  getStartupPerformanceDiagnosisLines(): string[] {
    if (!this.startupPerfTrace) {
      return ['No startup trace captured yet.'];
    }

    const topLevelEntries = this.getStartupTopLevelEntries()
      .sort((left, right) => right.elapsedMs - left.elapsedMs);
    const totalElapsedMs = this.getStartupPerfTotalElapsedMs();
    const slowestStep = topLevelEntries[0];
    const lines: string[] = [];

    if (slowestStep && totalElapsedMs > 0) {
      const share = Math.round((slowestStep.elapsedMs / totalElapsedMs) * 100);
      lines.push(
        `Primary phase: ${slowestStep.step} took ${formatDurationMs(slowestStep.elapsedMs)} (${share}% of ${formatDurationMs(totalElapsedMs)} total).`,
      );
    } else {
      return ['No top-level startup phases were recorded.'];
    }

    const persistNormalizedSettingsEntry = this.startupPerfTrace.entries.find(
      (entry) => entry.step === 'persistNormalizedSettings',
    );
    if (persistNormalizedSettingsEntry) {
      lines.push(
        `Settings recovery wrote normalized files during startup (${formatDurationMs(persistNormalizedSettingsEntry.elapsedMs)}), which usually only happens after migration or file recovery.`,
      );
    }

    const storageSettingsEntry = this.startupPerfTrace.entries.find(
      (entry) => entry.step === 'storage.loadPersistedSettings',
    );
    if (
      storageSettingsEntry
      && storageSettingsEntry.elapsedMs >= STARTUP_SLOW_PHASE_THRESHOLD_MS
      && !persistNormalizedSettingsEntry
    ) {
      lines.push(
        `Settings restore itself was slow (${formatDurationMs(storageSettingsEntry.elapsedMs)}); inspect split settings files and backup recovery state if this repeats.`,
      );
    }

    if (!this.isSlowStartupTrace() && lines.length === 1) {
      lines.push('No obvious startup hotspot crossed the current slow-start threshold.');
    }

    return lines;
  }

  private beginStartupPerfTrace(): void {
    const startedAt = new Date();
    this.startupPerfTrace = {
      runId: `startup-${startedAt.getTime()}`,
      startedAt: startedAt.toISOString(),
      status: 'running',
      entries: [],
    };
    this.startupPerfDepth = 0;
  }

  private recordStartupPerfEntry(entry: StartupPerfEntry): void {
    this.startupPerfTrace?.entries.push(entry);
  }

  private completeStartupPerfTrace(status: 'completed' | 'failed'): void {
    if (!this.startupPerfTrace) {
      return;
    }

    this.startupPerfTrace.status = status;
    this.startupPerfTrace.completedAt = new Date().toISOString();
    const summaryEntries = this.startupPerfTrace.entries.filter((entry) => entry.depth === 0);
    const totalElapsedMs = summaryEntries.reduce((sum, entry) => sum + entry.elapsedMs, 0);
    const summaryText = summaryEntries
      .map((entry) => `${entry.step}=${formatDurationMs(entry.elapsedMs)}`)
      .join(', ');

    logger.always(
      `[startup] ${status} in ${formatDurationMs(totalElapsedMs)}${summaryText ? ` | ${summaryText}` : ''}`,
    );

    if (status === 'failed' || this.isSlowStartupTrace()) {
      const diagnosis = this.getStartupPerformanceDiagnosisLines()[0];
      if (diagnosis) {
        logger.warn(`[startup] automatic diagnosis: ${diagnosis}`);
      }
    }
  }

  private async persistStartupPerfTraceSnapshot<TManagedServerState>(
    options: StartupExecuteOptions<TManagedServerState>,
  ): Promise<void> {
    if (!this.startupPerfTrace || !this.shouldPersistStartupPerfTraceSnapshot()) {
      return;
    }

    const vaultPath = options.getVaultBasePath();
    if (!vaultPath) {
      return;
    }

    const debugDirectoryPath = path.join(vaultPath, '.opencodian', 'debug');
    const outputPath = path.join(debugDirectoryPath, 'startup-perf-latest.log');
    const trace = this.startupPerfTrace;
    const topLevelEntries = trace.entries.filter((entry) => entry.depth === 0);
    const nestedEntries = trace.entries.filter((entry) => entry.depth > 0);
    const lines = [
      '# OpenCodian Startup Performance Trace',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Plugin version: ${options.manifest.version}`,
      `BUILD_ID: ${(globalThis as { BUILD_ID?: string }).BUILD_ID ?? 'unknown'}`,
      '',
      ...this.getStartupPerfSummaryLines(),
      '',
      'Automatic diagnosis:',
      ...this.getStartupPerformanceDiagnosisLines().map((line) => `- ${line}`),
      '',
      'Top-level entries:',
      ...(topLevelEntries.length
        ? topLevelEntries.map((entry) =>
          `- ${entry.step}: ${formatDurationMs(entry.elapsedMs)} [${entry.status}]${entry.detail ? ` (${entry.detail})` : ''}`)
        : ['- (none)']),
      '',
      'Nested entries:',
      ...(nestedEntries.length
        ? nestedEntries.map((entry) =>
          `- ${'  '.repeat(Math.max(0, entry.depth - 1))}${entry.step}: ${formatDurationMs(entry.elapsedMs)} [${entry.status}]${entry.detail ? ` (${entry.detail})` : ''}`)
        : ['- (none)']),
      '',
      'Recent logs:',
      getRecentLogText() || '(no logs captured yet)',
      '',
    ];

    await fs.promises.mkdir(debugDirectoryPath, { recursive: true });
    await fs.promises.writeFile(outputPath, lines.join('\n'), 'utf-8');
    logger.debug(`[startup] wrote startup trace snapshot to ${outputPath}`);
  }

  private getStartupTopLevelEntries(): StartupPerfEntry[] {
    return this.startupPerfTrace?.entries.filter((entry) => entry.depth === 0) ?? [];
  }

  private getStartupPerfTotalElapsedMs(): number {
    return this.getStartupTopLevelEntries()
      .reduce((sum, entry) => sum + entry.elapsedMs, 0);
  }

  private isSlowStartupTrace(): boolean {
    const totalElapsedMs = this.getStartupPerfTotalElapsedMs();
    if (totalElapsedMs >= STARTUP_TRACE_AUTO_PERSIST_THRESHOLD_MS) {
      return true;
    }

    const slowestTopLevelStep = this.getStartupTopLevelEntries()
      .sort((left, right) => right.elapsedMs - left.elapsedMs)[0];
    if (!slowestTopLevelStep || totalElapsedMs <= 0) {
      return false;
    }

    return slowestTopLevelStep.elapsedMs >= STARTUP_SLOW_PHASE_THRESHOLD_MS
      && (slowestTopLevelStep.elapsedMs / totalElapsedMs) >= STARTUP_DOMINANT_PHASE_RATIO;
  }

  private shouldPersistStartupPerfTraceSnapshot(): boolean {
    return Boolean(
      this.startupPerfTrace?.status === 'failed'
      || this.isSlowStartupTrace(),
    );
  }
}

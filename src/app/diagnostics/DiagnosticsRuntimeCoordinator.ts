/**
 * DiagnosticsRuntimeCoordinator owns the construction, typed-port exposure, and
 * unified flush/dispose lifecycle of the three backend trace services.
 *
 * Behavior is byte-for-byte compatible with the prior inline construction in
 * `main.ts` (`handleBootstrapOpenCodeRuntime` + `onunload`):
 *   - Construction order: OpenCode → Codex → Claude.
 *   - Each service receives the same option getters/defaults as before.
 *   - Dispose order: OpenCode → Codex → Claude. dispose() awaits each backend's
 *     `.dispose().catch(...)` sequentially (fail-closed warnings, deterministic
 *     teardown); main.ts onunload calls it with `void` (fire-and-forget).
 *
 * The coordinator does NOT merge the three backends' event schemas or internal
 * state. It exposes typed backend ports (`ports.openCode`, `ports.codex`,
 * `ports.claude`) — not a generic mutable service map — so a consumer cannot
 * reach an unrelated backend's trace state by key/type lookup.
 *
 * Task 11 hard requirement: `main.ts` has zero direct `new *SessionTraceService`.
 */
import { ClaudeSessionTraceService } from '../../core/agents/backend/diagnostics/ClaudeSessionTraceService';
import { CodexSessionTraceService } from '../../core/agents/backend/diagnostics/CodexSessionTraceService';
import { OpenCodeSessionTraceService } from '../../core/opencode/diagnostics/OpenCodeSessionTraceService';
import type { Logger } from '../../shared/logger';
import { createLogger } from '../../shared/logger';
import type { DiagnosticsBackendPorts, DiagnosticsRuntimeInputs } from './types';

export class DiagnosticsRuntimeCoordinator {
  readonly openCode: OpenCodeSessionTraceService;
  readonly codex: CodexSessionTraceService;
  readonly claude: ClaudeSessionTraceService;
  private readonly logger: Logger;

  constructor(inputs: DiagnosticsRuntimeInputs) {
    // Injected logger preserves the caller's console/export scope (main.ts uses
    // 'OpenCodian'); defaults to a coordinator-scoped logger when omitted.
    this.logger = inputs.logger ?? createLogger('DiagnosticsRuntimeCoordinator');
    // Construction order is pinned by the Task 10 characterization suite:
    // OpenCode first, then Codex, then Claude. Mirrors the prior inline order.
    // If a later construction throws, dispose the already-constructed services so
    // their timers/stores do not leak (the prior inline assignment published each
    // service immediately; the coordinator must match that no-leak guarantee).
    const constructed: Array<{ dispose(): Promise<void> }> = [];
    try {
      this.openCode = new OpenCodeSessionTraceService({
        settings: inputs.openCodeSettings,
        vaultPath: inputs.vaultPath,
        buildIdentity: inputs.buildIdentity,
        knownSecrets: inputs.openCodeKnownSecrets,
        runtimeMetadata: inputs.openCodeRuntimeMetadata,
      });
      constructed.push(this.openCode);
      this.codex = new CodexSessionTraceService({
        settings: inputs.codexSettings,
        vaultPath: inputs.vaultPath,
        buildIdentity: inputs.buildIdentity,
        knownSecrets: inputs.codexKnownSecrets,
        runtimeMetadata: inputs.codexRuntimeMetadata,
      });
      constructed.push(this.codex);
      this.claude = new ClaudeSessionTraceService({
        settings: inputs.claudeSettings,
        vaultPath: inputs.vaultPath,
        buildIdentity: inputs.buildIdentity,
        knownSecrets: inputs.claudeKnownSecrets,
        runtimeMetadata: inputs.claudeRuntimeMetadata,
      });
      constructed.push(this.claude);
    } catch (error) {
      // Best-effort disposal of any partially-constructed services.
      for (const service of constructed) {
        void service.dispose().catch(() => { /* shutdown must not throw */ });
      }
      throw error;
    }
  }

  /** Typed backend ports — one property per backend, no service-locator map. */
  get ports(): DiagnosticsBackendPorts {
    return { openCode: this.openCode, codex: this.codex, claude: this.claude };
  }

  /**
   * Dispose all three services in the pinned order (OpenCode → Codex → Claude),
   * awaiting each backend's disposal so callers (tests) can deterministically
   * wait for completion. A throwing trace flush is caught per-backend and logged
   * via the injected logger, so a rejection never propagates and never blocks
   * plugin unload — mirroring the prior `onunload` fail-closed inline disposal.
   * main.ts calls this with `void` (fire-and-forget) to preserve the prior
   * unload timing; tests `await` it for deterministic teardown.
   */
  async dispose(): Promise<void> {
    await this.openCode.dispose().catch((error) => {
      this.logger.warn('Failed to flush OpenCode trace service during unload:', error);
    });
    await this.codex.dispose().catch(() => {
      this.logger.warn('Failed to flush Codex trace service during unload');
    });
    await this.claude.dispose().catch(() => {
      this.logger.warn('Failed to flush Claude trace service during unload');
    });
  }
}

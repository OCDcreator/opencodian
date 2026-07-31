/**
 * DiagnosticsRuntimeCoordinator owns the construction, typed-port exposure, and
 * unified flush/dispose lifecycle of the three backend trace services.
 *
 * Behavior is byte-for-byte compatible with the prior inline construction in
 * `main.ts` (`handleBootstrapOpenCodeRuntime` + `onunload`):
 *   - Construction order: OpenCode → Codex → Claude.
 *   - Each service receives the same option getters/defaults as before.
 *   - Dispose order: OpenCode → Codex → Claude, each void-wrapped with `.catch`.
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
import { createLogger } from '../../shared/logger';
import type { DiagnosticsBackendPorts, DiagnosticsRuntimeInputs } from './types';

const logger = createLogger('DiagnosticsRuntimeCoordinator');

export class DiagnosticsRuntimeCoordinator {
  readonly openCode: OpenCodeSessionTraceService;
  readonly codex: CodexSessionTraceService;
  readonly claude: ClaudeSessionTraceService;

  constructor(inputs: DiagnosticsRuntimeInputs) {
    // Construction order is pinned by the Task 10 characterization suite:
    // OpenCode first, then Codex, then Claude. Mirrors the prior inline order.
    this.openCode = new OpenCodeSessionTraceService({
      settings: inputs.openCodeSettings,
      vaultPath: inputs.vaultPath,
      buildIdentity: inputs.buildIdentity,
      knownSecrets: inputs.openCodeKnownSecrets,
      runtimeMetadata: inputs.openCodeRuntimeMetadata,
    });
    this.codex = new CodexSessionTraceService({
      settings: inputs.codexSettings,
      vaultPath: inputs.vaultPath,
      buildIdentity: inputs.buildIdentity,
      knownSecrets: inputs.codexKnownSecrets,
      runtimeMetadata: inputs.codexRuntimeMetadata,
    });
    this.claude = new ClaudeSessionTraceService({
      settings: inputs.claudeSettings,
      vaultPath: inputs.vaultPath,
      buildIdentity: inputs.buildIdentity,
      knownSecrets: inputs.claudeKnownSecrets,
      runtimeMetadata: inputs.claudeRuntimeMetadata,
    });
  }

  /** Typed backend ports — one property per backend, no service-locator map. */
  get ports(): DiagnosticsBackendPorts {
    return { openCode: this.openCode, codex: this.codex, claude: this.claude };
  }

  /**
   * Dispose all three services in the pinned order (OpenCode → Codex → Claude).
   * Each disposal is void-wrapped with `.catch` so a throwing trace flush never
   * blocks plugin unload — mirroring the prior `onunload` inline disposal.
   */
  async dispose(): Promise<void> {
    // Per-backend warnings mirror the prior `onunload` inline disposal so
    // operator-visible diagnostics stay byte-for-byte compatible.
    void this.openCode.dispose().catch((error) => {
      logger.warn('Failed to flush OpenCode trace service during unload:', error);
    });
    void this.codex.dispose().catch(() => {
      logger.warn('Failed to flush Codex trace service during unload');
    });
    void this.claude.dispose().catch(() => {
      logger.warn('Failed to flush Claude trace service during unload');
    });
  }
}

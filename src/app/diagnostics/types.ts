/**
 * DiagnosticsRuntimeCoordinator types.
 *
 * The coordinator owns the construction, injection, and flush/dispose lifecycle
 * of the three backend trace services (OpenCode, Codex, Claude). It exposes
 * TYPED backend ports — one property per backend — rather than a generic mutable
 * service map, so consumers cannot reach an unrelated backend's trace state by
 * key/type lookup.
 *
 * These types are the narrow port surface `main.ts` and the chat/settings shells
 * consume. They deliberately do not merge the three backends' event schemas or
 * internal service state.
 */
import type { ClaudeSessionTraceService } from '../../core/agents/backend/diagnostics/ClaudeSessionTraceService';
import type { CodexSessionTraceService } from '../../core/agents/backend/diagnostics/CodexSessionTraceService';
import type { OpenCodeSessionTraceService } from '../../core/opencode/diagnostics/OpenCodeSessionTraceService';

/**
 * The three backend trace ports owned by the coordinator. Each is the concrete
 * service instance (the trace-port interface plus the store/reportBuilder the
 * settings/chat shells read). Consumers access exactly the backend they need;
 * there is no service-locator map.
 */
export interface DiagnosticsBackendPorts {
  readonly openCode: OpenCodeSessionTraceService;
  readonly codex: CodexSessionTraceService;
  readonly claude: ClaudeSessionTraceService;
}

/**
 * The runtime inputs the coordinator needs to construct the three services.
 * These mirror the option getters `main.ts` previously inlined; they are read
 * lazily (as arrow getters) so credential rotations and settings changes take
 * effect at the point each service reads them.
 */
export interface DiagnosticsRuntimeInputs {
  /** OpenCode session-trace settings getter. */
  openCodeSettings: () => import('../../core/opencode/diagnostics/OpenCodeSessionTraceService').OpenCodeSessionTraceSettings;
  /** Codex session-trace settings getter. */
  codexSettings: () => import('../../core/agents/backend/diagnostics/types').CodexSessionTraceSettings;
  /** Claude session-trace settings getter. */
  claudeSettings: () => import('../../core/agents/backend/diagnostics/types').ClaudeSessionTraceSettings;
  /** Vault base path (undefined when not yet resolvable). */
  vaultPath: string | undefined;
  /** Build-identity getter (consumed by each report builder). */
  buildIdentity: () => string;
  /** OpenCode known-secrets getter (password + token). */
  openCodeKnownSecrets: () => readonly string[];
  /** Codex known-secrets getter (password + token + codex apiKey). */
  codexKnownSecrets: () => readonly string[];
  /** Claude known-secrets getter (dynamically collected Claude credentials). */
  claudeKnownSecrets: () => readonly string[];
  /** OpenCode runtime-metadata getter. */
  openCodeRuntimeMetadata: () => Record<string, unknown>;
  /** Codex runtime-metadata getter. */
  codexRuntimeMetadata: () => Record<string, unknown>;
  /** Claude runtime-metadata getter. */
  claudeRuntimeMetadata: () => Record<string, unknown>;
}

/**
 * Agent adapter wiring — registers all agent adapters into the registry.
 *
 * Extracted from main.ts to keep the plugin entry point thin.
 * Each adapter is registered but NOT automatically enabled; the caller
 * must call `registry.setEnabledBackends()` afterwards.
 *
 * See AGENTS.md: "move stable responsibilities to adjacent owners when touching them."
 */

import type { CodexBackendSettings } from '../../types/settings';
import type { AgentService } from './AgentService';
import type { AgentServiceRegistry } from './AgentServiceRegistry';
import { CodexAdapter } from './CodexAdapter';
import { resolveCodexCli } from './CodexCliResolver';
import type { CodexTracePort } from './diagnostics/types';

export interface WireHiddenAdaptersOptions {
  registry: AgentServiceRegistry;
  /** Already-constructed user-facing adapters to register first. */
  adapters: AgentService[];
  /** Vault base path, used as working directory for hidden adapters. */
  vaultPath: string | undefined;
  /**
   * Legacy bootstrap context retained so the entry-point call shape stays
   * stable. It is intentionally ignored: Codex must never be discovered from
   * plugin-private paths or bundled runtime binaries.
   */
  pluginDir?: string;
  /** Codex-specific settings from plugin configuration. */
  codexSettings?: CodexBackendSettings;
  /**
   * Codex session-trace port. Injected into the CodexAdapter so wire-level
   * events flow into the CodexSessionTraceService. Optional for backwards
   * compatibility with callers that pre-date tracing.
   */
  codexTracePort?: CodexTracePort;
}

/**
 * Register user-facing adapters plus the Codex adapter.
 *
 * - All adapters in `options.adapters` are registered first.
 * - Then Codex is registered as a user-facing backend when `vaultPath` is available.
 *
 * The caller must still call `registry.setEnabledBackends()` to
 * activate the desired user-facing backends.
 */
export function wireHiddenAdapters(options: WireHiddenAdaptersOptions): void {
  const { registry, adapters, vaultPath, codexSettings } = options;

  for (const adapter of adapters) {
    registry.register(adapter);
  }

  if (vaultPath) {
    const codexCliResolution = resolveCodexCli({ executablePath: codexSettings?.executablePath ?? '' });
    registry.register(new CodexAdapter({
      workingDirectory: vaultPath,
      codexCliResolution,
      ...(codexSettings?.apiKey ? { apiKey: codexSettings.apiKey } : {}),
      ...(codexSettings?.model ? { model: codexSettings.model } : {}),
      ...(codexSettings?.sandboxMode ? { sandboxMode: codexSettings.sandboxMode } : {}),
      ...(codexSettings?.modelReasoningEffort ? { modelReasoningEffort: codexSettings.modelReasoningEffort } : {}),
      ...(codexSettings?.additionalDirectories
        ? { additionalDirectories: codexSettings.additionalDirectories.split('\n').map(d => d.trim()).filter(Boolean) }
        : {}),
      ...(codexSettings?.networkAccessEnabled !== undefined
        ? { networkAccessEnabled: codexSettings.networkAccessEnabled }
        : {}),
      ...(codexSettings?.webSearchMode
        ? { webSearchMode: codexSettings.webSearchMode }
        : {}),
      ...(codexSettings?.approvalPolicy
        ? { approvalPolicy: codexSettings.approvalPolicy }
        : {}),
      ...(codexCliResolution.mode === 'available'
        ? { codexPathOverride: codexCliResolution.executablePath }
        : {}),
      tracePort: options.codexTracePort,
    }));
  }
}

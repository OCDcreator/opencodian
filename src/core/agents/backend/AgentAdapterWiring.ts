/**
 * Agent adapter wiring — registers all agent adapters into the registry.
 *
 * Extracted from main.ts to keep the plugin entry point thin.
 * Each adapter is registered but NOT automatically enabled; the caller
 * must call `registry.setEnabledBackends()` afterwards.
 *
 * See AGENTS.md: "move stable responsibilities to adjacent owners when touching them."
 */

import * as path from 'path';

import type { CodexBackendSettings } from '../../types/settings';
import type { AgentService } from './AgentService';
import type { AgentServiceRegistry } from './AgentServiceRegistry';
import { CodexAdapter } from './CodexAdapter';

export interface WireHiddenAdaptersOptions {
  registry: AgentServiceRegistry;
  /** Already-constructed user-facing adapters to register first. */
  adapters: AgentService[];
  /** Vault base path, used as working directory for hidden adapters. */
  vaultPath: string | undefined;
  /** Plugin directory (absolute path). Used to locate bundled runtime binaries. */
  pluginDir: string;
  /** Codex-specific settings from plugin configuration. */
  codexSettings?: CodexBackendSettings;
}

/**
 * Resolve the Codex CLI binary path from the plugin directory.
 *
 * The Codex SDK's built-in binary discovery (findCodexPath) uses
 * require.resolve() chained through createRequire(import.meta.url),
 * which fails in Obsidian's plugin loader because __filename resolves
 * to Electron internals rather than the plugin directory.
 *
 * This helper resolves the binary directly from the known plugin layout:
 *   <pluginDir>/node_modules/@openai/codex-darwin-arm64/vendor/<triple>/bin/codex
 */
function resolveCodexBinaryPath(pluginDir: string): string | undefined {
  const { platform, arch } = process;

  let targetTriple: string | undefined;
  if (platform === 'darwin' && arch === 'arm64') {
    targetTriple = 'aarch64-apple-darwin';
  } else if (platform === 'darwin' && arch === 'x64') {
    targetTriple = 'x86_64-apple-darwin';
  } else if (platform === 'linux' && arch === 'arm64') {
    targetTriple = 'aarch64-unknown-linux-musl';
  } else if (platform === 'linux' && arch === 'x64') {
    targetTriple = 'x86_64-unknown-linux-musl';
  } else if (platform === 'win32' && arch === 'x64') {
    targetTriple = 'x86_64-pc-windows-msvc';
  } else if (platform === 'win32' && arch === 'arm64') {
    targetTriple = 'aarch64-pc-windows-msvc';
  }

  if (!targetTriple) {
    return undefined;
  }

  // Map to platform package name
  const platformPackages: Record<string, string> = {
    'aarch64-apple-darwin': '@openai/codex-darwin-arm64',
    'x86_64-apple-darwin': '@openai/codex-darwin-x64',
    'aarch64-unknown-linux-musl': '@openai/codex-linux-arm64',
    'x86_64-unknown-linux-musl': '@openai/codex-linux-x64',
    'x86_64-pc-windows-msvc': '@openai/codex-win32-x64',
    'aarch64-pc-windows-msvc': '@openai/codex-win32-arm64',
  };

  const platformPackage = platformPackages[targetTriple];
  if (!platformPackage) {
    return undefined;
  }

  const binaryName = platform === 'win32' ? 'codex.exe' : 'codex';
  const binaryPath = path.join(
    pluginDir,
    'node_modules',
    ...platformPackage.split('/'),
    'vendor',
    targetTriple,
    'bin',
    binaryName,
  );

  return binaryPath;
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
  const { registry, adapters, vaultPath, pluginDir, codexSettings } = options;

  for (const adapter of adapters) {
    registry.register(adapter);
  }

  if (vaultPath) {
    const codexPathOverride = resolveCodexBinaryPath(pluginDir);
    registry.register(new CodexAdapter({
      workingDirectory: vaultPath,
      pluginDir,
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
      ...(codexPathOverride ? { codexPathOverride } : {}),
    }));
  }
}

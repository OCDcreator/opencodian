import type { ClaudeCodeEffort, CodexReasoningEffort } from '../../types/settings';

export const CLAUDE_CODE_PROVIDER_ID = 'claude-code';
export const CLAUDE_CODE_PROVIDER_NAME = 'Claude Code';

export const CLAUDE_CODE_EFFORT_VARIANTS: ClaudeCodeEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

/**
 * Codex reasoning-effort levels.
 *
 * These map to CodexBackendSettings.modelReasoningEffort and are presented
 * in the chat toolbar effort selector when Codex is the active backend.
 * Order matches the Codex SDK's ModelReasoningEffort type (low→high).
 */
export const CODEX_EFFORT_VARIANTS: CodexReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

export interface ClaudeCodeModelCatalogEntry {
  id: string;
  name: string;
  provider?: string;
}

export interface ClaudeCodeModelSelectorProvider {
  id: string;
  name: string;
  models: Array<{
    id: string;
    name: string;
    variants: string[];
  }>;
}

const OFFICIAL_ALIAS_MODELS: ClaudeCodeModelCatalogEntry[] = [
  { id: 'default', name: 'Default' },
  { id: 'best', name: 'Best available' },
  { id: 'sonnet', name: 'Sonnet' },
  { id: 'opus', name: 'Opus' },
  { id: 'haiku', name: 'Haiku' },
  { id: 'sonnet[1m]', name: 'Sonnet 1M' },
  { id: 'opus[1m]', name: 'Opus 1M' },
  { id: 'opusplan', name: 'Opus plan' },
];

export function buildClaudeCodeModelSelectorProviders(
  supportedModels: readonly ClaudeCodeModelCatalogEntry[],
): ClaudeCodeModelSelectorProvider[] {
  const providers = new Map<string, ClaudeCodeModelSelectorProvider>();
  const addModel = (entry: ClaudeCodeModelCatalogEntry, fallbackProviderId: string): void => {
    const modelId = entry.id.trim();
    if (!modelId) {
      return;
    }
    const providerId = (entry.provider?.trim() || fallbackProviderId);
    const provider = providers.get(providerId) ?? {
      id: providerId,
      name: providerId === CLAUDE_CODE_PROVIDER_ID ? CLAUDE_CODE_PROVIDER_NAME : providerId,
      models: [],
    };
    if (!provider.models.some((model) => model.id === modelId)) {
      provider.models.push({
        id: modelId,
        name: entry.name.trim() || modelId,
        variants: [...CLAUDE_CODE_EFFORT_VARIANTS],
      });
    }
    providers.set(providerId, provider);
  };

  for (const entry of OFFICIAL_ALIAS_MODELS) {
    addModel(entry, CLAUDE_CODE_PROVIDER_ID);
  }
  for (const entry of supportedModels) {
    addModel(entry, CLAUDE_CODE_PROVIDER_ID);
  }

  return [...providers.values()].map((provider) => ({
    ...provider,
    models: [...provider.models].sort((left, right) => {
      const leftIndex = OFFICIAL_ALIAS_MODELS.findIndex((model) => model.id === left.id);
      const rightIndex = OFFICIAL_ALIAS_MODELS.findIndex((model) => model.id === right.id);
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex)
          - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
      }
      return left.name.localeCompare(right.name);
    }),
  }));
}

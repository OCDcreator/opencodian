import type { ClaudeCodeEffort, CodexReasoningEffort } from '../../types/settings';
import type { CodexModelSummary } from './CodexAdapter';

export const CLAUDE_CODE_PROVIDER_ID = 'claude-code';
export const CLAUDE_CODE_PROVIDER_NAME = 'Claude Code';

/**
 * Single Codex UI group identifier.
 *
 * Codex is NOT a switchable provider (provider posture B): model_provider is
 * managed externally in ~/.codex/config.toml. This id is only the UI container
 * for the model list returned by CodexAdapter.getModelList(). The composer must
 * never present it as a provider selector.
 */
export const CODEX_PROVIDER_ID = 'codex';
export const CODEX_PROVIDER_NAME = 'Codex';

/**
 * Sentinel model id used inside the Codex composer model selector to represent
 * the "Custom…" entry. When auth mode allows Custom (API-key or unknown), this
 * entry is appended to the Codex provider's model list. Selecting it triggers a
 * prompt for an arbitrary model name. It is never sent to the adapter as-is.
 */
export const CODEX_CUSTOM_MODEL_SENTINEL = '__codex_custom__';

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

export interface BackendModelSelectorProvider {
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
): BackendModelSelectorProvider[] {
  const providers = new Map<string, BackendModelSelectorProvider>();
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

// ---------------------------------------------------------------------------
// Codex model selector providers
// ---------------------------------------------------------------------------

/**
 * Build a single-group Codex model selector provider list.
 *
 * Source: CodexAdapter.getModelList() (app-server model/list, then
 * codex debug models CLI fallback). This is the ONLY model source for the
 * Codex composer selector — there is no third-party endpoint catalog fetch.
 *
 * The result is always a single provider group (CODEX_PROVIDER_ID). Codex is
 * not a switchable provider; model_provider is managed externally. Models
 * carry CODEX_EFFORT_VARIANTS so the toolbar effort selector can operate.
 *
 * Returns an empty array when no models are available so the selector shows
 * its honest "no models" state rather than a fake entry.
 */
export function buildCodexModelSelectorProviders(
  models: readonly CodexModelSummary[] | null | undefined,
): BackendModelSelectorProvider[] {
  if (!models || models.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const selectorModels: BackendModelSelectorProvider['models'] = [];
  for (const model of models) {
    const id = model.slug?.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    selectorModels.push({
      id,
      name: model.display_name?.trim() || id,
      variants: [...CODEX_EFFORT_VARIANTS],
    });
  }

  if (selectorModels.length === 0) {
    return [];
  }

  selectorModels.sort((left, right) => left.name.localeCompare(right.name));

  return [
    {
      id: CODEX_PROVIDER_ID,
      name: CODEX_PROVIDER_NAME,
      models: selectorModels,
    },
  ];
}

// ---------------------------------------------------------------------------
// Shared Codex model catalog resolution (single owner for auth-aware policy)
// Used by both ChatSelectionControlsCoordinator and CodexChatSurfaceBinding.
// ---------------------------------------------------------------------------

export type CodexAuthMode = 'chatgpt' | 'apikey' | 'unknown';

export interface CodexCatalogAdapter {
  getModelList?(): Promise<CodexModelSummary[] | null>;
  getAccountInfo?(): Promise<unknown | null>;
}

/**
 * Normalize auth mode from adapter account readback.
 * Handles both app-server `account/read` and CLI doctor shapes.
 * Never infers ChatGPT from an empty apiKey field.
 */
export function normalizeCodexAuthMode(raw: unknown): CodexAuthMode {
  if (!raw || typeof raw !== 'object') return 'unknown';
  const obj = raw as Record<string, unknown>;
  if (obj.account && typeof obj.account === 'object') {
    const typeRaw = String((obj.account as Record<string, unknown>).type ?? '').toLowerCase();
    if (typeRaw === 'chatgpt') return 'chatgpt';
    if (typeRaw.includes('api')) return 'apikey';
  }
  const storedMode = String(obj['stored auth mode'] ?? '').toLowerCase();
  if (storedMode === 'chatgpt') return 'chatgpt';
  if (storedMode.includes('api')) return 'apikey';
  return 'unknown';
}

/**
 * Resolve Codex model catalog with auth-aware Custom policy.
 * ChatGPT → Custom disabled; API-key → Custom allowed;
 * unknown → Custom allowed but marked unverified.
 *
 * This is the SINGLE production implementation — both the coordinator
 * and CodexChatSurfaceBinding call it to prevent policy drift.
 */
export async function resolveCodexModelCatalogFromAdapter(
  adapter: CodexCatalogAdapter,
  labelApiKey: string,
  labelUnverified: string,
): Promise<{ providers: BackendModelSelectorProvider[]; authMode: CodexAuthMode } | null> {
  if (!adapter.getModelList) return null;
  const [models, authMode] = await Promise.all([
    adapter.getModelList(),
    (async () => {
      if (!adapter.getAccountInfo) return 'unknown' as CodexAuthMode;
      try {
        return normalizeCodexAuthMode(await adapter.getAccountInfo());
      } catch {
        return 'unknown' as CodexAuthMode;
      }
    })(),
  ]);
  const providers = buildCodexModelSelectorProviders(models);
  if (providers.length > 0 && authMode !== 'chatgpt') {
    providers[0].models.push({
      id: CODEX_CUSTOM_MODEL_SENTINEL,
      name: authMode === 'apikey' ? labelApiKey : labelUnverified,
      variants: [],
    });
  }
  return { providers, authMode };
}

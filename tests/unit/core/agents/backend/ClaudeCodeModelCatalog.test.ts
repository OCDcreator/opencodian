import {
  buildClaudeCodeModelSelectorProviders,
  buildCodexModelSelectorProviders,
  CLAUDE_CODE_EFFORT_VARIANTS,
  CLAUDE_CODE_PROVIDER_ID,
  CODEX_CUSTOM_MODEL_SENTINEL,
  CODEX_EFFORT_VARIANTS,
  CODEX_PROVIDER_ID,
  CODEX_PROVIDER_NAME,
} from '../../../../../src/core/agents/backend/ClaudeCodeModelCatalog';
import type { CodexModelSummary } from '../../../../../src/core/agents/backend/CodexAdapter';

describe('ClaudeCodeModelCatalog', () => {
  it('exposes official Claude Code aliases with effort variants and merges SDK models', () => {
    const providers = buildClaudeCodeModelSelectorProviders([
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
      { id: 'sonnet', name: 'Sonnet duplicate' },
    ]);

    const aliasProvider = providers.find((provider) => provider.id === CLAUDE_CODE_PROVIDER_ID);
    const anthropicProvider = providers.find((provider) => provider.id === 'anthropic');

    expect(aliasProvider?.models.map((model) => model.id).slice(0, 5)).toEqual([
      'default',
      'best',
      'sonnet',
      'opus',
      'haiku',
    ]);
    expect(aliasProvider?.models.find((model) => model.id === 'sonnet')?.name).toBe('Sonnet');
    expect(aliasProvider?.models.find((model) => model.id === 'opusplan')?.variants)
      .toEqual(CLAUDE_CODE_EFFORT_VARIANTS);
    expect(anthropicProvider?.models).toEqual([{
      id: 'claude-sonnet-4-5',
      name: 'Claude Sonnet 4.5',
      variants: CLAUDE_CODE_EFFORT_VARIANTS,
    }]);
  });
});

describe('CODEX_EFFORT_VARIANTS', () => {
  it('contains the five Codex reasoning-effort levels in order', () => {
    expect(CODEX_EFFORT_VARIANTS).toEqual(['minimal', 'low', 'medium', 'high', 'xhigh']);
  });

  it('does not include Claude Code max level', () => {
    expect(CODEX_EFFORT_VARIANTS).not.toContain('max');
  });

  it('includes minimal which Claude Code lacks', () => {
    expect(CODEX_EFFORT_VARIANTS).toContain('minimal');
    expect(CLAUDE_CODE_EFFORT_VARIANTS).not.toContain('minimal');
  });
});

describe('buildCodexModelSelectorProviders', () => {
  function makeModel(overrides: Partial<CodexModelSummary> = {}): CodexModelSummary {
    return {
      slug: 'gpt-5.4',
      display_name: 'GPT-5.4',
      visibility: 'list',
      supported_in_api: true,
      default_reasoning_level: null,
      description: null,
      ...overrides,
    };
  }

  it('returns a single Codex provider group that is NOT a switchable provider', () => {
    const providers = buildCodexModelSelectorProviders([makeModel()]);
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe(CODEX_PROVIDER_ID);
    expect(providers[0].name).toBe(CODEX_PROVIDER_NAME);
  });

  it('maps CodexModelSummary slug/display_name to model id/name with effort variants', () => {
    const providers = buildCodexModelSelectorProviders([
      makeModel({ slug: 'o4-mini', display_name: 'O4 Mini' }),
    ]);
    expect(providers[0].models).toEqual([
      { id: 'o4-mini', name: 'O4 Mini', variants: [...CODEX_EFFORT_VARIANTS] },
    ]);
  });

  it('returns empty array when models are null or empty (honest no-models state)', () => {
    expect(buildCodexModelSelectorProviders(null)).toEqual([]);
    expect(buildCodexModelSelectorProviders(undefined)).toEqual([]);
    expect(buildCodexModelSelectorProviders([])).toEqual([]);
  });

  it('deduplicates models by slug and skips empty slugs', () => {
    const providers = buildCodexModelSelectorProviders([
      makeModel({ slug: 'gpt-5.4', display_name: 'First' }),
      makeModel({ slug: 'gpt-5.4', display_name: 'Duplicate' }),
      makeModel({ slug: '', display_name: 'Empty slug' }),
      makeModel({ slug: '  ', display_name: 'Whitespace slug' }),
    ]);
    expect(providers[0].models).toHaveLength(1);
    expect(providers[0].models[0].id).toBe('gpt-5.4');
  });

  it('sorts models alphabetically by display name', () => {
    const providers = buildCodexModelSelectorProviders([
      makeModel({ slug: 'zeta', display_name: 'Zeta' }),
      makeModel({ slug: 'alpha', display_name: 'Alpha' }),
    ]);
    expect(providers[0].models.map((m) => m.id)).toEqual(['alpha', 'zeta']);
  });

  it('falls back to slug when display_name is empty', () => {
    const providers = buildCodexModelSelectorProviders([
      makeModel({ slug: 'raw-id', display_name: '' }),
    ]);
    expect(providers[0].models[0].name).toBe('raw-id');
  });

  it('never includes a provider switcher or third-party endpoint catalog', () => {
    const providers = buildCodexModelSelectorProviders([makeModel()]);
    // Single Codex group only; no "openai", "anthropic", or multi-provider.
    expect(providers.every((p) => p.id === CODEX_PROVIDER_ID)).toBe(true);
  });
});

describe('CODEX_CUSTOM_MODEL_SENTINEL', () => {
  it('is a distinct sentinel that would never be a real model id', () => {
    expect(CODEX_CUSTOM_MODEL_SENTINEL).toBe('__codex_custom__');
    expect(CODEX_CUSTOM_MODEL_SENTINEL.startsWith('__')).toBe(true);
  });
});

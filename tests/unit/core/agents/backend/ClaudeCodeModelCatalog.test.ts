import {
  buildClaudeCodeModelSelectorProviders,
  CLAUDE_CODE_EFFORT_VARIANTS,
  CLAUDE_CODE_PROVIDER_ID,
} from '../../../../../src/core/agents/backend/ClaudeCodeModelCatalog';

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

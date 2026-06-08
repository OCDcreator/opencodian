import { buildClaudeCodeOptions } from '../../../../../src/core/agents/backend';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';

describe('ClaudeCodeOptionsBuilder systemPrompt option', () => {
  it('uses default preset when settings.systemPrompt is empty', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options.systemPrompt).toEqual({ type: 'preset', preset: 'claude_code' });
  });

  it('uses preset-with-append shape when settings.systemPrompt is non-empty', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        systemPrompt: 'Always use TypeScript.',
      },
    });

    expect(options.systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: 'Always use TypeScript.',
    });
  });

  it('trims systemPrompt whitespace before appending', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        systemPrompt: '  Always use TypeScript.  ',
      },
    });

    expect(options.systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: 'Always use TypeScript.',
    });
  });
});

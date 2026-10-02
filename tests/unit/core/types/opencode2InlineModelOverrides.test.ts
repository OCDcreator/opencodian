import {
  normalizeInlineCompletionModelOverrides,
  normalizeInlineEditEffortOverrides,
  normalizeInlineEditModelOverrides,
} from '../../../../src/core/types/settings';

describe('OpenCode 2 inline model override normalization (T02)', () => {
  it('keeps independent OpenCode 1 and 2 model identities while preserving the ZCode boundary', () => {
    const raw = {
      opencode: ' legacy/model ',
      opencode2: ' next/model ',
      'claude-code': ' claude-model ',
      codex: ' codex-model ',
      pi: ' pi/model ',
      zcode: ' zcode/model ',
      unknown: ' unknown/model ',
    };
    const edit = {
      opencode: 'legacy/model',
      opencode2: 'next/model',
      'claude-code': 'claude-model',
      codex: 'codex-model',
      pi: 'pi/model',
    };

    expect(normalizeInlineEditModelOverrides(raw)).toEqual(edit);
    expect(normalizeInlineCompletionModelOverrides(raw)).toEqual({ ...edit, zcode: 'zcode/model' });
    expect(raw.opencode2).toBe(' next/model ');
    expect(raw.zcode).toBe(' zcode/model ');
  });

  it.each([undefined, null, '', '   ', 42, false, [], {}])(
    'drops an invalid OpenCode 2 value %p without losing another backend', (opencode2) => {
      const input = { opencode: 'legacy/model', opencode2 };
      expect(normalizeInlineEditModelOverrides(input)).toEqual({ opencode: 'legacy/model' });
      expect(normalizeInlineCompletionModelOverrides(input)).toEqual({ opencode: 'legacy/model' });
    },
  );

  it('does not enable an OpenCode 2 or ZCode inline-edit effort override', () => {
    expect(normalizeInlineEditEffortOverrides({
      opencode2: 'high',
      zcode: 'high',
      'claude-code': ' high ',
      codex: 'low',
    })).toEqual({ 'claude-code': 'high', codex: 'low' });
  });
});

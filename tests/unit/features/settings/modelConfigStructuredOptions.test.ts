import {
  getStructuredModelOptionsState,
  setStructuredModelOption,
  setStructuredStringArrayOption,
  setStructuredThinkingBudget,
  setStructuredThinkingType,
} from '../../../../src/features/settings/modelConfigStructuredOptions';
import type { KeyValueFieldState } from '../../../../src/features/settings/modelConfigWorkspace';

function field(key: string, value: string): KeyValueFieldState {
  return {
    uid: `${key}-uid`,
    key,
    value,
  };
}

describe('modelConfigStructuredOptions', () => {
  it('reads known model option controls from existing key/value fields', () => {
    const fields = [
      field('reasoningEffort', 'high'),
      field('textVerbosity', 'medium'),
      field('reasoningSummary', 'auto'),
      field('include', '["reasoning.encrypted_content"]'),
      field('thinking', '{"type":"enabled","budgetTokens":4096}'),
    ];

    expect(getStructuredModelOptionsState(fields)).toEqual({
      reasoningEffort: 'high',
      textVerbosity: 'medium',
      reasoningSummary: 'auto',
      include: ['reasoning.encrypted_content'],
      thinkingType: 'enabled',
      thinkingBudgetTokens: '4096',
    });
  });

  it('updates string options without duplicating existing fields', () => {
    const fields = [field('reasoningEffort', 'low')];

    const next = setStructuredModelOption(fields, 'reasoningEffort', 'high');

    expect(next).toHaveLength(1);
    expect(next[0]).toEqual(expect.objectContaining({
      key: 'reasoningEffort',
      value: 'high',
    }));
  });

  it('removes string options when cleared', () => {
    const fields = [field('reasoningEffort', 'high'), field('temperature', '0.2')];

    const next = setStructuredModelOption(fields, 'reasoningEffort', '');

    expect(next).toEqual([expect.objectContaining({ key: 'temperature' })]);
  });

  it('writes include as a JSON string array', () => {
    const next = setStructuredStringArrayOption([], 'include', 'reasoning.encrypted_content, web_search_call.action.sources');

    expect(next).toEqual([
      expect.objectContaining({
        key: 'include',
        value: JSON.stringify([
          'reasoning.encrypted_content',
          'web_search_call.action.sources',
        ]),
      }),
    ]);
  });

  it('updates Anthropic thinking fields as one JSON object', () => {
    const withType = setStructuredThinkingType([], 'enabled');
    const withBudget = setStructuredThinkingBudget(withType, '4096');

    expect(withBudget).toEqual([
      expect.objectContaining({
        key: 'thinking',
        value: JSON.stringify({ type: 'enabled', budgetTokens: 4096 }, null, 2),
      }),
    ]);
  });

  it('removes thinking when both structured fields are cleared', () => {
    const fields = [field('thinking', '{"type":"enabled","budgetTokens":4096}')];

    const noType = setStructuredThinkingType(fields, '');
    const noBudget = setStructuredThinkingBudget(noType, '');

    expect(noBudget).toEqual([]);
  });
});

import { shouldFinalizeTrailingAssistantFooterOnly } from '../../../../src/features/chat/services/trailingAssistantPatchExecution';

describe('TrailingAssistantPatchFooterFinalizationDecisionHelper', () => {
  it('returns true when body signatures are unchanged', () => {
    expect(
      shouldFinalizeTrailingAssistantFooterOnly({
        previousBodySignature: '{"content":"Stable answer"}',
        nextBodySignature: '{"content":"Stable answer"}',
      }),
    ).toBe(true);
  });

  it('returns false when body signatures differ', () => {
    expect(
      shouldFinalizeTrailingAssistantFooterOnly({
        previousBodySignature: '{"content":"Stable answer"}',
        nextBodySignature: '{"content":"Updated answer"}',
      }),
    ).toBe(false);
  });
});

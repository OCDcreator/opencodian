import { normalizeConversationSessionSettings } from '../../../../src/core/types/chat';

describe('conversation session settings normalization', () => {
  it('keeps valid per-conversation overrides while normalizing numeric fields', () => {
    expect(normalizeConversationSessionSettings({
      autoCompactionEnabled: false,
      compactionReservedTokens: 12000.8,
      chatFontSizePx: 15.2,
    })).toEqual({
      autoCompactionEnabled: false,
      compactionReservedTokens: 12001,
      chatFontSizePx: 15,
    });
  });

  it('preserves explicit inherit markers and drops invalid override-only payloads', () => {
    expect(normalizeConversationSessionSettings({
      autoCompactionEnabled: null,
      compactionReservedTokens: null,
      chatFontSizePx: null,
    })).toEqual({
      autoCompactionEnabled: null,
      compactionReservedTokens: null,
      chatFontSizePx: null,
    });

    expect(normalizeConversationSessionSettings({
      compactionReservedTokens: 0,
      chatFontSizePx: 9,
    })).toBeUndefined();
    expect(normalizeConversationSessionSettings(null)).toBeUndefined();
  });
});

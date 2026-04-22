import { normalizeConversationSessionSettings } from '../../../../src/core/types/chat';

describe('conversation session settings normalization', () => {
  it('drops legacy compaction override fields from conversation session settings', () => {
    const legacyValue = {
      autoCompactionEnabled: false,
      compactionReservedTokens: 16_000,
      chatFontSizePx: 15.2,
    } as unknown as Partial<import('../../../../src/core/types/chat').ConversationSessionSettings>;

    expect(normalizeConversationSessionSettings(legacyValue)).toEqual({
      chatFontSizePx: 15,
    });
  });

  it('keeps valid per-conversation display overrides while normalizing numeric fields', () => {
    expect(normalizeConversationSessionSettings({
      chatFontSizePx: 15.2,
    })).toEqual({
      chatFontSizePx: 15,
    });
  });

  it('preserves explicit inherit markers and drops invalid override-only payloads', () => {
    expect(normalizeConversationSessionSettings({
      chatFontSizePx: null,
    })).toEqual({
      chatFontSizePx: null,
    });

    expect(normalizeConversationSessionSettings({
      chatFontSizePx: 9,
    })).toBeUndefined();
    expect(normalizeConversationSessionSettings(null)).toBeUndefined();
  });
});

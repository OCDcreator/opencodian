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

  it('normalizes codexModelOverride string', () => {
    expect(normalizeConversationSessionSettings({
      codexModelOverride: '  o4-mini  ',
    })).toEqual({
      codexModelOverride: 'o4-mini',
    });
  });

  it('drops empty codexModelOverride after trimming', () => {
    expect(normalizeConversationSessionSettings({
      codexModelOverride: '   ',
    })).toBeUndefined();
  });

  it('preserves explicit null codexModelOverride', () => {
    expect(normalizeConversationSessionSettings({
      codexModelOverride: null,
    })).toEqual({
      codexModelOverride: null,
    });
  });

  it('normalizes codexAdditionalDirectories string array', () => {
    expect(normalizeConversationSessionSettings({
      codexAdditionalDirectories: ['/tmp/probe', '/another/path'],
    })).toEqual({
      codexAdditionalDirectories: ['/tmp/probe', '/another/path'],
    });
  });

  it('drops empty codexAdditionalDirectories array', () => {
    expect(normalizeConversationSessionSettings({
      codexAdditionalDirectories: [],
    })).toBeUndefined();
  });

  it('drops codexAdditionalDirectories with only empty/whitespace strings', () => {
    expect(normalizeConversationSessionSettings({
      codexAdditionalDirectories: ['', '  ', ''],
    })).toBeUndefined();
  });

  it('filters whitespace-only entries from codexAdditionalDirectories', () => {
    expect(normalizeConversationSessionSettings({
      codexAdditionalDirectories: ['/valid', '', '  ', '/also-valid'],
    })).toEqual({
      codexAdditionalDirectories: ['/valid', '/also-valid'],
    });
  });

  it('preserves explicit null codexAdditionalDirectories', () => {
    expect(normalizeConversationSessionSettings({
      codexAdditionalDirectories: null,
    })).toEqual({
      codexAdditionalDirectories: null,
    });
  });

  it('preserves explicit true codexNetworkAccessEnabled', () => {
    expect(normalizeConversationSessionSettings({
      codexNetworkAccessEnabled: true,
    })).toEqual({
      codexNetworkAccessEnabled: true,
    });
  });

  it('preserves explicit false codexNetworkAccessEnabled', () => {
    expect(normalizeConversationSessionSettings({
      codexNetworkAccessEnabled: false,
    })).toEqual({
      codexNetworkAccessEnabled: false,
    });
  });

  it('preserves explicit null codexNetworkAccessEnabled', () => {
    expect(normalizeConversationSessionSettings({
      codexNetworkAccessEnabled: null,
    })).toEqual({
      codexNetworkAccessEnabled: null,
    });
  });

  it('drops non-boolean codexNetworkAccessEnabled values', () => {
    expect(normalizeConversationSessionSettings({
      codexNetworkAccessEnabled: 'true' as unknown as boolean,
    })).toBeUndefined();
  });
});

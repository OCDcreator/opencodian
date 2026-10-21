import { normalizeConversationSessionSettings } from '../../../../src/core/types/chat';

describe('conversation session settings normalization', () => {
  it('round-trips Claude model aliases, explicit Default and inheritance', () => {
    for (const override of [
      { provider: ' anthropic ', model: ' sonnet ' },
      { provider: 'claude-code', model: 'default' },
      null,
    ]) {
      const expected = override ? { provider: override.provider.trim(), model: override.model.trim() } : null;
      const normalized = normalizeConversationSessionSettings({ claudeModelOverride: override });
      expect(normalized).toEqual({ claudeModelOverride: expected });
      expect(normalizeConversationSessionSettings(JSON.parse(JSON.stringify(normalized)))).toEqual(normalized);
    }
  });

  it('drops malformed Claude models while preserving other backend overrides', () => {
    for (const override of [{ provider: '', model: 'sonnet' }, { provider: 'claude-code', model: '  ' }, []]) {
      expect(normalizeConversationSessionSettings({
        claudeModelOverride: override,
        piModelOverride: { provider: 'pi', model: 'pi-model' },
        codexModelOverride: 'codex-model',
      } as unknown as Parameters<typeof normalizeConversationSessionSettings>[0])).toEqual({
        piModelOverride: { provider: 'pi', model: 'pi-model' },
        codexModelOverride: 'codex-model',
      });
    }
  });

  it('round-trips Pi model and per-model effort overrides, including explicit inheritance', () => {
    const value = {
      piModelOverride: { provider: '  pi-provider ', model: ' model-a ' },
      piEffortOverrides: { 'pi-provider/model-a': 'low', 'pi-provider/model-b': null },
      chatFontSizePx: 15,
    } as unknown as Parameters<typeof normalizeConversationSessionSettings>[0];
    const normalized = normalizeConversationSessionSettings(value);
    expect(normalized).toEqual({
      piModelOverride: { provider: 'pi-provider', model: 'model-a' },
      piEffortOverrides: { 'pi-provider/model-a': 'low', 'pi-provider/model-b': null },
      chatFontSizePx: 15,
    });
    expect(normalizeConversationSessionSettings(JSON.parse(JSON.stringify(normalized)))).toEqual(normalized);
  });

  it('drops malformed Pi overrides without changing valid fields for other backends', () => {
    expect(normalizeConversationSessionSettings({
      piModelOverride: { provider: '', model: 'missing-provider' },
      piEffortOverrides: { 'pi/one': 12, 'pi/two': '', 'pi/three': ' future-sdk-level ' },
      codexModelOverride: 'codex-model',
    } as unknown as Parameters<typeof normalizeConversationSessionSettings>[0])).toEqual({
      piEffortOverrides: { 'pi/three': 'future-sdk-level' },
      codexModelOverride: 'codex-model',
    });
  });

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

  it.each(['max', 'ultra', 'persistent'] as const)('preserves per-conversation Codex effort %s', (effort) => {
    expect(normalizeConversationSessionSettings({
      codexModelReasoningEffort: effort,
    })).toEqual({
      codexModelReasoningEffort: effort,
    });
  });

  it.each(['inherit', 'on-request', 'never'] as const)('preserves supported Codex approval policy %s', (policy) => {
    expect(normalizeConversationSessionSettings({
      codexApprovalPolicy: policy,
    })).toEqual({
      codexApprovalPolicy: policy,
    });
  });

  it('migrates a persisted untrusted approval policy to on-request', () => {
    expect(normalizeConversationSessionSettings({
      codexApprovalPolicy: 'untrusted',
    })).toEqual({
      codexApprovalPolicy: 'on-request',
    });
  });

  it('preserves explicit null codexApprovalPolicy', () => {
    expect(normalizeConversationSessionSettings({
      codexApprovalPolicy: null,
    })).toEqual({
      codexApprovalPolicy: null,
    });
  });

  it('drops unknown Codex approval policy values', () => {
    expect(normalizeConversationSessionSettings({
      codexApprovalPolicy: 'whatever' as unknown as import('../../../../src/core/types/chat').ConversationSessionSettings['codexApprovalPolicy'],
    })).toBeUndefined();
  });
});

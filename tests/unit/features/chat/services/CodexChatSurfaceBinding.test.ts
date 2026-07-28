import type { CodexAuthMode } from '../../../../../src/core/agents/backend/BackendModelCatalog';
import type { CodexModelSummary } from '../../../../../src/core/agents/backend/CodexAdapter';
import {
  CodexChatSurfaceBinding,
  type CodexChatSurfaceBindingHost,
} from '../../../../../src/features/chat/services/CodexChatSurfaceBinding';

jest.mock('obsidian', () => ({
  Notice: class {
    noticeEl = { createEl: jest.fn(), empty: jest.fn(), addClass: jest.fn() };
    hide = jest.fn();
  },
}));

jest.mock('../../../../../src/i18n', () => ({
  t: (key: string) => key,
}));

function makeAdapter(overrides: {
  getModelList?: () => Promise<CodexModelSummary[] | null>;
  getAccountInfo?: () => Promise<unknown | null>;
} = {}): NonNullable<ReturnType<CodexChatSurfaceBindingHost['getCodexAdapter']>> {
  return {
    onSkillsChanged: jest.fn(() => ({ dispose: jest.fn() })),
    getModelList: overrides.getModelList ?? (() => Promise.resolve([
      { slug: 'gpt-5.4', display_name: 'GPT-5.4', visibility: 'list', supported_in_api: true, default_reasoning_level: null, description: null },
    ])),
    getAccountInfo: overrides.getAccountInfo ?? (() => Promise.resolve(null)),
  };
}

function makeHost(adapter: ReturnType<typeof makeAdapter> | null): CodexChatSurfaceBindingHost {
  return {
    getCodexAdapter: () => adapter,
    invalidateSlashCommandMenuCache: jest.fn(),
    openPluginSettings: jest.fn(),
    isCodexActive: () => true,
  };
}

describe('CodexChatSurfaceBinding.resolveCodexModelCatalog auth/Custom policy', () => {
  it('disables Custom when auth mode is known ChatGPT', async () => {
    const binding = new CodexChatSurfaceBinding(makeHost(makeAdapter({
      getAccountInfo: () => Promise.resolve({
        account: { type: 'chatgpt', email: 'user@example.com' },
        requiresOpenaiAuth: false,
      }),
    })));
    const result = await binding.resolveCodexModelCatalog();
    expect(result).not.toBeNull();
    expect(result!.authMode).toBe('chatgpt' as CodexAuthMode);
    const models = result!.providers[0].models;
    const customEntry = models.find((m) => m.id === '__codex_custom__');
    expect(customEntry).toBeUndefined();
  });

  it('allows Custom when auth mode is known API key', async () => {
    const binding = new CodexChatSurfaceBinding(makeHost(makeAdapter({
      getAccountInfo: () => Promise.resolve({
        account: { type: 'api_key' },
      }),
    })));
    const result = await binding.resolveCodexModelCatalog();
    expect(result!.authMode).toBe('apikey' as CodexAuthMode);
    const customEntry = result!.providers[0].models.find((m) => m.id === '__codex_custom__');
    expect(customEntry).toBeDefined();
    expect(customEntry!.name).toBe('chat.modelSelector.codex.customApiKey');
  });

  it('allows Custom but marks unverified when auth mode is unknown', async () => {
    const binding = new CodexChatSurfaceBinding(makeHost(makeAdapter({
      getAccountInfo: () => Promise.resolve(null),
    })));
    const result = await binding.resolveCodexModelCatalog();
    expect(result!.authMode).toBe('unknown' as CodexAuthMode);
    const customEntry = result!.providers[0].models.find((m) => m.id === '__codex_custom__');
    expect(customEntry).toBeDefined();
    expect(customEntry!.name).toBe('chat.modelSelector.codex.customUnverified');
  });

  it('does NOT infer ChatGPT from empty apiKey — unknown stays permissive', async () => {
    // Adapter returns no account info → auth mode is unknown (not ChatGPT)
    const binding = new CodexChatSurfaceBinding(makeHost(makeAdapter({
      getAccountInfo: () => Promise.resolve({}),
    })));
    const result = await binding.resolveCodexModelCatalog();
    expect(result!.authMode).toBe('unknown');
    const customEntry = result!.providers[0].models.find((m) => m.id === '__codex_custom__');
    expect(customEntry).toBeDefined();
  });

  it('returns null when adapter is unavailable', async () => {
    const binding = new CodexChatSurfaceBinding(makeHost(null));
    const result = await binding.resolveCodexModelCatalog();
    expect(result).toBeNull();
  });

  it('handles CLI doctor auth shape', async () => {
    const binding = new CodexChatSurfaceBinding(makeHost(makeAdapter({
      getAccountInfo: () => Promise.resolve({
        'stored auth mode': 'ChatGPT',
      }),
    })));
    const result = await binding.resolveCodexModelCatalog();
    expect(result!.authMode).toBe('chatgpt');
    const customEntry = result!.providers[0].models.find((m) => m.id === '__codex_custom__');
    expect(customEntry).toBeUndefined();
  });

  it('returns empty providers when model list is empty', async () => {
    const binding = new CodexChatSurfaceBinding(makeHost(makeAdapter({
      getModelList: () => Promise.resolve([]),
    })));
    const result = await binding.resolveCodexModelCatalog();
    expect(result!.providers).toHaveLength(0);
  });
});

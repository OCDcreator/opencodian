import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale } from '../../../../src/i18n';

describe('ConversationSessionSettingsModal Codex webSearchMode', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('renders webSearchMode dropdown when showCodexControls is true', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexNetworkAccessEnabled: false,
        codexWebSearchMode: 'cached',
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    expect(modal.contentEl.querySelector('[data-setting="codex-web-search-mode"]')).not.toBeNull();
  });

  it('initializes webSearchMode dropdown from overrides', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexNetworkAccessEnabled: false,
        codexWebSearchMode: 'cached',
      },
      initialOverrides: {
        codexWebSearchMode: 'live',
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    const select = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-web-search-mode"]',
    );

    expect(select?.value).toBe('live');
  });

  it('defaults webSearchMode dropdown to inherit when no override exists', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexNetworkAccessEnabled: false,
        codexWebSearchMode: 'cached',
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    const select = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-web-search-mode"]',
    );

    expect(select?.value).toBe('');
  });

  it('includes webSearchMode in save output', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexNetworkAccessEnabled: false,
        codexWebSearchMode: 'cached',
      },
      showCodexControls: true,
      onSave,
    });

    modal.onOpen();

    const select = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-web-search-mode"]',
    );

    if (!select) {
      throw new Error('Expected webSearchMode select to render');
    }

    select.value = 'live';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );
    saveButton?.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        codexWebSearchMode: 'live',
      }),
    );
  });

  it('sets webSearchMode to null when inherit is selected', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexNetworkAccessEnabled: false,
        codexWebSearchMode: 'cached',
      },
      initialOverrides: {
        codexWebSearchMode: 'live',
      },
      showCodexControls: true,
      onSave,
    });

    modal.onOpen();

    const select = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-web-search-mode"]',
    );

    if (!select) {
      throw new Error('Expected webSearchMode select to render');
    }

    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );
    saveButton?.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(undefined);
  });
});

import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale } from '../../../../src/i18n';

describe('ConversationSessionSettingsModal Codex networkAccessEnabled', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('renders networkAccessEnabled dropdown when showCodexControls is true', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexNetworkAccessEnabled: false,
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    expect(modal.contentEl.querySelector('[data-setting="codex-network-access-enabled"]')).not.toBeNull();
  });

  it('initializes networkAccessEnabled dropdown from overrides', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexNetworkAccessEnabled: false,
      },
      initialOverrides: {
        codexNetworkAccessEnabled: true,
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    const select = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-network-access-enabled"]',
    );

    expect(select?.value).toBe('true');
  });

  it('defaults networkAccessEnabled dropdown to inherit when no override exists', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexNetworkAccessEnabled: false,
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    const select = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-network-access-enabled"]',
    );

    expect(select?.value).toBe('');
  });

  it('includes networkAccessEnabled in save output', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexNetworkAccessEnabled: false,
      },
      showCodexControls: true,
      onSave,
    });

    modal.onOpen();

    const select = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-network-access-enabled"]',
    );

    if (!select) {
      throw new Error('Expected networkAccessEnabled select to render');
    }

    select.value = 'true';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );
    saveButton?.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        codexNetworkAccessEnabled: true,
      }),
    );
  });

  it('sets networkAccessEnabled to null when inherit is selected', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexNetworkAccessEnabled: false,
      },
      initialOverrides: {
        codexNetworkAccessEnabled: true,
      },
      showCodexControls: true,
      onSave,
    });

    modal.onOpen();

    const select = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-network-access-enabled"]',
    );

    if (!select) {
      throw new Error('Expected networkAccessEnabled select to render');
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

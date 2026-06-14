import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale } from '../../../../src/i18n';

describe('ConversationSessionSettingsModal Codex additionalDirectories', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('renders additionalDirectories textarea when showCodexControls is true', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    expect(modal.contentEl.querySelector('[data-setting="codex-additional-directories"]')).not.toBeNull();
  });

  it('initializes additionalDirectories textarea from overrides', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
      },
      initialOverrides: {
        codexAdditionalDirectories: ['/tmp/probe', '/another/path'],
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    const textarea = modal.contentEl.querySelector<HTMLTextAreaElement>(
      '[data-setting="codex-additional-directories"]',
    );

    expect(textarea?.value).toBe('/tmp/probe\n/another/path');
  });

  it('includes additionalDirectories in save output', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
      },
      showCodexControls: true,
      onSave,
    });

    modal.onOpen();

    const textarea = modal.contentEl.querySelector<HTMLTextAreaElement>(
      '[data-setting="codex-additional-directories"]',
    );

    if (!textarea) {
      throw new Error('Expected additionalDirectories textarea to render');
    }

    textarea.value = '/tmp/probe\n/another/path';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );
    saveButton?.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        codexAdditionalDirectories: ['/tmp/probe', '/another/path'],
      }),
    );
  });

  it('sets additionalDirectories to null when textarea is empty', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
      },
      initialOverrides: {
        codexAdditionalDirectories: ['/tmp/probe'],
      },
      showCodexControls: true,
      onSave,
    });

    modal.onOpen();

    const textarea = modal.contentEl.querySelector<HTMLTextAreaElement>(
      '[data-setting="codex-additional-directories"]',
    );

    if (!textarea) {
      throw new Error('Expected additionalDirectories textarea to render');
    }

    textarea.value = '';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );
    saveButton?.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(undefined);
  });
});

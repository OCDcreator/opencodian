import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale } from '../../../../src/i18n';

describe('ConversationSessionSettingsModal Codex model override', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('initializes model override input from overrides', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
      },
      initialOverrides: {
        codexModelOverride: 'o4-mini',
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    const modelInput = modal.contentEl.querySelector<HTMLInputElement>(
      '[data-setting="codex-model-override"]',
    );

    expect(modelInput?.value).toBe('o4-mini');
  });

  it('defaults model override input to empty when no override exists', () => {
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

    const modelInput = modal.contentEl.querySelector<HTMLInputElement>(
      '[data-setting="codex-model-override"]',
    );

    expect(modelInput?.value).toBe('');
  });

  it('includes model override in save output', async () => {
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

    const modelInput = modal.contentEl.querySelector<HTMLInputElement>(
      '[data-setting="codex-model-override"]',
    );

    if (!modelInput) {
      throw new Error('Expected model override input to render');
    }

    modelInput.value = 'o4-mini';
    modelInput.dispatchEvent(new Event('input', { bubbles: true }));

    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );
    saveButton?.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        codexModelOverride: 'o4-mini',
      }),
    );
  });

  it('sets model override to null when empty', async () => {
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
        codexModelOverride: 'o4-mini',
      },
      showCodexControls: true,
      onSave,
    });

    modal.onOpen();

    const modelInput = modal.contentEl.querySelector<HTMLInputElement>(
      '[data-setting="codex-model-override"]',
    );

    if (!modelInput) {
      throw new Error('Expected model override input to render');
    }

    modelInput.value = '';
    modelInput.dispatchEvent(new Event('input', { bubbles: true }));

    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );
    saveButton?.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(undefined);
  });
});

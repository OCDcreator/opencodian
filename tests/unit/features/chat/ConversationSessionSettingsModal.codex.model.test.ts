import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale } from '../../../../src/i18n';

const MOCK_MODELS = [
  { slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list', supported_in_api: true, default_reasoning_level: 'medium', description: null },
  { slug: 'gpt-5.4', display_name: 'gpt-5.4', visibility: 'list', supported_in_api: true, default_reasoning_level: 'medium', description: null },
];

describe('ConversationSessionSettingsModal Codex model override', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('initializes model override select from a known model override', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexAvailableModels: MOCK_MODELS,
      },
      initialOverrides: {
        codexModelOverride: 'gpt-5.5',
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    const modelSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-model-override"]',
    );

    expect(modelSelect?.value).toBe('gpt-5.5');
  });

  it('initializes custom input when override is not in the model list', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexAvailableModels: MOCK_MODELS,
      },
      initialOverrides: {
        codexModelOverride: 'o4-mini',
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    const modelSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-model-override"]',
    );
    const customInput = modal.contentEl.querySelector<HTMLInputElement>(
      '[data-setting="codex-model-override-custom"]',
    );

    expect(modelSelect?.value).toBe('__custom__');
    expect(customInput?.value).toBe('o4-mini');
    expect(customInput?.style.display).toBe('block');
  });

  it('defaults model override select to inherit when no override exists', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexAvailableModels: MOCK_MODELS,
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    const modelSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-model-override"]',
    );

    expect(modelSelect?.value).toBe('');
  });

  it('includes known model override in save output', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexAvailableModels: MOCK_MODELS,
      },
      showCodexControls: true,
      onSave,
    });

    modal.onOpen();

    const modelSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-model-override"]',
    );

    if (!modelSelect) {
      throw new Error('Expected model override select to render');
    }

    modelSelect.value = 'gpt-5.4';
    modelSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );
    saveButton?.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        codexModelOverride: 'gpt-5.4',
      }),
    );
  });

  it('includes custom model override in save output', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexAvailableModels: MOCK_MODELS,
      },
      showCodexControls: true,
      onSave,
    });

    modal.onOpen();

    const modelSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-model-override"]',
    );
    const customInput = modal.contentEl.querySelector<HTMLInputElement>(
      '[data-setting="codex-model-override-custom"]',
    );

    if (!modelSelect || !customInput) {
      throw new Error('Expected model override controls to render');
    }

    modelSelect.value = '__custom__';
    modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
    customInput.value = 'o4-mini';
    customInput.dispatchEvent(new Event('change', { bubbles: true }));

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

  it('sets model override to null when selecting inherit', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexAvailableModels: MOCK_MODELS,
      },
      initialOverrides: {
        codexModelOverride: 'gpt-5.5',
      },
      showCodexControls: true,
      onSave,
    });

    modal.onOpen();

    const modelSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-model-override"]',
    );

    if (!modelSelect) {
      throw new Error('Expected model override select to render');
    }

    modelSelect.value = '';
    modelSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );
    saveButton?.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(undefined);
  });
});

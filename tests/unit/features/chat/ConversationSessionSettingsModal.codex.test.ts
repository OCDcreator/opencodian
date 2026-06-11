import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale } from '../../../../src/i18n';

describe('ConversationSessionSettingsModal Codex controls', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('renders Codex section with sandbox mode and reasoning effort when showCodexControls is true', () => {
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

    expect(modal.contentEl.querySelector('[data-section="codex"]')).not.toBeNull();
    expect(modal.contentEl.querySelector('[data-setting="codex-sandbox-mode"]')).not.toBeNull();
    expect(modal.contentEl.querySelector('[data-setting="codex-reasoning-effort"]')).not.toBeNull();
    expect(modal.contentEl.querySelector('[data-setting="codex-model-override"]')).not.toBeNull();
  });

  it('does not render Codex section when showCodexControls is absent', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'OpenCode chat',
      defaults: { chatFontSizePx: 13 },
      onSave: jest.fn(),
    });

    modal.onOpen();

    expect(modal.contentEl.querySelector('[data-section="codex"]')).toBeNull();
    expect(modal.contentEl.querySelector('[data-setting="codex-sandbox-mode"]')).toBeNull();
    expect(modal.contentEl.querySelector('[data-setting="codex-reasoning-effort"]')).toBeNull();
    expect(modal.contentEl.querySelector('[data-setting="codex-model-override"]')).toBeNull();
  });

  it('does not render Codex section when showCodexControls is false', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Claude Code chat',
      defaults: { chatFontSizePx: 13 },
      showCodexControls: false,
      onSave: jest.fn(),
    });

    modal.onOpen();

    expect(modal.contentEl.querySelector('[data-section="codex"]')).toBeNull();
    expect(modal.contentEl.querySelector('[data-setting="codex-model-override"]')).toBeNull();
  });

  it('initializes sandbox mode dropdown from overrides', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
      },
      initialOverrides: {
        codexSandboxMode: 'read-only',
        codexModelReasoningEffort: 'high',
      },
      showCodexControls: true,
      onSave: jest.fn(),
    });

    modal.onOpen();

    const sandboxSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-sandbox-mode"]',
    );
    const effortSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-reasoning-effort"]',
    );

    expect(sandboxSelect?.value).toBe('read-only');
    expect(effortSelect?.value).toBe('high');
  });

  it('defaults sandbox mode dropdown to inherit when no override exists', () => {
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

    const sandboxSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-sandbox-mode"]',
    );

    expect(sandboxSelect?.value).toBe('');
  });

  it('includes Codex overrides in save output', async () => {
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

    const sandboxSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-sandbox-mode"]',
    );
    const effortSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-reasoning-effort"]',
    );

    if (!sandboxSelect || !effortSelect) {
      throw new Error('Expected Codex controls to render');
    }

    sandboxSelect.value = 'read-only';
    sandboxSelect.dispatchEvent(new Event('change', { bubbles: true }));
    effortSelect.value = 'xhigh';
    effortSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );
    saveButton?.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        codexSandboxMode: 'read-only',
        codexModelReasoningEffort: 'xhigh',
      }),
    );
  });

  it('sets Codex fields to null when inherit is selected', async () => {
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
        codexSandboxMode: 'read-only',
        codexModelReasoningEffort: 'high',
        codexModelOverride: 'o4-mini',
      },
      showCodexControls: true,
      onSave,
    });

    modal.onOpen();

    const sandboxSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-sandbox-mode"]',
    );
    const effortSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="codex-reasoning-effort"]',
    );
    const modelInput = modal.contentEl.querySelector<HTMLInputElement>(
      '[data-setting="codex-model-override"]',
    );

    if (!sandboxSelect || !effortSelect || !modelInput) {
      throw new Error('Expected Codex controls to render');
    }

    sandboxSelect.value = '';
    sandboxSelect.dispatchEvent(new Event('change', { bubbles: true }));
    effortSelect.value = '';
    effortSelect.dispatchEvent(new Event('change', { bubbles: true }));
    modelInput.value = '';
    modelInput.dispatchEvent(new Event('input', { bubbles: true }));

    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );
    saveButton?.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  it('shows a boundary hint that Codex settings apply to the next thread', () => {
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

    const codexSection = modal.contentEl.querySelector('[data-section="codex"]');
    expect(codexSection?.textContent).toContain('next thread');
  });
});

import type { ConversationSessionSettings } from '../../../../src/core/types';
import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';

describe('ConversationSessionSettingsModal', () => {
  it('renders grouped layout and submits inherit-aware session settings values', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Current chat',
      defaults: {
        autoCompactionEnabled: true,
        compactionReservedTokens: 10_000,
        chatFontSizePx: 13,
      },
      initialOverrides: {
        autoCompactionEnabled: false,
        compactionReservedTokens: null,
        chatFontSizePx: 16,
      },
      onSave,
    });

    modal.onOpen();

    expect(
      modal.contentEl.querySelector('.opencodian-session-settings-hero'),
    ).not.toBeNull();
    expect(
      modal.contentEl.querySelector('[data-section="compaction"]'),
    ).not.toBeNull();
    expect(
      modal.contentEl.querySelector('[data-section="display"]'),
    ).not.toBeNull();

    const autoDisabledButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '[data-setting="auto-compaction"][data-value="disabled"]',
    );
    const autoInheritButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '[data-setting="auto-compaction"][data-value="inherit"]',
    );
    const reservedInput = modal.contentEl.querySelector<HTMLInputElement>(
      '[data-setting="reserved-tokens"]',
    );
    const fontInput = modal.contentEl.querySelector<HTMLInputElement>(
      '[data-setting="chat-font-size"]',
    );
    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );

    expect(autoDisabledButton?.classList.contains('is-selected')).toBe(true);
    expect(reservedInput?.value).toBe('');
    expect(fontInput?.value).toBe('16');

    if (!autoInheritButton || !reservedInput || !fontInput || !saveButton) {
      throw new Error('Expected modal controls to render');
    }

    autoInheritButton.click();
    reservedInput.value = '14000';
    fontInput.value = '';

    saveButton.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith({
      autoCompactionEnabled: null,
      compactionReservedTokens: 14_000,
      chatFontSizePx: null,
    } satisfies ConversationSessionSettings);
  });

  it('shows a validation error for unsupported numeric input', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Current chat',
      defaults: {
        autoCompactionEnabled: true,
        compactionReservedTokens: 10_000,
        chatFontSizePx: 13,
      },
      onSave,
    });

    modal.onOpen();

    const reservedInput = modal.contentEl.querySelector<HTMLInputElement>(
      '[data-setting="reserved-tokens"]',
    );
    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );

    if (!reservedInput || !saveButton) {
      throw new Error('Expected modal controls to render');
    }

    reservedInput.value = '0';
    saveButton.click();
    await Promise.resolve();

    expect(onSave).not.toHaveBeenCalled();
    expect(
      modal.contentEl.querySelector('.opencodian-session-settings-error')?.textContent,
    ).toBe('Enter a positive reserved token count');
  });

  it('shows current conversation title and inherit summary in the hero section', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Research thread',
      defaults: {
        autoCompactionEnabled: false,
        compactionReservedTokens: 24_000,
        chatFontSizePx: 15,
      },
      onSave: jest.fn(),
    });

    modal.onOpen();

    expect(
      modal.contentEl.querySelector('.opencodian-session-settings-subtitle')?.textContent,
    ).toBe('Research thread');
    expect(
      modal.contentEl.querySelector('.opencodian-session-settings-hero-note')?.textContent,
    ).toContain('inherit');
  });
});

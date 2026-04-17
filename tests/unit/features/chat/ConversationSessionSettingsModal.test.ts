import type { ConversationSessionSettings } from '../../../../src/core/types';
import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';

describe('ConversationSessionSettingsModal', () => {
  it('renders overrides and submits inherit-aware session settings values', async () => {
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

    const autoSelect = modal.contentEl.querySelector<HTMLSelectElement>(
      '[data-setting="auto-compaction"]',
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

    expect(autoSelect?.value).toBe('disabled');
    expect(reservedInput?.value).toBe('');
    expect(fontInput?.value).toBe('16');

    if (!autoSelect || !reservedInput || !fontInput || !saveButton) {
      throw new Error('Expected modal controls to render');
    }

    autoSelect.value = 'inherit';
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
});

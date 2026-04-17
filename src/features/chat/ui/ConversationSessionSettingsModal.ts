import type { App } from 'obsidian';
import { Modal } from 'obsidian';

import type { ConversationSessionSettings } from '../../../core/types';
import {
  normalizeChatFontSizePx,
  normalizeCompactionReservedTokens,
} from '../../../core/types';
import { t } from '../../../i18n';

export interface ConversationSessionSettingsModalDefaults {
  autoCompactionEnabled: boolean;
  compactionReservedTokens: number;
  chatFontSizePx: number;
}

interface ConversationSessionSettingsModalOptions {
  conversationTitle: string;
  defaults: ConversationSessionSettingsModalDefaults;
  initialOverrides?: ConversationSessionSettings;
  onSave(
    overrides: ConversationSessionSettings | undefined,
  ): Promise<void> | void;
}

type AutoCompactionSelection = 'inherit' | 'enabled' | 'disabled';

export class ConversationSessionSettingsModal extends Modal {
  private autoCompactionSelectEl: HTMLSelectElement | null = null;
  private reservedTokensInputEl: HTMLInputElement | null = null;
  private chatFontSizeInputEl: HTMLInputElement | null = null;
  private errorEl: HTMLElement | null = null;
  private saveButtonEl: HTMLButtonElement | null = null;
  private cancelButtonEl: HTMLButtonElement | null = null;

  constructor(
    app: App,
    private readonly options: ConversationSessionSettingsModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('opencodian-session-settings-modal');
    this.contentEl.empty();
    this.titleEl.setText(t('chat.sessionSettings.modal.title'));

    this.contentEl.createDiv({
      cls: 'opencodian-session-settings-subtitle',
      text: this.options.conversationTitle,
    });

    this.autoCompactionSelectEl = this.createAutoCompactionField();
    this.reservedTokensInputEl = this.createNumberField({
      setting: 'reserved-tokens',
      name: t('chat.sessionSettings.modal.compactionReservedTokens'),
      description: t('chat.sessionSettings.modal.compactionReservedTokensDesc'),
      defaultValue: this.options.defaults.compactionReservedTokens,
      placeholder: String(this.options.defaults.compactionReservedTokens),
      initialValue: this.options.initialOverrides?.compactionReservedTokens,
    });
    this.chatFontSizeInputEl = this.createNumberField({
      setting: 'chat-font-size',
      name: t('chat.sessionSettings.modal.chatFontSize'),
      description: t('chat.sessionSettings.modal.chatFontSizeDesc'),
      defaultValue: `${this.options.defaults.chatFontSizePx}px`,
      placeholder: String(this.options.defaults.chatFontSizePx),
      initialValue: this.options.initialOverrides?.chatFontSizePx,
    });

    this.errorEl = this.contentEl.createDiv({
      cls: 'opencodian-session-settings-error',
    });

    const actionsEl = this.contentEl.createDiv({
      cls: 'opencodian-session-settings-actions',
    });
    this.cancelButtonEl = actionsEl.createEl('button', {
      cls: 'opencodian-session-settings-cancel',
      text: t('chat.sessionSettings.modal.cancel'),
      attr: { type: 'button' },
    });
    this.saveButtonEl = actionsEl.createEl('button', {
      cls: 'mod-cta opencodian-session-settings-save',
      text: t('chat.sessionSettings.modal.save'),
      attr: { type: 'button' },
    });

    this.cancelButtonEl.addEventListener('click', () => {
      this.close();
    });
    this.saveButtonEl.addEventListener('click', () => {
      void this.handleSave();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    this.modalEl.removeClass('opencodian-session-settings-modal');
    this.autoCompactionSelectEl = null;
    this.reservedTokensInputEl = null;
    this.chatFontSizeInputEl = null;
    this.errorEl = null;
    this.saveButtonEl = null;
    this.cancelButtonEl = null;
  }

  private createAutoCompactionField(): HTMLSelectElement {
    const fieldEl = this.contentEl.createDiv({
      cls: 'opencodian-session-settings-field',
    });
    fieldEl.createEl('label', {
      text: t('chat.sessionSettings.modal.autoCompaction'),
    });
    fieldEl.createDiv({
      cls: 'opencodian-session-settings-field-description',
      text: t('chat.sessionSettings.modal.autoCompactionDesc'),
    });
    fieldEl.createDiv({
      cls: 'opencodian-session-settings-field-hint',
      text: t('chat.sessionSettings.modal.defaultHint', {
        value: this.options.defaults.autoCompactionEnabled
          ? t('chat.sessionSettings.modal.enabled')
          : t('chat.sessionSettings.modal.disabled'),
      }),
    });

    const selectEl = fieldEl.createEl('select', {
      attr: {
        'data-setting': 'auto-compaction',
      },
    });
    this.appendOption(selectEl, 'inherit', t('chat.sessionSettings.modal.inherit'));
    this.appendOption(selectEl, 'enabled', t('chat.sessionSettings.modal.enabled'));
    this.appendOption(selectEl, 'disabled', t('chat.sessionSettings.modal.disabled'));

    const initialValue = this.options.initialOverrides?.autoCompactionEnabled;
    selectEl.value = initialValue === true
      ? 'enabled'
      : initialValue === false
        ? 'disabled'
        : 'inherit';
    return selectEl;
  }

  private createNumberField(options: {
    setting: string;
    name: string;
    description: string;
    defaultValue: string | number;
    placeholder: string;
    initialValue: number | null | undefined;
  }): HTMLInputElement {
    const fieldEl = this.contentEl.createDiv({
      cls: 'opencodian-session-settings-field',
    });
    fieldEl.createEl('label', {
      text: options.name,
    });
    fieldEl.createDiv({
      cls: 'opencodian-session-settings-field-description',
      text: options.description,
    });
    fieldEl.createDiv({
      cls: 'opencodian-session-settings-field-hint',
      text: t('chat.sessionSettings.modal.defaultHint', {
        value: String(options.defaultValue),
      }),
    });

    const inputEl = fieldEl.createEl('input', {
      cls: 'opencodian-session-settings-number-input',
      attr: {
        type: 'number',
        inputmode: 'numeric',
        placeholder: options.placeholder,
        'data-setting': options.setting,
      },
    });
    inputEl.value = typeof options.initialValue === 'number'
      ? String(options.initialValue)
      : '';
    return inputEl;
  }

  private appendOption(
    selectEl: HTMLSelectElement,
    value: AutoCompactionSelection,
    label: string,
  ): void {
    const optionEl = document.createElement('option');
    optionEl.value = value;
    optionEl.textContent = label;
    selectEl.appendChild(optionEl);
  }

  private async handleSave(): Promise<void> {
    this.setBusy(true);
    this.setError('');

    try {
      await this.options.onSave(this.buildOverrides());
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('chat.sessionSettings.savedRuntimeWarning');
      this.setError(message);
    } finally {
      this.setBusy(false);
    }
  }

  private buildOverrides(): ConversationSessionSettings | undefined {
    const overrides: ConversationSessionSettings = {};

    const autoCompactionSelection = this.autoCompactionSelectEl?.value ?? 'inherit';
    overrides.autoCompactionEnabled = autoCompactionSelection === 'enabled'
      ? true
      : autoCompactionSelection === 'disabled'
        ? false
        : null;

    const reservedTokensValue = this.reservedTokensInputEl?.value.trim() ?? '';
    if (reservedTokensValue.length > 0) {
      const normalizedReservedTokens = normalizeCompactionReservedTokens(
        Number(reservedTokensValue),
        -1,
      );
      if (normalizedReservedTokens <= 0) {
        throw new Error(t('chat.sessionSettings.validation.compactionReservedTokens'));
      }
      overrides.compactionReservedTokens = normalizedReservedTokens;
    } else {
      overrides.compactionReservedTokens = null;
    }

    const chatFontSizeValue = this.chatFontSizeInputEl?.value.trim() ?? '';
    if (chatFontSizeValue.length > 0) {
      const normalizedChatFontSizePx = normalizeChatFontSizePx(
        Number(chatFontSizeValue),
        0,
      );
      if (normalizedChatFontSizePx <= 0) {
        throw new Error(t('chat.sessionSettings.validation.chatFontSize'));
      }
      overrides.chatFontSizePx = normalizedChatFontSizePx;
    } else {
      overrides.chatFontSizePx = null;
    }

    return Object.values(overrides).every((value) => value === null)
      ? undefined
      : overrides;
  }

  private setBusy(isBusy: boolean): void {
    if (this.saveButtonEl) {
      this.saveButtonEl.disabled = isBusy;
    }
    if (this.cancelButtonEl) {
      this.cancelButtonEl.disabled = isBusy;
    }
  }

  private setError(message: string): void {
    if (this.errorEl) {
      this.errorEl.setText(message);
    }
  }
}

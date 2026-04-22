import type { App } from 'obsidian';
import { Modal } from 'obsidian';

import type { ConversationSessionSettings } from '../../../core/types';
import {
  normalizeChatFontSizePx,
} from '../../../core/types';
import { t } from '../../../i18n';

export interface ConversationSessionSettingsModalDefaults {
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

export class ConversationSessionSettingsModal extends Modal {
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

    const bodyEl = this.contentEl.createDiv({
      cls: 'opencodian-session-settings-body',
    });

    this.createHero(bodyEl);

    const displaySectionEl = this.createSection(bodyEl, {
      section: 'display',
      title: t('chat.sessionSettings.modal.displayGroup'),
      description: t('chat.sessionSettings.modal.displayGroupDesc'),
    });
    this.chatFontSizeInputEl = this.createNumberField(displaySectionEl, {
      setting: 'chat-font-size',
      name: t('chat.sessionSettings.modal.chatFontSize'),
      description: t('chat.sessionSettings.modal.chatFontSizeDesc'),
      defaultValue: `${this.options.defaults.chatFontSizePx}px`,
      placeholder: String(this.options.defaults.chatFontSizePx),
      initialValue: this.options.initialOverrides?.chatFontSizePx,
    });

    this.errorEl = bodyEl.createDiv({
      cls: 'opencodian-session-settings-error',
    });

    const actionsEl = bodyEl.createDiv({
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
    this.chatFontSizeInputEl = null;
    this.errorEl = null;
    this.saveButtonEl = null;
    this.cancelButtonEl = null;
  }

  private createHero(containerEl: HTMLElement): void {
    const heroEl = containerEl.createDiv({
      cls: 'opencodian-session-settings-hero',
    });
    const heroTextEl = heroEl.createDiv({
      cls: 'opencodian-session-settings-hero-text',
    });
    heroTextEl.createDiv({
      cls: 'opencodian-session-settings-subtitle',
      text: this.options.conversationTitle,
    });
    heroTextEl.createDiv({
      cls: 'opencodian-session-settings-hero-note',
      text: t('chat.sessionSettings.modal.inheritSummary'),
    });

    heroEl.createDiv({
      cls: 'opencodian-session-settings-hero-badge',
      text: t('chat.sessionSettings.modal.sessionOverrideBadge'),
    });
  }

  private createSection(
    containerEl: HTMLElement,
    options: { section: string; title: string; description: string },
  ): HTMLElement {
    const sectionEl = containerEl.createDiv({
      cls: 'opencodian-session-settings-section',
      attr: {
        'data-section': options.section,
      },
    });
    const headerEl = sectionEl.createDiv({
      cls: 'opencodian-session-settings-section-header',
    });
    headerEl.createDiv({
      cls: 'opencodian-session-settings-section-title',
      text: options.title,
    });
    headerEl.createDiv({
      cls: 'opencodian-session-settings-section-description',
      text: options.description,
    });
    return sectionEl;
  }

  private createNumberField(containerEl: HTMLElement, options: {
    setting: string;
    name: string;
    description: string;
    defaultValue: string | number;
    placeholder: string;
    initialValue: number | null | undefined;
  }): HTMLInputElement {
    const controlEl = this.createFieldShell(containerEl, {
      name: options.name,
      description: options.description,
      defaultValue: String(options.defaultValue),
    });

    const inputEl = controlEl.createEl('input', {
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

  private createFieldShell(
    containerEl: HTMLElement,
    options: { name: string; description: string; defaultValue: string },
  ): HTMLElement {
    const fieldEl = containerEl.createDiv({
      cls: 'opencodian-session-settings-field',
    });
    const infoEl = fieldEl.createDiv({
      cls: 'opencodian-session-settings-field-info',
    });
    infoEl.createEl('label', {
      cls: 'opencodian-session-settings-field-label',
      text: options.name,
    });
    infoEl.createDiv({
      cls: 'opencodian-session-settings-field-description',
      text: options.description,
    });
    infoEl.createDiv({
      cls: 'opencodian-session-settings-field-hint',
      text: t('chat.sessionSettings.modal.defaultHint', {
        value: options.defaultValue,
      }),
    });
    return fieldEl.createDiv({
      cls: 'opencodian-session-settings-field-control',
    });
  }

  private async handleSave(): Promise<void> {
    this.setBusy(true);
    this.setError('');

    try {
      await this.options.onSave(this.buildOverrides());
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setError(message);
    } finally {
      this.setBusy(false);
    }
  }

  private buildOverrides(): ConversationSessionSettings | undefined {
    const overrides: ConversationSessionSettings = {};

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

import type { App } from 'obsidian';
import { Modal } from 'obsidian';

import type {
  ConversationSessionSettings,
  QuestionCardPosition,
  QuestionDisplayMode,
  TitleMode,
} from '../../../core/types';
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

interface PluginSettingsSummary {
  titleMode: TitleMode;
  questionDisplayMode: QuestionDisplayMode;
  questionCardPosition: QuestionCardPosition;
  showAnsweredQuestionCards: boolean;
  renderUserMarkupAsCodeBlocks: boolean;
}

const PLUGIN_ID = 'opencodian';

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

    this.createSummaryDivider(bodyEl);

    const globalSectionEl = this.createSection(bodyEl, {
      section: 'global-defaults',
      title: t('chat.sessionSettings.modal.globalDefaultsGroup'),
      description: t('chat.sessionSettings.modal.globalDefaultsDesc'),
    });
    this.createSummaryRows(globalSectionEl);

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
    step?: number;
    min?: number;
    max?: number;
  }): HTMLInputElement {
    const controlEl = this.createFieldShell(containerEl, {
      name: options.name,
      description: options.description,
      defaultValue: String(options.defaultValue),
    });

    const stepperEl = controlEl.createDiv({
      cls: 'opencodian-session-settings-stepper',
    });

    const inputEl = stepperEl.createEl('input', {
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

    const step = options.step ?? 1;
    const min = options.min;
    const max = options.max;

    const decBtn = stepperEl.createEl('button', {
      cls: 'opencodian-session-settings-stepper-btn opencodian-session-settings-stepper-dec',
      attr: { type: 'button', 'aria-label': t('chat.sessionSettings.modal.decrease') },
    });
    decBtn.setText('−');

    const incBtn = stepperEl.createEl('button', {
      cls: 'opencodian-session-settings-stepper-btn opencodian-session-settings-stepper-inc',
      attr: { type: 'button', 'aria-label': t('chat.sessionSettings.modal.increase') },
    });
    incBtn.setText('+');

    const clampValue = (v: number): number => {
      if (min !== undefined && v < min) { return min; }
      if (max !== undefined && v > max) { return max; }
      return v;
    };

    const applyStep = (delta: number): void => {
      const current = Number(inputEl.value) || Number(options.placeholder) || 0;
      const next = clampValue(Math.round((current + delta) * 100) / 100);
      inputEl.value = String(next);
    };

    decBtn.addEventListener('click', () => { applyStep(-step); });
    incBtn.addEventListener('click', () => { applyStep(step); });

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

  private createSummaryDivider(containerEl: HTMLElement): void {
    containerEl.createDiv({
      cls: 'opencodian-session-settings-summary-divider',
    });
  }

  private readPluginSettingsSummary(): PluginSettingsSummary {
    const plugin = (this.app as typeof this.app & {
      plugins: {
        plugins: Record<string, unknown>;
      };
    }).plugins?.plugins?.[PLUGIN_ID] as
      | { settings: PluginSettingsSummary }
      | undefined
      | null;
    const s = plugin?.settings;
    return {
      titleMode: s?.titleMode ?? 'default',
      questionDisplayMode: s?.questionDisplayMode ?? 'all',
      questionCardPosition: s?.questionCardPosition ?? 'inline',
      showAnsweredQuestionCards: s?.showAnsweredQuestionCards ?? true,
      renderUserMarkupAsCodeBlocks: s?.renderUserMarkupAsCodeBlocks ?? false,
    };
  }

  private createSummaryRows(sectionEl: HTMLElement): void {
    const summary = this.readPluginSettingsSummary();

    const rows: Array<{
      id: string;
      label: string;
      chips: Array<{ text: string }>;
    }> = [
      {
        id: 'title',
        label: t('chat.sessionSettings.modal.summary.titleGeneration'),
        chips: [
          {
            text: summary.titleMode === 'ai'
              ? t('settings.titleGeneration.mode.ai')
              : t('settings.titleGeneration.mode.default'),
          },
        ],
      },
      {
        id: 'compaction',
        label: t('chat.sessionSettings.modal.summary.compaction'),
        chips: [
          { text: t('chat.sessionSettings.modal.summary.globalLevel') },
        ],
      },
      {
        id: 'questions',
        label: t('chat.sessionSettings.modal.summary.questions'),
        chips: [
          {
            text: summary.questionDisplayMode === 'all'
              ? t('settings.conversation.questionDisplayMode.all')
              : t('settings.conversation.questionDisplayMode.single'),
          },
          {
            text: summary.questionCardPosition === 'inline'
              ? t('settings.conversation.questionCardPosition.inline')
              : t('settings.conversation.questionCardPosition.aboveInput'),
          },
          {
            text: summary.showAnsweredQuestionCards
              ? t('chat.sessionSettings.modal.summary.showAnswered')
              : t('chat.sessionSettings.modal.summary.hideAnswered'),
          },
        ],
      },
      {
        id: 'rendering',
        label: t('chat.sessionSettings.modal.summary.rendering'),
        chips: [
          {
            text: summary.renderUserMarkupAsCodeBlocks
              ? t('chat.sessionSettings.modal.summary.on')
              : t('chat.sessionSettings.modal.summary.off'),
          },
        ],
      },
    ];

    const openSettingsLabel = t('chat.sessionSettings.modal.summary.openSettings');

    for (const row of rows) {
      this.createSummaryRow(sectionEl, row, openSettingsLabel);
    }
  }

  private createSummaryRow(
    containerEl: HTMLElement,
    row: { id: string; label: string; chips: Array<{ text: string }> },
    openSettingsLabel: string,
  ): void {
    const rowEl = containerEl.createDiv({
      cls: 'opencodian-session-settings-summary-row',
      attr: { 'data-summary': row.id },
    });

    rowEl.createDiv({
      cls: 'opencodian-session-settings-summary-label',
      text: row.label,
    });

    const chipsEl = rowEl.createDiv({
      cls: 'opencodian-session-settings-summary-chips',
    });
    for (const chip of row.chips) {
      chipsEl.createDiv({
        cls: 'opencodian-session-settings-summary-chip',
        text: chip.text,
      });
    }

    const linkEl = rowEl.createEl('button', {
      cls: 'opencodian-session-settings-summary-link',
      text: openSettingsLabel,
      attr: { type: 'button' },
    });
    linkEl.addEventListener('click', () => {
      const appSetting = (this.app as typeof this.app & {
        setting: { open: () => void; openTabById: (id: string) => void };
      }).setting;
      appSetting.open();
      appSetting.openTabById('opencodian');
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

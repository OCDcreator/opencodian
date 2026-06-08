/* eslint-disable max-lines -- This modal owns the session settings form, inherited-global summary, and settings deep-link behavior together. */
import type { App } from 'obsidian';
import { Modal } from 'obsidian';

import type {
  ConversationSessionSettings,
  OpencodeShareMode,
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
  /** Whether to show the title-generation global summary row. Defaults to true. */
  showTitleSummary?: boolean;
  /** Whether to show the compaction summary row. Defaults to false. */
  showCompactionSummary?: boolean;
  /** Whether to show question-card global summary rows. Defaults to true. */
  showQuestionsSummary?: boolean;
  onSave(
    overrides: ConversationSessionSettings | undefined,
  ): Promise<void> | void;
  onPreview?(
    overrides: ConversationSessionSettings | undefined,
  ): void;
  onCancelPreview?(): void;
  onShare?(): Promise<void> | void;
  onUnshare?(): Promise<void> | void;
  shareUrl?: string | null;
  shareMode?: OpencodeShareMode;
}

interface PluginSettingsSummary {
  titleMode: TitleMode;
  chatFontSizePx: number;
  questionDisplayMode: QuestionDisplayMode;
  questionCardPosition: QuestionCardPosition;
  showAnsweredQuestionCards: boolean;
  renderUserMarkupAsCodeBlocks: boolean;
}

const PLUGIN_ID = 'opencodian';
const SUMMARY_SETTINGS_TARGETS: Record<string, string> = {
  title: 'title',
  compaction: 'compaction',
  display: 'display',
  questions: 'questions',
  rendering: 'rendering',
};
const CLASSIC_SETTINGS_SCROLL_RETRY_DELAYS_MS = [0, 80, 200, 400] as const;

export class ConversationSessionSettingsModal extends Modal {
  private chatFontSizeInputEl: HTMLInputElement | null = null;
  private errorEl: HTMLElement | null = null;
  private saveButtonEl: HTMLButtonElement | null = null;
  private cancelButtonEl: HTMLButtonElement | null = null;
  private didSave = false;

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
      min: 10,
      max: 24,
    });
    this.chatFontSizeInputEl.addEventListener('input', () => {
      this.handlePreview();
    });

    this.createSharingSection(bodyEl);
    this.createSummaryDivider(bodyEl);

    const globalSectionEl = this.createSection(bodyEl, {
      section: 'global-defaults',
      title: t('chat.sessionSettings.modal.globalDefaultsGroup'),
      description: t('chat.sessionSettings.modal.globalDefaultsDesc'),
    });
    this.createSummaryRows(globalSectionEl);

    const footerEl = this.contentEl.createDiv({
      cls: 'opencodian-session-settings-footer',
    });
    this.errorEl = footerEl.createDiv({
      cls: 'opencodian-session-settings-error',
    });

    const actionsEl = footerEl.createDiv({
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
    if (!this.didSave) {
      this.options.onCancelPreview?.();
    }
    this.contentEl.empty();
    this.modalEl.removeClass('opencodian-session-settings-modal');
    this.chatFontSizeInputEl = null;
    this.errorEl = null;
    this.saveButtonEl = null;
    this.cancelButtonEl = null;
    this.didSave = false;
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
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    };

    decBtn.addEventListener('click', () => { applyStep(-step); });
    incBtn.addEventListener('click', () => { applyStep(step); });

    return inputEl;
  }

  private createSharingSection(containerEl: HTMLElement): void {
    if (!this.options.onShare && !this.options.onUnshare) {
      return;
    }

    const sectionEl = this.createSection(containerEl, {
      section: 'sharing',
      title: t('chat.sessionSharing.title'),
      description: t('chat.sessionSharing.desc'),
    });

    const isKnownUnshared = this.options.shareUrl === null;
    const isShared = Boolean(this.options.shareUrl);
    const isSharingDisabled = this.options.shareMode === 'disabled';
    const statusText = isShared
      ? t('chat.sessionSharing.status.shared')
      : isSharingDisabled
        ? t('chat.sessionSharing.status.disabled')
        : t('chat.sessionSharing.status.notShared');
    const statusEl = sectionEl.createDiv({
      cls: 'opencodian-session-settings-sharing-status',
      attr: { 'data-share-status': isShared ? 'shared' : isSharingDisabled ? 'disabled' : 'not-shared' },
      text: statusText,
    });
    if (this.options.shareUrl) {
      statusEl.createDiv({
        cls: 'opencodian-session-settings-sharing-url',
        attr: { 'data-share-url': 'true' },
        text: this.options.shareUrl,
      });
    }
    if (isSharingDisabled && !isShared) {
      sectionEl.createDiv({
        cls: 'opencodian-session-settings-sharing-hint',
        text: t('chat.sessionSharing.disabledByProjectConfig'),
      });
    }

    const actionsEl = sectionEl.createDiv({
      cls: 'opencodian-session-settings-sharing-actions',
    });

    if (this.options.onShare) {
      const shareButtonEl = actionsEl.createEl('button', {
        cls: 'mod-cta opencodian-session-settings-sharing-button',
        text: t('chat.sessionSharing.shareAndCopy'),
        attr: { type: 'button', 'data-action': 'share-session' },
      });
      shareButtonEl.disabled = isSharingDisabled;
      if (isSharingDisabled) {
        shareButtonEl.title = t('chat.sessionSharing.disabledByProjectConfig');
      }
      shareButtonEl.addEventListener('click', () => {
        void this.runSharingAction(shareButtonEl, this.options.onShare);
      });
    }

    if (this.options.onUnshare && !isKnownUnshared) {
      const unshareButtonEl = actionsEl.createEl('button', {
        cls: 'opencodian-session-settings-sharing-button',
        text: t('chat.sessionSharing.unshare'),
        attr: { type: 'button', 'data-action': 'unshare-session' },
      });
      unshareButtonEl.addEventListener('click', () => {
        void this.runSharingAction(unshareButtonEl, this.options.onUnshare);
      });
    }
  }

  private async runSharingAction(
    buttonEl: HTMLButtonElement,
    action: (() => Promise<void> | void) | undefined,
  ): Promise<void> {
    if (!action) {
      return;
    }

    buttonEl.disabled = true;
    this.setError('');
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setError(message);
    } finally {
      buttonEl.disabled = false;
    }
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
      chatFontSizePx: normalizeChatFontSizePx(s?.chatFontSizePx, this.options.defaults.chatFontSizePx),
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
      description?: string;
      chips: Array<{ text: string }>;
    }> = [
      ...(this.options.showTitleSummary !== false
        ? [{
            id: 'title',
            label: t('chat.sessionSettings.modal.summary.titleGeneration'),
            description: summary.titleMode === 'ai'
              ? t('chat.sessionSettings.modal.summary.titleGeneration.smartDesc')
              : t('chat.sessionSettings.modal.summary.titleGeneration.firstMessageDesc'),
            chips: [
              {
                text: summary.titleMode === 'ai'
                  ? t('settings.titleGeneration.mode.ai')
                  : t('settings.titleGeneration.mode.default'),
              },
            ],
          }]
        : []),
      ...(this.options.showCompactionSummary
        ? [{
            id: 'compaction',
            label: t('chat.sessionSettings.modal.summary.compaction'),
            chips: [
              { text: t('chat.sessionSettings.modal.summary.globalLevel') },
            ],
          }]
        : []),
      {
        id: 'display',
        label: t('chat.sessionSettings.modal.displayGroup'),
        chips: [
          { text: `${summary.chatFontSizePx}px` },
        ],
      },
      ...(this.options.showQuestionsSummary !== false
        ? [{
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
          }]
        : []),
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
    row: { id: string; label: string; description?: string; chips: Array<{ text: string }> },
    openSettingsLabel: string,
  ): void {
    const rowEl = containerEl.createDiv({
      cls: 'opencodian-session-settings-summary-row',
      attr: { 'data-summary': row.id },
    });

    const labelGroupEl = rowEl.createDiv({
      cls: 'opencodian-session-settings-summary-label-group',
    });
    labelGroupEl.createDiv({
      cls: 'opencodian-session-settings-summary-label',
      text: row.label,
    });
    if (row.description) {
      labelGroupEl.createDiv({
        cls: 'opencodian-session-settings-summary-description',
        text: row.description,
      });
    }

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
      const target = this.prepareSettingsTarget(row.id);
      const appSetting = (this.app as typeof this.app & {
        setting: { open: () => void; openTabById: (id: string) => void };
      }).setting;
      appSetting.open();
      try {
        appSetting.openTabById('opencodian');
      } catch {
        // Obsidian openTabById may throw if modal DOM isn't ready (race condition).
      }
      if (target?.layoutMode !== 'tabbed') {
        this.scheduleClassicSettingsDeepLink(row.id, target?.plugin);
      }
    });
  }

  private prepareSettingsTarget(rowId: string): {
    layoutMode?: string;
    plugin?: {
      settings?: {
        settingsPanelScrollTop?: number;
      };
      scheduleSettingsUiStateSave?: () => void;
    };
  } | null {
    const secondaryTab = SUMMARY_SETTINGS_TARGETS[rowId];
    if (!secondaryTab) {
      return null;
    }

    const plugin = (this.app as typeof this.app & {
      plugins: {
        plugins: Record<string, unknown>;
      };
    }).plugins?.plugins?.[PLUGIN_ID] as
      | {
        settings?: {
          settingsLayoutMode?: string;
          settingsTabbedPrimaryTab?: string;
          settingsTabbedSecondaryTabByPrimary?: Record<string, string>;
          settingsPanelScrollTop?: number;
        };
        saveSettings?: () => Promise<void> | void;
        scheduleSettingsUiStateSave?: () => void;
        settingsTab?: {
          prepareScrollToConversationOnNextOpen?: (secondaryTab?: string) => void;
        };
      }
      | undefined
      | null;

    if (!plugin?.settings) {
      return null;
    }

    plugin.settingsTab?.prepareScrollToConversationOnNextOpen?.(secondaryTab);

    if (plugin.settings.settingsLayoutMode === 'tabbed') {
      plugin.settings.settingsTabbedPrimaryTab = 'conversation';
      plugin.settings.settingsTabbedSecondaryTabByPrimary = {
        ...plugin.settings.settingsTabbedSecondaryTabByPrimary,
        conversation: secondaryTab,
      };
      void plugin.saveSettings?.();
    }

    return {
      layoutMode: plugin.settings.settingsLayoutMode,
      plugin,
    };
  }

  private scheduleClassicSettingsDeepLink(
    rowId: string,
    plugin?: {
      settings?: {
        settingsPanelScrollTop?: number;
      };
      scheduleSettingsUiStateSave?: () => void;
    },
  ): void {
    const targetId = SUMMARY_SETTINGS_TARGETS[rowId];
    if (!targetId) {
      return;
    }

    for (const delay of CLASSIC_SETTINGS_SCROLL_RETRY_DELAYS_MS) {
      window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          this.scrollClassicSettingsHeadingIntoView(targetId, plugin);
        });
      }, delay);
    }
  }

  private scrollClassicSettingsHeadingIntoView(
    targetId: string,
    plugin?: {
      settings?: {
        settingsPanelScrollTop?: number;
      };
      scheduleSettingsUiStateSave?: () => void;
    },
  ): void {
    const settingsRootEl = document.querySelector<HTMLElement>('.opencodian-settings--classic');
    if (!settingsRootEl) {
      return;
    }

    const targetEl = settingsRootEl.querySelector<HTMLElement>(
      `[data-settings-target="conversation-${targetId}"]`,
    );
    const headingEl = targetEl?.querySelector<HTMLElement>('.opencodian-settings-subsection-heading')
      ?? this.resolveClassicSettingsHeadingByText(settingsRootEl, targetId);
    if (!headingEl) {
      return;
    }

    const scrollContainer = this.resolveClassicSettingsScrollContainer(settingsRootEl);
    const headingRect = headingEl.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const quickNavEl = settingsRootEl.querySelector<HTMLElement>('.opencodian-settings-quick-nav');
    const quickNavOffset = quickNavEl ? this.resolveVisibleOffset(quickNavEl, containerRect) : 0;
    const targetScrollTop = Math.max(
      0,
      scrollContainer.scrollTop + (headingRect.top - containerRect.top) - quickNavOffset,
    );

    scrollContainer.scrollTop = targetScrollTop;
    if (plugin?.settings) {
      plugin.settings.settingsPanelScrollTop = targetScrollTop;
    }
    plugin?.scheduleSettingsUiStateSave?.();
  }

  private resolveClassicSettingsScrollContainer(settingsRootEl: HTMLElement): HTMLElement {
    const closestScrollContainer = settingsRootEl.closest<HTMLElement>(
      '.vertical-tab-content, .vertical-tab-content-container, .modal-content',
    );
    return closestScrollContainer ?? settingsRootEl;
  }

  private resolveVisibleOffset(
    element: HTMLElement,
    containerRect: DOMRect | Pick<DOMRect, 'top' | 'bottom'>,
  ): number {
    const elementRect = element.getBoundingClientRect();
    const visibleTop = Math.max(elementRect.top, containerRect.top);
    const visibleBottom = Math.min(elementRect.bottom, containerRect.bottom);
    return Math.max(0, visibleBottom - visibleTop);
  }

  private resolveClassicSettingsHeadingByText(
    settingsRootEl: HTMLElement,
    targetId: string,
  ): HTMLElement | undefined {
    const targetTitle = this.resolveClassicSettingsTargetTitle(targetId);
    if (!targetTitle) {
      return undefined;
    }

    return Array.from(
      settingsRootEl.querySelectorAll<HTMLElement>('.opencodian-settings-subsection-heading'),
    ).find((candidate) => candidate.textContent?.trim() === targetTitle);
  }

  private resolveClassicSettingsTargetTitle(targetId: string): string | null {
    switch (targetId) {
      case 'title':
        return t('settings.titleGeneration.title');
      case 'compaction':
        return t('settings.conversation.compaction.projectNote');
      case 'display':
        return t('settings.conversation.display.title');
      case 'questions':
        return t('settings.conversation.questions.title');
      case 'rendering':
        return t('settings.conversation.rendering.title');
      default:
        return null;
    }
  }

  private async handleSave(): Promise<void> {
    this.setBusy(true);
    this.setError('');

    try {
      await this.options.onSave(this.buildOverrides());
      this.didSave = true;
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setError(message);
    } finally {
      this.setBusy(false);
    }
  }

  private handlePreview(): void {
    if (!this.options.onPreview) {
      return;
    }

    try {
      this.options.onPreview(this.buildOverrides());
      this.setError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setError(message);
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

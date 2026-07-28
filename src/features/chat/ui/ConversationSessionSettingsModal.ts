/* eslint-disable max-lines -- This modal owns the session settings form, inherited-global summary, and settings deep-link behavior together. */
import type { App } from 'obsidian';
import { Modal } from 'obsidian';

import type { CodexModelSummary } from '../../../core/agents/backend/CodexAdapter';
import type { AppServerReviewResult, AppServerReviewTarget, AppServerThreadGoal } from '../../../core/agents/backend/CodexAppServerClient';
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
import type { CodexApprovalPolicy, CodexReasoningEffort, CodexSandboxMode, CodexWebSearchMode } from '../../../core/types/settings';
import { t } from '../../../i18n';
import {
  enhanceSettingsSelect,
  type SettingsDropdownControlHandle,
} from '../../settings/SettingsDropdownControl';

export interface ConversationSessionSettingsModalDefaults {
  chatFontSizePx: number;
  codexSandboxMode?: CodexSandboxMode;
  codexModelReasoningEffort?: CodexReasoningEffort;
  codexModelOverride?: string;
  codexAdditionalDirectories?: string[];
  codexNetworkAccessEnabled?: boolean;
  codexWebSearchMode?: CodexWebSearchMode;
  codexApprovalPolicy?: CodexApprovalPolicy;
  codexAvailableModels?: CodexModelSummary[];
  codexThreadGoal?: AppServerThreadGoal | null;
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
  /** Whether to show Codex-specific per-conversation overrides. Only true for Codex conversations. */
  showCodexControls?: boolean;
  onSave(
    overrides: ConversationSessionSettings | undefined,
  ): Promise<void> | void;
  onPreview?(
    overrides: ConversationSessionSettings | undefined,
  ): void;
  onCancelPreview?(): void;
  onShare?(): Promise<void> | void;
  onUnshare?(): Promise<void> | void;
  onOpenExperimentalActions?(): void;
  shareUrl?: string | null;
  shareMode?: OpencodeShareMode;
  onSetThreadGoal?(objective: string, options?: { tokenBudget?: number }): Promise<AppServerThreadGoal | null>;
  onClearThreadGoal?(): Promise<boolean>;
  /** Start a code review on the current Codex thread. Optional — only for Codex. */
  onStartReview?(target: AppServerReviewTarget): Promise<AppServerReviewResult | null>;
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
  private sandboxModeSelectEl: HTMLSelectElement | null = null;
  private reasoningEffortSelectEl: HTMLSelectElement | null = null;
  private codexModelOverrideSelectEl: HTMLSelectElement | null = null;
  private codexModelOverrideCustomInputEl: HTMLInputElement | null = null;
  private codexAdditionalDirectoriesTextareaEl: HTMLTextAreaElement | null = null;
  private codexNetworkAccessEnabledSelectEl: HTMLSelectElement | null = null;
  private codexWebSearchModeSelectEl: HTMLSelectElement | null = null;
  private codexApprovalPolicySelectEl: HTMLSelectElement | null = null;
  private codexGoalReadbackEl: HTMLElement | null = null;
  private codexGoalEmptyEl: HTMLElement | null = null;
  private codexGoalClearBtnEl: HTMLButtonElement | null = null;
  private codexGoalShellEl: HTMLElement | null = null;
  private codexReviewStatusEl: HTMLElement | null = null;
  private readonly dropdownHandles = new Set<SettingsDropdownControlHandle>();
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
    this.destroyDropdowns();
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

    this.createCodexSection(bodyEl);

    this.createSharingSection(bodyEl);
    this.createExperimentalActionsSection(bodyEl);
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
    this.destroyDropdowns();
    if (!this.didSave) {
      this.options.onCancelPreview?.();
    }
    this.contentEl.empty();
    this.modalEl.removeClass('opencodian-session-settings-modal');
    this.chatFontSizeInputEl = null;
    this.sandboxModeSelectEl = null;
    this.reasoningEffortSelectEl = null;
    this.codexModelOverrideSelectEl = null;
    this.codexModelOverrideCustomInputEl = null;
    this.codexAdditionalDirectoriesTextareaEl = null;
    this.codexNetworkAccessEnabledSelectEl = null;
    this.codexWebSearchModeSelectEl = null;
    this.codexApprovalPolicySelectEl = null;
    this.codexGoalReadbackEl = null;
    this.codexGoalEmptyEl = null;
    this.errorEl = null;
    this.saveButtonEl = null;
    this.cancelButtonEl = null;
    this.didSave = false;
  }

  private destroyDropdowns(): void {
    for (const handle of this.dropdownHandles) {
      handle.destroy();
    }
    this.dropdownHandles.clear();
  }

  private enhanceDropdown(selectEl: HTMLSelectElement): HTMLSelectElement {
    this.dropdownHandles.add(enhanceSettingsSelect(selectEl));
    return selectEl;
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

  private createDropdownField(containerEl: HTMLElement, options: {
    setting: string;
    name: string;
    description: string;
    defaultValue: string;
    choices: Array<{ value: string; label: string }>;
    initialValue: string | null | undefined;
    inheritLabel?: string;
  }): HTMLSelectElement {
    const controlEl = this.createFieldShell(containerEl, {
      name: options.name,
      description: options.description,
      defaultValue: options.defaultValue,
      controlId: options.setting,
    });

    const selectEl = controlEl.createEl('select', {
      cls: 'opencodian-session-settings-dropdown',
      attr: {
        id: options.setting,
        'data-setting': options.setting,
        'aria-labelledby': `${options.setting}-label`,
        'aria-label': options.name,
      },
    });

    if (options.inheritLabel === undefined || options.inheritLabel) {
      selectEl.createEl('option', {
        text: options.inheritLabel ?? t('chat.sessionSettings.modal.codexInherit'),
        attr: { value: '' },
      });
    }

    for (const choice of options.choices) {
      selectEl.createEl('option', {
        text: choice.label,
        attr: { value: choice.value },
      });
    }

    const initialValue = options.initialValue;
    if (typeof initialValue === 'string' && initialValue.length > 0) {
      selectEl.value = initialValue;
    }

    return this.enhanceDropdown(selectEl);
  }

  private createTextField(containerEl: HTMLElement, options: {
    setting: string;
    name: string;
    description: string;
    defaultValue: string;
    placeholder: string;
    initialValue: string | null | undefined;
  }): HTMLInputElement {
    const controlEl = this.createFieldShell(containerEl, {
      name: options.name,
      description: options.description,
      defaultValue: options.defaultValue,
      controlId: options.setting,
    });

    const inputEl = controlEl.createEl('input', {
      cls: 'opencodian-session-settings-text-input',
      attr: {
        type: 'text',
        id: options.setting,
        placeholder: options.placeholder,
        'data-setting': options.setting,
        'aria-labelledby': `${options.setting}-label`,
        'aria-label': options.name,
      },
    });
    inputEl.value = typeof options.initialValue === 'string'
      ? options.initialValue
      : '';

    return inputEl;
  }

  private createTextareaField(containerEl: HTMLElement, options: {
    setting: string;
    name: string;
    description: string;
    defaultValue: string;
    placeholder: string;
    initialValue: string[] | null | undefined;
  }): HTMLTextAreaElement {
    const controlEl = this.createFieldShell(containerEl, {
      name: options.name,
      description: options.description,
      defaultValue: options.defaultValue,
      controlId: options.setting,
    });

    const textareaEl = controlEl.createEl('textarea', {
      cls: 'opencodian-session-settings-textarea-input',
      attr: {
        placeholder: options.placeholder,
        'data-setting': options.setting,
        rows: '3',
      },
    });
    textareaEl.value = Array.isArray(options.initialValue)
      ? options.initialValue.join('\n')
      : '';

    return textareaEl;
  }

  private createCodexModelOverrideField(containerEl: HTMLElement, options: {
    setting: string;
    name: string;
    description: string;
    defaultValue: string;
    initialValue: string | null | undefined;
    models: CodexModelSummary[];
  }): HTMLSelectElement {
    const controlEl = this.createFieldShell(containerEl, {
      name: options.name,
      description: options.description,
      defaultValue: options.defaultValue,
    });

    const selectEl = controlEl.createEl('select', {
      cls: 'opencodian-session-settings-dropdown',
      attr: {
        id: options.setting,
        'data-setting': options.setting,
        'aria-labelledby': `${options.setting}-label`,
        'aria-label': options.name,
      },
    });

    selectEl.createEl('option', {
      text: t('chat.sessionSettings.modal.codexInherit'),
      attr: { value: '' },
    });

    for (const model of options.models) {
      selectEl.createEl('option', {
        text: model.display_name || model.slug,
        attr: { value: model.slug },
      });
    }

    selectEl.createEl('option', {
      text: t('settings.codex.model.customOption'),
      attr: { value: '__custom__' },
    });

    const customInputEl = controlEl.createEl('input', {
      cls: 'opencodian-session-settings-text-input',
      attr: {
        type: 'text',
        placeholder: t('settings.codex.model.customPlaceholder'),
        'data-setting': `${options.setting}-custom`,
      },
    });
    customInputEl.style.display = 'none';
    this.codexModelOverrideCustomInputEl = customInputEl;

    const initialValue = options.initialValue ?? '';
    const isKnownModel = options.models.some((m) => m.slug === initialValue);

    if (initialValue.length === 0) {
      selectEl.value = '';
      customInputEl.value = '';
      customInputEl.style.display = 'none';
    } else if (isKnownModel) {
      selectEl.value = initialValue;
      customInputEl.value = '';
      customInputEl.style.display = 'none';
    } else {
      selectEl.value = '__custom__';
      customInputEl.value = initialValue;
      customInputEl.style.display = 'block';
    }

    selectEl.addEventListener('change', () => {
      if (selectEl.value === '__custom__') {
        customInputEl.style.display = 'block';
        customInputEl.focus();
      } else {
        customInputEl.style.display = 'none';
        customInputEl.value = '';
      }
    });

    return this.enhanceDropdown(selectEl);
  }

  private createCodexSection(bodyEl: HTMLElement): void {
    if (!this.options.showCodexControls) {
      return;
    }

    const defaults = this.options.defaults;
    if (!defaults.codexSandboxMode || !defaults.codexModelReasoningEffort) {
      return;
    }

    const codexSectionEl = this.createSection(bodyEl, {
      section: 'codex',
      title: t('chat.sessionSettings.modal.codexGroup'),
      description: t('chat.sessionSettings.modal.codexGroupDesc'),
    });

    codexSectionEl.createDiv({
      cls: 'opencodian-session-settings-codex-boundary-hint',
      text: t('chat.sessionSettings.modal.codexBoundaryHint'),
    });

    this.codexModelOverrideSelectEl = this.createCodexModelOverrideField(codexSectionEl, {
      setting: 'codex-model-override',
      name: t('chat.sessionSettings.modal.codexModelOverride'),
      description: t('chat.sessionSettings.modal.codexModelOverrideDesc'),
      defaultValue: defaults.codexModelOverride || t('chat.sessionSettings.modal.codexModelOverrideEmpty'),
      initialValue: this.options.initialOverrides?.codexModelOverride,
      models: defaults.codexAvailableModels ?? [],
    });

    this.codexAdditionalDirectoriesTextareaEl = this.createTextareaField(codexSectionEl, {
      setting: 'codex-additional-directories',
      name: t('chat.sessionSettings.modal.codexAdditionalDirectories'),
      description: t('chat.sessionSettings.modal.codexAdditionalDirectoriesDesc'),
      defaultValue: defaults.codexAdditionalDirectories?.join('\n') || t('chat.sessionSettings.modal.codexAdditionalDirectoriesEmpty'),
      placeholder: t('settings.codex.additionalDirs.placeholder'),
      initialValue: this.options.initialOverrides?.codexAdditionalDirectories,
    });

    this.sandboxModeSelectEl = this.createDropdownField(codexSectionEl, {
      setting: 'codex-sandbox-mode',
      name: t('chat.sessionSettings.modal.codexSandboxMode'),
      description: t('chat.sessionSettings.modal.codexSandboxModeDesc'),
      defaultValue: this.sandboxModeLabel(defaults.codexSandboxMode),
      choices: [
        { value: 'read-only', label: t('settings.codex.sandbox.readOnly') },
        { value: 'workspace-write', label: t('settings.codex.sandbox.workspaceWrite') },
        { value: 'danger-full-access', label: t('settings.codex.sandbox.dangerFullAccess') },
      ],
      initialValue: this.options.initialOverrides?.codexSandboxMode,
    });

    this.reasoningEffortSelectEl = this.createDropdownField(codexSectionEl, {
      setting: 'codex-reasoning-effort',
      name: t('chat.sessionSettings.modal.codexReasoningEffort'),
      description: t('chat.sessionSettings.modal.codexReasoningEffortDesc'),
      defaultValue: this.effortLabel(defaults.codexModelReasoningEffort),
      choices: [
        { value: 'minimal', label: t('settings.codex.reasoning.minimal') },
        { value: 'low', label: t('settings.codex.reasoning.low') },
        { value: 'medium', label: t('settings.codex.reasoning.medium') },
        { value: 'high', label: t('settings.codex.reasoning.high') },
        { value: 'xhigh', label: t('settings.codex.reasoning.xhigh') },
      ],
      initialValue: this.options.initialOverrides?.codexModelReasoningEffort,
    });

    this.codexNetworkAccessEnabledSelectEl = this.createDropdownField(codexSectionEl, {
      setting: 'codex-network-access-enabled',
      name: t('chat.sessionSettings.modal.codexNetworkAccessEnabled'),
      description: t('chat.sessionSettings.modal.codexNetworkAccessEnabledDesc'),
      defaultValue: defaults.codexNetworkAccessEnabled === true
        ? t('chat.sessionSettings.modal.codexNetworkAccessEnabledOn')
        : t('chat.sessionSettings.modal.codexNetworkAccessEnabledOff'),
      choices: [
        { value: 'true', label: t('chat.sessionSettings.modal.codexNetworkAccessEnabledOn') },
        { value: 'false', label: t('chat.sessionSettings.modal.codexNetworkAccessEnabledOff') },
      ],
      initialValue: this.options.initialOverrides?.codexNetworkAccessEnabled === true
        ? 'true'
        : this.options.initialOverrides?.codexNetworkAccessEnabled === false
          ? 'false'
          : '',
    });

    this.codexWebSearchModeSelectEl = this.createDropdownField(codexSectionEl, {
      setting: 'codex-web-search-mode',
      name: t('chat.sessionSettings.modal.codexWebSearchMode'),
      description: t('chat.sessionSettings.modal.codexWebSearchModeDesc'),
      defaultValue: this.webSearchModeLabel(defaults.codexWebSearchMode ?? 'cached'),
      choices: [
        { value: 'disabled', label: t('settings.codex.webSearch.disabled') },
        { value: 'cached', label: t('settings.codex.webSearch.cached') },
        { value: 'live', label: t('settings.codex.webSearch.live') },
      ],
      initialValue: this.options.initialOverrides?.codexWebSearchMode,
    });

    this.codexApprovalPolicySelectEl = this.createDropdownField(codexSectionEl, {
      setting: 'codex-approval-policy',
      name: t('chat.sessionSettings.modal.codexApprovalPolicy'),
      description: t('chat.sessionSettings.modal.codexApprovalPolicyDesc'),
      defaultValue: this.approvalPolicyLabel(defaults.codexApprovalPolicy ?? 'inherit'),
      // The blank option means "no per-session override = use the global setting"
      // (null), distinct from the explicit "inherit" choice below which forces
      // the backend default regardless of the global policy.
      inheritLabel: t('chat.sessionSettings.modal.codexApprovalPolicyUseGlobal'),
      choices: [
        { value: 'inherit', label: t('settings.codex.approvalPolicy.inherit') },
        { value: 'untrusted', label: t('settings.codex.approvalPolicy.untrusted') },
        { value: 'on-request', label: t('settings.codex.approvalPolicy.onRequest') },
        { value: 'never', label: t('settings.codex.approvalPolicy.never') },
      ],
      initialValue: this.options.initialOverrides?.codexApprovalPolicy,
    });

    this.createCodexGoalSection(codexSectionEl);
    this.createCodexReviewSection(codexSectionEl);
  }

  private createCodexGoalSection(parentEl: HTMLElement): void {
    const goal = this.options.defaults.codexThreadGoal;

    const shellEl = parentEl.createDiv({ cls: 'opencodian-session-settings-codex-goal-shell' });

    const fieldEl = shellEl.createDiv({ cls: 'opencodian-session-settings-field' });
    const infoEl = fieldEl.createDiv({ cls: 'opencodian-session-settings-field-info' });
    infoEl.createEl('label', {
      cls: 'opencodian-session-settings-field-label',
      text: t('chat.sessionSettings.modal.codexThreadGoal'),
    });
    infoEl.createDiv({
      cls: 'opencodian-session-settings-field-description',
      text: t('chat.sessionSettings.modal.codexThreadGoalDesc'),
    });

    this.codexGoalReadbackEl = shellEl.createDiv({ cls: 'opencodian-session-settings-codex-goal-readback' });

    if (goal) {
      this.renderGoalReadback(goal);
    } else {
      this.codexGoalReadbackEl.style.display = 'none';
      this.codexGoalEmptyEl = shellEl.createDiv({
        cls: 'opencodian-session-settings-codex-goal-empty',
        text: t('chat.sessionSettings.modal.codexGoalNone'),
      });
      this.codexGoalEmptyEl.setAttribute('data-codex-thread-goal', 'empty');
    }

    this.codexGoalShellEl = shellEl;
    if (goal && this.options.onClearThreadGoal) {
      this.ensureClearGoalButton();
    }

    if (this.options.onSetThreadGoal) {
      const setInputShell = shellEl.createDiv({ cls: 'opencodian-session-settings-codex-goal-set' });
      const inputEl = setInputShell.createEl('input', {
        type: 'text',
        cls: 'opencodian-session-settings-codex-goal-input',
        placeholder: t('chat.sessionSettings.modal.codexGoalSetPlaceholder'),
      });
      const budgetInputEl = setInputShell.createEl('input', {
        type: 'number',
        cls: 'opencodian-session-settings-codex-goal-budget-input',
        placeholder: t('chat.sessionSettings.modal.codexGoalBudgetPlaceholder'),
        attr: { min: '0' },
      });
      const setBtn = setInputShell.createEl('button', {
        cls: 'opencodian-session-settings-codex-goal-set-btn',
        text: t('chat.sessionSettings.modal.codexGoalSet'),
      });
      setBtn.addEventListener('click', async () => {
        const objective = inputEl.value.trim();
        if (!objective) return;
        setBtn.disabled = true;
        const budgetRaw = budgetInputEl.value.trim();
        const budget = budgetRaw !== '' ? Number(budgetRaw) : undefined;
        const result = await this.options.onSetThreadGoal!(objective, budget !== undefined && !isNaN(budget) && budget > 0 ? { tokenBudget: budget } : undefined);
        setBtn.disabled = false;
        if (result && this.codexGoalReadbackEl) {
          this.renderGoalReadback(result);
          this.codexGoalReadbackEl.style.display = '';
          if (this.codexGoalEmptyEl) {
            this.codexGoalEmptyEl.remove();
            this.codexGoalEmptyEl = null;
          }
          this.ensureClearGoalButton();
        }
        inputEl.value = '';
        budgetInputEl.value = '';
      });
    }
  }

  private ensureClearGoalButton(): void {
    if (!this.options.onClearThreadGoal || !this.codexGoalShellEl) return;
    if (this.codexGoalClearBtnEl) return;
    const btn = this.codexGoalShellEl.createEl('button', {
      cls: 'opencodian-session-settings-codex-goal-clear-btn',
      text: t('chat.sessionSettings.modal.codexGoalClear'),
    });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const cleared = await this.options.onClearThreadGoal!();
      if (cleared && this.codexGoalReadbackEl) {
        this.codexGoalReadbackEl.style.display = 'none';
        this.codexGoalReadbackEl.empty();
      }
      btn.remove();
      this.codexGoalClearBtnEl = null;
      if (!this.codexGoalEmptyEl && this.codexGoalShellEl) {
        this.codexGoalEmptyEl = this.codexGoalShellEl.createDiv({
          cls: 'opencodian-session-settings-codex-goal-empty',
          text: t('chat.sessionSettings.modal.codexGoalNone'),
        });
        this.codexGoalEmptyEl.setAttribute('data-codex-thread-goal', 'empty');
      }
      btn.disabled = false;
    });
    this.codexGoalClearBtnEl = btn;
  }

  private createCodexReviewSection(parentEl: HTMLElement): void {
    if (!this.options.onStartReview) {
      return;
    }

    const shellEl = parentEl.createDiv({
      cls: 'opencodian-session-settings-codex-review-shell',
      attr: { 'data-codex-review-section': 'true' },
    });

    const fieldEl = shellEl.createDiv({ cls: 'opencodian-session-settings-field' });
    const infoEl = fieldEl.createDiv({ cls: 'opencodian-session-settings-field-info' });
    infoEl.createEl('label', {
      cls: 'opencodian-session-settings-field-label',
      text: t('chat.sessionSettings.modal.codexReview'),
    });
    infoEl.createDiv({
      cls: 'opencodian-session-settings-field-description',
      text: t('chat.sessionSettings.modal.codexReviewDesc'),
    });

    const controlsEl = shellEl.createDiv({ cls: 'opencodian-session-settings-codex-review-controls' });

    const targetSelect = controlsEl.createEl('select', {
      cls: 'opencodian-session-settings-codex-review-target dropdown',
      attr: {
        id: 'codex-review-target',
        'data-codex-review-target': 'true',
        'aria-label': t('chat.sessionSettings.modal.codexReview'),
      },
    });
    targetSelect.add(new Option(t('chat.sessionSettings.modal.codexReviewTargetUncommitted'), 'uncommittedChanges'));
    targetSelect.add(new Option(t('chat.sessionSettings.modal.codexReviewTargetBaseBranch'), 'baseBranch'));
    targetSelect.add(new Option(t('chat.sessionSettings.modal.codexReviewTargetCommit'), 'commit'));
    targetSelect.add(new Option(t('chat.sessionSettings.modal.codexReviewTargetCustom'), 'custom'));
    this.enhanceDropdown(targetSelect);

    const paramInput = controlsEl.createEl('input', {
      cls: 'opencodian-session-settings-codex-review-param',
      attr: {
        type: 'text',
        placeholder: t('chat.sessionSettings.modal.codexReviewParamPlaceholder'),
        'data-codex-review-param': 'true',
      },
    });
    paramInput.style.display = 'none';

    targetSelect.addEventListener('change', () => {
      paramInput.style.display = targetSelect.value === 'uncommittedChanges' ? 'none' : '';
      const ph = targetSelect.value === 'baseBranch'
        ? t('chat.sessionSettings.modal.codexReviewParamBranch')
        : targetSelect.value === 'commit'
          ? t('chat.sessionSettings.modal.codexReviewParamCommit')
          : t('chat.sessionSettings.modal.codexReviewParamCustom');
      paramInput.placeholder = ph;
    });

    const startBtn = controlsEl.createEl('button', {
      cls: 'opencodian-session-settings-codex-review-btn',
      attr: { 'data-codex-review-start': 'true' },
      text: t('chat.sessionSettings.modal.codexReviewStart'),
    });

    this.codexReviewStatusEl = shellEl.createDiv({
      cls: 'opencodian-session-settings-codex-review-status',
      attr: { 'data-codex-review-status': 'idle' },
    });

    startBtn.addEventListener('click', async () => {
      const targetType = targetSelect.value as AppServerReviewTarget['type'];
      const paramValue = paramInput.value.trim();
      let target: AppServerReviewTarget;
      switch (targetType) {
        case 'uncommittedChanges':
          target = { type: 'uncommittedChanges' };
          break;
        case 'baseBranch':
          target = { type: 'baseBranch', branch: paramValue || 'main' };
          break;
        case 'commit':
          target = { type: 'commit', sha: paramValue || 'HEAD' };
          break;
        case 'custom':
          target = { type: 'custom', instructions: paramValue || 'Review changes' };
          break;
      }
      startBtn.disabled = true;
      this.updateReviewStatus('in_progress');
      try {
        const result = await this.options.onStartReview!(target);
        if (result?.turn) {
          const normalized = this.normalizeReviewStatus(result.turn.status);
          const errorMsg = result.turn.error
            ?? (result.reviewMessages?.length ? undefined : undefined);
          this.updateReviewStatus(normalized, errorMsg);
        } else {
          this.updateReviewStatus('error', t('chat.sessionSettings.modal.codexReviewFailed'));
        }
      } catch (err) {
        this.updateReviewStatus('error', err instanceof Error ? err.message : String(err));
      } finally {
        startBtn.disabled = false;
      }
    });
  }

  /**
   * Normalize app-server turn status strings (camelCase) into the internal
   * status vocabulary used by `updateReviewStatus` (snake_case).
   *
   * The app-server returns `inProgress` for the synchronous response; after
   * waiting for `turn/completed`, the status is `completed` or `interrupted`.
   * Unknown values map to `error` as a safe default.
   */
  private normalizeReviewStatus(appServerStatus: string | undefined): string {
    if (!appServerStatus) return 'error';
    switch (appServerStatus) {
      case 'inProgress': return 'in_progress';
      case 'completed': return 'completed';
      case 'interrupted': return 'interrupted';
      default: return 'error';
    }
  }

  private updateReviewStatus(status: string, errorMessage?: string | null): void {
    if (!this.codexReviewStatusEl) return;
    this.codexReviewStatusEl.setAttribute('data-codex-review-status', status);
    const labelKey = status === 'in_progress'
      ? 'chat.sessionSettings.modal.codexReviewInProgress'
      : status === 'completed'
        ? 'chat.sessionSettings.modal.codexReviewCompleted'
        : status === 'interrupted'
          ? 'chat.sessionSettings.modal.codexReviewInterrupted'
          : 'chat.sessionSettings.modal.codexReviewFailed';
    let text = t(labelKey);
    if (errorMessage) {
      text += `: ${errorMessage}`;
    }
    this.codexReviewStatusEl.setText(text);
  }

  private renderGoalReadback(goal: AppServerThreadGoal): void {
    if (!this.codexGoalReadbackEl) return;
    this.codexGoalReadbackEl.empty();
    this.codexGoalReadbackEl.setAttribute('data-proof-state', 'readback');
    this.codexGoalReadbackEl.setAttribute('data-codex-thread-goal', 'true');

    const objectiveEl = this.codexGoalReadbackEl.createDiv({ cls: 'opencodian-session-settings-codex-goal-objective' });
    const truncated = goal.objective.length > 200 ? goal.objective.slice(0, 200) + '…' : goal.objective;
    objectiveEl.setText(truncated);

    const metaEl = this.codexGoalReadbackEl.createDiv({ cls: 'opencodian-session-settings-codex-goal-meta' });
    const statusLabel = t(`chat.sessionSettings.modal.codexGoalStatus.${goal.status}`) || goal.status;
    const parts: string[] = [
      `${t('chat.sessionSettings.modal.codexGoalStatus.label')}: ${statusLabel}`,
      `${t('chat.sessionSettings.modal.codexGoalTokens')}: ${goal.tokensUsed.toLocaleString()}`,
      `${t('chat.sessionSettings.modal.codexGoalTime')}: ${this.formatGoalDuration(goal.timeUsedSeconds)}`,
    ];
    if (goal.tokenBudget !== null) {
      parts.push(`${t('chat.sessionSettings.modal.codexGoalBudget')}: ${goal.tokensUsed.toLocaleString()} / ${goal.tokenBudget.toLocaleString()}`);
    }
    metaEl.setText(parts.join(' · '));
  }

  private formatGoalDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  }

  private sandboxModeLabel(mode: CodexSandboxMode): string {
    switch (mode) {
      case 'read-only': return t('settings.codex.sandbox.readOnly');
      case 'workspace-write': return t('settings.codex.sandbox.workspaceWrite');
      case 'danger-full-access': return t('settings.codex.sandbox.dangerFullAccess');
    }
  }

  private effortLabel(effort: CodexReasoningEffort): string {
    switch (effort) {
      case 'minimal': return t('settings.codex.reasoning.minimal');
      case 'low': return t('settings.codex.reasoning.low');
      case 'medium': return t('settings.codex.reasoning.medium');
      case 'high': return t('settings.codex.reasoning.high');
      case 'xhigh': return t('settings.codex.reasoning.xhigh');
    }
  }

  private webSearchModeLabel(mode: CodexWebSearchMode): string {
    switch (mode) {
      case 'disabled': return t('settings.codex.webSearch.disabled');
      case 'cached': return t('settings.codex.webSearch.cached');
      case 'live': return t('settings.codex.webSearch.live');
    }
  }

  private approvalPolicyLabel(policy: CodexApprovalPolicy): string {
    switch (policy) {
      case 'inherit': return t('settings.codex.approvalPolicy.inherit');
      case 'untrusted': return t('settings.codex.approvalPolicy.untrusted');
      case 'on-request': return t('settings.codex.approvalPolicy.onRequest');
      case 'never': return t('settings.codex.approvalPolicy.never');
    }
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

  private createExperimentalActionsSection(containerEl: HTMLElement): void {
    if (!this.options.onOpenExperimentalActions) {
      return;
    }

    const sectionEl = this.createSection(containerEl, {
      section: 'experimental-actions',
      title: t('chat.experimentalActions.launcher.title'),
      description: t('chat.experimentalActions.launcher.desc'),
    });
    const buttonEl = sectionEl.createEl('button', {
      cls: 'opencodian-session-settings-sharing-button',
      text: t('chat.experimentalActions.launcher.open'),
      attr: { type: 'button', 'data-action': 'open-experimental-actions' },
    });
    buttonEl.addEventListener('click', () => {
      this.options.onOpenExperimentalActions?.();
    });
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
    options: { name: string; description: string; defaultValue: string; controlId?: string },
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
      ...(options.controlId ? { attr: { for: options.controlId, id: `${options.controlId}-label` } } : {}),
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

    if (this.options.showCodexControls) {
      this.buildCodexOverrides(overrides);
    }

    return Object.values(overrides).every((value) => value === null)
      ? undefined
      : overrides;
  }

  private buildCodexOverrides(overrides: ConversationSessionSettings): void {
    const sandboxModeValue = this.sandboxModeSelectEl?.value ?? '';
    if (sandboxModeValue.length > 0) {
      overrides.codexSandboxMode = sandboxModeValue as CodexSandboxMode;
    } else {
      overrides.codexSandboxMode = null;
    }

    const effortValue = this.reasoningEffortSelectEl?.value ?? '';
    if (effortValue.length > 0) {
      overrides.codexModelReasoningEffort = effortValue as CodexReasoningEffort;
    } else {
      overrides.codexModelReasoningEffort = null;
    }

    const modelOverrideSelectValue = this.codexModelOverrideSelectEl?.value ?? '';
    if (modelOverrideSelectValue === '__custom__') {
      const customValue = this.codexModelOverrideCustomInputEl?.value?.trim() ?? '';
      overrides.codexModelOverride = customValue.length > 0 ? customValue : null;
    } else if (modelOverrideSelectValue.length > 0) {
      overrides.codexModelOverride = modelOverrideSelectValue;
    } else {
      overrides.codexModelOverride = null;
    }

    const additionalDirsValue = this.codexAdditionalDirectoriesTextareaEl?.value ?? '';
    const additionalDirs = additionalDirsValue
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (additionalDirs.length > 0) {
      overrides.codexAdditionalDirectories = additionalDirs;
    } else {
      overrides.codexAdditionalDirectories = null;
    }

    const networkAccessValue = this.codexNetworkAccessEnabledSelectEl?.value ?? '';
    if (networkAccessValue === 'true') {
      overrides.codexNetworkAccessEnabled = true;
    } else if (networkAccessValue === 'false') {
      overrides.codexNetworkAccessEnabled = false;
    } else {
      overrides.codexNetworkAccessEnabled = null;
    }

    const webSearchValue = this.codexWebSearchModeSelectEl?.value ?? '';
    if (webSearchValue.length > 0) {
      overrides.codexWebSearchMode = webSearchValue as CodexWebSearchMode;
    } else {
      overrides.codexWebSearchMode = null;
    }

    const approvalPolicyValue = this.codexApprovalPolicySelectEl?.value ?? '';
    if (approvalPolicyValue.length > 0) {
      overrides.codexApprovalPolicy = approvalPolicyValue as CodexApprovalPolicy;
    } else {
      overrides.codexApprovalPolicy = null;
    }
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

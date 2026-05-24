import type { App, ButtonComponent, ExtraButtonComponent } from 'obsidian';
import { Notice, requestUrl, Setting } from 'obsidian';

import {
  getBackendSessionPreview,
  listBackendSessions,
  type NormalizedSessionPreviewMessage,
  type NormalizedSessionPreviewPart,
  type NormalizedSessionRow,
} from '../../core/agents/backend/AgentBackendRouting';
import {
  parseModelReference,
  resolveModelSelection,
} from '../../core/config/modelConfig';
import type {
  OpencodeCompactionConfig,
  OpencodeShareMode,
  QuestionCardPosition,
  QuestionDisplayMode,
  TitleMode,
} from '../../core/types';
import {
  normalizeChatFontSizePx,
} from '../../core/types';
import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import {
  ConversationCompactionHelpModal,
  type ConversationCompactionHelpTopic,
} from './ConversationCompactionHelpModal';
import {
  buildModelPickerGroups,
  findModelPickerOptionByRef,
  type ModelPickerGroup,
} from './modelPicker';
import { ModelPickerModal } from './ModelPickerModal';
import { OpenCodeProjectConfigHelpModal } from './OpenCodeProjectConfigHelpModal';
import { ProjectConfigFileWatcher } from './ProjectConfigFileWatcher';
import type { SettingHelpButtonConfig } from './settingsStyleControls';

const logger = createLogger('SettingsConversationSection');
const OPENCODE_PUBLIC_SHARE_HOST = 'https://opncd.ai';
const OPENCODE_PUBLIC_SHARE_PROBE_URL = `${OPENCODE_PUBLIC_SHARE_HOST}/api/share`;

function parseNonNegativeInteger(value: string): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    return null;
  }
  return num;
}

interface SettingsConversationSectionOptions {
  app: App;
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  createSettingsBlock: (
    containerEl: HTMLElement,
    options: {
      title: string;
      description: string;
      collapsible?: boolean;
      defaultOpen?: boolean;
      onToggle?: (isOpen: boolean) => void;
    },
  ) => HTMLElement;
  addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
  setRefreshTitleModelsCallback: (callback?: () => void) => void;
}

interface ToggleValueControl {
  setValue(value: boolean): unknown;
}

interface TextValueControl {
  setValue(value: string): unknown;
}

interface DropdownValueControl {
  setValue(value: string): unknown;
}

type ShareDiagnosticState = 'ok' | 'warning' | 'error' | 'pending';

interface ShareHostDiagnosticResult {
  reachable: boolean;
  detail?: string;
}

export class SettingsConversationSection {
  private readonly app: App;
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  private readonly createSettingsBlock: (
    containerEl: HTMLElement,
    options: {
      title: string;
      description: string;
      collapsible?: boolean;
      defaultOpen?: boolean;
      onToggle?: (isOpen: boolean) => void;
    },
  ) => HTMLElement;
  private readonly addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
  private readonly setRefreshTitleModelsCallback: (callback?: () => void) => void;
  private titleModelSetting: Setting | null = null;
  private titleModelButton: ButtonComponent | null = null;
  private titleModelWarningButton: ExtraButtonComponent | null = null;
  private titleModelGroups: ModelPickerGroup[] = [];
  private projectCompactionAutoControl: ToggleValueControl | null = null;
  private projectCompactionPruneControl: ToggleValueControl | null = null;
  private projectCompactionTailTurnsControl: TextValueControl | null = null;
  private projectCompactionPreserveRecentTokensControl: TextValueControl | null = null;
  private projectCompactionReservedControl: TextValueControl | null = null;
  private projectShareModeControl: DropdownValueControl | null = null;
  private shareModeDiagnosticValueEl: HTMLElement | null = null;
  private sharedSessionsContainerEl: HTMLElement | null = null;
  private projectConfigWatcher: ProjectConfigFileWatcher | null = null;
  private currentCompactionState: {
    auto: boolean;
    prune: boolean;
    tailTurns: number;
    preserveRecentTokens: number | undefined;
    reserved: number | undefined;
  } = { auto: true, prune: true, tailTurns: 2, preserveRecentTokens: undefined, reserved: undefined };
  private currentShareMode: OpencodeShareMode = 'manual';

  constructor(options: SettingsConversationSectionOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.createSettingsBlock = options.createSettingsBlock;
    this.addSettingHelpButton = options.addSettingHelpButton;
    this.setRefreshTitleModelsCallback = options.setRefreshTitleModelsCallback;
  }

  dispose(): void {
    this.disposeProjectCompactionConfigListeners();
    this.setRefreshTitleModelsCallback(undefined);
    this.titleModelSetting = null;
    this.titleModelButton = null;
    this.titleModelWarningButton = null;
    this.titleModelGroups = [];
    this.projectCompactionAutoControl = null;
    this.projectCompactionPruneControl = null;
    this.projectCompactionTailTurnsControl = null;
    this.projectCompactionPreserveRecentTokensControl = null;
    this.projectCompactionReservedControl = null;
    this.projectShareModeControl = null;
    this.shareModeDiagnosticValueEl = null;
    this.sharedSessionsContainerEl = null;
  }

  private getActiveBackend(): AgentBackendKind | undefined {
    const activeBackend = this.plugin.settings.activeBackend;
    return activeBackend && this.plugin.settings.enabledBackends.includes(activeBackend)
      ? activeBackend
      : this.plugin.settings.enabledBackends[0];
  }

  private isOpenCodeActive(): boolean {
    return this.getActiveBackend() === 'opencode';
  }

  private canSaveOpenCodeProjectConversationConfig(): boolean {
    if (this.isOpenCodeActive()) {
      return true;
    }
    new Notice(t('settings.conversation.projectConfig.openCodeOnly'));
    return false;
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    this.resetState();
    this.setSharedCallbacks();

    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.conversation.title'),
      t('settings.quickNav.conversationDesc'),
    );

    const isOpenCodeActive = this.isOpenCodeActive();
    const titleGenerationBodyEl = isOpenCodeActive
      ? this.createSettingsBlock(containerEl, {
          title: t('settings.titleGeneration.title'),
          description: t('settings.titleGeneration.groupDesc'),
        })
      : null;
    if (titleGenerationBodyEl) {
      this.markSettingsTarget(titleGenerationBodyEl, 'title');
    }
    const compactionBodyEl = isOpenCodeActive
      ? this.createSettingsBlock(containerEl, {
          title: t('settings.conversation.compaction.projectNote'),
          description: t('settings.conversation.compaction.projectNoteDesc'),
        })
      : null;
    if (compactionBodyEl) {
      this.markSettingsTarget(compactionBodyEl, 'compaction');
    }
    const sharingBodyEl = isOpenCodeActive
      ? this.createSettingsBlock(containerEl, {
          title: t('settings.conversation.share.projectNote'),
          description: t('settings.conversation.share.projectNoteDesc'),
        })
      : null;
    if (sharingBodyEl) {
      this.markSettingsTarget(sharingBodyEl, 'sharing');
    }
    const displayBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.conversation.display.title'),
      description: t('settings.conversation.display.desc'),
    });
    this.markSettingsTarget(displayBodyEl, 'display');
    const questionBodyEl = isOpenCodeActive
      ? this.createSettingsBlock(containerEl, {
          title: t('settings.conversation.questions.title'),
          description: t('settings.conversation.questions.desc'),
        })
      : null;
    if (questionBodyEl) {
      this.markSettingsTarget(questionBodyEl, 'questions');
    }
    const renderingBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.conversation.rendering.title'),
      description: t('settings.conversation.rendering.desc'),
    });
    this.markSettingsTarget(renderingBodyEl, 'rendering');

    if (titleGenerationBodyEl) {
      this.renderTitleBlock(titleGenerationBodyEl);
    }
    if (compactionBodyEl) {
      this.renderCompactionBlock(compactionBodyEl);
    }
    if (sharingBodyEl) {
      this.renderSharingBlock(sharingBodyEl);
    }
    this.renderDisplayBlock(displayBodyEl);
    if (questionBodyEl) {
      this.renderQuestionsBlock(questionBodyEl);
    }
    this.renderRenderingBlock(renderingBodyEl);

    this.finishAttach();

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    this.resetState();
    this.setSharedCallbacks();

    const blocks: { id: string; render: (el: HTMLElement) => void }[] = [
      ...(this.isOpenCodeActive()
        ? [
            { id: 'title', render: (el: HTMLElement) => this.renderTitleBlock(el) },
            { id: 'compaction', render: (el: HTMLElement) => this.renderCompactionBlock(el) },
            { id: 'sharing', render: (el: HTMLElement) => this.renderSharingBlock(el) },
          ]
        : []),
      { id: 'display', render: (el) => this.renderDisplayTabBlock(el) },
      ...(this.isOpenCodeActive()
        ? [{ id: 'questions', render: (el: HTMLElement) => this.renderQuestionsBlock(el) }]
        : []),
    ];

    for (const block of blocks) {
      const blockEl = containerEl.createDiv({
        attr: {
          'data-section-block': block.id,
          'data-settings-target': `conversation-${block.id}`,
        },
      });
      block.render(blockEl);
      if (block.id !== secondaryTabId) {
        blockEl.style.display = 'none';
      }
    }

    this.finishAttach();
  }

  private resetState(): void {
    this.disposeProjectCompactionConfigListeners();
    this.titleModelSetting = null;
    this.titleModelButton = null;
    this.titleModelWarningButton = null;
    this.titleModelGroups = [];
    this.projectCompactionAutoControl = null;
    this.projectCompactionPruneControl = null;
    this.projectCompactionTailTurnsControl = null;
    this.projectCompactionPreserveRecentTokensControl = null;
    this.projectCompactionReservedControl = null;
    this.projectShareModeControl = null;
    this.shareModeDiagnosticValueEl = null;
    this.sharedSessionsContainerEl = null;
  }

  private setSharedCallbacks(): void {
    this.setRefreshTitleModelsCallback(() => {
      void this.loadTitleModels();
    });
  }

  private renderTitleBlock(containerEl: HTMLElement): void {
    this.addTitleModeSetting(containerEl);
    this.addTitleModelSetting(containerEl);
  }

  private renderCompactionBlock(containerEl: HTMLElement): void {
    this.addProjectCompactionSettings(containerEl);
  }

  private renderSharingBlock(containerEl: HTMLElement): void {
    this.addProjectShareSettings(containerEl);
  }

  private renderDisplayBlock(containerEl: HTMLElement): void {
    this.addChatFontSizeSetting(containerEl);
  }

  private renderDisplayTabBlock(containerEl: HTMLElement): void {
    this.renderDisplayBlock(containerEl);
    this.renderRenderingBlock(containerEl);
  }

  private renderQuestionsBlock(containerEl: HTMLElement): void {
    this.addQuestionDisplayModeSetting(containerEl);
    this.addQuestionCardPositionSetting(containerEl);
    this.addAnsweredQuestionCardsSetting(containerEl);
  }

  private renderRenderingBlock(containerEl: HTMLElement): void {
    this.addUserMarkupRenderSetting(containerEl);
  }

  private finishAttach(): void {
    this.updateTitleModelSettingVisibility();
    if (this.isOpenCodeActive()) {
      void this.loadTitleModels();
      this.registerProjectConfigListeners();
      void this.loadProjectConversationConfig();
    }
  }

  private markSettingsTarget(bodyEl: HTMLElement, blockId: string): void {
    const blockEl = bodyEl.closest<HTMLElement>('.opencodian-settings-block');
    const targetEl = blockEl ?? bodyEl;
    targetEl.dataset.sectionBlock = blockId;
    targetEl.dataset.settingsTarget = `conversation-${blockId}`;
  }

  private registerProjectConfigListeners(): void {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      return;
    }

    this.projectConfigWatcher = new ProjectConfigFileWatcher({
      app: this.app,
      configPath: configManager.getConfigPath(),
      onChange: () => {
        void this.loadProjectConversationConfig();
      },
    });
    this.projectConfigWatcher.start();
  }

  private disposeProjectCompactionConfigListeners(): void {
    this.projectConfigWatcher?.dispose();
    this.projectConfigWatcher = null;
  }

  private updateTitleModelSettingVisibility(): void {
    if (!this.titleModelSetting) {
      return;
    }

    this.titleModelSetting.settingEl.style.display = this.plugin.settings.titleMode === 'ai' ? '' : 'none';
  }

  private async loadTitleModels(): Promise<void> {
    const selectedValue = this.plugin.settings.aiTitleModel;
    const normalizedSelectedValue = selectedValue.trim();
    let selectedLabel = normalizedSelectedValue;
    let showUnavailableWarning = false;

    try {
      if (this.plugin.modelConfigService) {
        const catalogs = await this.plugin.modelConfigService.getCatalogs(
          this.plugin.settings.modelSourceMode,
          this.plugin.settings.disabledModelRefs,
        );
        this.titleModelGroups = buildModelPickerGroups(catalogs.effective);

        const selectedOption = findModelPickerOptionByRef(this.titleModelGroups, normalizedSelectedValue);
        if (selectedOption) {
          selectedLabel = `${selectedOption.providerName} / ${selectedOption.modelName}`;
        } else if (normalizedSelectedValue) {
          const parsedRef = parseModelReference(normalizedSelectedValue);
          if (parsedRef) {
            const resolution = resolveModelSelection(
              catalogs.baseEffective,
              catalogs.effective,
              parsedRef.provider,
              parsedRef.model,
            );
            selectedLabel = `${resolution.providerName || parsedRef.provider} / ${resolution.modelName || parsedRef.model}`;
            showUnavailableWarning = resolution.status === 'unavailable';
          } else {
            selectedLabel = normalizedSelectedValue;
          }
        }
      }
    } catch (error) {
      logger.error('Failed to load AI title models:', error);
      this.titleModelGroups = [];
      selectedLabel = normalizedSelectedValue;
    }

    if (this.titleModelButton) {
      this.titleModelButton.setButtonText(
        selectedLabel || t('settings.titleGeneration.model.followCurrent'),
      );
      this.titleModelButton.setDisabled(this.titleModelGroups.length === 0 && !normalizedSelectedValue);
    }

    if (this.titleModelWarningButton) {
      this.titleModelWarningButton.extraSettingsEl.style.display = showUnavailableWarning ? '' : 'none';
      this.titleModelWarningButton.setTooltip(t('settings.titleGeneration.model.unavailableNotice'));
    }

    this.updateTitleModelSettingVisibility();
  }

  private addTitleModeSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.titleGeneration.mode.name'))
      .setDesc(t('settings.titleGeneration.mode.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('default', t('settings.titleGeneration.mode.default'))
          .addOption('ai', t('settings.titleGeneration.mode.ai'))
          .setValue(this.plugin.settings.titleMode)
          .onChange(async (value) => {
            this.plugin.settings.titleMode = value as TitleMode;
            await this.plugin.saveSettings();
            this.updateTitleModelSettingVisibility();
          });
      });
  }

  private addQuestionDisplayModeSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.conversation.questionDisplayMode.name'))
      .setDesc(t('settings.conversation.questionDisplayMode.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('all', t('settings.conversation.questionDisplayMode.all'))
          .addOption('single', t('settings.conversation.questionDisplayMode.single'))
          .setValue(this.plugin.settings.questionDisplayMode)
          .onChange(async (value) => {
            this.plugin.settings.questionDisplayMode = value as QuestionDisplayMode;
            await this.plugin.saveSettings();
            this.plugin.refreshQuestionUi();
          });
      });
  }

  private addProjectCompactionSettings(containerEl: HTMLElement): void {
    const autoSetting = new Setting(containerEl)
      .setName(t('settings.conversation.compaction.auto.name'))
      .setDesc(t('settings.conversation.compaction.auto.desc'))
      .addToggle((toggle) => {
        this.projectCompactionAutoControl = toggle;
        toggle
          .setValue(true)
          .onChange(async (value) => {
            if (!this.canSaveOpenCodeProjectConversationConfig()) {
              this.projectCompactionAutoControl?.setValue(this.currentCompactionState.auto);
              return;
            }
            this.currentCompactionState.auto = value;
            await this.saveProjectCompactionConfig({ auto: value });
          });
      });
    this.addCompactionHelpButton(autoSetting, 'auto');

    const pruneSetting = new Setting(containerEl)
      .setName(t('settings.conversation.compaction.prune.name'))
      .setDesc(t('settings.conversation.compaction.prune.desc'))
      .addToggle((toggle) => {
        this.projectCompactionPruneControl = toggle;
        toggle
          .setValue(true)
          .onChange(async (value) => {
            if (!this.canSaveOpenCodeProjectConversationConfig()) {
              this.projectCompactionPruneControl?.setValue(this.currentCompactionState.prune);
              return;
            }
            this.currentCompactionState.prune = value;
            await this.saveProjectCompactionConfig({ prune: value });
          });
      });
    this.addCompactionHelpButton(pruneSetting, 'prune');

    const tailTurnsSetting = new Setting(containerEl)
      .setName(t('settings.conversation.compaction.tailTurns.name'))
      .setDesc(t('settings.conversation.compaction.tailTurns.desc'))
      .addText((text) => {
        this.projectCompactionTailTurnsControl = text;
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
        text
          .setPlaceholder('2')
          .setValue('2')
          .onChange(async (value) => {
            if (!this.canSaveOpenCodeProjectConversationConfig()) {
              this.resetCompactionTailTurnsInput();
              return;
            }
            const parsed = parseNonNegativeInteger(value.trim());
            if (parsed === null) {
              this.resetCompactionTailTurnsInput();
              return;
            }
            this.currentCompactionState.tailTurns = parsed;
            await this.saveProjectCompactionConfig({ tail_turns: parsed });
          });
      });
    this.addCompactionHelpButton(tailTurnsSetting, 'tailTurns');

    const preserveRecentTokensSetting = new Setting(containerEl)
      .setName(t('settings.conversation.compaction.preserveRecentTokens.name'))
      .setDesc(t('settings.conversation.compaction.preserveRecentTokens.desc'))
      .addText((text) => {
        this.projectCompactionPreserveRecentTokensControl = text;
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
        text
          .setPlaceholder(t('settings.conversation.compaction.followDefault'))
          .setValue('')
          .onChange(async (value) => {
            if (!this.canSaveOpenCodeProjectConversationConfig()) {
              this.resetCompactionPreserveRecentTokensInput();
              return;
            }
            const trimmed = value.trim();
            if (!trimmed) {
              this.currentCompactionState.preserveRecentTokens = undefined;
              await this.saveProjectCompactionConfig({ preserve_recent_tokens: undefined });
              return;
            }
            const parsed = parseNonNegativeInteger(trimmed);
            if (parsed === null) {
              this.resetCompactionPreserveRecentTokensInput();
              return;
            }
            this.currentCompactionState.preserveRecentTokens = parsed;
            await this.saveProjectCompactionConfig({ preserve_recent_tokens: parsed });
          });
      });
    this.addCompactionHelpButton(preserveRecentTokensSetting, 'preserveRecentTokens');

    const reservedSetting = new Setting(containerEl)
      .setName(t('settings.conversation.compaction.reserved.name'))
      .setDesc(t('settings.conversation.compaction.reserved.desc'))
      .addText((text) => {
        this.projectCompactionReservedControl = text;
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
        text
          .setPlaceholder(t('settings.conversation.compaction.followDefault'))
          .setValue('')
          .onChange(async (value) => {
            if (!this.canSaveOpenCodeProjectConversationConfig()) {
              this.resetCompactionReservedInput();
              return;
            }
            const trimmed = value.trim();
            if (!trimmed) {
              this.currentCompactionState.reserved = undefined;
              await this.saveProjectCompactionConfig({ reserved: undefined });
              return;
            }
            const parsed = parseNonNegativeInteger(trimmed);
            if (parsed === null) {
              this.resetCompactionReservedInput();
              return;
            }
            this.currentCompactionState.reserved = parsed;
            await this.saveProjectCompactionConfig({ reserved: parsed });
          });
      });
    this.addCompactionHelpButton(reservedSetting, 'reserved');
  }

  private addProjectShareSettings(containerEl: HTMLElement): void {
    const policyEl = containerEl.createDiv({
      cls: 'opencodian-share-policy-panel',
    });
    const policyHeaderEl = policyEl.createDiv({
      cls: 'opencodian-share-policy-header',
    });
    const policyCopyEl = policyHeaderEl.createDiv({
      cls: 'opencodian-share-policy-copy',
    });
    policyCopyEl.createDiv({
      cls: 'opencodian-share-policy-title',
      text: t('settings.conversation.share.mode.name'),
    });
    policyCopyEl.createDiv({
      cls: 'opencodian-share-policy-desc',
      text: t('settings.conversation.share.mode.desc'),
    });
    const policyStateEl = policyHeaderEl.createDiv({
      cls: 'opencodian-share-policy-state',
      text: this.getShareModeLabel(this.currentShareMode),
    });
    const policyControlEl = policyEl.createDiv({
      cls: 'opencodian-share-policy-control',
    });
    const shareSetting = new Setting(policyControlEl)
      .setName(t('settings.conversation.share.mode.name'))
      .setDesc(t('settings.conversation.share.mode.desc'))
      .addDropdown((dropdown) => {
        this.projectShareModeControl = dropdown;
        dropdown
          .addOption('manual', t('settings.conversation.share.mode.manual'))
          .addOption('auto', t('settings.conversation.share.mode.auto'))
          .addOption('disabled', t('settings.conversation.share.mode.disabled'))
          .setValue(this.currentShareMode)
          .onChange(async (value) => {
            if (!this.canSaveOpenCodeProjectConversationConfig()) {
              this.projectShareModeControl?.setValue(this.currentShareMode);
              return;
            }
            this.currentShareMode = value as OpencodeShareMode;
            policyStateEl.setText(this.getShareModeLabel(this.currentShareMode));
            if (this.shareModeDiagnosticValueEl) {
              this.setShareDiagnosticValue(
                this.shareModeDiagnosticValueEl,
                this.getShareModeDiagnosticText(),
                this.currentShareMode === 'disabled' ? 'error' : 'ok',
              );
            }
            await this.saveProjectShareConfig(this.currentShareMode);
          });
      });
    shareSetting.settingEl.classList.add('opencodian-share-policy-setting');
    this.addProjectConfigHelpButton(shareSetting, 'share');
    this.addShareDiagnostics(policyEl, policyStateEl);

    this.sharedSessionsContainerEl = containerEl.createDiv({
      cls: 'opencodian-shared-sessions',
    });
    void this.renderSharedSessionsList();
  }

  private addShareDiagnostics(containerEl: HTMLElement, policyStateEl: HTMLElement): void {
    const diagnosticsEl = containerEl.createDiv({
      cls: 'opencodian-share-diagnostics',
    });
    const rowsEl = diagnosticsEl.createDiv({
      cls: 'opencodian-share-diagnostics-rows',
    });
    const modeValueEl = this.createShareDiagnosticRow(rowsEl, {
      label: t('settings.conversation.share.diagnostics.mode'),
      value: this.getShareModeDiagnosticText(),
      state: this.currentShareMode === 'disabled' ? 'error' : 'ok',
    });
    this.shareModeDiagnosticValueEl = modeValueEl;
    const serviceValueEl = this.createShareDiagnosticRow(rowsEl, {
      label: t('settings.conversation.share.diagnostics.service'),
      value: t('settings.conversation.share.diagnostics.notChecked'),
      state: 'pending',
    });
    const networkValueEl = this.createShareDiagnosticRow(rowsEl, {
      label: t('settings.conversation.share.diagnostics.network'),
      value: t('settings.conversation.share.diagnostics.notChecked'),
      state: 'pending',
    });
    const checkButtonEl = diagnosticsEl.createEl('button', {
      cls: 'opencodian-share-diagnostics-button',
      text: t('settings.conversation.share.diagnostics.check'),
      attr: { type: 'button', 'data-action': 'check-share-diagnostics' },
    });
    checkButtonEl.addEventListener('click', () => {
      void (async () => {
        if (!this.canSaveOpenCodeProjectConversationConfig()) {
          return;
        }
        checkButtonEl.disabled = true;
        this.setShareDiagnosticValue(modeValueEl, this.getShareModeDiagnosticText(), this.currentShareMode === 'disabled' ? 'error' : 'ok');
        this.setShareDiagnosticValue(serviceValueEl, t('settings.conversation.share.diagnostics.checking'), 'pending');
        this.setShareDiagnosticValue(networkValueEl, t('settings.conversation.share.diagnostics.checking'), 'pending');
        try {
          const [serviceHealthy, shareHost] = await Promise.all([
            this.plugin.openCodeService.checkHealth().catch(() => false),
            this.checkPublicShareHostReachable(),
          ]);
          this.setShareDiagnosticValue(
            serviceValueEl,
            serviceHealthy
              ? t('settings.conversation.share.diagnostics.serviceOk')
              : t('settings.conversation.share.diagnostics.serviceError'),
            serviceHealthy ? 'ok' : 'error',
          );
          this.setShareDiagnosticValue(
            networkValueEl,
            shareHost.reachable
              ? t('settings.conversation.share.diagnostics.networkOk')
              : t('settings.conversation.share.diagnostics.networkError', {
                host: OPENCODE_PUBLIC_SHARE_HOST,
                detail: shareHost.detail ?? t('settings.conversation.share.diagnostics.networkUnknownError'),
              }),
            shareHost.reachable ? 'ok' : 'warning',
          );
        } finally {
          policyStateEl.setText(this.getShareModeLabel(this.currentShareMode));
          checkButtonEl.disabled = false;
        }
      })();
    });
  }

  private createShareDiagnosticRow(
    containerEl: HTMLElement,
    options: { label: string; value: string; state: ShareDiagnosticState },
  ): HTMLElement {
    const rowEl = containerEl.createDiv({
      cls: 'opencodian-share-diagnostic-row',
    });
    rowEl.createDiv({
      cls: 'opencodian-share-diagnostic-label',
      text: options.label,
    });
    const valueEl = rowEl.createDiv({
      cls: 'opencodian-share-diagnostic-value',
      text: options.value,
      attr: { 'data-state': options.state },
    });
    return valueEl;
  }

  private setShareDiagnosticValue(valueEl: HTMLElement, text: string, state: ShareDiagnosticState): void {
    valueEl.setText(text);
    valueEl.dataset.state = state;
  }

  private getShareModeDiagnosticText(): string {
    if (this.currentShareMode === 'disabled') {
      return t('settings.conversation.share.diagnostics.modeDisabled');
    }
    return t('settings.conversation.share.diagnostics.modeEnabled', {
      mode: this.getShareModeLabel(this.currentShareMode),
    });
  }

  private async checkPublicShareHostReachable(): Promise<ShareHostDiagnosticResult> {
    try {
      const response = await requestUrl({
        url: OPENCODE_PUBLIC_SHARE_PROBE_URL,
        method: 'GET',
        throw: false,
      });
      return {
        reachable: response.status > 0,
        detail: `HTTP ${response.status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lowerMessage = message.toLowerCase();
      const detail = lowerMessage.includes('err_connection_closed') || lowerMessage.includes('ssl_error_syscall')
        ? t('settings.conversation.share.diagnostics.networkProxyHint', { error: message })
        : message;
      return {
        reachable: false,
        detail,
      };
    }
  }

  private async renderSharedSessionsList(): Promise<void> {
    const containerEl = this.sharedSessionsContainerEl;
    if (!containerEl) {
      return;
    }

    containerEl.empty();
    const headerEl = containerEl.createDiv({
      cls: 'opencodian-shared-sessions-header',
    });
    const copyEl = headerEl.createDiv({
      cls: 'opencodian-shared-sessions-copy',
    });
    copyEl.createDiv({
      cls: 'opencodian-shared-sessions-title',
      text: t('settings.conversation.share.sharedSessions.title'),
    });
    copyEl.createDiv({
      cls: 'opencodian-shared-sessions-desc',
      text: t('settings.conversation.share.sharedSessions.desc'),
    });
    const toolsEl = headerEl.createDiv({
      cls: 'opencodian-shared-sessions-tools',
    });
    const countEl = toolsEl.createDiv({
      cls: 'opencodian-shared-sessions-count',
      text: t('settings.conversation.share.sharedSessions.count', { count: '0' }),
    });
    this.createSharedSessionButton(toolsEl, 'refresh-shared-sessions', t('settings.conversation.share.sharedSessions.refresh'), async () => {
      await this.renderSharedSessionsList();
    });

    try {
      const sessions = await listBackendSessions(
        this.plugin.agentServiceRegistry,
      );
      const sharedSessions = sessions.filter((row) => Boolean(row.shareUrl));
      countEl.setText(t('settings.conversation.share.sharedSessions.count', {
        count: String(sharedSessions.length),
      }));

      if (sharedSessions.length === 0) {
        containerEl.createDiv({
          cls: 'opencodian-shared-sessions-empty',
          text: t('settings.conversation.share.sharedSessions.empty'),
        });
        return;
      }

      const listEl = containerEl.createDiv({
        cls: 'opencodian-shared-sessions-list',
      });
      for (const row of sharedSessions) {
        this.renderSharedSessionRow(listEl, row, row.shareUrl!);
      }
    } catch (error) {
      logger.warn('Failed to load shared sessions:', error);
      containerEl.createDiv({
        cls: 'opencodian-shared-sessions-empty',
        text: t('settings.conversation.share.sharedSessions.loadFailed'),
      });
    }
  }

  private renderSharedSessionRow(containerEl: HTMLElement, row: NormalizedSessionRow, shareUrl: string): void {
    const rowEl = containerEl.createDiv({
      cls: 'opencodian-shared-session-row',
      attr: { 'data-shared-session-id': row.id },
    });
    const mainEl = rowEl.createDiv({
      cls: 'opencodian-shared-session-main',
    });
    mainEl.createDiv({
      cls: 'opencodian-shared-session-title',
      text: row.title || t('chat.history.untitled'),
    });
    mainEl.createDiv({
      cls: 'opencodian-shared-session-meta',
      text: t('settings.conversation.share.sharedSessions.updated', {
        value: this.formatTimestamp(row.updatedAt ?? undefined),
      }),
    });
    mainEl.createDiv({
      cls: 'opencodian-shared-session-url',
      text: shareUrl,
    });

    const actionsEl = rowEl.createDiv({
      cls: 'opencodian-shared-session-actions',
    });
    this.createSharedSessionButton(actionsEl, 'copy-shared-session-link', t('settings.conversation.share.sharedSessions.copy'), async () => {
      await navigator.clipboard.writeText(shareUrl);
      new Notice(t('settings.conversation.share.sharedSessions.copySuccess'));
    });
    this.createSharedSessionButton(actionsEl, 'preview-shared-session', t('settings.conversation.share.sharedSessions.preview'), async () => {
      await this.toggleSharedSessionPreview(rowEl, row.id);
    });
    this.createSharedSessionButton(actionsEl, 'unshare-shared-session', t('settings.conversation.share.sharedSessions.unshare'), async () => {
      // Defensive guard: sharing/unsharing is an OpenCode-specific write operation.
      // The entire sharing block is already gated by isOpenCodeActive(), but this
      // inner guard protects against backend switches while the settings page is open.
      if (!this.isOpenCodeActive()) {
        new Notice(t('settings.conversation.share.sharedSessions.unshareUnavailable'));
        return;
      }
      await this.plugin.openCodeService.unshareSession(row.id);
      new Notice(t('settings.conversation.share.sharedSessions.unshared'));
      await this.renderSharedSessionsList();
    });
  }

  private createSharedSessionButton(
    containerEl: HTMLElement,
    action: string,
    text: string,
    onClick: () => Promise<void>,
  ): void {
    const buttonEl = containerEl.createEl('button', {
      cls: 'opencodian-shared-session-button',
      text,
      attr: { type: 'button', 'data-action': action },
    });
    buttonEl.addEventListener('click', () => {
      void (async () => {
        buttonEl.disabled = true;
        try {
          await onClick();
        } finally {
          buttonEl.disabled = false;
        }
      })();
    });
  }

  private async toggleSharedSessionPreview(rowEl: HTMLElement, sessionId: string): Promise<void> {
    const existingPreviewEl = rowEl.querySelector<HTMLElement>('[data-shared-session-preview]');
    if (existingPreviewEl) {
      existingPreviewEl.remove();
      return;
    }

    const previewEl = rowEl.createDiv({
      cls: 'opencodian-shared-session-preview',
      attr: { 'data-shared-session-preview': sessionId },
    });
    previewEl.createDiv({
      cls: 'opencodian-shared-session-preview-loading',
      text: t('settings.conversation.share.sharedSessions.previewLoading'),
    });

    try {
      const messages = await getBackendSessionPreview(
        this.plugin.agentServiceRegistry,
        sessionId,
      );
      previewEl.empty();
      if (messages === null) {
        previewEl.createDiv({
          cls: 'opencodian-shared-sessions-empty',
          text: t('settings.conversation.share.sharedSessions.previewFailed'),
        });
        return;
      }
      if (messages.length === 0) {
        previewEl.createDiv({
          cls: 'opencodian-shared-sessions-empty',
          text: t('settings.conversation.share.sharedSessions.previewEmpty'),
        });
        return;
      }
      for (const message of messages) {
        this.renderSharedSessionMessage(previewEl, message);
      }
    } catch (error) {
      logger.warn('Failed to load shared session preview:', error);
      previewEl.empty();
      previewEl.createDiv({
        cls: 'opencodian-shared-sessions-empty',
        text: t('settings.conversation.share.sharedSessions.previewFailed'),
      });
    }
  }

  private renderSharedSessionMessage(containerEl: HTMLElement, message: NormalizedSessionPreviewMessage): void {
    const messageEl = containerEl.createDiv({
      cls: 'opencodian-shared-session-message',
    });
    messageEl.createDiv({
      cls: 'opencodian-shared-session-message-role',
      text: this.getNormalizedMessageRoleLabel(message.role),
    });
    const partsEl = messageEl.createDiv({
      cls: 'opencodian-shared-session-message-parts',
    });
    for (const part of message.parts) {
      this.renderSharedSessionPart(partsEl, part);
    }
  }

  private renderSharedSessionPart(containerEl: HTMLElement, part: NormalizedSessionPreviewPart): void {
    const text = typeof part.text === 'string' ? part.text : JSON.stringify(part, null, 2);
    const shouldCollapse = part.type !== 'text' || text.length > 800;
    if (shouldCollapse) {
      const detailsEl = containerEl.createEl('details', {
        cls: 'opencodian-shared-session-part opencodian-shared-session-part-collapsed',
      });
      detailsEl.createEl('summary', {
        text: t('settings.conversation.share.sharedSessions.collapsedPart', {
          type: part.type,
        }),
      });
      detailsEl.createEl('pre', {
        text,
      });
      return;
    }

    containerEl.createDiv({
      cls: 'opencodian-shared-session-part',
      text,
    });
  }

  private getNormalizedMessageRoleLabel(role: string): string {
    if (role === 'assistant') {
      return t('settings.conversation.share.sharedSessions.assistant');
    }
    if (role === 'user') {
      return t('settings.conversation.share.sharedSessions.user');
    }
    return role.trim() || 'unknown';
  }

  private getShareModeLabel(mode: OpencodeShareMode): string {
    switch (mode) {
      case 'auto':
        return t('settings.conversation.share.mode.auto');
      case 'disabled':
        return t('settings.conversation.share.mode.disabled');
      case 'manual':
      default:
        return t('settings.conversation.share.mode.manual');
    }
  }

  private formatTimestamp(value: number | undefined): string {
    if (!value) {
      return t('settings.conversation.share.sharedSessions.unknownTime');
    }
    return new Date(value).toLocaleString();
  }

  private async loadProjectConversationConfig(): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      return;
    }

    try {
      const config = await configManager.getCompactionConfig() ?? {};
      const state = {
        auto: config.auto ?? true,
        prune: config.prune ?? true,
        tailTurns: config.tail_turns ?? 2,
        preserveRecentTokens: config.preserve_recent_tokens ?? undefined,
        reserved: config.reserved ?? undefined,
      };
      this.currentCompactionState = state;
      this.setProjectCompactionUI({
        auto: state.auto,
        prune: state.prune,
        tailTurns: state.tailTurns,
        preserveRecentTokens: state.preserveRecentTokens ?? null,
        reservedTokens: state.reserved ?? null,
      });
      const shareMode = await configManager.getShareConfig?.() ?? 'manual';
      this.currentShareMode = shareMode;
      this.projectShareModeControl?.setValue(shareMode);
    } catch (error) {
      logger.warn('Failed to load project conversation config:', error);
    }
  }

  private setProjectCompactionUI(state: {
    auto: boolean;
    prune: boolean;
    tailTurns: number;
    preserveRecentTokens: number | null;
    reservedTokens: number | null;
  }): void {
    if (this.projectCompactionAutoControl) {
      this.projectCompactionAutoControl.setValue(state.auto);
    }

    if (this.projectCompactionPruneControl) {
      this.projectCompactionPruneControl.setValue(state.prune);
    }

    if (this.projectCompactionTailTurnsControl) {
      this.projectCompactionTailTurnsControl.setValue(String(state.tailTurns));
    }

    if (this.projectCompactionPreserveRecentTokensControl) {
      this.projectCompactionPreserveRecentTokensControl
        .setValue(state.preserveRecentTokens != null ? String(state.preserveRecentTokens) : '');
    }

    if (this.projectCompactionReservedControl) {
      this.projectCompactionReservedControl
        .setValue(state.reservedTokens != null ? String(state.reservedTokens) : '');
    }
  }

  private resetCompactionTailTurnsInput(): void {
    this.projectCompactionTailTurnsControl?.setValue(String(this.currentCompactionState.tailTurns));
  }

  private resetCompactionPreserveRecentTokensInput(): void {
    this.projectCompactionPreserveRecentTokensControl?.setValue(
      this.currentCompactionState.preserveRecentTokens != null
        ? String(this.currentCompactionState.preserveRecentTokens)
        : '',
    );
  }

  private resetCompactionReservedInput(): void {
    this.projectCompactionReservedControl?.setValue(
      this.currentCompactionState.reserved != null
        ? String(this.currentCompactionState.reserved)
        : '',
    );
  }

  private async saveProjectCompactionConfig(patch: OpencodeCompactionConfig): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      new Notice(t('settings.conversation.compaction.configUnavailable'));
      return;
    }

    try {
      await configManager.updateCompactionConfig(patch);

      const result = await this.plugin.openCodeService.reapplyCompactionConfigFromProjectConfig(patch);
      new Notice(
        result.status === 'applied'
          ? t('settings.conversation.compaction.savedApplied')
          : t('settings.conversation.compaction.savedDeferred'),
      );
    } catch (error) {
      logger.warn('Failed to save project compaction config:', error);
      new Notice(t('settings.conversation.compaction.saveFailed'));
    }
  }

  private async saveProjectShareConfig(shareMode: OpencodeShareMode): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager?.updateShareConfig) {
      new Notice(t('settings.conversation.share.configUnavailable'));
      return;
    }

    try {
      await configManager.updateShareConfig(shareMode);
      await this.restartLocalServiceForProjectConfig('settings.conversation.share.restartFailed');
      new Notice(t('settings.conversation.share.saved'));
    } catch (error) {
      logger.warn('Failed to save project share config:', error);
      new Notice(t('settings.conversation.share.saveFailed'));
    }
  }

  private addChatFontSizeSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.conversation.chatFontSizePx.name'))
      .setDesc(t('settings.conversation.chatFontSizePx.desc'))
      .addText((text) => {
        text.inputEl.type = 'number';
        text.inputEl.min = '10';
        text.inputEl.max = '24';
        text
          .setPlaceholder(String(this.plugin.settings.chatFontSizePx))
          .setValue(String(this.plugin.settings.chatFontSizePx))
          .onChange(async (value) => {
            const nextValue = this.parseChatFontSizePx(value);
            if (nextValue === null) {
              text.setValue(String(this.plugin.settings.chatFontSizePx));
              return;
            }

            this.plugin.settings.chatFontSizePx = nextValue;
            text.setValue(String(nextValue));
            await this.saveGlobalSessionDefaults();
          });
      });
  }

  private addQuestionCardPositionSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.conversation.questionCardPosition.name'))
      .setDesc(t('settings.conversation.questionCardPosition.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('inline', t('settings.conversation.questionCardPosition.inline'))
          .addOption('above_input', t('settings.conversation.questionCardPosition.aboveInput'))
          .setValue(this.plugin.settings.questionCardPosition)
          .onChange(async (value) => {
            this.plugin.settings.questionCardPosition = value as QuestionCardPosition;
            await this.plugin.saveSettings();
            this.plugin.refreshConversationRendering();
            this.plugin.refreshQuestionUi();
          });
      });
  }

  private addAnsweredQuestionCardsSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.conversation.showAnsweredQuestionCards.name'))
      .setDesc(t('settings.conversation.showAnsweredQuestionCards.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showAnsweredQuestionCards)
          .onChange(async (value) => {
            this.plugin.settings.showAnsweredQuestionCards = value;
            await this.plugin.saveSettings();
            this.plugin.refreshConversationRendering();
            this.plugin.refreshQuestionUi();
          });
      });
  }

  private addTitleModelSetting(containerEl: HTMLElement): void {
    this.titleModelSetting = new Setting(containerEl)
      .setName(t('settings.titleGeneration.model.name'))
      .setDesc(t('settings.titleGeneration.model.desc'))
      .addButton((button) => {
        this.titleModelButton = button;
        button.onClick(() => {
          new ModelPickerModal(this.app, {
            title: t('settings.titleGeneration.model.pickerTitle'),
            description: t('settings.titleGeneration.model.pickerDesc'),
            groups: this.titleModelGroups,
            selectedRef: this.plugin.settings.aiTitleModel,
            emptySelectionLabel: t('settings.titleGeneration.model.followCurrent'),
            onChoose: async (option) => {
              this.plugin.settings.aiTitleModel = option?.ref ?? '';
              await this.plugin.saveSettings();
              await this.loadTitleModels();
            },
          }).open();
        });
      })
      .addExtraButton((button) => {
        this.titleModelWarningButton = button;
        button
          .setIcon('alert-triangle')
          .setTooltip(t('settings.titleGeneration.model.unavailableNotice'))
          .onClick(() => {
            new Notice(t('settings.titleGeneration.model.unavailableNotice'));
          });
        button.extraSettingsEl.addClass('opencodian-title-model-warning-button');
        button.extraSettingsEl.style.display = 'none';
      });
  }

  private addUserMarkupRenderSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.conversation.userMarkupAsCodeBlocks.name'))
      .setDesc(t('settings.conversation.userMarkupAsCodeBlocks.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.renderUserMarkupAsCodeBlocks)
          .onChange(async (value) => {
            this.plugin.settings.renderUserMarkupAsCodeBlocks = value;
            await this.plugin.saveSettings();
            this.plugin.refreshConversationRendering();
          });
      });
  }

  private parseChatFontSizePx(value: string): number | null {
    const nextValue = Number.parseFloat(value.trim());
    const roundedValue = Math.round(nextValue);
    if (!Number.isFinite(nextValue) || roundedValue < 10 || roundedValue > 24) {
      return null;
    }

    return normalizeChatFontSizePx(nextValue, this.plugin.settings.chatFontSizePx);
  }

  private async saveGlobalSessionDefaults(): Promise<void> {
    await this.plugin.saveSettings({ reloadModels: false });
    await this.plugin.reapplyConversationSessionDefaults();
  }

  private addCompactionHelpButton(setting: Setting, topic: ConversationCompactionHelpTopic): void {
    this.addSettingHelpButton(setting, {
      tooltip: t('settings.conversation.compaction.help.openDoc'),
      onClick: () => {
        new ConversationCompactionHelpModal(this.app, topic).open();
      },
    });
  }

  private addProjectConfigHelpButton(setting: Setting, topic: 'share'): void {
    this.addSettingHelpButton(setting, {
      tooltip: t('settings.projectConfigHelp.open'),
      onClick: () => {
        new OpenCodeProjectConfigHelpModal(this.app, topic).open();
      },
    });
  }

  private async restartLocalServiceForProjectConfig(failedNoticeKey: string): Promise<void> {
    if (this.plugin.settings.server.mode !== 'local') {
      new Notice(t('settings.server.remoteManageUnavailable'));
      return;
    }

    try {
      const isRunning = await this.plugin.openCodeService.checkHealth();
      if (!isRunning) {
        return;
      }
      await this.plugin.openCodeService.stop();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await this.plugin.openCodeService.start();
    } catch (error) {
      logger.warn('Failed to restart OpenCode after project config update:', error);
      new Notice(t(failedNoticeKey as never));
    }
  }
}

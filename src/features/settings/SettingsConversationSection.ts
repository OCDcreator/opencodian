import type { App, ButtonComponent, ExtraButtonComponent } from 'obsidian';
import { Notice, Setting } from 'obsidian';

import {
  parseModelReference,
  resolveModelSelection,
} from '../../core/config/modelConfig';
import type {
  OpencodeCompactionConfig,
  QuestionCardPosition,
  QuestionDisplayMode,
  TitleMode,
} from '../../core/types';
import {
  normalizeChatFontSizePx,
} from '../../core/types';
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
import { ProjectConfigFileWatcher } from './ProjectConfigFileWatcher';
import type { SettingHelpButtonConfig } from './settingsStyleControls';

const logger = createLogger('SettingsConversationSection');

function parsePositiveInteger(value: string): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
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
  private projectCompactionConfigWatcher: ProjectConfigFileWatcher | null = null;
  private currentCompactionState: {
    auto: boolean;
    prune: boolean;
    tailTurns: number;
    preserveRecentTokens: number | undefined;
    reserved: number | undefined;
  } = { auto: true, prune: true, tailTurns: 2, preserveRecentTokens: undefined, reserved: undefined };

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
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
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

    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.conversation.title'),
      t('settings.quickNav.conversationDesc'),
    );

    this.setRefreshTitleModelsCallback(() => {
      void this.loadTitleModels();
    });

    const titleGenerationBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.titleGeneration.title'),
      description: t('settings.titleGeneration.groupDesc'),
    });
    const compactionBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.conversation.compaction.projectNote'),
      description: t('settings.conversation.compaction.projectNoteDesc'),
    });
    const displayBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.conversation.display.title'),
      description: t('settings.conversation.display.desc'),
    });
    const questionBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.conversation.questions.title'),
      description: t('settings.conversation.questions.desc'),
    });
    const renderingBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.conversation.rendering.title'),
      description: t('settings.conversation.rendering.desc'),
    });

    this.addTitleModeSetting(titleGenerationBodyEl);
    this.addTitleModelSetting(titleGenerationBodyEl);
    this.addProjectCompactionSettings(compactionBodyEl);
    this.addChatFontSizeSetting(displayBodyEl);
    this.addQuestionDisplayModeSetting(questionBodyEl);
    this.addQuestionCardPositionSetting(questionBodyEl);
    this.addAnsweredQuestionCardsSetting(questionBodyEl);
    this.updateTitleModelSettingVisibility();
    void this.loadTitleModels();
    this.addUserMarkupRenderSetting(renderingBodyEl);

    this.registerProjectCompactionConfigListeners();
    void this.loadProjectCompactionConfig();

    return headingEl;
  }

  private registerProjectCompactionConfigListeners(): void {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      return;
    }

    this.projectCompactionConfigWatcher = new ProjectConfigFileWatcher({
      app: this.app,
      configPath: configManager.getConfigPath(),
      onChange: () => {
        void this.loadProjectCompactionConfig();
      },
    });
    this.projectCompactionConfigWatcher.start();
  }

  private disposeProjectCompactionConfigListeners(): void {
    this.projectCompactionConfigWatcher?.dispose();
    this.projectCompactionConfigWatcher = null;
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
            this.currentCompactionState.auto = value;
            await this.saveProjectCompactionConfig();
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
            this.currentCompactionState.prune = value;
            await this.saveProjectCompactionConfig();
          });
      });
    this.addCompactionHelpButton(pruneSetting, 'prune');

    const tailTurnsSetting = new Setting(containerEl)
      .setName(t('settings.conversation.compaction.tailTurns.name'))
      .setDesc(t('settings.conversation.compaction.tailTurns.desc'))
      .addText((text) => {
        this.projectCompactionTailTurnsControl = text;
        text.inputEl.type = 'number';
        text.inputEl.min = '1';
        text
          .setPlaceholder('2')
          .setValue('2')
          .onChange(async (value) => {
            const parsed = parsePositiveInteger(value.trim());
            if (parsed === null) {
              return;
            }
            this.currentCompactionState.tailTurns = parsed;
            await this.saveProjectCompactionConfig();
          });
      });
    this.addCompactionHelpButton(tailTurnsSetting, 'tailTurns');

    const preserveRecentTokensSetting = new Setting(containerEl)
      .setName(t('settings.conversation.compaction.preserveRecentTokens.name'))
      .setDesc(t('settings.conversation.compaction.preserveRecentTokens.desc'))
      .addText((text) => {
        this.projectCompactionPreserveRecentTokensControl = text;
        text.inputEl.type = 'number';
        text.inputEl.min = '1';
        text
          .setPlaceholder(t('settings.conversation.compaction.followDefault'))
          .setValue('')
          .onChange(async (value) => {
            const trimmed = value.trim();
            if (!trimmed) {
              this.currentCompactionState.preserveRecentTokens = undefined;
              await this.saveProjectCompactionConfig();
              return;
            }
            const parsed = parsePositiveInteger(trimmed);
            if (parsed === null) {
              return;
            }
            this.currentCompactionState.preserveRecentTokens = parsed;
            await this.saveProjectCompactionConfig();
          });
      });
    this.addCompactionHelpButton(preserveRecentTokensSetting, 'preserveRecentTokens');

    const reservedSetting = new Setting(containerEl)
      .setName(t('settings.conversation.compaction.reserved.name'))
      .setDesc(t('settings.conversation.compaction.reserved.desc'))
      .addText((text) => {
        this.projectCompactionReservedControl = text;
        text.inputEl.type = 'number';
        text.inputEl.min = '1';
        text
          .setPlaceholder(t('settings.conversation.compaction.followDefault'))
          .setValue('')
          .onChange(async (value) => {
            const trimmed = value.trim();
            if (!trimmed) {
              this.currentCompactionState.reserved = undefined;
              await this.saveProjectCompactionConfig();
              return;
            }
            const parsed = parsePositiveInteger(trimmed);
            if (parsed === null) {
              return;
            }
            this.currentCompactionState.reserved = parsed;
            await this.saveProjectCompactionConfig();
          });
      });
    this.addCompactionHelpButton(reservedSetting, 'reserved');
  }

  private async loadProjectCompactionConfig(): Promise<void> {
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
    } catch (error) {
      logger.warn('Failed to load project compaction config:', error);
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

  private async saveProjectCompactionConfig(): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      new Notice(t('settings.conversation.compaction.configUnavailable'));
      return;
    }

    const state = this.currentCompactionState;
    const full: OpencodeCompactionConfig = {
      auto: state.auto,
      prune: state.prune,
      tail_turns: state.tailTurns,
      preserve_recent_tokens: state.preserveRecentTokens,
      reserved: state.reserved,
    };

    try {
      await configManager.updateCompactionConfig(full);

      const result = await this.plugin.openCodeService.reapplyCompactionConfigFromProjectConfig(full);
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
}

import type { App, ButtonComponent, ExtraButtonComponent } from 'obsidian';
import { Notice, Setting } from 'obsidian';

import {
  parseModelReference,
  resolveModelSelection,
} from '../../core/config/modelConfig';
import type {
  QuestionCardPosition,
  QuestionDisplayMode,
  TitleMode,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import {
  buildModelPickerGroups,
  findModelPickerOptionByRef,
  type ModelPickerGroup,
} from './modelPicker';
import { ModelPickerModal } from './ModelPickerModal';

const logger = createLogger('SettingsConversationSection');

interface SettingsConversationSectionOptions {
  app: App;
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  setRefreshTitleModelsCallback: (callback?: () => void) => void;
}

export class SettingsConversationSection {
  private readonly app: App;
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  private readonly setRefreshTitleModelsCallback: (callback?: () => void) => void;
  private titleModelSetting: Setting | null = null;
  private titleModelButton: ButtonComponent | null = null;
  private titleModelWarningButton: ExtraButtonComponent | null = null;
  private titleModelGroups: ModelPickerGroup[] = [];

  constructor(options: SettingsConversationSectionOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.setRefreshTitleModelsCallback = options.setRefreshTitleModelsCallback;
  }

  dispose(): void {
    this.setRefreshTitleModelsCallback(undefined);
    this.titleModelSetting = null;
    this.titleModelButton = null;
    this.titleModelWarningButton = null;
    this.titleModelGroups = [];
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    this.titleModelSetting = null;
    this.titleModelButton = null;
    this.titleModelWarningButton = null;
    this.titleModelGroups = [];

    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.conversation.title'),
      t('settings.quickNav.conversationDesc'),
    );

    this.setRefreshTitleModelsCallback(() => {
      void this.loadTitleModels();
    });

    this.addTitleModeSetting(containerEl);
    this.addQuestionDisplayModeSetting(containerEl);
    this.addQuestionCardPositionSetting(containerEl);
    this.addAnsweredQuestionCardsSetting(containerEl);
    this.addTitleModelSetting(containerEl);
    this.updateTitleModelSettingVisibility();
    void this.loadTitleModels();
    this.addUserMarkupRenderSetting(containerEl);

    return headingEl;
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
}

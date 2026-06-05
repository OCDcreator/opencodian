import type { App } from 'obsidian';
import { Notice, Setting } from 'obsidian';

import { isValidChatAppearanceCustomCssDeclarations } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import { SettingsStyleBackgroundSection } from './SettingsStyleBackgroundSection';
import {
  type ChatAppearanceStyleGroup,
  type ColorStyleControlConfig,
  type NumericControlConfig,
  type NumericStyleControlConfig,
  type SettingHelpButtonConfig,
  SettingsStyleControls,
} from './settingsStyleControls';
import { SettingsStyleInputPanelSection } from './SettingsStyleInputPanelSection';
import { SettingsStylePresetSection } from './SettingsStylePresetSection';
import { TextareaSizeMemory } from './TextareaSizeMemory';

const logger = createLogger('SettingsStyleSection');

interface SettingsStyleSectionOptions {
  app: App;
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  setSettingDescWithFormatting: (setting: Setting, text: string) => void;
  addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
}

interface SettingsStyleSectionRuntimeState {
  backgroundStyleSection: SettingsStyleBackgroundSection;
  inputPanelSection: SettingsStyleInputPanelSection;
  presetSection: SettingsStylePresetSection;
}

export class SettingsStyleSection {
  private readonly app: App;
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  private readonly setSettingDescWithFormatting: (setting: Setting, text: string) => void;
  private readonly addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
  private readonly styleControls: SettingsStyleControls;
  private runtime: SettingsStyleSectionRuntimeState | null = null;
  private textareaSizeMemories: TextareaSizeMemory[] = [];

  constructor(options: SettingsStyleSectionOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.setSettingDescWithFormatting = options.setSettingDescWithFormatting;
    this.addSettingHelpButton = options.addSettingHelpButton;
    this.styleControls = new SettingsStyleControls({
      plugin: this.plugin,
      addSettingHelpButton: (setting, helpButton) => this.addSettingHelpButton(setting, helpButton),
      applyAndScheduleStyleUpdate: () => this.applyAndScheduleStyleUpdate(),
    });
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    this.dispose();

    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.style.title'),
      t('settings.quickNav.styleDesc'),
    );
    const runtime = this.initializeRuntime();
    this.attachPresetAndBackgroundSettings(containerEl, runtime);
    this.attachPrimaryStyleGroups(containerEl, runtime);
    this.attachTrailingStyleGroups(containerEl);

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    this.dispose();
    const runtime = this.initializeRuntime();

    switch (secondaryTabId) {
      case 'presets':
        runtime.presetSection.attach(containerEl);
        break;
      case 'background':
        runtime.backgroundStyleSection.attach(containerEl);
        break;
      case 'layout':
        this.addLayoutStyleGroup(containerEl);
        break;
      case 'user':
        this.addUserStyleGroup(containerEl);
        break;
      case 'assistant':
        this.addAssistantStyleGroup(containerEl);
        break;
      case 'input':
        runtime.inputPanelSection.attach(containerEl);
        break;
      case 'scrollbar':
        this.addScrollbarStyleGroup(containerEl);
        break;
      case 'advanced':
        this.addAdvancedStyleGroup(containerEl);
        break;
    }
  }

  dispose(): void {
    this.styleControls.dispose();
    for (const memory of this.textareaSizeMemories) {
      memory.destroy();
    }
    this.textareaSizeMemories = [];
    const runtime = this.runtime;
    this.runtime = null;
    runtime?.backgroundStyleSection.dispose();
    runtime?.inputPanelSection.dispose();
    runtime?.presetSection.dispose();
  }

  private initializeRuntime(): SettingsStyleSectionRuntimeState {
    const runtime: SettingsStyleSectionRuntimeState = {
      backgroundStyleSection: this.createBackgroundStyleSection(),
      inputPanelSection: this.createInputPanelSection(),
      presetSection: this.createPresetSection(),
    };
    this.runtime = runtime;
    return runtime;
  }

  private attachPresetAndBackgroundSettings(
    containerEl: HTMLElement,
    runtime: SettingsStyleSectionRuntimeState,
  ): void {
    this.addThemePresetSection(containerEl, runtime);
    this.addResetAllSetting(containerEl);
    runtime.backgroundStyleSection.attach(containerEl);
  }

  private attachPrimaryStyleGroups(
    containerEl: HTMLElement,
    runtime: SettingsStyleSectionRuntimeState,
  ): void {
    this.addLayoutStyleGroup(containerEl);
    this.addUserStyleGroup(containerEl);
    this.addAssistantStyleGroup(containerEl);
    runtime.inputPanelSection.attach(containerEl);
  }

  private attachTrailingStyleGroups(containerEl: HTMLElement): void {
    this.addScrollbarStyleGroup(containerEl);
    this.addAdvancedStyleGroup(containerEl);
  }

  private addResetAllSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.style.resetAll.name'))
      .setDesc(t('settings.style.resetAll.desc'))
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.style.resetAll.button'))
          .onClick(() => {
            void this.resetAllChatStyles();
          });
      });
  }

  private addLayoutStyleGroup(containerEl: HTMLElement): void {
    const layoutGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.layout.title'),
      t('settings.style.groups.layout.desc'),
    );
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.layout.messagesPaddingTop.name'),
      desc: t('settings.style.layout.messagesPaddingTop.desc'),
      min: 0,
      max: 32,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.layout.messagesPaddingTop,
      resetValue: () => this.plugin.getChatAppearanceBaseline().layout.messagesPaddingTop,
      setValue: (appearance, value) => {
        appearance.layout.messagesPaddingTop = value;
      },
    });
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.layout.messagesPaddingX.name'),
      desc: t('settings.style.layout.messagesPaddingX.desc'),
      min: 0,
      max: 32,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.layout.messagesPaddingX,
      resetValue: () => this.plugin.getChatAppearanceBaseline().layout.messagesPaddingX,
      setValue: (appearance, value) => {
        appearance.layout.messagesPaddingX = value;
      },
    });
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.layout.messagePaddingX.name'),
      desc: t('settings.style.layout.messagePaddingX.desc'),
      min: 0,
      max: 48,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.layout.messagePaddingX,
      resetValue: () => this.plugin.getChatAppearanceBaseline().layout.messagePaddingX,
      setValue: (appearance, value) => {
        appearance.layout.messagePaddingX = value;
      },
    });
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.layout.contentPaddingX.name'),
      desc: t('settings.style.layout.contentPaddingX.desc'),
      min: 0,
      max: 32,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.layout.contentPaddingX,
      resetValue: () => this.plugin.getChatAppearanceBaseline().layout.contentPaddingX,
      setValue: (appearance, value) => {
        appearance.layout.contentPaddingX = value;
      },
    });
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.layout.contentPaddingY.name'),
      desc: t('settings.style.layout.contentPaddingY.desc'),
      min: 0,
      max: 32,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.layout.contentPaddingY,
      resetValue: () => this.plugin.getChatAppearanceBaseline().layout.contentPaddingY,
      setValue: (appearance, value) => {
        appearance.layout.contentPaddingY = value;
      },
    });
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.sticky.headerGap.name'),
      desc: t('settings.style.sticky.headerGap.desc'),
      min: 0,
      max: 16,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.sticky.headerGap,
      resetValue: () => this.plugin.getChatAppearanceBaseline().sticky.headerGap,
      setValue: (appearance, value) => {
        appearance.sticky.headerGap = value;
      },
    });
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.sticky.maskHeight.name'),
      desc: t('settings.style.sticky.maskHeight.desc'),
      min: 0,
      max: 40,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.sticky.maskHeight,
      resetValue: () => this.plugin.getChatAppearanceBaseline().sticky.maskHeight,
      setValue: (appearance, value) => {
        appearance.sticky.maskHeight = value;
      },
    });
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.sticky.maskBlur.name'),
      desc: t('settings.style.sticky.maskBlur.desc'),
      min: 0,
      max: 40,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.sticky.maskBlur,
      resetValue: () => this.plugin.getChatAppearanceBaseline().sticky.maskBlur,
      setValue: (appearance, value) => {
        appearance.sticky.maskBlur = value;
      },
    });
    this.createStyleResetSetting(layoutGroupEl, 'layout');
  }

  private addUserStyleGroup(containerEl: HTMLElement): void {
    const userGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.user.title'),
      t('settings.style.groups.user.desc'),
    );
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.radius.name'),
      desc: t('settings.style.user.radius.desc'),
      min: 8,
      max: 28,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.user.radius,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.radius,
      setValue: (appearance, value) => {
        appearance.user.radius = value;
      },
    });
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.tailRadius.name'),
      desc: t('settings.style.user.tailRadius.desc'),
      min: 0,
      max: 12,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.user.tailRadius,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.tailRadius,
      setValue: (appearance, value) => {
        appearance.user.tailRadius = value;
      },
    });
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.blur.name'),
      desc: t('settings.style.user.blur.desc'),
      min: 0,
      max: 24,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.user.blur,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.blur,
      setValue: (appearance, value) => {
        appearance.user.blur = value;
      },
    });
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.shadowBlur.name'),
      desc: t('settings.style.user.shadowBlur.desc'),
      min: 0,
      max: 40,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.user.shadowBlur,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.shadowBlur,
      setValue: (appearance, value) => {
        appearance.user.shadowBlur = value;
      },
    });
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.timeFontSize.name'),
      desc: t('settings.style.user.timeFontSize.desc'),
      min: 6,
      max: 36,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.user.timeFontSize,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.timeFontSize,
      setValue: (appearance, value) => {
        appearance.user.timeFontSize = value;
      },
    });
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.timeFontWeight.name'),
      desc: t('settings.style.user.timeFontWeight.desc'),
      min: 100,
      max: 900,
      step: 1,
      unit: '',
      value: () => this.plugin.settings.chatAppearance.user.timeFontWeight,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.timeFontWeight,
      setValue: (appearance, value) => {
        appearance.user.timeFontWeight = value;
      },
    });
    this.addColorStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.timeColor.name'),
      desc: t('settings.style.user.timeColor.desc'),
      value: () => this.plugin.settings.chatAppearance.user.timeColor,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.timeColor,
      setValue: (appearance, value) => {
        appearance.user.timeColor = value;
      },
    });
    this.createStyleResetSetting(userGroupEl, 'user');
  }

  private addAssistantStyleGroup(containerEl: HTMLElement): void {
    const assistantGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.assistant.title'),
      t('settings.style.groups.assistant.desc'),
    );
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.radius.name'),
      desc: t('settings.style.assistant.radius.desc'),
      min: 8,
      max: 24,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.radius,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.radius,
      setValue: (appearance, value) => {
        appearance.assistant.radius = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.backgroundOpacity.name'),
      desc: t('settings.style.assistant.backgroundOpacity.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.assistant.backgroundOpacity,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.backgroundOpacity,
      setValue: (appearance, value) => {
        appearance.assistant.backgroundOpacity = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.blur.name'),
      desc: t('settings.style.assistant.blur.desc'),
      min: 0,
      max: 20,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.blur,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.blur,
      setValue: (appearance, value) => {
        appearance.assistant.blur = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.shadowBlur.name'),
      desc: t('settings.style.assistant.shadowBlur.desc'),
      min: 0,
      max: 32,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.shadowBlur,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.shadowBlur,
      setValue: (appearance, value) => {
        appearance.assistant.shadowBlur = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.metaFontSize.name'),
      desc: t('settings.style.assistant.metaFontSize.desc'),
      min: 6,
      max: 36,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.metaFontSize,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.metaFontSize,
      setValue: (appearance, value) => {
        appearance.assistant.metaFontSize = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.timeFontSize.name'),
      desc: t('settings.style.assistant.timeFontSize.desc'),
      min: 6,
      max: 36,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.timeFontSize,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.timeFontSize,
      setValue: (appearance, value) => {
        appearance.assistant.timeFontSize = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.timeFontWeight.name'),
      desc: t('settings.style.assistant.timeFontWeight.desc'),
      min: 100,
      max: 900,
      step: 1,
      unit: '',
      value: () => this.plugin.settings.chatAppearance.assistant.timeFontWeight,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.timeFontWeight,
      setValue: (appearance, value) => {
        appearance.assistant.timeFontWeight = value;
      },
    });
    this.addColorStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.metaColor.name'),
      desc: t('settings.style.assistant.metaColor.desc'),
      value: () => this.plugin.settings.chatAppearance.assistant.metaColor,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.metaColor,
      setValue: (appearance, value) => {
        appearance.assistant.metaColor = value;
      },
    });
    this.addColorStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.timeColor.name'),
      desc: t('settings.style.assistant.timeColor.desc'),
      value: () => this.plugin.settings.chatAppearance.assistant.timeColor,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.timeColor,
      setValue: (appearance, value) => {
        appearance.assistant.timeColor = value;
      },
    });
    this.addColorStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.modelIdColor.name'),
      desc: t('settings.style.assistant.modelIdColor.desc'),
      value: () => this.plugin.settings.chatAppearance.assistant.modelIdColor,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.modelIdColor,
      setValue: (appearance, value) => {
        appearance.assistant.modelIdColor = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.modelIdFontSize.name'),
      desc: t('settings.style.assistant.modelIdFontSize.desc'),
      min: 6,
      max: 36,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.modelIdFontSize,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.modelIdFontSize,
      setValue: (appearance, value) => {
        appearance.assistant.modelIdFontSize = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.modelIdFontWeight.name'),
      desc: t('settings.style.assistant.modelIdFontWeight.desc'),
      min: 100,
      max: 900,
      step: 1,
      unit: '',
      value: () => this.plugin.settings.chatAppearance.assistant.modelIdFontWeight,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.modelIdFontWeight,
      setValue: (appearance, value) => {
        appearance.assistant.modelIdFontWeight = value;
      },
    });
    this.createStyleResetSetting(assistantGroupEl, 'assistant');
  }

  private addScrollbarStyleGroup(containerEl: HTMLElement): void {
    const scrollbarGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.scrollbar.title'),
      t('settings.style.groups.scrollbar.desc'),
    );
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.width.name'),
      desc: t('settings.style.scrollbar.width.desc'),
      min: 6,
      max: 12,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.scrollbar.width,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.width,
      setValue: (appearance, value) => {
        appearance.scrollbar.width = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.radius.name'),
      desc: t('settings.style.scrollbar.radius.desc'),
      min: 2,
      max: 999,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.scrollbar.radius,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.radius,
      setValue: (appearance, value) => {
        appearance.scrollbar.radius = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.trackOpacity.name'),
      desc: t('settings.style.scrollbar.trackOpacity.desc'),
      min: 0,
      max: 60,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.scrollbar.trackOpacity,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.trackOpacity,
      setValue: (appearance, value) => {
        appearance.scrollbar.trackOpacity = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.thumbOpacity.name'),
      desc: t('settings.style.scrollbar.thumbOpacity.desc'),
      min: 20,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.scrollbar.thumbOpacity,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.thumbOpacity,
      setValue: (appearance, value) => {
        appearance.scrollbar.thumbOpacity = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.thumbHoverOpacity.name'),
      desc: t('settings.style.scrollbar.thumbHoverOpacity.desc'),
      min: 30,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.scrollbar.thumbHoverOpacity,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.thumbHoverOpacity,
      setValue: (appearance, value) => {
        appearance.scrollbar.thumbHoverOpacity = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.edgePadding.name'),
      desc: t('settings.style.scrollbar.edgePadding.desc'),
      min: 0,
      max: 4,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.scrollbar.edgePadding,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.edgePadding,
      setValue: (appearance, value) => {
        appearance.scrollbar.edgePadding = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.shadowOpacity.name'),
      desc: t('settings.style.scrollbar.shadowOpacity.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.scrollbar.shadowOpacity,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.shadowOpacity,
      setValue: (appearance, value) => {
        appearance.scrollbar.shadowOpacity = value;
      },
    });
    this.createStyleResetSetting(scrollbarGroupEl, 'scrollbar');
  }

  private addAdvancedStyleGroup(containerEl: HTMLElement): void {
    const advancedGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.advanced.title'),
      t('settings.style.groups.advanced.desc'),
    );

    const advancedSetting = new Setting(advancedGroupEl)
      .setName(t('settings.style.advanced.customCssDeclarations.name'))
      .setClass('opencodian-style-setting')
      .setClass('opencodian-style-setting-long-text');
    this.setSettingDescWithFormatting(
      advancedSetting,
      t('settings.style.advanced.customCssDeclarations.desc'),
    );

    const validationEl = advancedSetting.settingEl.createDiv({
      cls: 'opencodian-style-validation',
    });

    advancedSetting.addTextArea((text) => {
      const syncFromSettings = () => {
        this.syncCustomCssDeclarationsInput(text, validationEl);
      };

      text
        .setPlaceholder(t('settings.style.advanced.customCssDeclarations.placeholder'))
        .setValue(this.plugin.settings.chatAppearance.advanced.customCssDeclarations)
        .onChange((value) => {
          this.applyCustomCssDeclarations(value, text, validationEl);
        });

      text.inputEl.rows = 6;
      text.inputEl.cols = 44;
      text.inputEl.addClass('opencodian-style-textarea');
      this.textareaSizeMemories.push(
        TextareaSizeMemory.attach(text.inputEl, 'style-custom-css-declarations'),
      );

      this.registerStyleControlBinding('advanced', syncFromSettings);
    });

    this.createStyleResetSetting(advancedGroupEl, 'advanced');
  }

  private syncCustomCssDeclarationsInput(
    text: { setValue: (value: string) => unknown; inputEl: HTMLTextAreaElement },
    validationEl: HTMLElement,
  ): void {
    const currentValue = this.plugin.settings.chatAppearance.advanced.customCssDeclarations;
    text.setValue(currentValue);
    this.updateCustomCssValidationState(text.inputEl, validationEl, currentValue);
  }

  private applyCustomCssDeclarations(
    value: string,
    text: { inputEl: HTMLTextAreaElement },
    validationEl: HTMLElement,
  ): void {
    if (!this.updateCustomCssValidationState(text.inputEl, validationEl, value)) {
      return;
    }

    this.plugin.updateChatAppearance((appearance) => {
      appearance.advanced.customCssDeclarations = value;
    });
    this.applyAndScheduleStyleUpdate();
  }

  private updateCustomCssValidationState(
    inputEl: HTMLTextAreaElement,
    validationEl: HTMLElement,
    value: string,
  ): boolean {
    if (isValidChatAppearanceCustomCssDeclarations(value)) {
      inputEl.removeClass('is-invalid');
      validationEl.empty();
      return true;
    }

    inputEl.addClass('is-invalid');
    validationEl.setText(t('settings.style.advanced.customCssDeclarations.invalid'));
    return false;
  }

  private addThemePresetSection(
    containerEl: HTMLElement,
    runtime: SettingsStyleSectionRuntimeState,
  ): void {
    runtime.presetSection.attach(containerEl);
  }

  private createStyleGroupSection(containerEl: HTMLElement, title: string, desc: string): HTMLElement {
    const sectionEl = containerEl.createDiv({ cls: 'opencodian-style-section' });
    const headerEl = sectionEl.createDiv({ cls: 'opencodian-style-group' });
    headerEl.createEl('h4', { cls: 'opencodian-style-group-title', text: title });
    headerEl.createEl('p', { cls: 'opencodian-style-group-desc', text: desc });

    return sectionEl.createDiv({ cls: 'opencodian-style-group-body' });
  }

  private addNumericControl(containerEl: HTMLElement, config: NumericControlConfig): void {
    this.styleControls.addNumericControl(containerEl, config);
  }

  private getNumericControlInputChars(config: Pick<NumericControlConfig, 'min' | 'max' | 'step'>): number {
    return this.styleControls.getNumericControlInputChars(config);
  }

  private addNumericStyleControl(containerEl: HTMLElement, config: NumericStyleControlConfig): void {
    this.styleControls.addNumericStyleControl(containerEl, config);
  }

  private addColorStyleControl(containerEl: HTMLElement, config: ColorStyleControlConfig): void {
    this.styleControls.addColorStyleControl(containerEl, config);
  }

  private createStyleResetSetting(
    containerEl: HTMLElement,
    group: ChatAppearanceStyleGroup,
  ): void {
    this.styleControls.createStyleResetSetting(containerEl, group);
  }

  private registerStyleControlBinding(
    group: ChatAppearanceStyleGroup,
    syncFromSettings: () => void,
  ): void {
    this.styleControls.registerStyleControlBinding(group, syncFromSettings);
  }

  private clearStyleControlBindings(group: ChatAppearanceStyleGroup): void {
    this.styleControls.clearStyleControlBindings(group);
  }

  private refreshStyleControlValues(group?: ChatAppearanceStyleGroup): void {
    this.styleControls.refreshStyleControlValues(group);
  }

  private clampStyleNumber(value: number, min: number, max: number, step: number): number {
    return this.styleControls.clampStyleNumber(value, min, max, step);
  }

  private applyAndScheduleStyleUpdate(): void {
    this.plugin.applyChatAppearanceSettings();
    this.plugin.scheduleChatAppearanceSave();
  }

  private createBackgroundStyleSection(): SettingsStyleBackgroundSection {
    return new SettingsStyleBackgroundSection({
      plugin: this.plugin,
      createStyleGroupSection: (containerEl, title, desc) => this.createStyleGroupSection(containerEl, title, desc),
      addNumericStyleControl: (containerEl, config) => this.addNumericStyleControl(containerEl, config),
      clearStyleControlBindings: (group) => this.clearStyleControlBindings(group),
      refreshStyleControlValues: (group) => this.refreshStyleControlValues(group),
      applyAndScheduleStyleUpdate: () => this.applyAndScheduleStyleUpdate(),
      clampStyleNumber: (value, min, max, step) => this.clampStyleNumber(value, min, max, step),
    });
  }

  private createInputPanelSection(): SettingsStyleInputPanelSection {
    return new SettingsStyleInputPanelSection({
      app: this.app,
      plugin: this.plugin,
      createStyleGroupSection: (containerEl, title, desc) => this.createStyleGroupSection(containerEl, title, desc),
      addNumericControl: (containerEl, config) => this.addNumericControl(containerEl, config),
      addNumericStyleControl: (containerEl, config) => this.addNumericStyleControl(containerEl, config),
      createStyleResetSetting: (containerEl, group) => this.createStyleResetSetting(containerEl, group),
      registerStyleControlBinding: (group, syncFromSettings) => this.registerStyleControlBinding(group, syncFromSettings),
      clearStyleControlBindings: (group) => this.clearStyleControlBindings(group),
      applyAndScheduleStyleUpdate: () => this.applyAndScheduleStyleUpdate(),
      addSettingHelpButton: (setting, helpButton) => this.addSettingHelpButton(setting, helpButton),
    });
  }

  private createPresetSection(): SettingsStylePresetSection {
    return new SettingsStylePresetSection({
      plugin: this.plugin,
      createStyleGroupSection: (containerEl, title, desc) => this.createStyleGroupSection(containerEl, title, desc),
      onThemeAppearanceChanged: () => {
        this.refreshStyleControlValues();
        this.runtime?.backgroundStyleSection.refresh();
      },
    });
  }

  private async resetAllChatStyles(): Promise<void> {
    const runtime = this.runtime;
    try {
      await this.plugin.resetChatAppearanceToBaselineAndSave();
      this.refreshThemePresetUi(runtime);
      new Notice(t('settings.style.resetAll.success'));
    } catch (error) {
      logger.warn('Failed to reset chat styles', error);
      new Notice(t('settings.style.resetAll.failed'));
    }
  }

  private refreshThemePresetUi(runtime?: SettingsStyleSectionRuntimeState | null): void {
    if (runtime && !this.isRuntimeActive(runtime)) {
      return;
    }

    this.refreshStyleControlValues();
    this.runtime?.backgroundStyleSection.refresh();
    this.runtime?.presetSection.refresh();
  }

  private isRuntimeActive(runtime: SettingsStyleSectionRuntimeState): boolean {
    return this.runtime === runtime;
  }
}

import type { App } from 'obsidian';
import { Notice, Setting } from 'obsidian';

import { getBuiltinThemePresets, hasThemeAppearanceOverrides } from '../../core/theme';
import {
  type ChatAppearanceSettings,
  getDefaultInputPanelGlassRefractionSettings,
  getDefaultInputPanelGlassRefractionSvgFilterSettings,
  getInputPanelGlassRefractionVariantId,
  getInputPanelThemeFamily,
  getInputPanelThemeIdForLiquidGlassAdapter,
  getLiquidGlassAdapterIdForInputPanelTheme,
  type InputPanelActionButtonStyleId,
  type InputPanelGlassRefractionSvgFilterPresetId,
  type InputPanelGlassRefractionVariantId,
  type InputPanelThemeId,
  isValidChatAppearanceCustomCssDeclarations,
  type LiquidGlassAdapterId,
  normalizeGlassRefractionInputPanelThemeId,
  normalizeLiquidGlassInputPanelThemeId,
  type ThemePresetDefinition,
  type ThemeStyleId,
} from '../../core/types';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import { getAllGlassAdapters } from '../../utils/glass';
import { LiquidGlassSettingHelpModal } from './LiquidGlassSettingHelpModal';
import { SettingsStyleBackgroundSection } from './SettingsStyleBackgroundSection';

const logger = createLogger('SettingsStyleSection');

type ChatAppearanceStyleGroup =
  | 'layout'
  | 'background'
  | 'user'
  | 'assistant'
  | 'input'
  | 'scrollbar'
  | 'advanced';

interface NumericStyleControlConfig {
  group: ChatAppearanceStyleGroup;
  name: string;
  desc: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  value: () => number;
  resetValue: () => number;
  setValue: (appearance: ChatAppearanceSettings, value: number) => void;
}

interface ColorStyleControlConfig {
  group: ChatAppearanceStyleGroup;
  name: string;
  desc: string;
  value: () => string;
  resetValue: () => string;
  setValue: (appearance: ChatAppearanceSettings, value: string) => void;
}

interface NumericControlConfig {
  name: string;
  desc: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  value: () => number;
  resetValue: () => number;
  commitValue: (value: number) => void;
  helpButton?: SettingHelpButtonConfig;
  registerSync?: (syncFromSettings: () => void) => void;
}

interface SettingHelpButtonConfig {
  tooltip: string;
  onClick: () => void;
}

interface StyleControlBinding {
  group: ChatAppearanceStyleGroup;
  syncFromSettings: () => void;
}

interface SettingsStyleSectionOptions {
  app: App;
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  setSettingDescWithFormatting: (setting: Setting, text: string) => void;
  addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
}

export class SettingsStyleSection {
  private readonly app: App;
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  private readonly setSettingDescWithFormatting: (setting: Setting, text: string) => void;
  private readonly addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
  private styleControlBindings: StyleControlBinding[] = [];
  private stylePresetUiRefresh?: () => void;
  private backgroundStyleSection: SettingsStyleBackgroundSection | null = null;
  private inputStyleGroupHostEl: HTMLElement | null = null;

  constructor(options: SettingsStyleSectionOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.setSettingDescWithFormatting = options.setSettingDescWithFormatting;
    this.addSettingHelpButton = options.addSettingHelpButton;
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    this.dispose();

    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.style.title'),
      t('settings.quickNav.styleDesc'),
    );
    this.addThemePresetSection(containerEl);
    this.addResetAllSetting(containerEl);

    this.backgroundStyleSection = this.createBackgroundStyleSection();
    this.backgroundStyleSection.attach(containerEl);
    this.addLayoutStyleGroup(containerEl);
    this.addUserStyleGroup(containerEl);
    this.addAssistantStyleGroup(containerEl);

    const inputGroupHostEl = containerEl.createDiv({ cls: 'opencodian-style-input-group-host' });
    this.renderInputStyleGroup(inputGroupHostEl);

    this.addScrollbarStyleGroup(containerEl);
    this.addAdvancedStyleGroup(containerEl);

    return headingEl;
  }

  dispose(): void {
    this.styleControlBindings = [];
    this.stylePresetUiRefresh = undefined;
    this.backgroundStyleSection?.dispose();
    this.backgroundStyleSection = null;
    this.inputStyleGroupHostEl = null;
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
      .setClass('opencodian-style-setting');
    this.setSettingDescWithFormatting(
      advancedSetting,
      t('settings.style.advanced.customCssDeclarations.desc'),
    );

    const validationEl = advancedSetting.settingEl.createDiv({
      cls: 'opencodian-style-validation',
    });

    advancedSetting.addTextArea((text) => {
      const syncFromSettings = () => {
        const currentValue = this.plugin.settings.chatAppearance.advanced.customCssDeclarations;
        text.setValue(currentValue);
        if (isValidChatAppearanceCustomCssDeclarations(currentValue)) {
          text.inputEl.removeClass('is-invalid');
          validationEl.empty();
          return;
        }

        text.inputEl.addClass('is-invalid');
        validationEl.setText(t('settings.style.advanced.customCssDeclarations.invalid'));
      };

      text
        .setPlaceholder(t('settings.style.advanced.customCssDeclarations.placeholder'))
        .setValue(this.plugin.settings.chatAppearance.advanced.customCssDeclarations)
        .onChange((value) => {
          if (!isValidChatAppearanceCustomCssDeclarations(value)) {
            text.inputEl.addClass('is-invalid');
            validationEl.setText(t('settings.style.advanced.customCssDeclarations.invalid'));
            return;
          }

          text.inputEl.removeClass('is-invalid');
          validationEl.empty();
          this.plugin.updateChatAppearance((appearance) => {
            appearance.advanced.customCssDeclarations = value;
          });
          this.applyAndScheduleStyleUpdate();
        });

      text.inputEl.rows = 6;
      text.inputEl.cols = 44;
      text.inputEl.addClass('opencodian-style-textarea');

      this.registerStyleControlBinding('advanced', syncFromSettings);
    });

    this.createStyleResetSetting(advancedGroupEl, 'advanced');
  }

  private addThemePresetSection(containerEl: HTMLElement): void {
    const presetGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.presets.title'),
      t('settings.style.presets.desc'),
    );
    presetGroupEl.addClass('opencodian-theme-presets');

    const presets = getBuiltinThemePresets();
    const styleOrder: ThemeStyleId[] = ['glass', 'flat', 'soft', 'sharp'];
    const presetsByStyle = new Map<ThemeStyleId, ThemePresetDefinition[]>(
      styleOrder.map((styleId) => [styleId, presets.filter((preset) => preset.styleId === styleId)]),
    );
    const styleGridEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-style-grid' });
    const statusRowEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-status-row' });
    const statusEl = statusRowEl.createDiv({ cls: 'opencodian-theme-status-copy' });
    const schemeSectionEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-scheme-section' });
    const schemeLabelEl = schemeSectionEl.createDiv({
      cls: 'opencodian-theme-scheme-label',
      text: t('settings.style.presets.schemes.label'),
    });
    const schemeChipsEl = schemeSectionEl.createDiv({ cls: 'opencodian-theme-scheme-chips' });
    const actionsEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-actions' });
    const styleButtons = new Map<ThemeStyleId, HTMLButtonElement>();

    let selectedStyleId: ThemeStyleId = this.plugin.getActiveThemePresetDefinition()?.styleId ?? 'glass';

    const renderPresetUi = () => {
      const activePreset = this.plugin.getActiveThemePresetDefinition();
      if (activePreset) {
        selectedStyleId = activePreset.styleId;
      }

      const hasOverrides = activePreset ? hasThemeAppearanceOverrides(this.plugin.settings.theme) : false;
      statusEl.setText(
        activePreset
          ? (
            hasOverrides
              ? t('settings.style.presets.statusCustomized', { preset: activePreset.name })
              : t('settings.style.presets.statusPreset', { preset: activePreset.name })
          )
          : t('settings.style.presets.statusCustom'),
      );
      statusRowEl.toggleClass('is-customized', hasOverrides);

      for (const [styleId, buttonEl] of styleButtons) {
        buttonEl.toggleClass('is-active', activePreset?.styleId === styleId);
      }

      schemeChipsEl.empty();
      for (const preset of presetsByStyle.get(selectedStyleId) ?? []) {
        const schemeButtonEl = schemeChipsEl.createEl('button', {
          cls: 'opencodian-theme-scheme-chip',
          text: this.getThemeSchemeLabel(preset.id),
        });
        schemeButtonEl.type = 'button';
        schemeButtonEl.toggleClass('is-active', activePreset?.id === preset.id);
        schemeButtonEl.addEventListener('click', () => {
          void this.applyThemePresetSelection(preset.id, renderPresetUi);
        });
      }
      schemeSectionEl.toggleClass('is-empty', schemeChipsEl.childElementCount === 0);
      schemeLabelEl.setText(t('settings.style.presets.schemes.label'));

      actionsEl.empty();
      if (activePreset) {
        const resetBtn = actionsEl.createEl('button', {
          cls: 'mod-cta opencodian-theme-reset-btn',
          text: t('settings.style.presets.reset.button'),
        });
        resetBtn.type = 'button';
        resetBtn.disabled = !hasOverrides;
        resetBtn.addEventListener('click', () => {
          void this.resetThemePresetAppearance(renderPresetUi);
        });
      }
    };

    for (const styleId of styleOrder) {
      const buttonEl = styleGridEl.createEl('button', {
        cls: 'opencodian-theme-style-card',
      });
      buttonEl.type = 'button';
      buttonEl.createDiv({
        cls: 'opencodian-theme-style-card-title',
        text: this.getThemeStyleTitle(styleId),
      });
      buttonEl.createDiv({
        cls: 'opencodian-theme-style-card-desc',
        text: this.getThemeStyleDescription(styleId),
      });
      buttonEl.addEventListener('click', () => {
        void this.applyThemeStyleSelection(styleId, presetsByStyle, renderPresetUi, (nextStyleId) => {
          selectedStyleId = nextStyleId;
        });
      });
      styleButtons.set(styleId, buttonEl);
    }

    this.stylePresetUiRefresh = renderPresetUi;
    renderPresetUi();
  }

  private async applyThemePresetSelection(
    presetId: ThemePresetDefinition['id'],
    renderPresetUi: () => void,
  ): Promise<void> {
    try {
      await this.plugin.selectThemePresetAndSave(presetId);
      this.refreshStyleControlValues();
      this.backgroundStyleSection?.refresh();
      renderPresetUi();
    } catch (error) {
      logger.warn('Failed to apply theme preset selection', error);
      new Notice(t('settings.style.presets.applyFailed'));
    }
  }

  private async resetThemePresetAppearance(renderPresetUi: () => void): Promise<void> {
    try {
      await this.plugin.resetThemePresetAppearanceAndSave();
      this.refreshStyleControlValues();
      this.backgroundStyleSection?.refresh();
      renderPresetUi();
    } catch (error) {
      logger.warn('Failed to reset preset appearance', error);
      new Notice(t('settings.style.presets.reset.failed'));
    }
  }

  private async applyThemeStyleSelection(
    styleId: ThemeStyleId,
    presetsByStyle: Map<ThemeStyleId, ThemePresetDefinition[]>,
    renderPresetUi: () => void,
    updateSelectedStyleId: (styleId: ThemeStyleId) => void,
  ): Promise<void> {
    updateSelectedStyleId(styleId);
    const nextPreset = presetsByStyle.get(styleId)?.[0];
    if (!nextPreset) {
      renderPresetUi();
      return;
    }

    await this.applyThemePresetSelection(nextPreset.id, renderPresetUi);
  }

  private getThemeStyleTitle(styleId: ThemeStyleId): string {
    return t(`settings.style.presets.styles.${styleId}.title` as TranslationKey);
  }

  private getThemeStyleDescription(styleId: ThemeStyleId): string {
    return t(`settings.style.presets.styles.${styleId}.desc` as TranslationKey);
  }

  private getThemeSchemeLabel(presetId: ThemePresetDefinition['id']): string {
    return t(`settings.style.presets.scheme.${presetId}` as TranslationKey);
  }

  private createStyleGroupSection(containerEl: HTMLElement, title: string, desc: string): HTMLElement {
    const sectionEl = containerEl.createDiv({ cls: 'opencodian-style-section' });
    const headerEl = sectionEl.createDiv({ cls: 'opencodian-style-group' });
    headerEl.createEl('h4', { cls: 'opencodian-style-group-title', text: title });
    headerEl.createEl('p', { cls: 'opencodian-style-group-desc', text: desc });

    return sectionEl.createDiv({ cls: 'opencodian-style-group-body' });
  }

  private addNumericControl(containerEl: HTMLElement, config: NumericControlConfig): void {
    const setting = new Setting(containerEl)
      .setName(config.name)
      .setDesc(config.desc)
      .setClass('opencodian-style-setting');

    setting.controlEl.empty();
    setting.controlEl.addClass('opencodian-style-setting-control');

    const decrementBtn = setting.controlEl.createEl('button', {
      cls: 'opencodian-style-step-btn',
      text: '−',
    });
    decrementBtn.type = 'button';
    decrementBtn.setAttribute('aria-label', `${config.name} -`);

    const sliderEl = setting.controlEl.createEl('input', {
      cls: 'opencodian-style-slider',
      type: 'range',
    });
    sliderEl.min = String(config.min);
    sliderEl.max = String(config.max);
    sliderEl.step = String(config.step);

    const numberInputChars = this.getNumericControlInputChars(config);
    const numberWrapEl = setting.controlEl.createDiv({ cls: 'opencodian-style-number-wrap' });
    numberWrapEl.style.setProperty(
      '--opencodian-style-number-width',
      `calc(${numberInputChars}ch + 1.8em)`,
    );
    const numberEl = numberWrapEl.createEl('input', {
      cls: 'opencodian-style-number',
      type: 'number',
    });
    numberEl.size = numberInputChars;
    numberEl.min = String(config.min);
    numberEl.max = String(config.max);
    numberEl.step = 'any';
    const unitEl = numberWrapEl.createSpan({ cls: 'opencodian-style-unit', text: config.unit });

    const incrementBtn = setting.controlEl.createEl('button', {
      cls: 'opencodian-style-step-btn',
      text: '+',
    });
    incrementBtn.type = 'button';
    incrementBtn.setAttribute('aria-label', `${config.name} +`);

    const resetBtn = setting.controlEl.createEl('button', {
      cls: 'opencodian-style-reset-btn',
      text: '⟲',
    });
    resetBtn.type = 'button';
    resetBtn.setAttribute('aria-label', t('settings.style.resetSingle.tooltip'));
    resetBtn.setAttribute('title', t('settings.style.resetSingle.tooltip'));

    let isEditingNumberInput = false;
    let isDraggingSlider = false;

    const renderValue = (value: number, options: { preserveNumberDraft?: boolean } = {}) => {
      sliderEl.value = String(value);
      if (!(options.preserveNumberDraft && isEditingNumberInput)) {
        numberEl.value = String(value);
      }
      unitEl.setText(config.unit);
    };

    const commitValue = (
      value: number,
      options: { preserveNumberDraft?: boolean; snapToStep?: boolean } = {},
    ) => {
      const nextValue = options.snapToStep === false
        ? this.clampNumericControlValue(value, config.min, config.max)
        : this.clampStyleNumber(value, config.min, config.max, config.step);
      config.commitValue(nextValue);
      renderValue(nextValue, { preserveNumberDraft: options.preserveNumberDraft });
    };

    const commitNumberInputDraft = () => {
      isEditingNumberInput = false;
      const rawValue = numberEl.value.trim();
      if (!this.isStableNumericControlDraft(rawValue)) {
        renderValue(config.value());
        return;
      }

      const nextValue = Number(rawValue);
      if (Number.isNaN(nextValue)) {
        renderValue(config.value());
        return;
      }

      commitValue(nextValue, { snapToStep: false });
    };

    decrementBtn.addEventListener('click', () => {
      commitValue(config.value() - config.step);
    });
    incrementBtn.addEventListener('click', () => {
      commitValue(config.value() + config.step);
    });
    resetBtn.addEventListener('click', () => {
      isDraggingSlider = false;
      commitValue(config.resetValue());
    });
    sliderEl.addEventListener('pointerdown', () => {
      isDraggingSlider = true;
    });
    sliderEl.addEventListener('input', () => {
      const nextValue = Number(sliderEl.value);
      if (Number.isNaN(nextValue)) {
        return;
      }

      if (isDraggingSlider) {
        renderValue(nextValue, { preserveNumberDraft: true });
        return;
      }

      commitValue(nextValue);
    });
    sliderEl.addEventListener('change', () => {
      isDraggingSlider = false;
      const nextValue = Number(sliderEl.value);
      if (!Number.isNaN(nextValue)) {
        commitValue(nextValue);
      }
    });
    sliderEl.addEventListener('blur', () => {
      isDraggingSlider = false;
    });
    numberEl.addEventListener('focus', () => {
      isEditingNumberInput = true;
    });
    numberEl.addEventListener('input', () => {
      const rawValue = numberEl.value.trim();
      if (!this.isStableNumericControlDraft(rawValue)) {
        return;
      }

      const nextValue = Number(rawValue);
      if (!Number.isNaN(nextValue)) {
        commitValue(nextValue, {
          preserveNumberDraft: true,
          snapToStep: false,
        });
      }
    });
    numberEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        numberEl.blur();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        isEditingNumberInput = false;
        renderValue(config.value());
        numberEl.blur();
      }
    });
    numberEl.addEventListener('blur', () => {
      commitNumberInputDraft();
    });

    renderValue(config.value());
    config.registerSync?.(() => {
      renderValue(config.value());
    });

    if (config.helpButton) {
      this.addSettingHelpButton(setting, config.helpButton);
    }
  }

  private getNumericControlInputChars(config: Pick<NumericControlConfig, 'min' | 'max' | 'step'>): number {
    const precision = this.getNumericControlPrecision(config.step);
    const minChars = this.formatNumericControlValue(config.min, precision).length;
    const maxChars = this.formatNumericControlValue(config.max, precision).length;

    return Math.max(4, minChars, maxChars);
  }

  private getNumericControlPrecision(step: number): number {
    const stepText = String(step);
    const decimalIndex = stepText.indexOf('.');

    return decimalIndex >= 0 ? stepText.length - decimalIndex - 1 : 0;
  }

  private formatNumericControlValue(value: number, precision: number): string {
    if (precision <= 0) {
      return String(value);
    }

    return value.toFixed(precision).replace(/\.?0+$/, '');
  }

  private isStableNumericControlDraft(rawValue: string): boolean {
    const normalized = rawValue.trim();
    if (
      normalized.length === 0
      || normalized === '-'
      || normalized === '+'
      || normalized === '.'
      || normalized === '-.'
      || normalized === '+.'
      || normalized.endsWith('.')
      || /[eE][+-]?$/.test(normalized)
    ) {
      return false;
    }

    return Number.isFinite(Number(normalized));
  }

  private clampNumericControlValue(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private addNumericStyleControl(containerEl: HTMLElement, config: NumericStyleControlConfig): void {
    this.addNumericControl(containerEl, {
      name: config.name,
      desc: config.desc,
      min: config.min,
      max: config.max,
      step: config.step,
      unit: config.unit,
      value: config.value,
      resetValue: config.resetValue,
      commitValue: (nextValue) => {
        this.plugin.updateChatAppearance((appearance) => {
          config.setValue(appearance, nextValue);
        });
        this.applyAndScheduleStyleUpdate();
      },
      registerSync: (syncFromSettings) => {
        this.registerStyleControlBinding(config.group, syncFromSettings);
      },
    });
  }

  private addColorStyleControl(containerEl: HTMLElement, config: ColorStyleControlConfig): void {
    const setting = new Setting(containerEl)
      .setName(config.name)
      .setDesc(config.desc)
      .setClass('opencodian-style-setting');

    const controlEl = (setting as Setting & { controlEl?: HTMLElement }).controlEl instanceof HTMLElement
      ? (setting as Setting & { controlEl: HTMLElement }).controlEl
      : setting.settingEl.createDiv({ cls: 'setting-item-control' });
    controlEl.empty();
    controlEl.addClass('opencodian-style-setting-control');

    controlEl.addClass('opencodian-style-color-control');

    const previewBtn = controlEl.createEl('button', {
      cls: 'opencodian-style-color-preview',
    });
    previewBtn.type = 'button';
    previewBtn.setAttribute('aria-label', t('settings.style.colorPicker.pick'));

    const valueEl = controlEl.createSpan({ cls: 'opencodian-style-color-value' });

    const pickBtn = controlEl.createEl('button', {
      cls: 'opencodian-style-secondary-btn',
      text: t('settings.style.colorPicker.pick'),
    });
    pickBtn.type = 'button';

    const followThemeBtn = controlEl.createEl('button', {
      cls: 'opencodian-style-secondary-btn',
      text: t('settings.style.colorPicker.followTheme'),
    });
    followThemeBtn.type = 'button';

    const colorInput = controlEl.createEl('input', {
      cls: 'opencodian-style-color-input',
      type: 'color',
    });
    colorInput.tabIndex = -1;
    colorInput.setAttribute('aria-hidden', 'true');

    const renderValue = (value: string) => {
      const normalizedValue = value.trim();
      const resetValue = config.resetValue().trim();
      const pickerHex = this.resolveStyleColorPickerHex(normalizedValue || resetValue, resetValue, setting.settingEl);
      const followsTheme = normalizedValue === resetValue;

      colorInput.value = pickerHex;
      previewBtn.style.background = normalizedValue || resetValue;
      previewBtn.setAttribute('title', followsTheme ? t('settings.style.colorPicker.followThemeValue') : normalizedValue);
      valueEl.setText(followsTheme ? t('settings.style.colorPicker.followThemeValue') : pickerHex.toUpperCase());
      valueEl.setAttribute('title', normalizedValue || resetValue);
      followThemeBtn.disabled = followsTheme;
    };

    const commitValue = (value: string) => {
      this.plugin.updateChatAppearance((appearance) => {
        config.setValue(appearance, value.trim());
      });
      this.applyAndScheduleStyleUpdate();
      renderValue(config.value());
    };

    const openColorPicker = () => {
      const inputWithPicker = colorInput as HTMLInputElement & { showPicker?: () => void };
      if (typeof inputWithPicker.showPicker === 'function') {
        inputWithPicker.showPicker();
        return;
      }

      colorInput.click();
    };

    previewBtn.addEventListener('click', openColorPicker);
    pickBtn.addEventListener('click', openColorPicker);
    followThemeBtn.addEventListener('click', () => {
      commitValue(config.resetValue());
    });
    colorInput.addEventListener('change', () => {
      commitValue(colorInput.value);
    });

    renderValue(config.value());
    this.registerStyleControlBinding(config.group, () => {
      renderValue(config.value());
    });
  }

  private resolveStyleColorPickerHex(
    value: string,
    fallback: string,
    hostEl?: HTMLElement | null,
  ): string {
    return this.resolveCssColorToHex(value, hostEl)
      ?? this.resolveCssColorToHex(fallback, hostEl)
      ?? '#808080';
  }

  private resolveCssColorToHex(value: string, hostEl?: HTMLElement | null): string | null {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const probeEl = document.createElement('span');
    probeEl.style.color = normalized;
    probeEl.style.position = 'absolute';
    probeEl.style.opacity = '0';
    probeEl.style.pointerEvents = 'none';

    const mountTarget = hostEl?.isConnected ? hostEl : document.body;
    mountTarget.appendChild(probeEl);
    const computedColor = window.getComputedStyle(probeEl).color;
    probeEl.remove();

    return this.parseCssColorToHex(computedColor);
  }

  private parseCssColorToHex(color: string): string | null {
    const match = color.match(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/iu);
    if (!match) {
      return null;
    }

    const toHex = (value: string) => Number.parseInt(value, 10).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  }

  private addGlassRefractionInputControls(containerEl: HTMLElement): void {
    const variantId = getInputPanelGlassRefractionVariantId(this.plugin.settings.inputPanelTheme);
    const defaults = getDefaultInputPanelGlassRefractionSettings()[variantId];
    const svgFilterDefaults = getDefaultInputPanelGlassRefractionSvgFilterSettings();
    const syncHandlers: Array<() => void> = [];
    const registerSync = (syncFromSettings: () => void) => {
      syncHandlers.push(syncFromSettings);
    };

    this.addNumericControl(containerEl, {
      name: t('settings.style.input.glassRefraction.backgroundOpacity.name'),
      desc: t('settings.style.input.glassRefraction.backgroundOpacity.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.inputPanelGlassRefraction[variantId].backgroundOpacity,
      resetValue: () => defaults.backgroundOpacity,
      commitValue: (value) => {
        this.updateInputPanelGlassRefractionVariant(variantId, (settings) => {
          settings.backgroundOpacity = value;
        });
        this.applyAndScheduleStyleUpdate();
      },
      registerSync,
    });
    this.addNumericControl(containerEl, {
      name: t('settings.style.input.glassRefraction.blur.name'),
      desc: t('settings.style.input.glassRefraction.blur.desc'),
      min: 0,
      max: 40,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.inputPanelGlassRefraction[variantId].blur,
      resetValue: () => defaults.blur,
      commitValue: (value) => {
        this.updateInputPanelGlassRefractionVariant(variantId, (settings) => {
          settings.blur = value;
        });
        this.applyAndScheduleStyleUpdate();
      },
      registerSync,
    });
    this.addNumericControl(containerEl, {
      name: t('settings.style.input.glassRefraction.saturation.name'),
      desc: t('settings.style.input.glassRefraction.saturation.desc'),
      min: 50,
      max: 250,
      step: 5,
      unit: '%',
      value: () => this.plugin.settings.inputPanelGlassRefraction[variantId].saturation,
      resetValue: () => defaults.saturation,
      commitValue: (value) => {
        this.updateInputPanelGlassRefractionVariant(variantId, (settings) => {
          settings.saturation = value;
        });
        this.applyAndScheduleStyleUpdate();
      },
      registerSync,
    });
    this.addNumericControl(containerEl, {
      name: t('settings.style.input.glassRefraction.brightness.name'),
      desc: t('settings.style.input.glassRefraction.brightness.desc'),
      min: 50,
      max: 150,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.inputPanelGlassRefraction[variantId].brightness,
      resetValue: () => defaults.brightness,
      commitValue: (value) => {
        this.updateInputPanelGlassRefractionVariant(variantId, (settings) => {
          settings.brightness = value;
        });
        this.applyAndScheduleStyleUpdate();
      },
      registerSync,
    });

    new Setting(containerEl)
      .setName(t('settings.style.input.glassRefraction.svgFilter.name'))
      .setDesc(t('settings.style.input.glassRefraction.svgFilter.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('none', t('settings.style.input.glassRefraction.svgFilter.option.none'))
          .addOption('subtle', t('settings.style.input.glassRefraction.svgFilter.option.subtle'))
          .addOption('strong', t('settings.style.input.glassRefraction.svgFilter.option.strong'))
          .setValue(this.plugin.settings.inputPanelGlassRefractionSvgFilter.preset)
          .onChange((value) => {
            this.plugin.settings.inputPanelGlassRefractionSvgFilter = {
              ...this.plugin.settings.inputPanelGlassRefractionSvgFilter,
              preset: value as InputPanelGlassRefractionSvgFilterPresetId,
            };
            this.applyAndScheduleStyleUpdate();
            this.renderInputStyleGroup();
          });
      });

    const activeSvgFilterPreset = this.plugin.settings.inputPanelGlassRefractionSvgFilter.preset;
    if (activeSvgFilterPreset !== 'none') {
      const scaleKey = this.getInputPanelGlassRefractionSvgFilterScaleKey(activeSvgFilterPreset);
      const scaleDefault = svgFilterDefaults[scaleKey];

      this.addNumericControl(containerEl, {
        name: t('settings.style.input.glassRefraction.svgFilter.scale.name'),
        desc: t('settings.style.input.glassRefraction.svgFilter.scale.desc'),
        min: 0,
        max: 32,
        step: 1,
        unit: '',
        value: () => this.plugin.settings.inputPanelGlassRefractionSvgFilter[scaleKey],
        resetValue: () => scaleDefault,
        commitValue: (value) => {
          this.plugin.settings.inputPanelGlassRefractionSvgFilter = {
            ...this.plugin.settings.inputPanelGlassRefractionSvgFilter,
            [scaleKey]: value,
          };
          this.applyAndScheduleStyleUpdate();
        },
        registerSync,
      });

      new Setting(containerEl)
        .setName(t('settings.style.input.glassRefraction.svgFilter.reset.name'))
        .setDesc(t('settings.style.input.glassRefraction.svgFilter.reset.desc'))
        .setClass('opencodian-style-reset-setting')
        .addButton((btn) => {
          btn
            .setButtonText(t('settings.style.input.glassRefraction.svgFilter.reset.button'))
            .onClick(() => {
              this.plugin.settings.inputPanelGlassRefractionSvgFilter = {
                ...this.plugin.settings.inputPanelGlassRefractionSvgFilter,
                [scaleKey]: scaleDefault,
              };
              this.applyAndScheduleStyleUpdate();
              syncHandlers.forEach((syncFromSettings) => syncFromSettings());
            });
        });
    }

    new Setting(containerEl)
      .setName(t('settings.style.input.glassRefraction.reset.name'))
      .setDesc(t('settings.style.input.glassRefraction.reset.desc'))
      .setClass('opencodian-style-reset-setting')
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.style.input.glassRefraction.reset.button'))
          .onClick(() => {
            this.plugin.settings.inputPanelGlassRefraction = {
              ...this.plugin.settings.inputPanelGlassRefraction,
              [variantId]: { ...defaults },
            };
            this.applyAndScheduleStyleUpdate();
            syncHandlers.forEach((syncFromSettings) => syncFromSettings());
          });
      });
  }

  private createStyleResetSetting(
    containerEl: HTMLElement,
    group: ChatAppearanceStyleGroup,
  ): void {
    new Setting(containerEl)
      .setName(t('settings.style.groupReset.name'))
      .setDesc(t('settings.style.groupReset.desc'))
      .setClass('opencodian-style-reset-setting')
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.style.groupReset.button'))
          .onClick(() => {
            this.plugin.resetChatAppearanceGroup(group);
            this.applyAndScheduleStyleUpdate();
            this.refreshStyleControlValues(group);
          });
      });
  }

  private registerStyleControlBinding(
    group: ChatAppearanceStyleGroup,
    syncFromSettings: () => void,
  ): void {
    this.styleControlBindings.push({
      group,
      syncFromSettings,
    });
  }

  private clearStyleControlBindings(group: ChatAppearanceStyleGroup): void {
    this.styleControlBindings = this.styleControlBindings.filter((binding) => binding.group !== group);
  }

  private refreshStyleControlValues(group?: ChatAppearanceStyleGroup): void {
    for (const binding of this.styleControlBindings) {
      if (group && binding.group !== group) {
        continue;
      }
      binding.syncFromSettings();
    }
  }

  private clampStyleNumber(value: number, min: number, max: number, step: number): number {
    const clampedValue = this.clampNumericControlValue(value, min, max);
    const precision = Math.max(
      this.getNumericControlPrecision(step),
      this.getNumericControlPrecision(min),
      this.getNumericControlPrecision(max),
    );
    const steppedValue = (Math.round(((clampedValue - min) / step) + Number.EPSILON) * step) + min;
    const normalizedValue = precision > 0 ? Number(steppedValue.toFixed(precision)) : steppedValue;
    return this.clampNumericControlValue(normalizedValue, min, max);
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

  private getInputPanelGlassRefractionSvgFilterScaleKey(
    preset: Exclude<InputPanelGlassRefractionSvgFilterPresetId, 'none'>,
  ): 'subtleScale' | 'strongScale' {
    return preset === 'subtle' ? 'subtleScale' : 'strongScale';
  }

  private updateInputPanelGlassRefractionVariant(
    variantId: InputPanelGlassRefractionVariantId,
    mutator: (settings: OpenCodianPlugin['settings']['inputPanelGlassRefraction'][InputPanelGlassRefractionVariantId]) => void,
  ): void {
    const nextVariantSettings = {
      ...this.plugin.settings.inputPanelGlassRefraction[variantId],
    };
    mutator(nextVariantSettings);
    this.plugin.settings.inputPanelGlassRefraction = {
      ...this.plugin.settings.inputPanelGlassRefraction,
      [variantId]: nextVariantSettings,
    };
  }

  private async resetAllChatStyles(): Promise<void> {
    try {
      await this.plugin.resetChatAppearanceToBaselineAndSave();
      this.refreshStyleControlValues();
      this.backgroundStyleSection?.refresh();
      this.stylePresetUiRefresh?.();
      new Notice(t('settings.style.resetAll.success'));
    } catch (error) {
      logger.warn('Failed to reset chat styles', error);
      new Notice(t('settings.style.resetAll.failed'));
    }
  }

  private renderInputStyleGroup(containerEl?: HTMLElement): void {
    const hostEl = containerEl ?? this.inputStyleGroupHostEl;
    if (!hostEl) {
      return;
    }

    this.inputStyleGroupHostEl = hostEl;
    this.clearStyleControlBindings('input');
    hostEl.empty();

    const inputGroupEl = this.createStyleGroupSection(
      hostEl,
      t('settings.style.groups.input.title'),
      t('settings.style.groups.input.desc'),
    );
    const themeFamily = getInputPanelThemeFamily(this.plugin.settings.inputPanelTheme);
    const isPresetInputPanelTheme = themeFamily === 'preset';
    new Setting(inputGroupEl)
      .setName(t('settings.style.input.theme.name'))
      .setDesc(t('settings.style.input.theme.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('preset', t('settings.style.input.theme.option.preset'))
          .addOption('glass-refraction', t('settings.style.input.theme.option.glassRefraction'))
          .addOption('liquid-glass', t('settings.style.input.theme.option.liquidGlass'))
          .setValue(themeFamily)
          .onChange(async (value) => {
            const nextTheme: InputPanelThemeId =
              value === 'preset'
                ? 'preset'
                : value === 'glass-refraction'
                  ? (
                    themeFamily === 'glass-refraction'
                      ? normalizeGlassRefractionInputPanelThemeId(this.plugin.settings.inputPanelTheme)
                      : 'glass-refraction-glass'
                  )
                  : (
                    themeFamily === 'liquid-glass'
                      ? normalizeLiquidGlassInputPanelThemeId(this.plugin.settings.inputPanelTheme)
                      : 'liquid-glass-shuding'
                  );
            await this.applyInputPanelThemeChange(nextTheme);
          });
      });

    new Setting(inputGroupEl)
      .setName(t('settings.style.input.actionButtons.name'))
      .setDesc(t('settings.style.input.actionButtons.desc'))
      .addDropdown((dropdown) => {
        const syncFromSettings = () => {
          dropdown.setValue(this.plugin.settings.chatAppearance.input.actionButtonStyle);
        };
        this.registerStyleControlBinding('input', syncFromSettings);
        dropdown
          .addOption('default', t('settings.style.input.actionButtons.option.default'))
          .addOption('etched', t('settings.style.input.actionButtons.option.etched'))
          .setValue(this.plugin.settings.chatAppearance.input.actionButtonStyle)
          .onChange((value) => {
            this.plugin.updateChatAppearance((appearance) => {
              appearance.input.actionButtonStyle = value as InputPanelActionButtonStyleId;
            });
            this.applyAndScheduleStyleUpdate();
          });
      });

    if (themeFamily === 'glass-refraction') {
      new Setting(inputGroupEl)
        .setName(t('settings.style.input.variant.name'))
        .setDesc(t('settings.style.input.variant.desc'))
        .addDropdown((dropdown) => {
          dropdown
            .addOption('glass-refraction-glass', t('settings.style.input.variant.option.glass'))
            .addOption('glass-refraction-card', t('settings.style.input.variant.option.card'))
            .addOption('glass-refraction-pill', t('settings.style.input.variant.option.pill'))
            .setValue(normalizeGlassRefractionInputPanelThemeId(this.plugin.settings.inputPanelTheme))
            .onChange(async (value) => {
              await this.applyInputPanelThemeChange(value as InputPanelThemeId);
            });
        });
    }

    if (themeFamily === 'liquid-glass') {
      new Setting(inputGroupEl)
        .setName(t('settings.style.input.liquidGlass.variant.name'))
        .setDesc(t('settings.style.input.liquidGlass.variant.desc'))
        .addDropdown((dropdown) => {
          for (const adapter of getAllGlassAdapters()) {
            dropdown.addOption(getInputPanelThemeIdForLiquidGlassAdapter(adapter.id), adapter.displayName);
          }

          dropdown
            .setValue(normalizeLiquidGlassInputPanelThemeId(this.plugin.settings.inputPanelTheme))
            .onChange(async (value) => {
              await this.applyInputPanelThemeChange(value as InputPanelThemeId);
            });
        });
    }

    const inputControlsEl = inputGroupEl.createDiv({ cls: 'opencodian-style-input-controls' });
    this.addNumericStyleControl(inputControlsEl, {
      group: 'input',
      name: t('settings.style.input.radius.name'),
      desc: t('settings.style.input.radius.desc'),
      min: 8,
      max: 24,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.input.radius,
      resetValue: () => this.plugin.getChatAppearanceBaseline().input.radius,
      setValue: (appearance, value) => {
        appearance.input.radius = value;
      },
    });

    if (isPresetInputPanelTheme) {
      this.addNumericStyleControl(inputControlsEl, {
        group: 'input',
        name: t('settings.style.input.backgroundOpacity.name'),
        desc: t('settings.style.input.backgroundOpacity.desc'),
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
        value: () => this.plugin.settings.chatAppearance.input.backgroundOpacity,
        resetValue: () => this.plugin.getChatAppearanceBaseline().input.backgroundOpacity,
        setValue: (appearance, value) => {
          appearance.input.backgroundOpacity = value;
        },
      });
      this.addNumericStyleControl(inputControlsEl, {
        group: 'input',
        name: t('settings.style.input.blur.name'),
        desc: t('settings.style.input.blur.desc'),
        min: 0,
        max: 24,
        step: 1,
        unit: 'px',
        value: () => this.plugin.settings.chatAppearance.input.blur,
        resetValue: () => this.plugin.getChatAppearanceBaseline().input.blur,
        setValue: (appearance, value) => {
          appearance.input.blur = value;
        },
      });
      this.addNumericStyleControl(inputControlsEl, {
        group: 'input',
        name: t('settings.style.input.shadowBlur.name'),
        desc: t('settings.style.input.shadowBlur.desc'),
        min: 0,
        max: 36,
        step: 1,
        unit: 'px',
        value: () => this.plugin.settings.chatAppearance.input.shadowBlur,
        resetValue: () => this.plugin.getChatAppearanceBaseline().input.shadowBlur,
        setValue: (appearance, value) => {
          appearance.input.shadowBlur = value;
        },
      });
      this.createStyleResetSetting(inputControlsEl, 'input');
      return;
    }

    if (themeFamily === 'liquid-glass') {
      this.addLiquidGlassInputControls(inputControlsEl);
      return;
    }

    inputControlsEl.createDiv({
      cls: 'opencodian-style-input-lock-note',
      text: t('settings.style.input.glassRefractionNotice'),
    });
    this.addGlassRefractionInputControls(inputControlsEl);
  }

  private addLiquidGlassInputControls(containerEl: HTMLElement): void {
    const adapterId = getLiquidGlassAdapterIdForInputPanelTheme(this.plugin.settings.inputPanelTheme);
    if (!adapterId) {
      return;
    }

    const adapter = getAllGlassAdapters().find((item) => item.id === adapterId);
    if (!adapter) {
      return;
    }

    const adapterSettings = this.plugin.settings.inputPanelLiquidGlass[adapterId];
    let activeSectionLabelKey: TranslationKey | null = null;
    for (const paramDef of adapter.paramDefs) {
      if (paramDef.sectionLabelKey && paramDef.sectionLabelKey !== activeSectionLabelKey) {
        activeSectionLabelKey = paramDef.sectionLabelKey as TranslationKey;
        containerEl.createEl('h5', {
          cls: 'opencodian-style-subgroup-title',
          text: t(activeSectionLabelKey),
        });
      }

      const label = t(paramDef.labelKey as TranslationKey);
      const desc = paramDef.descKey ? t(paramDef.descKey as TranslationKey) : '';
      const helpButton = this.getLiquidGlassSettingHelpButtonConfig(adapterId, paramDef.key, label);

      if (paramDef.type === 'toggle') {
        const setting = new Setting(containerEl)
          .setName(label)
          .setDesc(desc)
          .setClass('opencodian-style-setting');
        setting.addToggle((toggle) => {
          toggle
            .setValue(Boolean(adapterSettings[paramDef.key] ?? paramDef.defaultValue))
            .onChange((value) => {
              this.updateLiquidGlassAdapterSetting(adapterId, paramDef.key, value);
              void this.plugin.saveSettings({
                syncService: false,
                reloadModels: false,
                syncConfig: false,
                applyUi: true,
              });
            });
        });
        if (helpButton) {
          this.addSettingHelpButton(setting, helpButton);
        }
        continue;
      }

      if (paramDef.type === 'select') {
        const setting = new Setting(containerEl)
          .setName(label)
          .setDesc(desc);
        setting.addDropdown((dropdown) => {
          for (const option of paramDef.options ?? []) {
            dropdown.addOption(
              option.value,
              option.labelKey ? t(option.labelKey as TranslationKey) : (option.label ?? option.value),
            );
          }

          dropdown
            .setValue(String(adapterSettings[paramDef.key] ?? paramDef.defaultValue))
            .onChange((value) => {
              this.updateLiquidGlassAdapterSetting(adapterId, paramDef.key, value);
              void this.plugin.saveSettings({
                syncService: false,
                reloadModels: false,
                syncConfig: false,
                applyUi: true,
              });
            });
        });
        if (helpButton) {
          this.addSettingHelpButton(setting, helpButton);
        }
        continue;
      }

      if (paramDef.type === 'text') {
        const setting = new Setting(containerEl)
          .setName(label)
          .setDesc(desc);
        setting.addText((text) => {
          text
            .setValue(String(adapterSettings[paramDef.key] ?? paramDef.defaultValue ?? ''))
            .onChange((value) => {
              this.updateLiquidGlassAdapterSetting(adapterId, paramDef.key, value.trim());
              void this.plugin.saveSettings({
                syncService: false,
                reloadModels: false,
                syncConfig: false,
                applyUi: true,
              });
            });
        });
        if (helpButton) {
          this.addSettingHelpButton(setting, helpButton);
        }
        continue;
      }

      this.addNumericControl(containerEl, {
        name: label,
        desc,
        min: paramDef.min ?? 0,
        max: paramDef.max ?? 100,
        step: paramDef.step ?? 1,
        unit: paramDef.unit ?? '',
        value: () => Number(
          this.plugin.settings.inputPanelLiquidGlass[adapterId][paramDef.key] ?? paramDef.defaultValue,
        ),
        resetValue: () => Number(paramDef.defaultValue),
        commitValue: (value) => {
          this.updateLiquidGlassAdapterSetting(adapterId, paramDef.key, value);
          void this.plugin.saveSettings({
            syncService: false,
            reloadModels: false,
            syncConfig: false,
            applyUi: true,
          });
        },
        helpButton,
      });
    }
  }

  private getLiquidGlassSettingHelpButtonConfig(
    adapterId: LiquidGlassAdapterId,
    paramKey: string,
    title: string,
  ): SettingHelpButtonConfig | undefined {
    const helpText = this.getLiquidGlassSettingHelpText(adapterId, paramKey);
    if (!helpText) {
      return undefined;
    }

    return {
      tooltip: t('settings.style.input.help.buttonTooltip'),
      onClick: () => {
        new LiquidGlassSettingHelpModal(this.app, title, helpText).open();
      },
    };
  }

  private getLiquidGlassSettingHelpText(
    adapterId: LiquidGlassAdapterId,
    paramKey: string,
  ): string | null {
    if (adapterId !== 'shuding') {
      return null;
    }

    const helpKey = `settings.style.input.liquidGlass.shuding.help.${paramKey}` as TranslationKey;
    const helpText = t(helpKey);

    return helpText === helpKey ? null : helpText;
  }

  private updateLiquidGlassAdapterSetting(
    adapterId: LiquidGlassAdapterId,
    key: string,
    value: number | string | boolean,
  ): void {
    this.plugin.settings.inputPanelLiquidGlass = {
      ...this.plugin.settings.inputPanelLiquidGlass,
      [adapterId]: {
        ...this.plugin.settings.inputPanelLiquidGlass[adapterId],
        [key]: value,
      },
    };
  }

  private async applyInputPanelThemeChange(themeId: InputPanelThemeId): Promise<void> {
    if (this.plugin.settings.inputPanelTheme === themeId) {
      return;
    }

    this.plugin.settings.inputPanelTheme = themeId;
    await this.plugin.saveSettings({
      syncService: false,
      reloadModels: false,
      syncConfig: false,
      applyUi: true,
    });
    this.renderInputStyleGroup();
  }
}

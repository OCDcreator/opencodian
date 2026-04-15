import type { App } from 'obsidian';
import { Setting } from 'obsidian';

import {
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
  normalizeGlassRefractionInputPanelThemeId,
  normalizeLiquidGlassInputPanelThemeId,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getAllGlassAdapters } from '../../utils/glass';
import { SettingsStyleLiquidGlassInputControls } from './SettingsStyleLiquidGlassInputControls';

interface InputPanelNumericStyleControlConfig {
  group: 'input';
  name: string;
  desc: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  value: () => number;
  resetValue: () => number;
  setValue: (appearance: OpenCodianPlugin['settings']['chatAppearance'], value: number) => void;
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

interface SettingsStyleInputPanelSectionOptions {
  app: App;
  plugin: OpenCodianPlugin;
  createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
  addNumericControl: (containerEl: HTMLElement, config: NumericControlConfig) => void;
  addNumericStyleControl: (containerEl: HTMLElement, config: InputPanelNumericStyleControlConfig) => void;
  createStyleResetSetting: (containerEl: HTMLElement, group: 'input') => void;
  registerStyleControlBinding: (group: 'input', syncFromSettings: () => void) => void;
  clearStyleControlBindings: (group: 'input') => void;
  applyAndScheduleStyleUpdate: () => void;
  addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
}

export class SettingsStyleInputPanelSection {
  private readonly app: App;
  private readonly plugin: OpenCodianPlugin;
  private readonly createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
  private readonly addNumericControl: (containerEl: HTMLElement, config: NumericControlConfig) => void;
  private readonly addNumericStyleControl: (
    containerEl: HTMLElement,
    config: InputPanelNumericStyleControlConfig,
  ) => void;
  private readonly createStyleResetSetting: (containerEl: HTMLElement, group: 'input') => void;
  private readonly registerStyleControlBinding: (group: 'input', syncFromSettings: () => void) => void;
  private readonly clearStyleControlBindings: (group: 'input') => void;
  private readonly applyAndScheduleStyleUpdate: () => void;
  private readonly addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
  private readonly liquidGlassControls: SettingsStyleLiquidGlassInputControls;
  private hostEl: HTMLElement | null = null;
  private renderSessionId = 0;

  constructor(options: SettingsStyleInputPanelSectionOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.createStyleGroupSection = options.createStyleGroupSection;
    this.addNumericControl = options.addNumericControl;
    this.addNumericStyleControl = options.addNumericStyleControl;
    this.createStyleResetSetting = options.createStyleResetSetting;
    this.registerStyleControlBinding = options.registerStyleControlBinding;
    this.clearStyleControlBindings = options.clearStyleControlBindings;
    this.applyAndScheduleStyleUpdate = options.applyAndScheduleStyleUpdate;
    this.addSettingHelpButton = options.addSettingHelpButton;
    this.liquidGlassControls = new SettingsStyleLiquidGlassInputControls({
      app: this.app,
      plugin: this.plugin,
      addNumericControl: this.addNumericControl,
      addSettingHelpButton: this.addSettingHelpButton,
    });
  }

  attach(containerEl: HTMLElement): void {
    this.renderSessionId += 1;
    this.hostEl = containerEl.createDiv({ cls: 'opencodian-style-input-group-host' });
    this.refresh();
  }

  dispose(): void {
    this.renderSessionId += 1;
    this.hostEl = null;
  }

  refresh(): void {
    const hostEl = this.hostEl;
    if (!hostEl) {
      return;
    }

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
      this.addPresetInputControls(inputControlsEl);
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

  async applyInputPanelThemeChange(themeId: InputPanelThemeId): Promise<void> {
    const sessionId = this.renderSessionId;
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
    if (sessionId !== this.renderSessionId || !this.hostEl) {
      return;
    }

    this.refresh();
  }

  private addPresetInputControls(containerEl: HTMLElement): void {
    this.addNumericStyleControl(containerEl, {
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
    this.addNumericStyleControl(containerEl, {
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
    this.addNumericStyleControl(containerEl, {
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
    this.createStyleResetSetting(containerEl, 'input');
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
            this.refresh();
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

  private addLiquidGlassInputControls(containerEl: HTMLElement): void {
    const adapterId = getLiquidGlassAdapterIdForInputPanelTheme(this.plugin.settings.inputPanelTheme);
    if (!adapterId) {
      return;
    }

    this.liquidGlassControls.attach(containerEl, adapterId);
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

}

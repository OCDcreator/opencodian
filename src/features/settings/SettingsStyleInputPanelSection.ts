/* eslint-disable max-lines -- Input panel style controls intentionally keep theme, radius, font, and variant settings co-located for shared refresh lifecycle. */
import type { App } from 'obsidian';
import { Setting } from 'obsidian';

import {
  type ContextRingStyleId,
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
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getAllGlassAdapters } from '../../utils/glass';
import {
  CUSTOM_FONT_ID,
  FONT_CATEGORY_LABELS,
  FONT_CATEGORY_ORDER,
  InputFontLoader,
  UNIFIED_FONT_OPTIONS,
} from './InputFontRegistry';
import type {
  NumericControlConfig,
  NumericStyleControlConfig,
  SettingHelpButtonConfig,
} from './settingsStyleControls';
import { SettingsStyleLiquidGlassInputControls } from './SettingsStyleLiquidGlassInputControls';

type InputPanelNumericStyleControlConfig = NumericStyleControlConfig & {
  group: 'input';
  setValue: (appearance: OpenCodianPlugin['settings']['chatAppearance'], value: number) => void;
};

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
  private fontLoader = new InputFontLoader();

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

    new Setting(inputGroupEl)
      .setName(t('settings.style.input.contextRing.name'))
      .setDesc(t('settings.style.input.contextRing.desc'))
      .addDropdown((dropdown) => {
        const syncFromSettings = () => {
          dropdown.setValue(this.plugin.settings.chatAppearance.input.contextRingStyle);
        };
        this.registerStyleControlBinding('input', syncFromSettings);
        dropdown
          .addOption('classic', t('settings.style.input.contextRing.option.classic'))
          .addOption('segmented', t('settings.style.input.contextRing.option.segmented'))
          .setValue(this.plugin.settings.chatAppearance.input.contextRingStyle)
          .onChange((value) => {
            this.plugin.updateChatAppearance((appearance) => {
              appearance.input.contextRingStyle = value as ContextRingStyleId;
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

    // ── Font controls (shown for all input panel themes) ──
    this.addFontControls(inputControlsEl);

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

  private addFontControls(container: HTMLElement): void {
    // ── English font dropdown ──
    new Setting(container)
      .setName(t('settings.style.input.enFont.name'))
      .setDesc(t('settings.style.input.enFont.desc'))
      .then((setting) => {
        this.buildFontDropdown(setting, container, 'en');
      });

    // ── Chinese font dropdown ──
    new Setting(container)
      .setName(t('settings.style.input.cnFont.name'))
      .setDesc(t('settings.style.input.cnFont.desc'))
      .then((setting) => {
        this.buildFontDropdown(setting, container, 'cn');
      });
  }

  private static readonly CATEGORY_SEPARATOR_PREFIX = '__cat__';

  private buildFontDropdown(
    setting: Setting,
    container: HTMLElement,
    kind: 'en' | 'cn',
  ): void {
    const options = UNIFIED_FONT_OPTIONS;
    const currentValue = kind === 'en'
      ? this.plugin.settings.chatAppearance.input.enFontFamily
      : this.plugin.settings.chatAppearance.input.cnFontFamily;

    // Determine current selection: match a known id, or mark as custom
    const isCustomValue = !!currentValue && !options.some(o => o.id === currentValue);
    const dropdownValue = isCustomValue ? CUSTOM_FONT_ID : (currentValue || 'inherit');

    let customInputEl: HTMLInputElement | null = null;

    setting.addDropdown((dd) => {
      // Build categorized options with separator headers
      const selectEl = dd.selectEl;
      selectEl.empty();

      for (const category of FONT_CATEGORY_ORDER) {
        const categoryFonts = options.filter(o => o.category === category);
        if (categoryFonts.length === 0) continue;

        // Category header (disabled separator)
        const headerValue = `${SettingsStyleInputPanelSection.CATEGORY_SEPARATOR_PREFIX}${category}`;
        const headerEl = document.createElement('option');
        headerEl.value = headerValue;
        headerEl.textContent = t(FONT_CATEGORY_LABELS[category] as TranslationKey);
        headerEl.disabled = true;
        selectEl.appendChild(headerEl);

        // Font options in this category
        for (const font of categoryFonts) {
          const optionEl = document.createElement('option');
          optionEl.value = font.id;
          optionEl.textContent = font.displayName;
          selectEl.appendChild(optionEl);
        }
      }

      // Custom option at the end
      const customOption = document.createElement('option');
      customOption.value = CUSTOM_FONT_ID;
      customOption.textContent = t('settings.style.input.font.custom');
      selectEl.appendChild(customOption);

      selectEl.value = dropdownValue;

      dd.onChange((value) => {
        // Ignore separator selections
        if (value.startsWith(SettingsStyleInputPanelSection.CATEGORY_SEPARATOR_PREFIX)) return;

        if (value === CUSTOM_FONT_ID) {
          // Show custom input
          if (!customInputEl) {
            customInputEl = this.createCustomFontInput(setting, kind, isCustomValue ? currentValue : '');
          }
          customInputEl?.focus();
        } else {
          // Hide custom input
          if (customInputEl) {
            customInputEl.remove();
            customInputEl = null;
          }
          this.applyFontSelection(kind, value);
        }
      });
    });

    // If current value is custom, show the input immediately
    if (isCustomValue) {
      customInputEl = this.createCustomFontInput(setting, kind, currentValue);
    }
  }

  private createCustomFontInput(
    setting: Setting,
    kind: 'en' | 'cn',
    initialValue: string,
  ): HTMLInputElement {
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.placeholder = "'My Font', sans-serif";
    inputEl.value = initialValue;
    inputEl.style.cssText =
      'width: 100%; margin-top: 6px; padding: 4px 8px; border-radius: 6px;' +
      ' border: 1px solid var(--background-modifier-border);' +
      ' background: var(--background-primary); color: var(--text-normal); font-size: 12px;';

    inputEl.addEventListener('input', () => {
      const val = inputEl.value.trim();
      if (kind === 'en') {
        this.plugin.settings.chatAppearance.input.enFontFamily = val;
      } else {
        this.plugin.settings.chatAppearance.input.cnFontFamily = val;
      }
      this.applyAndScheduleStyleUpdate();
    });

    // Append below the setting control area
    const controlEl = setting.settingEl.querySelector('.setting-item-control');
    if (controlEl?.parentElement) {
      controlEl.parentElement.appendChild(inputEl);
    }

    return inputEl;
  }

  private applyFontSelection(kind: 'en' | 'cn', fontId: string): void {
    const input = this.plugin.settings.chatAppearance.input;
    if (kind === 'en') {
      input.enFontFamily = fontId;
      this.fontLoader.ensureLoaded(fontId);
    } else {
      input.cnFontFamily = fontId;
      this.fontLoader.ensureLoaded(fontId);
    }
    this.applyAndScheduleStyleUpdate();
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

import type { App } from 'obsidian';
import { Setting } from 'obsidian';

import { type LiquidGlassAdapterId } from '../../core/types';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getAllGlassAdapters } from '../../utils/glass';
import { LiquidGlassSettingHelpModal } from './LiquidGlassSettingHelpModal';

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
}

interface SettingHelpButtonConfig {
  tooltip: string;
  onClick: () => void;
}

interface SettingsStyleLiquidGlassInputControlsOptions {
  app: App;
  plugin: OpenCodianPlugin;
  addNumericControl: (containerEl: HTMLElement, config: NumericControlConfig) => void;
  addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
}

export class SettingsStyleLiquidGlassInputControls {
  private readonly app: App;
  private readonly plugin: OpenCodianPlugin;
  private readonly addNumericControl: (containerEl: HTMLElement, config: NumericControlConfig) => void;
  private readonly addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;

  constructor(options: SettingsStyleLiquidGlassInputControlsOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.addNumericControl = options.addNumericControl;
    this.addSettingHelpButton = options.addSettingHelpButton;
  }

  attach(containerEl: HTMLElement, adapterId: LiquidGlassAdapterId): void {
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
              void this.saveLiquidGlassInputSettings();
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
              void this.saveLiquidGlassInputSettings();
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
              void this.saveLiquidGlassInputSettings();
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
          void this.saveLiquidGlassInputSettings();
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

  private saveLiquidGlassInputSettings(): Promise<void> {
    return this.plugin.saveSettings({
      syncService: false,
      reloadModels: false,
      syncConfig: false,
      applyUi: true,
    });
  }
}

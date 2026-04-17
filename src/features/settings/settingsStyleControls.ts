import { Setting } from 'obsidian';

import type { ChatAppearanceSettings } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

export type ChatAppearanceStyleGroup =
  | 'layout'
  | 'background'
  | 'user'
  | 'assistant'
  | 'input'
  | 'scrollbar'
  | 'advanced';

export interface NumericStyleControlConfig {
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

export interface ColorStyleControlConfig {
  group: ChatAppearanceStyleGroup;
  name: string;
  desc: string;
  value: () => string;
  resetValue: () => string;
  setValue: (appearance: ChatAppearanceSettings, value: string) => void;
}

export interface NumericControlConfig {
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

export interface SettingHelpButtonConfig {
  tooltip: string;
  onClick: () => void;
}

interface StyleControlBinding {
  group: ChatAppearanceStyleGroup;
  syncFromSettings: () => void;
}

interface ColorStyleControlElements {
  settingEl: HTMLElement;
  previewBtn: HTMLButtonElement;
  valueEl: HTMLSpanElement;
  followThemeBtn: HTMLButtonElement;
  colorInput: HTMLInputElement;
}

interface SettingsStyleControlsOptions {
  plugin: OpenCodianPlugin;
  addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
  applyAndScheduleStyleUpdate: () => void;
}

export class SettingsStyleControls {
  private readonly plugin: OpenCodianPlugin;
  private readonly addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
  private readonly applyAndScheduleStyleUpdate: () => void;
  private styleControlBindings: StyleControlBinding[] = [];

  constructor(options: SettingsStyleControlsOptions) {
    this.plugin = options.plugin;
    this.addSettingHelpButton = options.addSettingHelpButton;
    this.applyAndScheduleStyleUpdate = options.applyAndScheduleStyleUpdate;
  }

  dispose(): void {
    this.styleControlBindings = [];
  }

  addNumericControl(containerEl: HTMLElement, config: NumericControlConfig): void {
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

  getNumericControlInputChars(config: Pick<NumericControlConfig, 'min' | 'max' | 'step'>): number {
    const precision = this.getNumericControlPrecision(config.step);
    const minChars = this.formatNumericControlValue(config.min, precision).length;
    const maxChars = this.formatNumericControlValue(config.max, precision).length;

    return Math.max(4, minChars, maxChars);
  }

  addNumericStyleControl(containerEl: HTMLElement, config: NumericStyleControlConfig): void {
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

  addColorStyleControl(containerEl: HTMLElement, config: ColorStyleControlConfig): void {
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

    const elements: ColorStyleControlElements = {
      settingEl: setting.settingEl,
      previewBtn,
      valueEl,
      followThemeBtn,
      colorInput,
    };

    const renderValue = (value: string) => {
      this.renderColorStyleControlValue(config, elements, value);
    };

    const commitValue = (value: string) => {
      this.commitColorStyleControlValue(config, value);
      renderValue(config.value());
    };

    previewBtn.addEventListener('click', () => {
      this.openStyleColorPicker(colorInput);
    });
    pickBtn.addEventListener('click', () => {
      this.openStyleColorPicker(colorInput);
    });
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

  createStyleResetSetting(
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

  registerStyleControlBinding(
    group: ChatAppearanceStyleGroup,
    syncFromSettings: () => void,
  ): void {
    this.styleControlBindings.push({
      group,
      syncFromSettings,
    });
  }

  clearStyleControlBindings(group: ChatAppearanceStyleGroup): void {
    this.styleControlBindings = this.styleControlBindings.filter((binding) => binding.group !== group);
  }

  refreshStyleControlValues(group?: ChatAppearanceStyleGroup): void {
    for (const binding of this.styleControlBindings) {
      if (group && binding.group !== group) {
        continue;
      }
      binding.syncFromSettings();
    }
  }

  clampStyleNumber(value: number, min: number, max: number, step: number): number {
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

  private renderColorStyleControlValue(
    config: ColorStyleControlConfig,
    elements: ColorStyleControlElements,
    value: string,
  ): void {
    const { settingEl, previewBtn, valueEl, followThemeBtn, colorInput } = elements;
    const normalizedValue = value.trim();
    const resetValue = config.resetValue().trim();
    const pickerHex = this.resolveStyleColorPickerHex(normalizedValue || resetValue, resetValue, settingEl);
    const followsTheme = normalizedValue === resetValue;

    colorInput.value = pickerHex;
    previewBtn.style.background = normalizedValue || resetValue;
    previewBtn.setAttribute('title', followsTheme ? t('settings.style.colorPicker.followThemeValue') : normalizedValue);
    valueEl.setText(followsTheme ? t('settings.style.colorPicker.followThemeValue') : pickerHex.toUpperCase());
    valueEl.setAttribute('title', normalizedValue || resetValue);
    followThemeBtn.disabled = followsTheme;
  }

  private commitColorStyleControlValue(config: ColorStyleControlConfig, value: string): void {
    this.plugin.updateChatAppearance((appearance) => {
      config.setValue(appearance, value.trim());
    });
    this.applyAndScheduleStyleUpdate();
  }

  private openStyleColorPicker(colorInput: HTMLInputElement): void {
    const inputWithPicker = colorInput as HTMLInputElement & { showPicker?: () => void };
    if (typeof inputWithPicker.showPicker === 'function') {
      inputWithPicker.showPicker();
      return;
    }

    colorInput.click();
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
}

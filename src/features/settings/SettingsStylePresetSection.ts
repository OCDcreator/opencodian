import { Notice } from 'obsidian';

import { getBuiltinThemePresets, hasThemeAppearanceOverrides } from '../../core/theme';
import { type ThemePresetDefinition, type ThemeStyleId } from '../../core/types';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';

const logger = createLogger('SettingsStylePresetSection');
const STYLE_ORDER: ThemeStyleId[] = ['glass', 'flat', 'soft', 'sharp'];

interface SettingsStylePresetSectionOptions {
  plugin: OpenCodianPlugin;
  createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
  onThemeAppearanceChanged: () => void;
}

export class SettingsStylePresetSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
  private readonly onThemeAppearanceChanged: () => void;
  private hostEl: HTMLElement | null = null;
  private renderSessionId = 0;
  private selectedStyleId: ThemeStyleId;

  constructor(options: SettingsStylePresetSectionOptions) {
    this.plugin = options.plugin;
    this.createStyleGroupSection = options.createStyleGroupSection;
    this.onThemeAppearanceChanged = options.onThemeAppearanceChanged;
    this.selectedStyleId = this.plugin.getActiveThemePresetDefinition()?.styleId ?? 'glass';
  }

  attach(containerEl: HTMLElement): void {
    this.renderSessionId += 1;
    this.hostEl = containerEl.createDiv({ cls: 'opencodian-style-preset-group-host' });
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

    hostEl.empty();

    const presetGroupEl = this.createStyleGroupSection(
      hostEl,
      t('settings.style.presets.title'),
      t('settings.style.presets.desc'),
    );
    presetGroupEl.addClass('opencodian-theme-presets');

    const presetsByStyle = this.getPresetsByStyle();
    const activePreset = this.plugin.getActiveThemePresetDefinition();
    if (activePreset) {
      this.selectedStyleId = activePreset.styleId;
    }

    const styleGridEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-style-grid' });
    for (const styleId of STYLE_ORDER) {
      const buttonEl = styleGridEl.createEl('button', {
        cls: 'opencodian-theme-style-card',
      });
      buttonEl.type = 'button';
      buttonEl.toggleClass('is-active', activePreset?.styleId === styleId);
      buttonEl.createDiv({
        cls: 'opencodian-theme-style-card-title',
        text: this.getThemeStyleTitle(styleId),
      });
      buttonEl.createDiv({
        cls: 'opencodian-theme-style-card-desc',
        text: this.getThemeStyleDescription(styleId),
      });
      buttonEl.addEventListener('click', () => {
        void this.applyThemeStyleSelection(styleId, presetsByStyle);
      });
    }

    const hasOverrides = activePreset ? hasThemeAppearanceOverrides(this.plugin.settings.theme) : false;
    const statusRowEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-status-row' });
    statusRowEl.toggleClass('is-customized', hasOverrides);
    statusRowEl.createDiv({
      cls: 'opencodian-theme-status-copy',
      text: activePreset
        ? (
          hasOverrides
            ? t('settings.style.presets.statusCustomized', { preset: activePreset.name })
            : t('settings.style.presets.statusPreset', { preset: activePreset.name })
        )
        : t('settings.style.presets.statusCustom'),
    });

    const schemeSectionEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-scheme-section' });
    schemeSectionEl.createDiv({
      cls: 'opencodian-theme-scheme-label',
      text: t('settings.style.presets.schemes.label'),
    });
    const schemeChipsEl = schemeSectionEl.createDiv({ cls: 'opencodian-theme-scheme-chips' });
    for (const preset of presetsByStyle.get(this.selectedStyleId) ?? []) {
      const schemeButtonEl = schemeChipsEl.createEl('button', {
        cls: 'opencodian-theme-scheme-chip',
        text: this.getThemeSchemeLabel(preset.id),
      });
      schemeButtonEl.type = 'button';
      schemeButtonEl.toggleClass('is-active', activePreset?.id === preset.id);
      schemeButtonEl.addEventListener('click', () => {
        void this.applyThemePresetSelection(preset.id);
      });
    }
    schemeSectionEl.toggleClass('is-empty', schemeChipsEl.childElementCount === 0);

    if (!activePreset) {
      return;
    }

    const actionsEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-actions' });
    const resetBtn = actionsEl.createEl('button', {
      cls: 'mod-cta opencodian-theme-reset-btn',
      text: t('settings.style.presets.reset.button'),
    });
    resetBtn.type = 'button';
    resetBtn.disabled = !hasOverrides;
    resetBtn.addEventListener('click', () => {
      void this.resetThemePresetAppearance();
    });
  }

  private getPresetsByStyle(): Map<ThemeStyleId, ThemePresetDefinition[]> {
    const presets = getBuiltinThemePresets();
    return new Map(
      STYLE_ORDER.map((styleId) => [styleId, presets.filter((preset) => preset.styleId === styleId)]),
    );
  }

  private async applyThemePresetSelection(presetId: ThemePresetDefinition['id']): Promise<void> {
    const sessionId = this.renderSessionId;
    try {
      await this.plugin.selectThemePresetAndSave(presetId);
      if (!this.isSessionActive(sessionId)) {
        return;
      }

      this.onThemeAppearanceChanged();
      if (!this.isSessionActive(sessionId)) {
        return;
      }

      this.refresh();
    } catch (error) {
      logger.warn('Failed to apply theme preset selection', error);
      new Notice(t('settings.style.presets.applyFailed'));
    }
  }

  private async resetThemePresetAppearance(): Promise<void> {
    const sessionId = this.renderSessionId;
    try {
      await this.plugin.resetThemePresetAppearanceAndSave();
      if (!this.isSessionActive(sessionId)) {
        return;
      }

      this.onThemeAppearanceChanged();
      if (!this.isSessionActive(sessionId)) {
        return;
      }

      this.refresh();
    } catch (error) {
      logger.warn('Failed to reset preset appearance', error);
      new Notice(t('settings.style.presets.reset.failed'));
    }
  }

  private async applyThemeStyleSelection(
    styleId: ThemeStyleId,
    presetsByStyle: Map<ThemeStyleId, ThemePresetDefinition[]>,
  ): Promise<void> {
    this.selectedStyleId = styleId;
    const nextPreset = presetsByStyle.get(styleId)?.[0];
    if (!nextPreset) {
      this.refresh();
      return;
    }

    await this.applyThemePresetSelection(nextPreset.id);
  }

  private isSessionActive(sessionId: number): boolean {
    return sessionId === this.renderSessionId && this.hostEl !== null;
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
}

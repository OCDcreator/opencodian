import { Notice, Setting } from 'obsidian';
import * as path from 'path';

import {
  type ChatAppearanceBackgroundFitMode,
  type ChatAppearanceSettings,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import { getChatAppearanceBackgroundSizeValue } from '../chat/chatAppearance';

const logger = createLogger('SettingsStyleBackgroundSection');

interface BackgroundNumericStyleControlConfig {
  group: 'background';
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

interface SettingsStyleBackgroundSectionOptions {
  plugin: OpenCodianPlugin;
  createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
  addNumericStyleControl: (containerEl: HTMLElement, config: BackgroundNumericStyleControlConfig) => void;
  clearStyleControlBindings: (group: 'background') => void;
  refreshStyleControlValues: (group: 'background') => void;
  applyAndScheduleStyleUpdate: () => void;
  clampStyleNumber: (value: number, min: number, max: number, step: number) => number;
}

export class SettingsStyleBackgroundSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
  private readonly addNumericStyleControl: (containerEl: HTMLElement, config: BackgroundNumericStyleControlConfig) => void;
  private readonly clearStyleControlBindings: (group: 'background') => void;
  private readonly refreshStyleControlValues: (group: 'background') => void;
  private readonly applyAndScheduleStyleUpdate: () => void;
  private readonly clampStyleNumber: (value: number, min: number, max: number, step: number) => number;
  private hostEl: HTMLElement | null = null;
  private previewRequestId = 0;

  constructor(options: SettingsStyleBackgroundSectionOptions) {
    this.plugin = options.plugin;
    this.createStyleGroupSection = options.createStyleGroupSection;
    this.addNumericStyleControl = options.addNumericStyleControl;
    this.clearStyleControlBindings = options.clearStyleControlBindings;
    this.refreshStyleControlValues = options.refreshStyleControlValues;
    this.applyAndScheduleStyleUpdate = options.applyAndScheduleStyleUpdate;
    this.clampStyleNumber = options.clampStyleNumber;
  }

  attach(containerEl: HTMLElement): void {
    this.hostEl = containerEl.createDiv({ cls: 'opencodian-style-background-group-host' });
    this.refresh();
  }

  refresh(): void {
    const hostEl = this.hostEl;
    if (!hostEl) {
      return;
    }

    this.clearStyleControlBindings('background');
    hostEl.empty();

    const backgroundGroupEl = this.createStyleGroupSection(
      hostEl,
      t('settings.style.groups.background.title'),
      t('settings.style.groups.background.desc'),
    );

    this.renderBackgroundCard(backgroundGroupEl);
    this.renderFitModeSetting(backgroundGroupEl);
    this.renderNumericControls(backgroundGroupEl);
    this.renderResetSetting(backgroundGroupEl);
  }

  dispose(): void {
    this.previewRequestId += 1;
    this.hostEl = null;
  }

  async reset(): Promise<void> {
    try {
      await this.plugin.resetChatAppearanceGroupAndSave('background');
      this.refreshStyleControlValues('background');
      this.refresh();
      new Notice(t('settings.style.groupReset.success'));
    } catch (error) {
      logger.warn('Failed to reset background style group', error);
      new Notice(t('settings.style.groupReset.failed'));
    }
  }

  private renderBackgroundCard(backgroundGroupEl: HTMLElement): void {
    const backgroundSettings = this.plugin.settings.chatAppearance.background;
    const hasBackgroundImage = Boolean(backgroundSettings.imagePath);

    const cardEl = backgroundGroupEl.createDiv({ cls: 'opencodian-theme-background-card' });
    const previewEl = cardEl.createDiv({
      cls: `opencodian-theme-background-preview ${hasBackgroundImage ? 'is-loading' : 'is-empty'}`,
    });
    previewEl.createDiv({
      cls: 'opencodian-theme-background-preview-placeholder',
      text: hasBackgroundImage
        ? t('settings.style.background.preview.loading')
        : t('settings.style.background.preview.empty'),
    });

    const metaEl = cardEl.createDiv({ cls: 'opencodian-theme-background-meta' });
    metaEl.createDiv({
      cls: 'opencodian-theme-background-label',
      text: t('settings.style.background.card.title'),
    });
    metaEl.createDiv({
      cls: 'opencodian-theme-background-copy',
      text: hasBackgroundImage
        ? t('settings.style.background.card.descLoaded', {
          name: this.getBackgroundDisplayName() || t('settings.style.background.card.defaultName'),
        })
        : t('settings.style.background.card.descEmpty'),
    });
    const detailEl = metaEl.createDiv({
      cls: 'opencodian-theme-background-note',
      text: t('settings.style.background.card.scope'),
    });

    const actionsEl = metaEl.createDiv({ cls: 'opencodian-theme-background-actions' });
    this.renderFileSelectionControls(actionsEl, hasBackgroundImage);

    if (hasBackgroundImage) {
      const requestId = ++this.previewRequestId;
      void this.populatePreview(previewEl, detailEl, requestId);
      return;
    }

    this.previewRequestId += 1;
  }

  private renderFileSelectionControls(actionsEl: HTMLElement, hasBackgroundImage: boolean): void {
    const fileInputEl = document.createElement('input');
    fileInputEl.type = 'file';
    fileInputEl.accept = '.svg,.png,.jpg,.jpeg,.webp,.gif,image/*';
    fileInputEl.style.display = 'none';
    fileInputEl.addEventListener('change', () => {
      const selectedFile = fileInputEl.files?.[0];
      if (!selectedFile) {
        return;
      }

      fileInputEl.value = '';
      void this.handleThemeBackgroundFileSelected(selectedFile);
    });
    actionsEl.appendChild(fileInputEl);

    const uploadBtn = actionsEl.createEl('button', {
      cls: 'mod-cta',
      text: hasBackgroundImage
        ? t('settings.style.background.actions.replace')
        : t('settings.style.background.actions.upload'),
    });
    uploadBtn.type = 'button';
    uploadBtn.addEventListener('click', () => {
      fileInputEl.click();
    });

    const clearBtn = actionsEl.createEl('button', {
      text: t('settings.style.background.actions.remove'),
    });
    clearBtn.type = 'button';
    clearBtn.disabled = !hasBackgroundImage;
    clearBtn.addEventListener('click', () => {
      void this.clearThemeBackgroundSelection();
    });
  }

  private renderFitModeSetting(backgroundGroupEl: HTMLElement): void {
    new Setting(backgroundGroupEl)
      .setName(t('settings.style.background.fitMode.name'))
      .setDesc(t('settings.style.background.fitMode.desc'))
      .setClass('opencodian-style-setting')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('cover', t('settings.style.background.fitMode.option.cover'))
          .addOption('contain', t('settings.style.background.fitMode.option.contain'))
          .addOption('fit-width', t('settings.style.background.fitMode.option.fitWidth'))
          .addOption('fit-height', t('settings.style.background.fitMode.option.fitHeight'))
          .setValue(this.plugin.settings.chatAppearance.background.fitMode)
          .onChange((value) => {
            this.plugin.updateChatAppearance((appearance) => {
              appearance.background.fitMode = value as ChatAppearanceBackgroundFitMode;
            });
            this.applyAndScheduleStyleUpdate();
            this.refresh();
          });
      });
  }

  private renderNumericControls(backgroundGroupEl: HTMLElement): void {
    const defaults = this.plugin.getChatAppearanceBaseline().background;

    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.opacity.name'),
      desc: t('settings.style.background.opacity.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.opacity,
      resetValue: () => defaults.opacity,
      setValue: (appearance, value) => {
        appearance.background.opacity = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.blur.name'),
      desc: t('settings.style.background.blur.desc'),
      min: 0,
      max: 48,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.background.blur,
      resetValue: () => defaults.blur,
      setValue: (appearance, value) => {
        appearance.background.blur = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.depth.name'),
      desc: t('settings.style.background.depth.desc'),
      min: 0,
      max: 36,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.depth,
      resetValue: () => defaults.depth,
      setValue: (appearance, value) => {
        appearance.background.depth = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.dim.name'),
      desc: t('settings.style.background.dim.desc'),
      min: 0,
      max: 88,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.dim,
      resetValue: () => defaults.dim,
      setValue: (appearance, value) => {
        appearance.background.dim = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.edgeFade.name'),
      desc: t('settings.style.background.edgeFade.desc'),
      min: 0,
      max: 80,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.background.edgeFade,
      resetValue: () => defaults.edgeFade,
      setValue: (appearance, value) => {
        appearance.background.edgeFade = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.saturation.name'),
      desc: t('settings.style.background.saturation.desc'),
      min: 50,
      max: 200,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.saturation,
      resetValue: () => defaults.saturation,
      setValue: (appearance, value) => {
        appearance.background.saturation = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.brightness.name'),
      desc: t('settings.style.background.brightness.desc'),
      min: 40,
      max: 140,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.brightness,
      resetValue: () => defaults.brightness,
      setValue: (appearance, value) => {
        appearance.background.brightness = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.focusX.name'),
      desc: t('settings.style.background.focusX.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.focusX,
      resetValue: () => defaults.focusX,
      setValue: (appearance, value) => {
        appearance.background.focusX = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.focusY.name'),
      desc: t('settings.style.background.focusY.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.focusY,
      resetValue: () => defaults.focusY,
      setValue: (appearance, value) => {
        appearance.background.focusY = value;
      },
    });
  }

  private renderResetSetting(backgroundGroupEl: HTMLElement): void {
    new Setting(backgroundGroupEl)
      .setName(t('settings.style.groupReset.name'))
      .setDesc(t('settings.style.groupReset.desc'))
      .setClass('opencodian-style-reset-setting')
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.style.groupReset.button'))
          .onClick(() => {
            void this.reset();
          });
      });
  }

  private updatePreviewPresentation(
    previewEl: HTMLElement,
    imageEl: HTMLElement,
    overlayEl: HTMLElement,
  ): void {
    const backgroundSettings = this.plugin.settings.chatAppearance.background;
    previewEl.style.setProperty('--opencodian-theme-background-preview-edge-fade', `${backgroundSettings.edgeFade}px`);
    imageEl.style.opacity = String(backgroundSettings.opacity / 100);
    imageEl.style.backgroundSize = getChatAppearanceBackgroundSizeValue(backgroundSettings.fitMode);
    imageEl.style.backgroundPosition = `${backgroundSettings.focusX}% ${backgroundSettings.focusY}%`;
    imageEl.style.transform = `scale(${(100 + backgroundSettings.depth) / 100})`;
    imageEl.style.filter = `blur(${backgroundSettings.blur}px) saturate(${backgroundSettings.saturation}%) brightness(${backgroundSettings.brightness}%)`;
    overlayEl.style.opacity = String(Math.min(0.88, backgroundSettings.dim / 100));
  }

  private bindPreviewFocusDrag(
    previewEl: HTMLElement,
    applyPreviewPresentation: () => void,
  ): void {
    let activePointerId: number | null = null;

    const updateFocusFromPointer = (clientX: number, clientY: number) => {
      const rect = previewEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const nextFocusX = this.clampStyleNumber(((clientX - rect.left) / rect.width) * 100, 0, 100, 1);
      const nextFocusY = this.clampStyleNumber(((clientY - rect.top) / rect.height) * 100, 0, 100, 1);

      this.plugin.updateChatAppearance((appearance) => {
        appearance.background.focusX = nextFocusX;
        appearance.background.focusY = nextFocusY;
      });
      applyPreviewPresentation();
      this.refreshStyleControlValues('background');
      this.applyAndScheduleStyleUpdate();
    };

    previewEl.addClass('is-draggable');
    previewEl.setAttribute('title', t('settings.style.background.preview.dragHint'));
    previewEl.style.touchAction = 'none';

    previewEl.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }

      activePointerId = event.pointerId;
      previewEl.addClass('is-dragging');
      previewEl.setPointerCapture(event.pointerId);
      updateFocusFromPointer(event.clientX, event.clientY);
      event.preventDefault();
    });

    previewEl.addEventListener('pointermove', (event) => {
      if (activePointerId !== event.pointerId) {
        return;
      }

      updateFocusFromPointer(event.clientX, event.clientY);
    });

    const releasePointer = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) {
        return;
      }

      activePointerId = null;
      previewEl.removeClass('is-dragging');
      if (previewEl.hasPointerCapture(event.pointerId)) {
        previewEl.releasePointerCapture(event.pointerId);
      }
    };

    previewEl.addEventListener('pointerup', releasePointer);
    previewEl.addEventListener('pointercancel', releasePointer);
  }

  private async populatePreview(
    previewEl: HTMLElement,
    detailEl: HTMLElement,
    requestId: number,
  ): Promise<void> {
    const displayName = this.getBackgroundDisplayName() || t('settings.style.background.card.defaultName');
    const dataUrl = await this.plugin.resolveChatThemeBackgroundDataUrl();

    if (requestId !== this.previewRequestId || !previewEl.isConnected) {
      return;
    }

    previewEl.empty();
    previewEl.removeClass('is-loading');
    if (!dataUrl) {
      previewEl.addClass('is-empty');
      previewEl.createDiv({
        cls: 'opencodian-theme-background-preview-placeholder',
        text: t('settings.style.background.preview.missing'),
      });
      detailEl.setText(t('settings.style.background.card.descMissing'));
      return;
    }

    previewEl.removeClass('is-empty');
    const imageEl = previewEl.createDiv({ cls: 'opencodian-theme-background-preview-image' });
    imageEl.setAttribute('aria-label', displayName);
    imageEl.style.backgroundImage = `url(${JSON.stringify(dataUrl)})`;
    const overlayEl = previewEl.createDiv({ cls: 'opencodian-theme-background-preview-overlay' });
    const applyPreviewPresentation = () => {
      this.updatePreviewPresentation(previewEl, imageEl, overlayEl);
    };
    applyPreviewPresentation();
    this.bindPreviewFocusDrag(previewEl, applyPreviewPresentation);
    detailEl.setText(
      `${t('settings.style.background.card.scopeWithName', { name: displayName })} ${t('settings.style.background.preview.dragHint')}`,
    );
  }

  private async handleThemeBackgroundFileSelected(file: File): Promise<void> {
    try {
      await this.plugin.importChatThemeBackgroundFile(file);
      this.refresh();
      new Notice(t('settings.style.background.upload.success', { name: file.name }));
    } catch (error) {
      logger.warn('Failed to import theme background image', error);
      new Notice(
        error instanceof Error
          ? error.message
          : t('settings.style.background.upload.failed'),
      );
    }
  }

  private async clearThemeBackgroundSelection(): Promise<void> {
    try {
      await this.plugin.clearChatThemeBackground();
      this.refresh();
      new Notice(t('settings.style.background.remove.success'));
    } catch (error) {
      logger.warn('Failed to clear theme background image', error);
      new Notice(t('settings.style.background.remove.failed'));
    }
  }

  private getBackgroundDisplayName(): string {
    const backgroundSettings = this.plugin.settings.chatAppearance.background;
    return backgroundSettings.imageDisplayName
      || (backgroundSettings.imagePath ? path.basename(backgroundSettings.imagePath) : '');
  }
}

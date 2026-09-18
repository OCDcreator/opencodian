/**
 * SettingsImageGenerationSection — CRUD surface for the R-C2 text-to-image
 * settings: the configured model list (`imageGenerationModels`), the default
 * embed width (`imageGenerationMaxWidth`), and the orphan-asset cleanup
 * policy (`imageGenerationAssetCleanup`).
 *
 * Editing follows the context-group CRUD contract
 * (SettingsContextGroupsSection): rows persist as they are, and load-time
 * normalization prunes malformed entries on the next restart. The API key
 * input uses the password field pattern so the credential is never displayed
 * in plain text; it is stored through the same settings path and diagnostic
 * redaction contract as every other key.
 */

import { Setting } from 'obsidian';

import type { ImageGenerationModelConfig, OpenCodianSettings } from '../../core/types';
import { IMAGE_GENERATION_API_FORMATS } from '../../core/types';
import { t } from '../../i18n';

/**
 * The plugin surface this section needs (structural: importing the plugin
 * class would create a feature -> app dependency edge).
 */
interface ImageGenerationSettingsHost {
  settings: OpenCodianSettings;
  saveSettings(): Promise<unknown>;
}

interface SettingsImageGenerationSectionOptions {
  plugin: ImageGenerationSettingsHost;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
}

/** A field-writable clone of the persisted model entry. */
type WritableModelConfig = {
  -readonly [K in keyof ImageGenerationModelConfig]: ImageGenerationModelConfig[K];
};

export class SettingsImageGenerationSection {
  private readonly plugin: ImageGenerationSettingsHost;
  private readonly createSectionHeading: SettingsImageGenerationSectionOptions['createSectionHeading'];
  private modelListEl: HTMLElement | null = null;

  constructor(options: SettingsImageGenerationSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  dispose(): void { /* No subscriptions to release. */ }

  /**
   * Tabbed-layout mount (same secondary-tab visibility contract as the
   * context-groups section).
   */
  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    const blockEl = containerEl.createDiv({ attr: { 'data-section-block': 'image-generation' } });
    blockEl.style.display = secondaryTabId === 'image-generation' ? '' : 'none';
    this.attach(blockEl);
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.imageGeneration.title'),
      t('settings.imageGeneration.desc'),
    );

    new Setting(containerEl)
      .setName(t('settings.imageGeneration.add'))
      .setDesc(t('settings.imageGeneration.addDesc'))
      .addButton((button) => button
        .setButtonText(t('settings.imageGeneration.add'))
        .onClick(async () => {
          this.plugin.settings.imageGenerationModels = [
            ...this.plugin.settings.imageGenerationModels,
            {
              id: this.createModelId(),
              displayName: '',
              apiFormat: 'openai-images',
              baseURL: '',
              apiKey: '',
              model: '',
              size: '',
            },
          ];
          await this.plugin.saveSettings();
          this.renderModelRows();
        }));

    new Setting(containerEl)
      .setName(t('settings.imageGeneration.maxWidth.name'))
      .setDesc(t('settings.imageGeneration.maxWidth.desc'))
      .addText((text) => text
        .setValue(String(this.plugin.settings.imageGenerationMaxWidth))
        .onChange(async (value) => {
          const parsed = Number(value);
          this.plugin.settings.imageGenerationMaxWidth = Number.isFinite(parsed) ? parsed : 0;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('settings.imageGeneration.cleanup.name'))
      .setDesc(t('settings.imageGeneration.cleanup.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('trash', t('settings.imageGeneration.cleanup.trash'));
        dropdown.addOption('keep', t('settings.imageGeneration.cleanup.keep'));
        dropdown
          .setValue(this.plugin.settings.imageGenerationAssetCleanup)
          .onChange(async (value) => {
            this.plugin.settings.imageGenerationAssetCleanup = value === 'keep' ? 'keep' : 'trash';
            await this.plugin.saveSettings();
          });
      });

    this.modelListEl = containerEl.createDiv({ cls: 'opencodian-imagegen-models' });
    this.renderModelRows();

    return headingEl;
  }

  /** Rebuild the model rows from settings (called after add/remove). */
  private renderModelRows(): void {
    const listEl = this.modelListEl;
    if (!listEl) return;
    listEl.empty();
    const models = this.plugin.settings.imageGenerationModels;
    if (models.length === 0) {
      listEl.createDiv({
        cls: 'opencodian-imagegen-models-empty setting-item-description',
        text: t('settings.imageGeneration.empty'),
      });
      return;
    }
    models.forEach((model, index) => {
      this.addModelRow(listEl, model, index);
    });
  }

  private addModelRow(listEl: HTMLElement, model: ImageGenerationModelConfig, index: number): void {
    // Keep `apiFormat` honest: phase 1 ships exactly one format and the UI
    // surfaces it read-only instead of pretending there is a choice.
    const formatLabel = IMAGE_GENERATION_API_FORMATS.includes(model.apiFormat)
      ? model.apiFormat
      : 'openai-images';
    const setting = new Setting(listEl)
      .setName(t('settings.imageGeneration.row.name', { index: index + 1 }))
      .setDesc(t('settings.imageGeneration.row.desc', { format: formatLabel }));

    setting.addText((text) => text
      .setPlaceholder(t('settings.imageGeneration.row.displayName'))
      .setValue(model.displayName)
      .onChange(async (value) => {
        this.mutateModel(model.id, (entry) => (entry.displayName = value));
        await this.plugin.saveSettings();
      }));
    setting.addText((text) => text
      .setPlaceholder(t('settings.imageGeneration.row.baseURL'))
      .setValue(model.baseURL)
      .onChange(async (value) => {
        this.mutateModel(model.id, (entry) => (entry.baseURL = value.trim().replace(/\/+$/, '')));
        await this.plugin.saveSettings();
      }));
    setting.addText((text) => text
      .setPlaceholder(t('settings.imageGeneration.row.model'))
      .setValue(model.model)
      .onChange(async (value) => {
        this.mutateModel(model.id, (entry) => (entry.model = value.trim()));
        await this.plugin.saveSettings();
      }));
    setting.addText((text) => {
      text.inputEl.type = 'password';
      text.setPlaceholder(t('settings.imageGeneration.row.apiKey'))
        .setValue(model.apiKey)
        .onChange(async (value) => {
          this.mutateModel(model.id, (entry) => (entry.apiKey = value));
          await this.plugin.saveSettings();
        });
    });
    setting.addText((text) => text
      .setPlaceholder(t('settings.imageGeneration.row.size'))
      .setValue(model.size)
      .onChange(async (value) => {
        this.mutateModel(model.id, (entry) => (entry.size = value.trim()));
        await this.plugin.saveSettings();
      }));
    setting.addExtraButton((button) => button
      .setIcon('trash-2')
      .setTooltip(t('settings.imageGeneration.row.delete'))
      .onClick(async () => {
        this.plugin.settings.imageGenerationModels =
          this.plugin.settings.imageGenerationModels.filter((entry) => entry.id !== model.id);
        await this.plugin.saveSettings();
        this.renderModelRows();
      }));
  }

  private mutateModel(id: string, mutate: (entry: WritableModelConfig) => void): void {
    this.plugin.settings.imageGenerationModels = this.plugin.settings.imageGenerationModels
      .map((entry) => {
        if (entry.id !== id) return entry;
        const next: WritableModelConfig = { ...entry };
        mutate(next);
        return next;
      });
  }

  private createModelId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `imagegen-${crypto.randomUUID()}`
      : `imagegen-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

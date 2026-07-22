import { App, Modal, Notice } from 'obsidian';

import type { ModelPricingOverride, ModelPricingRates } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

type PriceField = keyof ModelPricingRates;

const PRICE_FIELDS: Array<{ key: PriceField; labelKey: 'settings.cost.field.input' | 'settings.cost.field.output' | 'settings.cost.field.cacheRead' | 'settings.cost.field.cacheWrite' }> = [
  { key: 'inputPerMillion', labelKey: 'settings.cost.field.input' },
  { key: 'outputPerMillion', labelKey: 'settings.cost.field.output' },
  { key: 'cacheReadPerMillion', labelKey: 'settings.cost.field.cacheRead' },
  { key: 'cacheWritePerMillion', labelKey: 'settings.cost.field.cacheWrite' },
];

function formatTimestamp(value: number | null): string {
  return value === null
    ? t('settings.cost.catalog.neverRefreshed')
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

function formatRate(value: number | null): string {
  return value === null ? '—' : `$${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
}

function parseRate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** One shared editor for the manually refreshed models.dev catalogue and local price overrides. */
export class ModelPricingModal extends Modal {
  private editingOverride: ModelPricingOverride | null = null;
  private providerInputEl: HTMLInputElement | null = null;
  private endpointInputEl: HTMLInputElement | null = null;
  private modelInputEl: HTMLInputElement | null = null;
  private sourceHintEl: HTMLElement | null = null;
  private readonly rateInputs = new Map<PriceField, HTMLInputElement>();

  constructor(app: App, private readonly plugin: OpenCodianPlugin) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('opencodian-model-pricing-modal');
    this.render();
  }

  onClose(): void {
    this.rateInputs.clear();
    this.providerInputEl = null;
    this.endpointInputEl = null;
    this.modelInputEl = null;
    this.sourceHintEl = null;
    this.contentEl.empty();
    this.modalEl.removeClass('opencodian-model-pricing-modal');
  }

  private render(): void {
    this.contentEl.empty();
    const service = this.plugin.modelPricingService;
    this.contentEl.createEl('h2', { text: t('settings.cost.modal.title') });
    this.contentEl.createEl('p', {
      cls: 'opencodian-model-pricing-intro',
      text: t('settings.cost.modal.desc'),
    });

    if (!service) {
      this.contentEl.createDiv({
        cls: 'opencodian-model-pricing-empty',
        text: t('settings.cost.catalog.unavailable'),
      });
      return;
    }

    this.renderCatalogStatus(service.getStatus());
    this.renderOverrideEditor();
    this.renderOverrides();
  }

  private renderCatalogStatus(status: { fetchedAt: number | null; entryCount: number }): void {
    const sectionEl = this.contentEl.createDiv({ cls: 'opencodian-model-pricing-section' });
    const headerEl = sectionEl.createDiv({ cls: 'opencodian-model-pricing-section-header' });
    headerEl.createEl('h3', { text: t('settings.cost.catalog.title') });
    const refreshButtonEl = headerEl.createEl('button', {
      cls: 'mod-cta opencodian-model-pricing-refresh',
      text: t('settings.cost.catalog.refresh'),
    });
    refreshButtonEl.type = 'button';
    refreshButtonEl.addEventListener('click', () => {
      void this.refreshCatalog(refreshButtonEl);
    });

    const statusEl = sectionEl.createDiv({ cls: 'opencodian-model-pricing-status' });
    statusEl.createDiv({
      text: t('settings.cost.catalog.source', { source: 'models.dev' }),
    });
    statusEl.createDiv({
      text: t('settings.cost.catalog.refreshedAt', { timestamp: formatTimestamp(status.fetchedAt) }),
    });
    statusEl.createDiv({
      text: t('settings.cost.catalog.entryCount', { count: String(status.entryCount) }),
    });
  }

  private renderOverrideEditor(): void {
    const sectionEl = this.contentEl.createDiv({ cls: 'opencodian-model-pricing-section' });
    sectionEl.createEl('h3', {
      text: this.editingOverride ? t('settings.cost.override.editTitle') : t('settings.cost.override.addTitle'),
    });
    sectionEl.createEl('p', {
      cls: 'opencodian-model-pricing-section-desc',
      text: t('settings.cost.override.desc'),
    });

    const formEl = sectionEl.createDiv({ cls: 'opencodian-model-pricing-form' });
    const providerFieldEl = this.renderTextField(
      formEl,
      t('settings.cost.override.provider'),
      this.editingOverride?.providerId ?? '',
      'openai',
    );
    this.providerInputEl = providerFieldEl;
    const endpointFieldEl = this.renderTextField(
      formEl,
      t('settings.cost.override.endpoint'),
      this.editingOverride?.endpoint ?? '',
      'https://api.example.com/v1',
    );
    this.endpointInputEl = endpointFieldEl;
    const modelFieldEl = this.renderTextField(
      formEl,
      t('settings.cost.override.model'),
      this.editingOverride?.modelId ?? '',
      'gpt-5',
    );
    this.modelInputEl = modelFieldEl;
    providerFieldEl.addEventListener('input', () => this.refreshSourceHint());
    endpointFieldEl.addEventListener('input', () => this.refreshSourceHint());
    modelFieldEl.addEventListener('input', () => this.refreshSourceHint());

    for (const field of PRICE_FIELDS) {
      const inputEl = this.renderRateField(
        formEl,
        t(field.labelKey),
        this.editingOverride?.[field.key] ?? null,
      );
      this.rateInputs.set(field.key, inputEl);
    }

    this.sourceHintEl = sectionEl.createDiv({ cls: 'opencodian-model-pricing-source-hint' });
    this.refreshSourceHint();

    const actionsEl = sectionEl.createDiv({ cls: 'opencodian-model-pricing-form-actions' });
    const saveButtonEl = actionsEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.cost.override.save'),
    });
    saveButtonEl.type = 'button';
    saveButtonEl.addEventListener('click', () => {
      void this.saveOverride();
    });

    if (this.editingOverride) {
      const cancelButtonEl = actionsEl.createEl('button', { text: t('settings.cost.override.cancelEdit') });
      cancelButtonEl.type = 'button';
      cancelButtonEl.addEventListener('click', () => {
        this.editingOverride = null;
        this.render();
      });
    }
  }

  private renderOverrides(): void {
    const sectionEl = this.contentEl.createDiv({ cls: 'opencodian-model-pricing-section' });
    sectionEl.createEl('h3', { text: t('settings.cost.override.savedTitle') });
    const overrides = this.plugin.settings.modelPricingOverrides;
    if (overrides.length === 0) {
      sectionEl.createDiv({
        cls: 'opencodian-model-pricing-empty',
        text: t('settings.cost.override.none'),
      });
      return;
    }

    const listEl = sectionEl.createDiv({ cls: 'opencodian-model-pricing-override-list' });
    for (const override of overrides) {
      const rowEl = listEl.createDiv({ cls: 'opencodian-model-pricing-override-row' });
      const identityEl = rowEl.createDiv({ cls: 'opencodian-model-pricing-override-identity' });
      identityEl.createDiv({
        cls: 'opencodian-model-pricing-override-model',
        text: override.endpoint
          ? `${override.providerId}/${override.modelId} @ ${override.endpoint}`
          : `${override.providerId}/${override.modelId}`,
      });
      identityEl.createDiv({
        cls: 'opencodian-model-pricing-override-rates',
        text: PRICE_FIELDS.map((field) => `${t(field.labelKey)} ${formatRate(override[field.key])}`).join(' · '),
      });

      const actionsEl = rowEl.createDiv({ cls: 'opencodian-model-pricing-override-actions' });
      const editButtonEl = actionsEl.createEl('button', { text: t('settings.cost.override.edit') });
      editButtonEl.type = 'button';
      editButtonEl.addEventListener('click', () => {
        this.editingOverride = override;
        this.render();
      });
      const removeButtonEl = actionsEl.createEl('button', {
        cls: 'mod-warning',
        text: t('settings.cost.override.remove'),
      });
      removeButtonEl.type = 'button';
      removeButtonEl.addEventListener('click', () => {
        void this.removeOverride(override);
      });
    }
  }

  private renderTextField(
    containerEl: HTMLElement,
    label: string,
    value: string,
    placeholder: string,
  ): HTMLInputElement {
    const fieldEl = containerEl.createDiv({ cls: 'opencodian-model-pricing-field' });
    fieldEl.createEl('label', { text: label });
    return fieldEl.createEl('input', {
      attr: { type: 'text', placeholder },
      value,
    });
  }

  private renderRateField(
    containerEl: HTMLElement,
    label: string,
    value: number | null,
  ): HTMLInputElement {
    const fieldEl = containerEl.createDiv({ cls: 'opencodian-model-pricing-field' });
    fieldEl.createEl('label', { text: label });
    return fieldEl.createEl('input', {
      attr: {
        type: 'number',
        min: '0',
        step: '0.000001',
        placeholder: t('settings.cost.override.useCatalog'),
      },
      value: value === null ? '' : String(value),
    });
  }

  private refreshSourceHint(): void {
    const service = this.plugin.modelPricingService;
    if (!service || !this.sourceHintEl) {
      return;
    }
    const providerId = this.providerInputEl?.value.trim() ?? '';
    const endpoint = this.endpointInputEl?.value.trim() ?? '';
    const modelId = this.modelInputEl?.value.trim() ?? '';
    const catalogEntry = service.getCatalogEntry(providerId, modelId);
    this.sourceHintEl.setText(catalogEntry
      ? t('settings.cost.override.catalogMatch', {
          provider: catalogEntry.providerName,
          model: catalogEntry.modelName,
        })
      : endpoint
        ? t('settings.cost.override.catalogNoMatchEndpoint')
        : t('settings.cost.override.catalogNoMatch'));
  }

  private async refreshCatalog(buttonEl: HTMLButtonElement): Promise<void> {
    const service = this.plugin.modelPricingService;
    if (!service) {
      return;
    }
    buttonEl.disabled = true;
    buttonEl.setText(t('settings.cost.catalog.refreshing'));
    try {
      await service.refresh();
      this.editingOverride = null;
      this.render();
    } catch {
      new Notice(t('settings.cost.catalog.refreshFailed'));
      buttonEl.disabled = false;
      buttonEl.setText(t('settings.cost.catalog.refresh'));
    }
  }

  private async saveOverride(): Promise<void> {
    const service = this.plugin.modelPricingService;
    if (!service) {
      return;
    }
    try {
      this.plugin.settings.modelPricingOverrides = service.upsertOverride(
        this.plugin.settings.modelPricingOverrides,
        {
          providerId: this.providerInputEl?.value ?? '',
          endpoint: this.endpointInputEl?.value ?? '',
          modelId: this.modelInputEl?.value ?? '',
          inputPerMillion: parseRate(this.rateInputs.get('inputPerMillion')?.value ?? ''),
          outputPerMillion: parseRate(this.rateInputs.get('outputPerMillion')?.value ?? ''),
          cacheReadPerMillion: parseRate(this.rateInputs.get('cacheReadPerMillion')?.value ?? ''),
          cacheWritePerMillion: parseRate(this.rateInputs.get('cacheWritePerMillion')?.value ?? ''),
        },
      );
      await this.plugin.saveSettings();
      this.editingOverride = null;
      this.render();
    } catch {
      new Notice(t('settings.cost.override.invalid'));
    }
  }

  private async removeOverride(override: ModelPricingOverride): Promise<void> {
    const service = this.plugin.modelPricingService;
    if (!service) {
      return;
    }
    this.plugin.settings.modelPricingOverrides = service.removeOverride(
      this.plugin.settings.modelPricingOverrides,
      override.providerId,
      override.modelId,
      override.endpoint,
    );
    await this.plugin.saveSettings();
    if (
      this.editingOverride?.providerId === override.providerId
      && this.editingOverride.endpoint === override.endpoint
      && this.editingOverride.modelId === override.modelId
    ) {
      this.editingOverride = null;
    }
    this.render();
  }
}

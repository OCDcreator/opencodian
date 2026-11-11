/** Chat defaults and searchable native model choices. Owns only presentation;
 * the adapter remains the catalog/default application authority. Permission
 * mode lives on the separate permissions tab (SettingsZCodeSection). */
import { Setting } from 'obsidian';

import type { ZCodeModelCatalog, ZCodeWorkspaceCatalogOptions } from '../../../../core/agents/backend/zcode/ZCodeModelCatalog';
import { normalizeZCodeBackendSettings, type ZCodeBackendSettings } from '../../../../core/types/settings';
import { t } from '../../../../i18n';
import { describeBackendSetting } from '../../controls/BackendSettingsControls';

export interface ZCodeSettingsModelCatalog {
  models: ZCodeModelCatalog['models'];
  defaultModel: { provider: string; model: string } | null;
  thoughtLevels?: ZCodeModelCatalog['thoughtLevels'];
  thoughtLevelEnabled?: boolean | null;
}
export interface ZCodeModelSettingsHost {
  settings: {
    backendSettings: { zcode?: ZCodeBackendSettings };
    inlineCompletionEnabled?: boolean;
    inlineCompletionModelOverrides?: Partial<Record<string, string>>;
  };
  saveSettings(): Promise<unknown>;
}
interface ModelControlsOptions {
  getCatalog(options?: ZCodeWorkspaceCatalogOptions): Promise<ZCodeSettingsModelCatalog>;
  onCatalogUnavailable(): void;
  openCompletionSettings(): void;
}

export class SettingsZCodeModelControls {
  private catalog: ZCodeSettingsModelCatalog | null = null;
  private epoch = 0;
  private root!: HTMLElement;
  private choices!: HTMLElement;
  private status!: HTMLElement;

  constructor(private readonly host: ZCodeModelSettingsHost, private readonly options: ModelControlsOptions) {}

  attach(container: HTMLElement): void {
    this.root = container.createDiv({ cls: 'opencodian-zcode-group', attr: { 'data-zcode-group': 'chat-defaults', 'data-zcode-catalog-state': 'loading' } });
    this.root.createEl('h3', { text: t('settings.zcode.ui.chat') });
    this.root.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.chatHelp') });
    this.status = this.root.createDiv({ cls: 'opencodian-zcode-feedback', attr: { role: 'status' } });
    const toolbar = this.root.createDiv({ cls: 'opencodian-zcode-actions' });
    const retry = toolbar.createEl('button', { text: t('settings.zcode.ui.retry'), attr: { type: 'button' } });
    retry.addEventListener('click', () => { void this.refresh(true); });
    this.choices = this.root.createDiv({ cls: 'opencodian-settings-form-stack' });
    this.renderChoices();
    void this.refresh();
  }

  /** Terminal catalog states only; 'ready' also covers an honestly empty catalog. */
  private setCatalogState(state: 'loading' | 'ready' | 'failed'): void {
    if (this.root?.isConnected) this.root.dataset.zcodeCatalogState = state;
  }

  private get catalogPending(): boolean {
    return !this.catalog && this.root?.dataset.zcodeCatalogState !== 'failed';
  }

  async refresh(forceRefresh = false): Promise<void> {
    const epoch = ++this.epoch;
    this.setCatalogState('loading');
    this.status.setText(t('settings.zcode.ui.loading'));
    this.status.removeClass('is-error');
    try {
      const catalog = await this.options.getCatalog({ forceRefresh });
      if (epoch !== this.epoch || !this.root.isConnected) return;
      this.catalog = catalog;
      this.setCatalogState('ready');
      this.status.setText(catalog.models.length ? '' : t('settings.zcode.ui.noModels'));
      this.renderChoices();
      if (!catalog.models.length) this.options.onCatalogUnavailable();
      else await this.refreshThinking();
    } catch {
      if (epoch !== this.epoch || !this.root.isConnected) return;
      this.setCatalogState('failed');
      this.status.setText(t('settings.zcode.ui.catalogFailed'));
      this.status.addClass('is-error');
      this.options.onCatalogUnavailable();
    }
  }

  private renderChoices(): void {
    this.choices.empty();
    this.modelRow(this.choices, false);
    const thinking = this.choices.createDiv({ cls: 'opencodian-zcode-thinking' });
    this.renderThinking(thinking, this.catalog);
    const completion = this.choices.createDiv({ cls: 'opencodian-zcode-group', attr: { 'data-zcode-group': 'completion' } });
    completion.createEl('h4', { text: t('settings.zcode.ui.completion') });
    completion.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.completionHelp') });
    this.modelRow(completion, true);
    const footer = completion.createDiv({ cls: 'opencodian-zcode-completion-status' });
    footer.createEl('p', { cls: 'setting-item-description', text: t(this.host.settings.inlineCompletionEnabled ? 'settings.zcode.ui.completionOn' : 'settings.zcode.ui.completionOff') });
    const link = footer.createEl('button', { text: t('settings.zcode.ui.completionSettings'), attr: { type: 'button' } });
    link.addEventListener('click', () => this.options.openCompletionSettings());
  }

  private modelRow(container: HTMLElement, completion: boolean): void {
    const title = t(completion ? 'settings.zcode.ui.completionModel' : 'settings.zcode.ui.model');
    const inherit = t(completion ? 'settings.zcode.ui.followChat' : 'settings.zcode.ui.inherit');
    const value = completion ? this.host.settings.inlineCompletionModelOverrides?.zcode ?? ''
      : normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode).model;
    const entry = this.catalog?.models.find((model) => `${model.providerId}/${model.modelId}` === value);
    // While the catalog is pending (or failed) the saved value is NOT judged
    // unknown: only an authoritative ready catalog can make that claim.
    const pending = this.catalogPending;
    const sourceLabel = this.catalog?.models.length ? t('settings.zcode.ui.catalogSource') : undefined;
    const row = new Setting(container).setName(title).setDesc(pending ? t('settings.zcode.ui.loading')
      : value ? (entry ? `${entry.providerLabel} · ${value}` : t('settings.zcode.ui.savedUnknown', { value })) : inherit);
    describeBackendSetting(row, {
      key: completion ? 'zcode-completion-model' : 'zcode-default-model',
      scope: 'vault',
      effect: 'new-session',
      risk: 'low',
      defaultLabel: inherit,
      ...(sourceLabel ? { source: sourceLabel } : {}),
    });
    row.settingEl.dataset.zcodeField = completion ? 'completion-model' : 'model';
    let picker: HTMLElement | null = null;
    let resetControl: { setDisabled(value: boolean): unknown } | undefined;
    row.addButton((button) => {
      button.setButtonText(entry?.label ?? (value || t('settings.zcode.ui.choose'))).setDisabled(!this.catalog?.models.length);
      button.buttonEl.setAttribute('aria-label', `${title}: ${entry?.label ?? (value || inherit)}`);
      button.buttonEl.setAttribute('aria-expanded', 'false');
      button.onClick(() => {
        if (picker?.isConnected) { picker.remove(); picker = null; button.buttonEl.setAttribute('aria-expanded', 'false'); button.buttonEl.removeAttribute('aria-controls'); return; }
        picker = null;
        const choose = async (ref: string) => {
          if (!await this.saveModel(ref, completion)) return;
          if (!container.isConnected) return;
          picker?.remove(); picker = null;
          button.buttonEl.setAttribute('aria-expanded', 'false');
          button.buttonEl.removeAttribute('aria-controls');
          const model = this.catalog?.models.find((item) => `${item.providerId}/${item.modelId}` === ref);
          button.setButtonText(model?.label ?? t('settings.zcode.ui.choose'));
          button.buttonEl.setAttribute('aria-label', `${title}: ${model?.label ?? inherit}`);
          row.setDesc(model ? `${model.providerLabel} · ${ref}` : inherit);
          resetControl?.setDisabled(!ref);
          button.buttonEl.focus();
          if (!completion) await this.refreshThinking();
        };
        const selected = completion ? this.host.settings.inlineCompletionModelOverrides?.zcode ?? ''
          : normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode).model;
        picker = this.renderPicker(row.settingEl, selected, choose);
        button.buttonEl.setAttribute('aria-expanded', 'true');
        button.buttonEl.setAttribute('aria-controls', picker.id);
      });
    });
    row.addButton((button) => {
      resetControl = button;
      button.buttonEl.setAttribute('aria-label', t(completion ? 'settings.zcode.ui.resetCompletion' : 'settings.zcode.ui.resetChat'));
      button.setButtonText(t('settings.zcode.ui.reset')).setDisabled(!value).onClick(async () => {
      if (await this.saveModel('', completion) && this.root.isConnected) {
        this.renderChoices();
        if (!completion) await this.refreshThinking();
        this.root.querySelector<HTMLButtonElement>(`[data-zcode-field="${completion ? 'completion-model' : 'model'}"] button`)?.focus();
      }
      });
    });
  }

  private renderPicker(host: HTMLElement, selected: string, choose: (ref: string) => Promise<void>): HTMLElement {
    const picker = host.createDiv({ cls: 'opencodian-zcode-model-picker', attr: { id: `zcode-models-${crypto.randomUUID()}` } });
    const search = picker.createEl('input', { cls: 'opencodian-zcode-search', attr: { type: 'search', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'true', placeholder: t('settings.zcode.ui.search'), 'aria-label': t('settings.zcode.ui.search'), 'aria-controls': `${picker.id}-list` } });
    const count = picker.createDiv({ cls: 'setting-item-description', attr: { role: 'status', 'aria-live': 'polite' } });
    const list = picker.createDiv({ cls: 'opencodian-zcode-model-list', attr: { id: `${picker.id}-list`, role: 'listbox', 'aria-label': t('settings.zcode.ui.choose') } });
    let active = -1;
    const activate = (index: number) => {
      const options = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="option"]'));
      active = Math.max(0, Math.min(options.length - 1, index));
      options.forEach((option, position) => option.toggleClass('is-active', position === active));
      const option = options[active];
      if (option) { search.setAttribute('aria-activedescendant', option.id); option.scrollIntoView?.({ block: 'nearest' }); }
      else search.removeAttribute('aria-activedescendant');
    };
    const close = (focus: boolean) => {
      const trigger = host.querySelector<HTMLButtonElement>('button[aria-expanded]');
      trigger?.setAttribute('aria-expanded', 'false'); trigger?.removeAttribute('aria-controls');
      picker.remove();
      if (focus) trigger?.focus();
      return trigger;
    };
    const render = () => {
      list.empty();
      const query = search.value.trim().toLowerCase();
      const models = this.catalog?.models.filter((model) => `${model.label} ${model.modelId} ${model.providerId} ${model.providerLabel}`.toLowerCase().includes(query)) ?? [];
      const providers = [...new Set(models.map((model) => model.providerId))];
      count.setText(models.length ? t('settings.zcode.ui.modelCount', { count: String(models.length) }) : t('settings.zcode.ui.noMatches'));
      for (const provider of providers) {
        const entries = models.filter((model) => model.providerId === provider);
        const group = list.createDiv({ attr: { role: 'group', 'aria-label': entries[0].providerLabel } });
        group.createEl('h5', { text: entries[0].providerLabel });
        for (const model of entries) {
          const ref = `${model.providerId}/${model.modelId}`;
          const option = group.createEl('button', { cls: 'opencodian-zcode-model-option', attr: { id: `${picker.id}-option-${list.querySelectorAll('[role="option"]').length}`, type: 'button', role: 'option', 'aria-selected': String(ref === selected), tabindex: '-1' } });
          option.createSpan({ text: model.label });
          option.createEl('small', { text: model.modelId });
          option.addEventListener('click', () => { void choose(ref); });
        }
      }
      const options = Array.from(list.querySelectorAll('[role="option"]'));
      activate(Math.max(0, options.findIndex((option) => option.getAttribute('aria-selected') === 'true')));
    };
    search.addEventListener('input', render);
    picker.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
      if (event.key === 'Tab') {
        event.preventDefault(); const trigger = close(false);
        const focusable = Array.from(this.root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]'))
          .filter((element) => element.tabIndex >= 0 && !element.closest('[aria-hidden="true"]') && element.getClientRects().length > 0);
        const next = event.shiftKey ? trigger : focusable[focusable.indexOf(trigger!) + 1] ?? trigger;
        next?.focus(); return;
      }
      if (event.key === 'Enter') {
        event.preventDefault(); list.querySelectorAll<HTMLButtonElement>('[role="option"]')[active]?.click(); return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const choices = Array.from(list.querySelectorAll<HTMLButtonElement>('button'));
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
        : Math.max(0, Math.min(choices.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
      activate(next); event.preventDefault();
    });
    render(); search.focus();
    return picker;
  }

  private renderThinking(container: HTMLElement, catalog: ZCodeSettingsModelCatalog | null): void {
    container.empty();
    const current = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode).thinkingLevel;
    const levels = catalog?.thoughtLevelEnabled === false ? [] : catalog?.thoughtLevels ?? [];
    // Pending or failed: no unknown-value judgement and no readback claims.
    const pending = this.catalogPending;
    const sourceLabel = this.catalog ? t('settings.zcode.ui.catalogSource') : undefined;
    const setting = new Setting(container).setName(t('settings.zcode.ui.thinking'))
      .setDesc(pending ? t('settings.zcode.ui.loading')
        : current && catalog && !levels.some((level) => level.value === current) ? t('settings.zcode.ui.savedUnknown', { value: current })
          : t(levels.length ? 'settings.zcode.ui.thinkingHelp' : 'settings.zcode.ui.thinkingUnavailable'));
    describeBackendSetting(setting, {
      key: 'zcode-default-thinking',
      scope: 'vault',
      effect: 'new-session',
      risk: 'low',
      defaultLabel: t('settings.zcode.ui.inherit'),
      ...(sourceLabel ? { source: sourceLabel } : {}),
    });
    setting.addDropdown((control) => {
      control.addOption('', t('settings.zcode.ui.inherit'));
      for (const level of levels) control.addOption(level.value, level.label);
      if (current && !levels.some((level) => level.value === current)) {
        control.addOption(current, current);
        for (const option of Array.from(control.selectEl.options)) if (option.value === current) option.disabled = true;
      }
      control.selectEl.setAttribute('aria-label', t('settings.zcode.ui.thinking'));
      control.setValue(current).onChange(async (value) => {
        if (!await this.saveField('thinkingLevel', value)) {
          const current = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode).thinkingLevel;
          control.setValue(current); control.selectEl.setAttribute('value', current);
        }
      });
    });
  }

  private async refreshThinking(): Promise<void> {
    const model = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode).model;
    const separator = model.indexOf('/');
    const epoch = ++this.epoch;
    try {
      const result = model && separator > 0
        ? await this.options.getCatalog({ model: { providerId: model.slice(0, separator), modelId: model.slice(separator + 1) } })
        : this.catalog;
      if (epoch !== this.epoch || !this.root.isConnected) return;
      const container = this.root.querySelector<HTMLElement>('.opencodian-zcode-thinking');
      if (container) this.renderThinking(container, result);
    } catch {
      if (epoch === this.epoch && this.root.isConnected) {
        const container = this.root.querySelector<HTMLElement>('.opencodian-zcode-thinking');
        if (container) this.renderThinking(container, null);
      }
    }
  }

  private async saveModel(value: string, completion: boolean): Promise<boolean> {
    if (!completion) return this.saveField('model', value);
    const previous = this.host.settings.inlineCompletionModelOverrides?.zcode;
    const overrides = { ...this.host.settings.inlineCompletionModelOverrides };
    if (value) overrides.zcode = value; else delete overrides.zcode;
    this.host.settings.inlineCompletionModelOverrides = overrides;
    const saved = await this.persist(true);
    if (!saved && this.host.settings.inlineCompletionModelOverrides?.zcode === (value || undefined)) {
      const rollback = { ...this.host.settings.inlineCompletionModelOverrides };
      if (previous === undefined) delete rollback.zcode; else rollback.zcode = previous;
      this.host.settings.inlineCompletionModelOverrides = rollback;
    }
    return saved;
  }

  private async saveField(field: keyof ZCodeBackendSettings, value: string): Promise<boolean> {
    const previous = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode);
    const next = normalizeZCodeBackendSettings({
      ...previous, [field]: value,
    });
    this.host.settings.backendSettings.zcode = next;
    const saved = await this.persist();
    const current = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode);
    if (!saved && current[field] === next[field]) this.host.settings.backendSettings.zcode = { ...current, [field]: previous[field] };
    return saved;
  }

  private async persist(completion = false): Promise<boolean> {
    try {
      await this.host.saveSettings();
      if (this.root.isConnected) { this.status.setText(t(completion ? 'settings.zcode.ui.completionSaved' : 'settings.zcode.ui.saved')); this.status.removeClass('is-error'); }
      return true;
    } catch {
      if (this.root.isConnected) { this.status.setText(t('settings.zcode.ui.saveFailed')); this.status.addClass('is-error'); }
      return false;
    }
  }
}

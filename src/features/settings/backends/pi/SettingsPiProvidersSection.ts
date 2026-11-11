import { Notice, Setting } from 'obsidian';

import type { PiAdapter } from '../../../../core/agents/backend/pi/PiAdapter';
import type { PiConfigurationDocument } from '../../../../core/agents/backend/pi/PiProtocol';
import { type PiRecord, piRecord } from '../../../../core/agents/backend/pi/PiRpcClient';
import { t } from '../../../../i18n';
import { describeBackendSetting } from '../../controls/BackendSettingsControls';

/**
 * Optional native archive contract on PiAdapter (core-owned). When absent the
 * editor falls back to the memory-only session undo below.
 */
export interface PiConfigurationHistoryBackend {
  supportsConfigurationHistory(): Promise<boolean>;
  getConfigurationHistory(): Promise<PiRecord>;
  restoreConfiguration(input: PiRecord): Promise<PiRecord>;
}
interface PiArchiveEntry { index: number; savedAt: number; revision: string; bytes?: number }

/**
 * Session-scoped undo for the native models.json editor. While the adapter
 * lacks the native archive, history lives only in a plugin-lifetime WeakMap
 * keyed by the adapter: it survives tab rerenders, is never persisted and
 * never written to the vault (the file embeds API-key expressions), and is
 * intentionally lost on plugin reload. Secrets stay out of vault storage.
 */
interface PiDocumentVersion { savedAt: number; revision: string; value: PiRecord }
const PI_DOCUMENT_HISTORY_LIMIT = 5;
const documentHistory = new WeakMap<PiAdapter, PiDocumentVersion[]>();

/** Structured models.json editor, with lossless native JSON for provider-specific extensions. */
export class SettingsPiProvidersSection {
  private document?: PiConfigurationDocument;
  private selected = '';
  private editors: Array<() => void> = [];
  private historyList?: HTMLElement;
  private historyEpoch = 0;
  private nativeHistory: boolean | null = null;
  constructor(private readonly adapter: PiAdapter, private readonly reconnect: () => Promise<void>) {}

  attach(container: HTMLElement): void {
    container.createEl('p', { cls: 'setting-item-description', text: t('settings.pi.providers.help') });
    const status = container.createDiv({ text: t('settings.pi.loading'), attr: { role: 'status' } });
    const body = container.createDiv();
    void this.adapter.command(undefined, 'get_model_configuration').then(result => {
      this.document = result as unknown as PiConfigurationDocument; status.setText(this.document.path); this.render(body);
      // Mounted outside the editor body so editor re-renders keep the history.
      this.renderHistory(container);
    }).catch(error => status.setText(String(error)));
    void this.probeNativeHistory();
  }

  private get historyBackend(): PiConfigurationHistoryBackend | undefined {
    const candidate = this.adapter as unknown as Partial<PiConfigurationHistoryBackend>;
    return typeof candidate.supportsConfigurationHistory === 'function'
      && typeof candidate.getConfigurationHistory === 'function'
      && typeof candidate.restoreConfiguration === 'function' ? candidate as PiConfigurationHistoryBackend : undefined;
  }

  private async probeNativeHistory(): Promise<void> {
    const backend = this.historyBackend;
    if (!backend) { this.nativeHistory = false; return; }
    try { this.nativeHistory = await backend.supportsConfigurationHistory(); }
    catch { this.nativeHistory = false; }
  }

  private render(body: HTMLElement): void {
    body.empty();
    body.addClass('opencodian-settings-form-stack');
    const document = this.document as PiConfigurationDocument;
    const providers = piRecord(document.value.providers);
    this.selected ||= Object.keys(providers)[0] ?? '';
    const select = new Setting(body).setName(t('settings.pi.selectProvider'));
    describeBackendSetting(select, {
      key: 'pi-provider-select',
      scope: 'global',
      effect: 'new-session',
      risk: 'high',
      defaultLabel: t('settings.pi.newProvider'),
      source: document.path,
    });
    select.addDropdown(dropdown => {
      dropdown.addOption('', t('settings.pi.newProvider'));
      for (const name of Object.keys(providers)) dropdown.addOption(name, name);
      dropdown.setValue(this.selected).onChange(value => { this.selected = value; this.renderEditor(editor, providers); });
    });
    const editor = body.createDiv(); this.renderEditor(editor, providers);
    this.renderNative(body);
  }

  private renderEditor(container: HTMLElement, providers: PiRecord): void {
    container.empty();
    container.addClass('opencodian-settings-form-stack');
    const draft: PiRecord = JSON.parse(JSON.stringify(providers[this.selected] ?? { models: [] })) as PiRecord;
    let name = this.selected;
    this.editors = [];
    new Setting(container).setName(t('settings.pi.providerId')).addText(input => input.setValue(name).setDisabled(Boolean(this.selected)).onChange(value => { name = value.trim(); }));
    this.text(container, draft, 'name', t('settings.pi.displayName'));
    this.text(container, draft, 'baseUrl', t('settings.pi.baseUrl'));
    this.api(container, draft);
    this.text(container, draft, 'apiKey', t('settings.pi.apiKeyExpression'));
    this.tristate(container, draft, 'authHeader', t('settings.pi.authHeader'));
    for (const key of ['headers', 'compat', 'modelOverrides'] as const) this.json(container, draft, key, t(`settings.pi.providerField.${key}`));
    const models = Array.isArray(draft.models) ? draft.models.map(model => piRecord(model)) : [];
    const modelsHost = container.createDiv({ cls: 'opencodian-pi-models' });
    const renderModels = (): void => {
      modelsHost.empty();
      for (const model of models) this.model(modelsHost, model, () => {
        try { for (const apply of this.editors) apply(); models.splice(models.indexOf(model), 1); renderModels(); }
        catch (error) { new Notice(String(error)); }
      });
    };
    renderModels();
    new Setting(container).setName(t('settings.pi.customModels')).addButton(button => button.setButtonText(t('settings.pi.addModel')).onClick(() => {
      try { for (const apply of this.editors) apply(); models.push({ id: '' }); renderModels(); }
      catch (error) { new Notice(String(error)); }
    }));
    const status = container.createDiv({ attr: { role: 'status', 'aria-live': 'polite' } });
    new Setting(container).addButton(button => button.setButtonText(t('settings.pi.saveProvider')).setCta().onClick(async () => {
      button.setDisabled(true);
      try {
        if (!name || ['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error(t('settings.pi.providerIdRequired'));
        if (!this.selected && Object.prototype.hasOwnProperty.call(providers, name)) throw new Error(t('settings.pi.providerAlreadyExists'));
        for (const apply of this.editors) apply();
        if (models.length) draft.models = models; else delete draft.models;
        const value = { ...(this.document as PiConfigurationDocument).value, providers: { ...providers, [name]: draft } };
        await this.save(value); this.selected = name; this.render(container.parentElement as HTMLElement);
      } catch (error) { status.setText(String(error)); }
      finally { button.setDisabled(false); }
    }));
    if (this.selected) {
      let confirm = false;
      new Setting(container).setName(t('settings.pi.removeProvider')).setDesc(t('settings.pi.removeProvider.help'))
        .addToggle(toggle => toggle.onChange(value => { confirm = value; }))
        .addButton(button => button.setButtonText(t('settings.pi.remove')).onClick(async () => {
          if (!confirm) { status.setText(t('settings.pi.confirmRemoval')); return; }
          try { const next = { ...providers }; delete next[this.selected]; await this.save({ ...(this.document as PiConfigurationDocument).value, providers: next }); this.selected = ''; this.render(container.parentElement as HTMLElement); }
          catch (error) { status.setText(String(error)); }
        }));
    }
  }

  private model(container: HTMLElement, model: PiRecord, remove: () => void): void {
    const details = container.createEl('details', { cls: 'opencodian-pi-model-editor' });
    details.open = !model.id;
    details.createEl('summary', { text: String(model.name ?? model.id ?? t('settings.pi.newModel')) });
    for (const [key, label] of [['id', 'modelId'], ['name', 'displayName'], ['baseUrl', 'baseUrl']] as const) this.text(details, model, key, t(`settings.pi.${label}`));
    this.api(details, model);
    this.tristate(details, model, 'reasoning', t('settings.pi.reasoning'));
    new Setting(details).setName(t('settings.pi.imageInput')).addToggle(toggle => toggle.setValue(Array.isArray(model.input) && model.input.includes('image')).onChange(value => { model.input = value ? ['text', 'image'] : ['text']; }));
    for (const key of ['contextWindow', 'maxTokens'] as const) this.numeric(details, model, key, t(`settings.pi.modelField.${key}`));
    const cost = piRecord(model.cost);
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) this.numeric(details, cost, key, t(`settings.pi.cost.${key}`));
    this.editors.push(() => { if (!details.isConnected) return; if (Object.keys(cost).length) model.cost = cost; else delete model.cost; });
    for (const key of ['thinkingLevelMap', 'headers', 'compat'] as const) this.json(details, model, key, t(`settings.pi.modelField.${key}`));
    new Setting(details).addButton(button => button.setButtonText(t('settings.pi.removeModel')).onClick(remove));
  }

  private text(container: HTMLElement, value: PiRecord, key: string, label: string): void {
    new Setting(container).setName(label).setDesc(key).addText(input => {
      input.inputEl.setAttribute('aria-label', label); if (key === 'apiKey') input.inputEl.type = 'password';
      input.setValue(typeof value[key] === 'string' ? value[key] as string : '').onChange(text => { if (text) value[key] = text; else delete value[key]; });
    });
  }
  private numeric(container: HTMLElement, value: PiRecord, key: string, label: string): void {
    new Setting(container).setName(label).setDesc(key).addText(input => {
      input.inputEl.type = 'number'; input.inputEl.min = '0'; input.inputEl.step = 'any'; input.inputEl.setAttribute('aria-label', label);
      input.setValue(value[key] === undefined ? '' : String(value[key])).onChange(text => { if (text) value[key] = Number(text); else delete value[key]; });
    });
  }
  private tristate(container: HTMLElement, value: PiRecord, key: string, label: string): void {
    new Setting(container).setName(label).setDesc(key).addDropdown(dropdown => dropdown.addOption('', t('settings.pi.inherit')).addOption('true', t('settings.pi.enabled')).addOption('false', t('settings.pi.disabled'))
      .setValue(value[key] === undefined ? '' : String(value[key])).onChange(text => { if (text) value[key] = text === 'true'; else delete value[key]; }));
  }
  private api(container: HTMLElement, value: PiRecord): void {
    new Setting(container).setName(t('settings.pi.api')).addDropdown(dropdown => {
      dropdown.addOption('', t('settings.pi.inherit'));
      for (const api of ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai']) dropdown.addOption(api, api);
      if (value.api && !dropdown.selectEl.querySelector(`option[value="${String(value.api).replace(/[^a-z-]/g, '')}"]`)) dropdown.addOption(String(value.api), String(value.api));
      dropdown.setValue(String(value.api ?? '')).onChange(text => { if (text) value.api = text; else delete value.api; });
    });
  }
  private json(container: HTMLElement, value: PiRecord, key: string, label: string): void {
    const details = container.createEl('details', { cls: 'opencodian-pi-config-advanced' });
    details.createEl('summary', { text: label });
    const input = details.createEl('textarea', { cls: 'opencodian-pi-json-editor', attr: { 'aria-label': key, spellcheck: 'false' } });
    input.rows = 4; input.value = value[key] === undefined ? '' : JSON.stringify(value[key], null, 2);
    this.editors.push(() => { if (!input.isConnected) return; if (input.value.trim()) value[key] = JSON.parse(input.value); else delete value[key]; });
  }

  /** Every successful write archives the previous document (memory only). */
  private async save(value: PiRecord): Promise<void> {
    const previous = this.document;
    const next = await this.adapter.command(undefined, 'save_model_configuration', { revision: (this.document as PiConfigurationDocument).revision, value }) as unknown as PiConfigurationDocument;
    if (previous) this.pushHistory(previous);
    this.document = next;
    this.renderHistoryEntries();
  }

  private pushHistory(document: PiConfigurationDocument): void {
    const history = documentHistory.get(this.adapter) ?? [];
    history.unshift({ savedAt: Date.now(), revision: document.revision, value: document.value });
    documentHistory.set(this.adapter, history.slice(0, PI_DOCUMENT_HISTORY_LIMIT));
  }

  private peekHistory(): PiDocumentVersion[] {
    return documentHistory.get(this.adapter) ?? [];
  }

  /**
   * Version history for models.json. Native persistent archive (survives
   * reload) when the adapter exposes the contract; memory-only session undo
   * otherwise, honestly labeled. Restore is always revision-guarded and
   * reachable in three clicks: open disclosure -> Restore -> Confirm.
   */
  private renderHistory(container: HTMLElement): void {
    const details = container.createEl('details', { cls: 'opencodian-pi-config-advanced opencodian-pi-config-history', attr: { 'data-pi-history': '', 'data-backend-risk': 'medium' } });
    details.createEl('summary', { text: t('settings.pi.history.title') });
    const body = details.createDiv({ cls: 'opencodian-zcode-disclosure-body' });
    this.historyHelp = body.createEl('p', { cls: 'setting-item-description' });
    this.historyList = body.createDiv({ cls: 'opencodian-settings-form-stack', attr: { 'data-pi-history-list': '' } });
    details.addEventListener('toggle', () => { if (details.open) void this.renderHistoryEntries(); });
  }

  private historyHelp?: HTMLElement;

  private renderHistoryEntries(): void {
    const list = this.historyList;
    if (!list?.isConnected) return;
    const epoch = ++this.historyEpoch;
    list.empty();
    if (this.nativeHistory === true) {
      this.historyHelp?.setText(t('settings.pi.history.nativeHelp'));
      void this.renderNativeEntries(epoch);
      return;
    }
    this.historyHelp?.setText(t('settings.pi.history.help'));
    const entries = this.peekHistory();
    if (!entries.length) {
      list.createEl('p', { text: t('settings.pi.history.empty'), cls: 'setting-item-description' });
      return;
    }
    for (const entry of entries) {
      const row = new Setting(list)
        .setName(t('settings.pi.history.entry', { time: new Date(entry.savedAt).toLocaleString() }))
        .setDesc(t('settings.pi.history.entryDetail', { time: new Date(entry.savedAt).toLocaleTimeString() }));
      describeBackendSetting(row, {
        key: 'pi-history-memory-entry',
        scope: 'vault',
        effect: 'immediate',
        source: t('settings.pi.history.memorySource'),
      });
      row.addButton(button => button.setButtonText(t('settings.pi.history.restore')).onClick(() => {
        this.confirmMemoryRestore(entry, row.settingEl, epoch);
      }));
    }
  }

  /** Three clicks: open disclosure -> Restore -> Confirm (memory fallback). */
  private confirmMemoryRestore(entry: PiDocumentVersion, row: HTMLElement, epoch: number): void {
    const list = this.historyList;
    if (!list?.isConnected) return;
    const confirmHost = list.createDiv({ cls: 'opencodian-pi-config-history-confirm', attr: { 'data-pi-history-confirm': '' } });
    confirmHost.createEl('p', { text: t('settings.pi.history.confirmHelp'), cls: 'setting-item-description' });
    const confirm = confirmHost.createEl('button', { text: t('settings.pi.history.confirm'), attr: { type: 'button' } });
    const cancel = confirmHost.createEl('button', { text: t('settings.pi.cancel'), attr: { type: 'button' } });
    cancel.addEventListener('click', () => { confirmHost.empty(); row.querySelector<HTMLButtonElement>('button')?.focus(); });
    confirm.addEventListener('click', () => {
      confirm.disabled = true; cancel.disabled = true;
      void (async () => {
        await this.save(entry.value);
        if (epoch !== this.historyEpoch || !list.isConnected) return;
        new Notice(t('settings.pi.history.restored'));
        this.renderHistoryEntries();
      })().catch(() => {
        if (!confirmHost.isConnected) return;
        // Stale view never overwrites; classified copy only, never raw errors.
        confirmHost.empty();
        const stale = confirmHost.createEl('p', { text: t('settings.pi.history.stale'), cls: 'setting-item-description', attr: { role: 'alert' } });
        const reload = stale.createEl('button', { text: t('settings.pi.history.refresh'), attr: { type: 'button' } });
        reload.addEventListener('click', () => { reload.disabled = true; this.renderHistoryEntries(); });
      })
        .finally(() => { if (confirmHost.isConnected) { confirm.disabled = false; cancel.disabled = false; } });
    });
    confirm.focus();
  }

  private async renderNativeEntries(epoch: number): Promise<void> {
    const list = this.historyList;
    const backend = this.historyBackend;
    if (!list?.isConnected || !backend || this.nativeHistory !== true) return;
    if (!list.childElementCount) list.setText(t('settings.pi.history.loading'));
    let entries: PiArchiveEntry[] = [];
    try {
      const snapshot = await backend.getConfigurationHistory();
      const models = piRecord(snapshot.models);
      entries = Array.isArray(models.entries) ? models.entries as PiArchiveEntry[] : [];
    } catch {
      if (epoch === this.historyEpoch && list.isConnected) list.setText(t('settings.pi.history.failed'));
      return;
    }
    if (epoch !== this.historyEpoch || !list.isConnected) return;
    list.empty();
    if (!entries.length) {
      list.createEl('p', { text: t('settings.pi.history.nativeEmpty'), cls: 'setting-item-description' });
      return;
    }
    for (const entry of entries) {
      const row = new Setting(list)
        .setName(t('settings.pi.history.nativeEntry', { index: String(entry.index), time: new Date(entry.savedAt).toLocaleString() }))
        .setDesc(t('settings.pi.history.nativeDetail', { size: String(entry.bytes ?? '?'), revision: String(entry.revision).slice(0, 12) }));
      describeBackendSetting(row, {
        key: `pi-history-native-${entry.index}`,
        scope: 'global',
        effect: 'immediate',
        source: t('settings.pi.history.nativeSource'),
      });
      row.addButton(button => button.setButtonText(t('settings.pi.history.restore')).onClick(() => {
        this.confirmNativeRestore(entry, row.settingEl, epoch);
      }));
    }
  }

  /** Three clicks: open disclosure -> Restore -> Confirm restore. */
  private confirmNativeRestore(entry: PiArchiveEntry, row: HTMLElement, epoch: number): void {
    const list = this.historyList;
    if (!list?.isConnected) return;
    const confirmHost = list.createDiv({ cls: 'opencodian-pi-config-history-confirm', attr: { 'data-pi-history-confirm': '' } });
    confirmHost.createEl('p', { text: t('settings.pi.history.confirmHelp'), cls: 'setting-item-description' });
    const confirm = confirmHost.createEl('button', { text: t('settings.pi.history.confirm'), attr: { type: 'button' } });
    const cancel = confirmHost.createEl('button', { text: t('settings.pi.cancel'), attr: { type: 'button' } });
    cancel.addEventListener('click', () => { confirmHost.empty(); row.querySelector<HTMLButtonElement>('button')?.focus(); });
    confirm.addEventListener('click', () => {
      confirm.disabled = true; cancel.disabled = true;
      void (async () => {
        const backend = this.historyBackend;
        if (!backend) throw new Error('Pi history backend is unavailable.');
        const next = await backend.restoreConfiguration({
          target: 'models', index: entry.index, archivedRevision: entry.revision, revision: (this.document as PiConfigurationDocument).revision,
        });
        this.document = next as unknown as PiConfigurationDocument;
        if (epoch !== this.historyEpoch || !list.isConnected) return;
        new Notice(t('settings.pi.history.restored'));
        await this.renderNativeEntries(epoch);
      })().catch(() => {
        if (!confirmHost.isConnected) return;
        // A stale view never overwrites: surface refresh, never raw CLI text.
        confirmHost.empty();
        const stale = confirmHost.createEl('p', { text: t('settings.pi.history.stale'), cls: 'setting-item-description', attr: { role: 'alert' } });
        const reload = stale.createEl('button', { text: t('settings.pi.history.refresh'), attr: { type: 'button' } });
        reload.addEventListener('click', () => { reload.disabled = true; void this.renderNativeEntries(++this.historyEpoch); });
      })
        .finally(() => { if (confirmHost.isConnected) { confirm.disabled = false; cancel.disabled = false; } });
    });
    confirm.focus();
  }

  private renderNative(container: HTMLElement): void {
    const details = container.createEl('details', { cls: 'opencodian-pi-config-advanced' });
    details.createEl('summary', { text: t('settings.pi.nativeModels') });
    details.createEl('p', { text: t('settings.pi.nativeModels.help'), cls: 'setting-item-description' });
    const input = details.createEl('textarea', { cls: 'opencodian-pi-json-editor', attr: { 'aria-label': 'models.json', spellcheck: 'false' } });
    input.rows = 18; input.value = JSON.stringify((this.document as PiConfigurationDocument).value, null, 2);
    const status = details.createDiv({ attr: { role: 'status' } });
    new Setting(details).addButton(button => button.setButtonText(t('settings.pi.save')).onClick(async () => {
      try { await this.save(JSON.parse(input.value) as PiRecord); this.render(container); new Notice(t('settings.pi.saved')); } catch (error) { status.setText(String(error)); }
    }));
    new Setting(container).setDesc(t('settings.pi.applyBoundary')).addButton(button => button.setButtonText(t('settings.pi.reconnect')).onClick(async () => {
      try { await this.reconnect(); status.setText(t('settings.pi.connected')); } catch (error) { status.setText(String(error)); }
    }));
  }
}

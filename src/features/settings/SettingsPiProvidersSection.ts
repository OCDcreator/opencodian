import { Notice, Setting } from 'obsidian';

import type { PiAdapter } from '../../core/agents/backend/pi/PiAdapter';
import type { PiConfigurationDocument } from '../../core/agents/backend/pi/PiProtocol';
import { type PiRecord, piRecord } from '../../core/agents/backend/pi/PiRpcClient';
import { t } from '../../i18n';

/** Structured models.json editor, with lossless native JSON for provider-specific extensions. */
export class SettingsPiProvidersSection {
  private document?: PiConfigurationDocument;
  private selected = '';
  private editors: Array<() => void> = [];
  constructor(private readonly adapter: PiAdapter, private readonly reconnect: () => Promise<void>) {}

  attach(container: HTMLElement): void {
    container.createEl('p', { cls: 'setting-item-description', text: t('settings.pi.providers.help') });
    const status = container.createDiv({ text: t('settings.pi.loading'), attr: { role: 'status' } });
    const body = container.createDiv();
    void this.adapter.command(undefined, 'get_model_configuration').then(result => {
      this.document = result as unknown as PiConfigurationDocument; status.setText(this.document.path); this.render(body);
    }).catch(error => status.setText(String(error)));
  }

  private render(body: HTMLElement): void {
    body.empty();
    const document = this.document as PiConfigurationDocument;
    const providers = piRecord(document.value.providers);
    this.selected ||= Object.keys(providers)[0] ?? '';
    new Setting(body).setName(t('settings.pi.selectProvider')).addDropdown(dropdown => {
      dropdown.addOption('', t('settings.pi.newProvider'));
      for (const name of Object.keys(providers)) dropdown.addOption(name, name);
      dropdown.setValue(this.selected).onChange(value => { this.selected = value; this.renderEditor(editor, providers); });
    });
    const editor = body.createDiv(); this.renderEditor(editor, providers);
    this.renderNative(body);
  }

  private renderEditor(container: HTMLElement, providers: PiRecord): void {
    container.empty();
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
  private async save(value: PiRecord): Promise<void> {
    this.document = await this.adapter.command(undefined, 'save_model_configuration', { revision: (this.document as PiConfigurationDocument).revision, value }) as unknown as PiConfigurationDocument;
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

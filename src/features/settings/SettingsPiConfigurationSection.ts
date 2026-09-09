import { Setting } from 'obsidian';

import type { PiAdapter } from '../../core/agents/backend/pi/PiAdapter';
import type { PiConfigurationSnapshot, PiSettingField } from '../../core/agents/backend/pi/PiProtocol';
import { getLocale, t } from '../../i18n';

const valueAt = (value: Record<string, unknown>, key: string): unknown => key.split('.').reduce<unknown>((parent, part) => (parent as Record<string, unknown> | undefined)?.[part], value);

/** Native global/project settings forms; file persistence stays inside the Pi service. */
export class SettingsPiConfigurationSection {
  private scope: 'global' | 'project' = 'project';
  private snapshot?: PiConfigurationSnapshot;
  private readonly drafts = { global: new Map<string, string>(), project: new Map<string, string>() };
  constructor(private readonly adapter: PiAdapter, private readonly onSaved: (keys: string[]) => Promise<void>, private readonly reconnect: () => Promise<void>) {}

  attach(container: HTMLElement, group: string): void {
    const status = container.createDiv({ cls: 'opencodian-pi-config-status', text: t('settings.pi.loading'), attr: { role: 'status' } });
    const body = container.createDiv();
    const load = async (): Promise<void> => {
      try {
        this.snapshot = await this.adapter.command(undefined, 'get_configuration') as unknown as PiConfigurationSnapshot;
        status.setText(''); this.render(body, group);
      } catch (error) { status.setText(String(error)); }
    };
    new Setting(container).setName(t('settings.pi.refresh')).addButton(button => button.setButtonText(t('settings.pi.refresh')).onClick(() => { void load(); }));
    void load();
  }

  private render(body: HTMLElement, group: string): void {
    if (!this.snapshot) return;
    body.empty();
    body.addClass('opencodian-settings-form-stack');
    const document = this.snapshot.scopes[this.scope];
    new Setting(body).setName(t('settings.pi.scope')).setDesc(document.path).addDropdown(dropdown => {
      dropdown.addOption('project', t('settings.pi.scope.project')).addOption('global', t('settings.pi.scope.global')).setValue(this.scope)
        .onChange(value => { this.scope = value as 'project' | 'global'; this.render(body, group); });
    });
    body.createEl('p', { cls: 'setting-item-description', text: t('settings.pi.scope.help') });
    const fields = this.snapshot.fields.filter(field => field.group === group);
    for (const field of fields) this.renderField(body, field);
    const status = body.createDiv({ cls: 'opencodian-pi-config-status', attr: { role: 'status', 'aria-live': 'polite' } });
    new Setting(body).setName(t('settings.pi.saveSettings')).setDesc(t('settings.pi.applyBoundary')).addButton(button => {
      button.setButtonText(t('settings.pi.save')).setCta().onClick(async () => {
        button.setDisabled(true);
        try {
          const changes = this.collectChanges(fields);
          if (!Object.keys(changes).length) { status.setText(t('settings.pi.noChanges')); return; }
          this.snapshot = await this.adapter.command(undefined, 'save_configuration', { scope: this.scope, revision: document.revision, changes }) as unknown as PiConfigurationSnapshot;
          this.drafts[this.scope].clear(); await this.onSaved(Object.keys(changes));
          this.render(body, group); body.querySelector('.opencodian-pi-config-status')?.setText(t('settings.pi.saved'));
        } catch (error) { status.setText(String(error)); }
        finally { button.setDisabled(false); }
      });
    }).addButton(button => button.setButtonText(t('settings.pi.reconnect')).onClick(async () => {
      button.setDisabled(true);
      try { await this.reconnect(); status.setText(t('settings.pi.connected')); }
      catch (error) { status.setText(String(error)); }
      finally { button.setDisabled(false); }
    }));
    if (group === 'advanced') this.renderRawEditor(body);
  }

  private renderField(container: HTMLElement, field: PiSettingField): void {
    const snapshot = this.snapshot as PiConfigurationSnapshot;
    const current = valueAt(snapshot.scopes[this.scope].value, field.path);
    const inherited = this.scope === 'project' ? valueAt(snapshot.scopes.global.value, field.path) : undefined;
    const label = getLocale() === 'zh' ? field.label.zh : field.label.en;
    const scope = field.scope ? t(`settings.pi.fieldScope.${field.scope}`) : t('settings.pi.fieldScope.sdk');
    const setting = new Setting(container).setName(label).setDesc(`${field.path} · ${scope}${inherited === undefined ? '' : ` · ${t('settings.pi.inherited')}: ${JSON.stringify(inherited)}`}`);
    setting.settingEl.dataset.piSetting = field.path;
    let text = current === undefined ? '' : String(current);
    if (field.kind === 'list') text = Array.isArray(current) ? current.join('\n') : '';
    if (field.kind === 'json') text = current === undefined ? '' : JSON.stringify(current, null, 2);
    text = this.drafts[this.scope].get(field.path) ?? text;
    const update = (value: string): void => { this.drafts[this.scope].set(field.path, value); };
    if (field.kind === 'boolean' || field.options) {
      setting.addDropdown(dropdown => {
        dropdown.addOption('', t('settings.pi.inherit'));
        for (const option of field.options ?? ['true', 'false']) dropdown.addOption(option, option === 'true' ? t('settings.pi.enabled') : option === 'false' ? t('settings.pi.disabled') : option);
        dropdown.setValue(text).setDisabled(field.readOnly === true).onChange(update);
      });
    } else if (field.kind === 'list' || field.kind === 'json') {
      setting.settingEl.addClass('opencodian-pi-config-multiline');
      setting.addTextArea(input => { input.inputEl.rows = field.kind === 'json' ? 6 : 3; input.inputEl.setAttribute('aria-label', label); input.setValue(text).setPlaceholder(t('settings.pi.inherit')).onChange(update); });
    } else setting.addText(input => {
      input.inputEl.setAttribute('aria-label', label);
      if (field.kind === 'number') { input.inputEl.type = 'number'; input.inputEl.min = String(field.min ?? 0); if (field.max !== undefined) input.inputEl.max = String(field.max); }
      input.setValue(text).setPlaceholder(t('settings.pi.inherit')).setDisabled(field.readOnly === true).onChange(update);
    });
  }

  private collectChanges(fields: PiSettingField[]): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const field of fields) {
      const value = this.drafts[this.scope].get(field.path); if (value === undefined) continue;
      if (value === '') { changes[field.path] = null; continue; }
      switch (field.kind) {
        case 'boolean': changes[field.path] = value === 'true'; break;
        case 'number': {
          const number = Number(value);
          if (!Number.isInteger(number) || number < (field.min ?? 0) || (field.max !== undefined && number > field.max)) throw new Error(`${field.path}: ${t('settings.pi.invalidNumber')}`);
          changes[field.path] = number; break;
        }
        case 'json': changes[field.path] = JSON.parse(value); break;
        case 'list': changes[field.path] = value.split('\n').map(line => line.trim()).filter(Boolean); break;
        default: changes[field.path] = value;
      }
    }
    return changes;
  }

  private renderRawEditor(container: HTMLElement): void {
    const details = container.createEl('details', { cls: 'opencodian-pi-config-advanced' });
    details.createEl('summary', { text: t('settings.pi.nativeSettings') });
    details.createEl('p', { text: t('settings.pi.nativeSettings.help'), cls: 'setting-item-description' });
    let document = (this.snapshot as PiConfigurationSnapshot).scopes[this.scope];
    const input = details.createEl('textarea', { cls: 'opencodian-pi-json-editor', attr: { 'aria-label': 'settings.json', spellcheck: 'false' } });
    input.rows = 16; input.value = JSON.stringify(document.value, null, 2);
    const status = details.createDiv({ attr: { role: 'status' } });
    new Setting(details).addButton(button => button.setButtonText(t('settings.pi.save')).onClick(async () => {
      button.setDisabled(true);
      try {
        this.snapshot = await this.adapter.command(undefined, 'save_configuration', { scope: this.scope, revision: document.revision, value: JSON.parse(input.value) }) as unknown as PiConfigurationSnapshot;
        document = this.snapshot.scopes[this.scope];
        await this.onSaved(['defaultProvider', 'defaultModel', 'defaultThinkingLevel']); status.setText(t('settings.pi.saved'));
      } catch (error) { status.setText(String(error)); }
      finally { button.setDisabled(false); }
    }));
  }
}

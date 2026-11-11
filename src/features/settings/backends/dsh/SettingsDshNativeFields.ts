import { Setting } from 'obsidian';

import type { DshJsonObject, DshJsonValue, DshNativeConfigurationFieldDescriptor } from '../../../../core/types/dshConfiguration';
import { t, type TranslationKey } from '../../../../i18n';

export interface DshNativeFieldsHost {
  fields: readonly DshNativeConfigurationFieldDescriptor[];
  value: DshJsonObject;
  base: DshJsonObject;
  /** Root fields whose host saves them as one related transaction. */
  transaction?: boolean;
  change(transaction: boolean): void;
  credential(container: HTMLElement, ref: string, header: boolean): void;
}

export function dshNativeText(key: string, params?: Record<string, string | number>): string {
  return t(`settings.dsh.native.${key}` as TranslationKey, params);
}

export function dshNativeObject(value: unknown): DshJsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as DshJsonObject : undefined;
}

/** Structural readback of the native credential service, kept core-free here so
 * the guided-fields owner never imports the native controls transport. */
export interface DshNativeCredentialMetadata { ref: string; configured: boolean; source?: string; writable: boolean }
/** The workspace supplies live predicates and RPCs; the port is only invoked
 * while `available()` holds and `stale()` is false. */
export interface DshNativeCredentialRowPort {
  available(): boolean;
  stale(): boolean;
  describe(refs: string[]): Promise<{ credentials: DshNativeCredentialMetadata[] }>;
  set(ref: string, value: string): Promise<{ credentials: DshNativeCredentialMetadata[] }>;
  unset(ref: string): Promise<{ credentials: DshNativeCredentialMetadata[] }>;
}

/** Credential administration row for one reference. Only metadata (configured,
 * source, writability) is ever read back; a secret value is sent once and then
 * discarded, so no readback, feedback or draft can contain it. Write actions
 * stay disabled until the native service has observed a writable reference. */
export function renderDshNativeCredentialRow(container: HTMLElement, ref: string, header: boolean, port: DshNativeCredentialRowPort): void {
  const row = new Setting(container).setName(dshNativeText('credential', { ref }))
    .setDesc(`${dshNativeText(header ? 'credential.header' : 'credential.desc')} ${dshNativeText('credential.shared')}`);
  row.settingEl.addClass('opencodian-dsh-native-credential');
  const feedback = row.infoEl.createDiv({ cls: 'opencodian-dsh-field-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
  const password = row.controlEl.createEl('input', { type: 'password', attr: { 'aria-label': dshNativeText('credentialValue'), autocomplete: 'new-password' } });
  const unavailable = !port.available();
  let writable = false;
  const writeButtons: Array<{ setDisabled(value: boolean): unknown }> = [];
  const syncAccess = (): void => {
    password.disabled = !writable;
    for (const button of writeButtons) button.setDisabled(unavailable || !writable);
  };
  // Renders metadata without ever surfacing a secret value or a raw error.
  const metadata = (result: { credentials: DshNativeCredentialMetadata[] }): string => {
    const descriptor = result.credentials.find(item => item.ref === ref);
    writable = descriptor?.writable === true;
    syncAccess();
    return [
      dshNativeText(descriptor?.configured ? 'credential.configured' : 'credential.missing'),
      descriptor?.source ? dshNativeText('credential.source', { source: descriptor.source }) : dshNativeText('credential.source.unknown'),
      dshNativeText(writable ? 'credential.writable' : 'credential.readOnly'),
    ].join(' · ');
  };
  const run = async (button: { setDisabled(value: boolean): unknown }, stillDisabled: () => boolean, action: () => Promise<string>): Promise<void> => {
    if (port.stale()) return;
    if (!port.available()) { feedback.setText(dshNativeText('credential.unavailable')); return; }
    button.setDisabled(true);
    try { feedback.setText(await action()); }
    catch { if (!port.stale()) feedback.setText(dshNativeText('credential.failed')); }
    finally { if (!port.stale()) button.setDisabled(stillDisabled()); }
  };
  password.disabled = true;
  row.addButton(button => button.setButtonText(dshNativeText('credential.check')).setDisabled(unavailable)
    .onClick(() => run(button, () => unavailable, async () => metadata(await port.describe([ref])))));
  row.addButton(button => {
    button.setButtonText(dshNativeText('credential.set')).setDisabled(true);
    writeButtons.push(button);
    button.onClick(() => run(button, () => unavailable || !writable, async () => {
      if (!writable || !password.value) return dshNativeText('credential.checkFirst');
      const value = password.value;
      password.value = '';
      const detail = metadata(await port.set(ref, value));
      return `${dshNativeText(header ? 'credential.reconnect' : 'credential.updated')} · ${detail}`;
    }));
  });
  row.addButton(button => {
    button.setButtonText(dshNativeText('credential.unset')).setDisabled(true);
    writeButtons.push(button);
    button.onClick(() => run(button, () => unavailable || !writable, async () => {
      if (!writable) return dshNativeText('credential.checkFirst');
      password.value = '';
      const detail = metadata(await port.unset(ref));
      return `${dshNativeText(header ? 'credential.reconnect' : 'credential.updated')} · ${detail}`;
    }));
  });
  syncAccess();
}

/** Guided, schema-led editor. Maps and arrays have named entries and typed fields;
 * JSON is a supplementary workspace control, never their only editing path. */
export class SettingsDshNativeFields {
  private readonly fields: readonly DshNativeConfigurationFieldDescriptor[];
  constructor(private readonly host: DshNativeFieldsHost) {
    this.fields = host.fields.map(field => ({ ...field, path: field.path.replace(/\[\]/g, '.[]') }));
  }

  render(container: HTMLElement): void {
    this.object(container, this.host.value, this.host.base, { path: '', transaction: this.host.transaction === true });
  }

  private children(path: string): DshNativeConfigurationFieldDescriptor[] {
    const prefix = path ? `${path}.` : '';
    return this.fields.filter(field => field.path.startsWith(prefix)
      && !field.path.slice(prefix.length).includes('.') && field.path !== path);
  }

  private label(field: DshNativeConfigurationFieldDescriptor): string {
    if (field.labelKey) return t(field.labelKey as TranslationKey);
    const leaf = field.path.split('.').at(-1) ?? field.path;
    if (leaf === '*' || leaf === '[]') return dshNativeText('entry');
    const key = `settings.dsh.native.field.${leaf}` as TranslationKey;
    const translated = t(key);
    return translated === key ? leaf : translated;
  }

  private help(field: DshNativeConfigurationFieldDescriptor): string {
    const path = field.path.replace(/\.\[\]/g, '[]');
    const leaf = path.replace(/\[\]/g, '').split('.').filter(part => part !== '*').at(-1) ?? path;
    // Exact public paths distinguish model request limits from compaction
    // summary limits; shared leaves cover identical provider compatibility fields.
    for (const suffix of [`${field.namespace}.${path}`, `${field.namespace}.${leaf}`, leaf]) {
      const key = `settings.dsh.native.help.${suffix}` as TranslationKey;
      const value = t(key);
      if (value !== key) return value;
    }
    return dshNativeText('help.structured');
  }

  private describe(row: Setting, field: DshNativeConfigurationFieldDescriptor, state: { value: DshJsonValue | undefined; base: DshJsonValue | undefined; transaction: boolean }): void {
    row.setDesc(this.help(field));
    const metadata = [dshNativeText(state.value === undefined ? 'inherited' : 'override')];
    if (state.base !== undefined && !field.sensitive) metadata.push(dshNativeText('baseValue', { value: this.display(state.base) }));
    if (field.unit) metadata.push(dshNativeText(`unit.${field.unit}`));
    if (field.semantics) metadata.push(dshNativeText(`semantics.${field.semantics}`));
    metadata.push(dshNativeText(state.transaction ? 'help.saveTogether' : 'help.saveScalar'));
    row.infoEl.createDiv({ cls: 'opencodian-dsh-control-hint', text: metadata.join(' · '), attr: { 'data-native-metadata': field.path } });
  }

  private object(container: HTMLElement, value: DshJsonObject, base: DshJsonObject, options: { path: string; transaction: boolean }): void {
    const { path, transaction } = options;
    const children = this.children(path);
    const render = (target: HTMLElement, field: DshNativeConfigurationFieldDescriptor): void => {
      const key = field.path.split('.').at(-1)!;
      if (key === '*' || key === '[]') return;
      this.field(target, value, base, { key, field, transaction });
    };
    for (const field of children.filter(field => !field.advanced)) render(container, field);
    const advanced = children.filter(field => field.advanced);
    if (advanced.length) {
      const details = container.createEl('details', { cls: 'opencodian-dsh-native-details' });
      details.createEl('summary', { text: dshNativeText('advancedFields') });
      const body = details.createDiv({ cls: 'opencodian-dsh-disclosure-body' });
      for (const field of advanced) render(body, field);
    }
  }

  private field(container: HTMLElement, value: DshJsonObject, base: DshJsonObject, options: { key: string; field: DshNativeConfigurationFieldDescriptor; transaction: boolean }): void {
    const { key, field, transaction } = options;
    if (field.type === 'union' && field.alternatives?.length) {
      this.union(container, value, base, { key, field });
      return;
    }
    const composite = ['object', 'array', 'record'].includes(field.type)
      || (field.type === 'union' && this.children(field.path).length > 0);
    if (composite) {
      this.composite(container, value, base, { key, field });
      return;
    }
    const label = this.label(field);
    const row = new Setting(container).setName(label);
    row.settingEl.addClass('opencodian-dsh-form-row', 'opencodian-dsh-native-field');
    row.settingEl.dataset.nativePath = field.path;
    this.describe(row, field, { value: value[key], base: base[key], transaction });
    const set = (next: DshJsonValue | undefined): void => {
      if (next === undefined) delete value[key]; else value[key] = next;
      this.host.change(transaction);
    };
    this.scalar(row, field, value[key], set);
    if (value[key] !== undefined) row.addButton(button => button.setButtonText(dshNativeText('reset')).onClick(() => set(undefined)));
    if (field.sensitive === 'credential-reference' && typeof value[key] === 'string' && value[key]) {
      this.host.credential(container, value[key], field.path.includes('headerCredentialRefs'));
    }
  }

  private scalar(row: Setting, field: DshNativeConfigurationFieldDescriptor, value: DshJsonValue | undefined, set: (value: DshJsonValue | undefined) => void): void {
    const label = this.label(field);
    if (field.type === 'boolean' || field.type === 'enum' || field.enumValues?.length) {
      const select = row.controlEl.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label } });
      select.createEl('option', { attr: { value: '' }, text: dshNativeText('inherit') });
      const choices = field.type === 'boolean' ? ['true', 'false'] : field.enumValues ?? [];
      for (const choice of choices) {
        const key = `settings.dsh.native.option.${choice}` as TranslationKey;
        const translated = t(key);
        select.createEl('option', { attr: { value: choice }, text: translated === key ? choice : translated });
      }
      const selected = value === undefined ? '' : String(value);
      if (selected && !choices.includes(selected)) select.createEl('option', { attr: { value: selected }, text: dshNativeText('savedUnknown', { value: selected }) });
      select.value = selected;
      select.addEventListener('change', () => set(select.value === '' ? undefined : field.type === 'boolean' ? select.value === 'true' : select.value));
      return;
    }
    this.scalarInput(row, field, value, set);
  }

  private scalarInput(row: Setting, field: DshNativeConfigurationFieldDescriptor, value: DshJsonValue | undefined, set: (value: DshJsonValue | undefined) => void): void {
    const input = row.controlEl.createEl('input', {
      type: field.type === 'number' ? 'number' : 'text',
      attr: { 'aria-label': this.label(field), autocomplete: 'off', spellcheck: 'false', placeholder: dshNativeText('inherit') },
    });
    input.value = value === undefined ? '' : this.display(value);
    if (field.minimum !== undefined) input.min = String(field.minimum);
    if (field.maximum !== undefined) input.max = String(field.maximum);
    if (field.type === 'number') input.step = field.integer ? '1' : 'any';
    input.addEventListener('change', () => {
      const raw = input.value.trim();
      let next: DshJsonValue | undefined = raw || undefined;
      if (raw && field.type === 'number') next = Number(raw);
      set(next);
    });
  }

  private union(container: HTMLElement, owner: DshJsonObject, base: DshJsonObject, options: { key: string; field: DshNativeConfigurationFieldDescriptor }): void {
    const { key, field } = options;
    const alternatives = field.alternatives ?? [];
    const holder = container.createDiv({ cls: 'opencodian-dsh-native-union' });
    const render = (): void => {
      holder.empty();
      const row = new Setting(holder).setName(this.label(field));
      this.describe(row, field, { value: owner[key], base: base[key], transaction: true });
      const select = row.controlEl.createEl('select', { cls: 'dropdown', attr: { 'aria-label': this.label(field) } });
      select.createEl('option', { attr: { value: '' }, text: dshNativeText('inherit') });
      alternatives.forEach((alternative, index) => {
        const kind = alternative.literalValue !== undefined ? String(alternative.literalValue)
          : alternative.type === 'enum' ? alternative.enumValues?.join(' / ') ?? 'enum'
            : dshNativeText(`kind.${alternative.type === 'record' ? 'object' : alternative.type}`);
        select.createEl('option', { attr: { value: String(index) }, text: kind });
      });
      const value = owner[key];
      const selected = alternatives.findIndex(alternative => alternative.literalValue !== undefined
        ? value === alternative.literalValue : alternative.type === 'null' ? value === null
          : alternative.type === 'enum' ? alternative.enumValues?.includes(String(value))
            : ['object', 'record'].includes(alternative.type) ? Boolean(dshNativeObject(value)) : typeof value === alternative.type);
      select.value = value === undefined ? '' : selected >= 0 ? String(selected) : '';
      select.addEventListener('change', () => {
        if (!select.value) delete owner[key];
        else {
          const alternative = alternatives[Number(select.value)];
          owner[key] = alternative.literalValue !== undefined ? alternative.literalValue
            : ['object', 'record'].includes(alternative.type) ? {} : alternative.type === 'null' ? null
              : alternative.type === 'enum' ? alternative.enumValues?.[0] ?? '' : alternative.type === 'number'
                ? alternative.minimum ?? (alternative.exclusiveMinimum !== undefined ? alternative.exclusiveMinimum + 1 : 0)
                : alternative.type === 'boolean' ? false : '';
        }
        this.host.change(true); render();
      });
      if (value === undefined || selected < 0) return;
      const alternative = { ...alternatives[selected], path: field.path };
      if (alternative.literalValue !== undefined || alternative.type === 'null') return;
      if (alternative.type === 'object') this.object(holder, owner[key] as DshJsonObject, dshNativeObject(base[key]) ?? {}, { path: field.path, transaction: true });
      else if (alternative.type === 'record') this.record(holder, owner, base, { key, field: alternative, render });
      else this.field(holder, owner, base, { key, field: alternative, transaction: true });
    };
    render();
  }

  private composite(container: HTMLElement, owner: DshJsonObject, inherited: DshJsonObject, options: { key: string; field: DshNativeConfigurationFieldDescriptor }): void {
    const { key, field } = options;
    const details = container.createEl('details', { cls: 'opencodian-dsh-native-details', attr: { 'data-native-path': field.path } });
    details.createEl('summary', { text: this.label(field) });
    const body = details.createDiv({ cls: 'opencodian-dsh-disclosure-body' });
    const render = (): void => {
      body.empty();
      body.createEl('p', { cls: 'setting-item-description', text: this.help(field) });
      body.createEl('p', { cls: 'opencodian-dsh-control-hint', text: dshNativeText(owner[key] === undefined ? 'collectionInherited' : 'collectionDraft') });
      if (field.type === 'array') this.array(body, owner, inherited, { key, field, render });
      else if (field.type === 'record') this.record(body, owner, inherited, { key, field, render });
      else this.nested(body, owner, inherited, { key, field, render });
      if (owner[key] !== undefined) {
        const reset = body.createEl('button', { text: dshNativeText('resetGroup'), attr: { type: 'button' } });
        reset.addEventListener('click', () => { delete owner[key]; this.host.change(true); render(); });
      }
    };
    render();
  }

  private nested(container: HTMLElement, owner: DshJsonObject, inherited: DshJsonObject, options: { key: string; field: DshNativeConfigurationFieldDescriptor; render: () => void }): void {
    const { key, field, render } = options;
    const children = this.children(field.path);
    if (field.type === 'union') {
      const row = new Setting(container).setName(dshNativeText('valueKind'));
      const select = row.controlEl.createEl('select', { cls: 'dropdown', attr: { 'aria-label': dshNativeText('valueKind') } });
      const variants = ['inherit', 'object', ...(field.path.endsWith('reasoningEfforts') ? ['false'] : ['string', 'number', 'boolean', 'null'])];
      for (const kind of variants) select.createEl('option', { attr: { value: kind }, text: dshNativeText(`kind.${kind}`) });
      const current = owner[key];
      select.value = current === undefined ? 'inherit' : current === null ? 'null' : current === false && variants.includes('false') ? 'false' : typeof current;
      select.addEventListener('change', () => {
        const kind = select.value;
        if (kind === 'inherit') delete owner[key];
        else owner[key] = kind === 'object' ? {} : kind === 'null' ? null : kind === 'false' ? false : kind === 'boolean' ? true : kind === 'number' ? 0 : '';
        this.host.change(true); render();
      });
      if (owner[key] !== undefined && !dshNativeObject(owner[key])) {
        if (owner[key] !== null && owner[key] !== false) this.field(container, owner, inherited, { key, field: { ...field, type: typeof owner[key] === 'number' ? 'number' : typeof owner[key] === 'boolean' ? 'boolean' : 'string' }, transaction: true });
        return;
      }
    }
    const object = dshNativeObject(owner[key]);
    if (!object) {
      const add = container.createEl('button', { text: dshNativeText('customize'), attr: { type: 'button' } });
      add.addEventListener('click', () => { owner[key] = {}; this.host.change(true); render(); });
      return;
    }
    const base = dshNativeObject(inherited[key]) ?? {};
    if (children.some(child => child.path.endsWith('.*'))) this.record(container, owner, inherited, { key, field, render });
    else this.object(container, object, base, { path: field.path, transaction: true });
  }

  private record(container: HTMLElement, owner: DshJsonObject, inherited: DshJsonObject, options: { key: string; field: DshNativeConfigurationFieldDescriptor; render: () => void }): void {
    const { key, field, render } = options;
    const entries = dshNativeObject(owner[key]) ?? {};
    const base = dshNativeObject(inherited[key]) ?? {};
    const entryField = this.fields.find(candidate => candidate.path === `${field.path}.*`);
    const holder = container.createDiv({ cls: 'opencodian-dsh-native-entries' });
    for (const [name, entry] of Object.entries(entries)) {
      const item = holder.createDiv({ cls: 'opencodian-dsh-native-entry' });
      const title = new Setting(item).setName(name);
      title.addButton(button => button.setButtonText(dshNativeText('removeEntry')).onClick(() => {
        delete entries[name]; owner[key] = entries; this.host.change(true); render();
      }));
      if (entryField?.type === 'union' && entryField.alternatives?.length) {
        this.union(item, entries, base, { key: name, field: entryField });
      } else if (entryField && ['string', 'number', 'boolean', 'enum', 'union'].includes(entryField.type) && !this.children(entryField.path).length) {
        this.field(item, entries, base, { key: name, field: entryField, transaction: true });
      } else if (dshNativeObject(entry)) {
        this.object(item, entry as DshJsonObject, dshNativeObject(base[name]) ?? {}, { path: `${field.path}.*`, transaction: true });
      } else if (entryField?.type === 'union') {
        this.nested(item, entries, base, { key: name, field: entryField, render });
      }
    }
    const row = new Setting(container).setName(dshNativeText('newEntry'));
    const input = row.controlEl.createEl('input', { type: 'text', attr: { 'aria-label': dshNativeText('entryName'), autocomplete: 'off' } });
    const error = container.createDiv({ cls: 'opencodian-dsh-field-feedback', attr: { role: 'status' } });
    row.addButton(button => button.setButtonText(dshNativeText('addEntry')).onClick(() => {
      const name = input.value.trim();
      if (!name || ['__proto__', 'constructor', 'prototype'].includes(name) || Object.prototype.hasOwnProperty.call(entries, name)) { error.setText(dshNativeText('entryNameInvalid')); return; }
      entries[name] = entryField?.type === 'string' ? '' : entryField?.type === 'number' ? 0 : entryField?.type === 'boolean' ? false : {};
      owner[key] = entries; this.host.change(true); render();
    }));
    const inheritedNames = Object.keys(base).filter(name => !Object.prototype.hasOwnProperty.call(entries, name));
    if (inheritedNames.length) {
      const row = new Setting(container).setName(dshNativeText('inheritedEntries'));
      const select = row.controlEl.createEl('select', { cls: 'dropdown', attr: { 'aria-label': dshNativeText('inheritedEntries') } });
      for (const name of inheritedNames) select.createEl('option', { attr: { value: name }, text: name });
      row.addButton(button => button.setButtonText(dshNativeText('customize')).onClick(() => {
        entries[select.value] = JSON.parse(JSON.stringify(base[select.value])) as DshJsonValue;
        owner[key] = entries; this.host.change(true); render();
      }));
    }
  }

  private array(container: HTMLElement, owner: DshJsonObject, inherited: DshJsonObject, options: { key: string; field: DshNativeConfigurationFieldDescriptor; render: () => void }): void {
    const { key, field, render } = options;
    const values = Array.isArray(owner[key]) ? owner[key] as DshJsonValue[] : [];
    const entryField = this.fields.find(candidate => candidate.path === `${field.path}.[]`);
    values.forEach((entry, index) => {
      const item = container.createDiv({ cls: 'opencodian-dsh-native-entry' });
      const label = dshNativeText('arrayEntry', { index: index + 1 });
      const row = new Setting(item).setName(typeof dshNativeObject(entry)?.id === 'string' ? String(dshNativeObject(entry)?.id) : label);
      row.addButton(button => button.setButtonText(dshNativeText('removeEntry')).onClick(() => { values.splice(index, 1); this.host.change(true); render(); }));
      if (dshNativeObject(entry)) this.object(item, entry as DshJsonObject, {}, { path: `${field.path}.[]`, transaction: true });
      else {
        if (entryField?.enumValues) {
          const select = row.controlEl.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label } });
          for (const option of entryField.enumValues) select.createEl('option', { attr: { value: option }, text: option });
          select.value = String(entry);
          select.addEventListener('change', () => { values[index] = select.value; this.host.change(true); });
        } else {
          const input = row.controlEl.createEl('input', { type: 'text', attr: { 'aria-label': label } });
          input.value = String(entry);
          input.addEventListener('change', () => { values[index] = input.value.trim(); this.host.change(true); });
        }
      }
    });
    const add = container.createEl('button', { text: dshNativeText('addEntry'), attr: { type: 'button' } });
    add.addEventListener('click', () => {
      values.push(entryField?.type === 'object' || this.children(`${field.path}.[]`).length ? {} : entryField?.enumValues?.[0] ?? '');
      owner[key] = values; this.host.change(true); render();
    });
    if (!owner[key] && Array.isArray(inherited[key]) && inherited[key].length) {
      const customize = container.createEl('button', { text: dshNativeText('customizeInherited'), attr: { type: 'button' } });
      customize.addEventListener('click', () => { owner[key] = JSON.parse(JSON.stringify(inherited[key])) as DshJsonValue; this.host.change(true); render(); });
    }
  }

  private display(value: DshJsonValue): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
}

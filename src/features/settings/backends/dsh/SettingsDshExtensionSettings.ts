import { Setting } from 'obsidian';

import type { DshNativeExtensionSettingsOperation } from '../../../../core/agents/backend/dsh/DshNativeControls';
import type { DshJsonObject, DshJsonValue } from '../../../../core/types/dshConfiguration';
import { dshNativeObject, dshNativeText as text } from './SettingsDshNativeFields';
import type { DshNativeSettingsHost } from './SettingsDshNativeWorkspace';

interface ExtensionLeaf { path: string[]; type: string; meta: DshJsonObject; choices?: DshJsonValue[] }
interface ExtensionDraft { revision: number; ops: Map<string, DshNativeExtensionSettingsOperation>; busy: boolean; message?: string }
const DRAFTS = new WeakMap<object, Map<string, ExtensionDraft>>();
const FORBIDDEN = /(?:password|secret|token|credential|authorization|cookie|api.?key)/i;

/** Native public extension schemas use ref IDs, not JSON Schema properties.
 * Only returned scalar leaves are editable. The bridge remains responsible for
 * volatile-field, ownership, revision and secret guards before durable writes. */
export class SettingsDshExtensionSettings {
  private readonly drafts: Map<string, ExtensionDraft>;
  constructor(private readonly host: DshNativeSettingsHost) {
    const owner = host.draftOwner ?? host.getSettings();
    this.drafts = DRAFTS.get(owner) ?? new Map();
    DRAFTS.set(owner, this.drafts);
  }

  render(container: HTMLElement, form: DshJsonObject, capable: boolean, reread: () => Promise<void>): void {
    const ns = typeof form.ns === 'string' ? form.ns : '';
    if (!ns) return;
    const revision = typeof form.revision === 'number' ? form.revision : undefined;
    const writable = capable && form.writable === true && form.persistenceSource === 'managed-profile' && revision !== undefined;
    container.createEl('p', { cls: 'setting-item-description', text: text(writable ? 'extensionSettings.scope' : 'extensionSettings.readOnly') });
    const { leaves, unsupported } = this.leaves(form);
    if (unsupported) container.createEl('p', { cls: 'setting-item-description', text: text('extensionSettings.unsupported', { count: unsupported }) });
    if (!writable || revision === undefined) return;
    let draft = this.drafts.get(ns);
    if (!draft || (!draft.ops.size && !draft.busy && draft.revision !== revision)) {
      draft = { revision, ops: new Map(), busy: false }; this.drafts.set(ns, draft);
    }
    const state = draft;
    const feedback = container.createDiv({ cls: 'opencodian-dsh-field-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    if (state.ops.size) feedback.setText(text('draft'));
    else if (state.message) feedback.setText(text(state.message));
    const value = dshNativeObject(form.value) ?? {};
    const edit = (leaf: ExtensionLeaf, next: DshJsonValue | undefined): void => {
      const path = leaf.path.join('.');
      state.ops.set(path, next === undefined ? { op: 'unset', path: leaf.path } : { op: 'set', path: leaf.path, value: next });
      feedback.setText(text('draft'));
    };
    for (const leaf of leaves) this.renderLeaf(container, leaf, { state, value, edit });
    if (!leaves.length) { feedback.setText(text('extensionSettings.noFields')); return; }
    const actions = new Setting(container).setName(text('extensionSettings.transaction'));
    actions.addButton(button => button.setButtonText(text('saveGroup')).setDisabled(state.busy).onClick(async () => {
      if (state.busy || !state.ops.size) return;
      state.busy = true; button.setDisabled(true);
      try {
        const method = this.host.getAdapter()?.mutateNativeExtensionSettings;
        if (!method) throw new Error('unavailable');
        for (const op of state.ops.values()) {
          if (op.op !== 'set') continue;
          const leaf = leaves.find(candidate => candidate.path.join('.') === op.path.join('.'));
          if (!leaf || !this.valid(leaf, op.value)) { feedback.setText(text('invalid')); return; }
        }
        const adapter = this.host.getAdapter()!;
        const result = await adapter.mutateNativeExtensionSettings!({ ns, expectedRevision: state.revision, ops: [...state.ops.values()] });
        if (typeof result.form?.revision === 'number') state.revision = result.form.revision;
        state.ops.clear();
        state.message = result.application.status === 'verified' && result.readback.status === 'verified' && result.form
          ? 'extensionSettings.saved' : 'extensionSettings.pending';
        feedback.setText(text(state.message));
        state.busy = false;
        await reread();
      } catch (error) {
        feedback.setText(text(error instanceof Error && error.message.includes('SETTINGS_CONFLICT') ? 'conflict' : 'extensionSettings.failed'));
      } finally { state.busy = false; button.setDisabled(false); }
    }));
    actions.addButton(button => button.setButtonText(text('discard')).setDisabled(state.busy).onClick(() => { this.drafts.delete(ns); void reread(); }));
  }

  private renderLeaf(container: HTMLElement, leaf: ExtensionLeaf, context: { state: ExtensionDraft; value: DshJsonObject; edit: (leaf: ExtensionLeaf, value: DshJsonValue | undefined) => void }): void {
    const { state, value, edit } = context;
      const path = leaf.path.join('.');
      const op = state.ops.get(path);
      const current = op ? op.op === 'set' ? op.value : undefined : this.at(value, leaf.path);
      const label = typeof leaf.meta.description === 'string' ? leaf.meta.description : path;
      const row = new Setting(container).setName(label).setDesc(path);
      row.settingEl.dataset.extensionPath = path;
      if (leaf.type === 'boolean' || leaf.choices) {
        const select = row.controlEl.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label } });
        select.disabled = state.busy;
        select.createEl('option', { attr: { value: '' }, text: text('inherit') });
        const choices = leaf.choices ?? [true, false];
        choices.forEach((choice, index) => select.createEl('option', { attr: { value: String(index) }, text: typeof choice === 'boolean' ? text(`option.${choice}`) : String(choice) }));
        const selected = choices.findIndex(choice => choice === current);
        select.value = selected < 0 ? '' : String(selected);
        select.addEventListener('change', () => edit(leaf, select.value === '' ? undefined : choices[Number(select.value)]));
      } else {
        const input = row.controlEl.createEl('input', { type: leaf.type === 'number' ? 'number' : 'text', attr: { 'aria-label': label, autocomplete: 'off' } });
        input.disabled = state.busy; input.value = current === undefined ? '' : String(current);
        if (typeof leaf.meta.min === 'number') input.min = String(leaf.meta.min);
        if (typeof leaf.meta.max === 'number') input.max = String(leaf.meta.max);
        if (leaf.type === 'number') input.step = leaf.meta.step === 1 ? '1' : 'any';
        input.addEventListener('change', () => edit(leaf, input.value === '' ? undefined : leaf.type === 'number' ? Number(input.value) : input.value));
      }
      row.addButton(button => button.setButtonText(text('reset')).setDisabled(state.busy).onClick(() => { edit(leaf, undefined); }));
  }

  private leaves(form: DshJsonObject): { leaves: ExtensionLeaf[]; unsupported: number } {
    const schema = dshNativeObject(form.schema);
    const refs = dshNativeObject(schema?.refs);
    const result: ExtensionLeaf[] = [];
    let unsupported = 0;
    if (!schema || !refs) return { leaves: [], unsupported: 1 };
    const secrets = Array.isArray(form.secrets) ? form.secrets : [];
    const secret = (path: string[]): boolean => path.some(part => FORBIDDEN.test(part)) || secrets.some(entry => {
      const secretPath = typeof entry === 'string' ? entry : Array.isArray(entry) ? entry.join('.')
        : Array.isArray(dshNativeObject(entry)?.path) ? (dshNativeObject(entry)!.path as DshJsonValue[]).join('.') : '';
      return secretPath !== '' && (path.join('.') === secretPath || path.join('.').startsWith(`${secretPath}.`));
    });
    const walk = (id: DshJsonValue | undefined, path: string[], visited: Set<string>): void => {
      if (path.length > 12 || result.length > 128 || id === undefined || visited.has(String(id))) { unsupported += 1; return; }
      const node = dshNativeObject(refs[String(id)]);
      if (!node || secret(path)) return;
      const meta = dshNativeObject(node.meta) ?? {};
      if (meta.secret === true || meta.readonly === true || meta.readOnly === true) return;
      const next = new Set(visited).add(String(id));
      if (node.type === 'object') {
        for (const [name, child] of Object.entries(dshNativeObject(node.dict) ?? {})) {
          if (['__proto__', 'constructor', 'prototype'].includes(name)) continue;
          walk(child, [...path, name], next);
        }
      } else if (['string', 'number', 'boolean'].includes(String(node.type))) {
        result.push({ path, type: String(node.type), meta });
      } else if (node.type === 'union' && Array.isArray(node.list)) {
        const values = node.list.map(id => dshNativeObject(refs[String(id)]));
        if (values.every(value => value?.type === 'const' && ['string', 'number', 'boolean'].includes(typeof value.value))) {
          result.push({ path, type: 'enum', meta, choices: values.map(value => value!.value) });
        } else unsupported += 1;
      } else unsupported += 1;
    };
    walk(schema.uid, [], new Set());
    return { leaves: result, unsupported };
  }

  private at(object: DshJsonObject, path: string[]): DshJsonValue | undefined {
    let value: DshJsonValue | undefined = object;
    for (const key of path) value = dshNativeObject(value)?.[key];
    return value;
  }

  private valid(leaf: ExtensionLeaf, value: DshJsonValue): boolean {
    if (leaf.choices) return leaf.choices.includes(value);
    if (typeof value !== leaf.type) return false;
    if (typeof value === 'number') return Number.isFinite(value)
      && (typeof leaf.meta.min !== 'number' || value >= leaf.meta.min)
      && (typeof leaf.meta.max !== 'number' || value <= leaf.meta.max);
    return true;
  }
}

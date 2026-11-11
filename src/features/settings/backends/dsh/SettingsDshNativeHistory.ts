import { Setting } from 'obsidian';

import { type BackendConfigRecoveryEntry, type BackendConfigRecoveryStore,backendRecoveryIdentity } from '../../../../core/agents/backend/configuration/BackendConfigRecoveryStore';
import { dshNativeConfigurationRevision, normalizeDshNativeConfiguration } from '../../../../core/agents/backend/configuration/DshNativeConfiguration';
import type { DshJsonObject, DshNativeConfiguration, DshNativeConfigurationNamespace } from '../../../../core/types/dshConfiguration';
import { dshNativeObject, dshNativeText as text } from './SettingsDshNativeFields';

export interface DshNativeHistoryRestore {
  value: DshJsonObject;
  expectedRevision: string;
  /** Rechecked inside the shared save queue immediately before the write. */
  current(): boolean;
}
interface HistoryDraft { value: DshJsonObject; raw?: string; busy: boolean; dirty: boolean; message?: string }
interface HistoryHost {
  vaultPath?: string;
  recovery: BackendConfigRecoveryStore;
  saved(): DshNativeConfiguration;
  draft(namespace: DshNativeConfigurationNamespace): HistoryDraft;
  save(namespace: DshNativeConfigurationNamespace, restore: DshNativeHistoryRestore): Promise<boolean>;
  redraw(): void;
}
interface HistoryPreview {
  namespace: DshNativeConfigurationNamespace;
  identity: string;
  entry: BackendConfigRecoveryEntry;
  savedRevision: string;
  /** Non-validating liveness token of the guided draft content. In-progress
   * drafts may hold schema-invalid values, so this read-only view compares
   * content instead of running the write-path validator on the draft. */
  draftToken: string;
  value: DshJsonObject;
  isCurrent(): boolean;
}

/** Secret-free history previews remain read-only until explicit apply. Native
 * settings validation, snapshot CAS, draft identity and view lifetime all guard
 * the final queued persistence operation; this owner never applies runtime state. */
export class SettingsDshNativeHistory {
  constructor(private readonly host: HistoryHost) {}

  render(container: HTMLElement, namespace: DshNativeConfigurationNamespace, isCurrent: () => boolean): void {
    const details = container.createEl('details', { cls: 'opencodian-dsh-native-details' });
    details.createEl('summary', { text: text('history') });
    const body = details.createDiv({ cls: 'opencodian-dsh-disclosure-body' });
    body.createEl('p', { cls: 'setting-item-description', text: text('history.desc') });
    const feedback = body.createDiv({ cls: 'opencodian-dsh-field-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    const identity = backendRecoveryIdentity(this.host.vaultPath, `dsh:native:${namespace}`);
    if (!identity) { feedback.setText(text('historyUnavailable')); return; }
    try {
      const entries = this.host.recovery.list(identity, `dsh-native-${namespace}`);
      if (!entries.length) feedback.setText(text('historyEmpty'));
      for (const entry of entries) {
        const row = new Setting(body).setName(new Date(entry.savedAt).toLocaleString()).setDesc(text('historyEntry', { bytes: entry.bytes }));
        const preview = body.createDiv({ attr: { 'data-native-history-preview': String(entry.index) } });
        row.addButton(button => button.setButtonText(text('restore')).onClick(() => {
          if (!isCurrent() || this.blocked(namespace)) return;
          preview.empty(); feedback.setText('');
          try {
            const value = this.snapshot(namespace, identity, entry);
            const saved = this.host.saved().overrides[namespace];
            const state: HistoryPreview = { namespace, identity, entry, value, isCurrent,
              savedRevision: this.revision(namespace, saved), draftToken: this.draftToken(this.host.draft(namespace).value) };
            this.preview(preview, state, saved);
          } catch { feedback.setText(text('history.previewInvalid')); }
        }));
      }
    } catch { feedback.setText(text('historyUnavailable')); }
  }

  private blocked(namespace: DshNativeConfigurationNamespace): boolean {
    const draft = this.host.draft(namespace);
    return draft.busy || draft.raw !== undefined;
  }

  private revision(namespace: DshNativeConfigurationNamespace, value: unknown): string {
    return dshNativeConfigurationRevision({ version: 1, overrides: value === undefined ? {} : { [namespace]: value } });
  }

  private snapshot(namespace: DshNativeConfigurationNamespace, identity: string, entry: BackendConfigRecoveryEntry): DshJsonObject {
    const snapshot = this.host.recovery.read(identity, `dsh-native-${namespace}`, entry.index);
    if (!snapshot || snapshot.revision !== entry.revision) throw new Error('stale history');
    const normalized = normalizeDshNativeConfiguration(JSON.parse(snapshot.raw));
    if (Object.keys(normalized.overrides).some(key => key !== namespace)) throw new Error('wrong history namespace');
    return JSON.parse(JSON.stringify(normalized.overrides[namespace] ?? {})) as DshJsonObject;
  }

  private current(state: HistoryPreview): boolean {
    if (!state.isCurrent() || this.host.draft(state.namespace).raw !== undefined) return false;
    try {
      this.snapshot(state.namespace, state.identity, state.entry);
      return this.revision(state.namespace, this.host.saved().overrides[state.namespace]) === state.savedRevision
        && this.draftToken(this.host.draft(state.namespace).value) === state.draftToken;
    } catch { return false; }
  }

  /** Draft drift token, not a validation gate: the restored value is always the
   * validated backup snapshot, so an invalid in-progress draft only warns. Any
   * non-JSON draft content fails closed instead of being stringified. */
  private draftToken(value: unknown): string {
    const token = JSON.stringify(value ?? null);
    if (token === undefined) throw new Error('draft is not JSON content');
    return token;
  }

  private preview(container: HTMLElement, state: HistoryPreview, saved: unknown): void {
    container.createEl('h6', { text: text('history.previewTitle') });
    container.createEl('p', { cls: 'setting-item-description', text: text('history.previewDesc') });
    const changes = this.differences(saved ?? {}, state.value);
    container.createEl('pre', { cls: 'opencodian-dsh-native-readback', text: changes.length ? changes.join('\n\n') : text('history.noChanges') });
    if (this.host.draft(state.namespace).dirty) container.createEl('p', { cls: 'setting-item-description', text: text('history.draftWarning') });
    const feedback = container.createDiv({ cls: 'opencodian-dsh-field-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    const actions = container.createDiv({ cls: 'opencodian-dsh-native-actions' });
    const apply = actions.createEl('button', { text: text('history.apply'), attr: { type: 'button' } });
    const cancel = actions.createEl('button', { text: text('history.cancel'), attr: { type: 'button' } });
    let active = true;
    cancel.addEventListener('click', () => { active = false; container.empty(); });
    apply.addEventListener('click', async () => {
      if (!active || !state.isCurrent() || this.blocked(state.namespace)) return;
      if (!this.current(state)) { apply.disabled = true; feedback.setText(text('history.conflict')); return; }
      apply.disabled = true; cancel.disabled = true;
      const success = await this.host.save(state.namespace, { value: state.value, expectedRevision: state.savedRevision, current: () => active && this.current(state) });
      if (!state.isCurrent()) return;
      if (success) { active = false; this.host.redraw(); return; }
      feedback.setText(text(this.host.draft(state.namespace).message ?? 'saveFailed'));
      cancel.disabled = false;
    });
  }

  private differences(before: unknown, after: unknown, path = ''): string[] {
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    const left = dshNativeObject(before);
    const right = dshNativeObject(after);
    if (left && right) return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
      .flatMap(key => this.differences(left[key], right[key], path ? `${path}.${key}` : key));
    const display = (value: unknown): string => value === undefined ? text('inherit') : JSON.stringify(value, null, 2);
    return [`${path}\n${text('history.currentValue')}: ${display(before)}\n${text('history.restoredValue')}: ${display(after)}`];
  }
}

/**
 * Catalog-driven common-fields presenter for the Claude settings workbench.
 *
 * This presenter owns the form controls and their typed parsing/readback. Its
 * host owns the one raw draft, so form edits and the advanced JSON editor can
 * never diverge into separate state stores.
 */
import {
  buildClaudeSettingsCommonFieldEdit,
  CLAUDE_SETTINGS_COMMON_FIELDS,
  type ClaudeCommonFieldMeta,
} from '../../core/agents/backend/ClaudeSettingsCommonFieldModel';
import type { JsoncPathEdit } from '../../core/agents/backend/ProjectResourceSecureWrite';
import { t } from '../../i18n';

export interface ClaudeSettingsCommonFieldsHost {
  getDraft(): string;
  isReadOnly(): boolean;
  applyDraftEdit(edit: JsoncPathEdit): boolean;
  setInlineDiagnostic(message: string): void;
  /** Stable id of the shared diagnostic element for aria-describedby wiring. */
  diagnosticId(): string;
}

/** Renders and synchronizes the nine documented Claude settings fields. */
export class ClaudeSettingsCommonFieldsPresenter {
  private readonly controls = new Map<string, HTMLElement>();
  private root: HTMLElement | null = null;

  constructor(private readonly host: ClaudeSettingsCommonFieldsHost) {}

  render(root: HTMLElement): void {
    this.root = root;
    this.controls.clear();
    while (root.firstChild) root.removeChild(root.firstChild);
    for (const meta of CLAUDE_SETTINGS_COMMON_FIELDS) {
      this.appendControl(root, meta);
    }
    this.refresh();
  }

  /** Reflect the exact raw JSON draft back into all form controls. */
  refresh(): void {
    for (const control of this.controls.values()) {
      this.setDisabled(control, this.host.isReadOnly());
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.host.getDraft());
    } catch {
      return;
    }
    for (const meta of CLAUDE_SETTINGS_COMMON_FIELDS) {
      const control = this.controls.get(meta.id);
      if (!control) continue;
      this.writeControlValue(control, this.serialize(meta, this.readPath(parsed, meta.path)));
      // A repaired raw draft is authoritative. Never leave a field pointing
      // at a diagnostic that no longer describes its current value.
      this.clearControlInvalid(control);
    }
  }

  private appendControl(form: HTMLElement, meta: ClaudeCommonFieldMeta): void {
    const row = document.createElement('div');
    row.className = 'opencodian-claude-configuration-field-row';
    const controlId = `claude-configuration-field-${meta.id.replace(/[^a-z0-9]+/gi, '-')}`;
    const label = document.createElement('label');
    label.className = 'opencodian-claude-configuration-field-label';
    label.htmlFor = controlId;
    label.textContent = t(`settings.claudeCode.configuration.field.${meta.id}` as never);
    row.appendChild(label);

    const control = this.createControl(meta);
    control.id = controlId;
    control.className = 'opencodian-claude-configuration-field';
    control.setAttribute('data-claude-config-field', meta.id);
    control.setAttribute('aria-label', t(`settings.claudeCode.configuration.field.${meta.id}` as never));
    control.addEventListener('change', () => this.applyControlChange(meta, control));
    row.appendChild(control);
    form.appendChild(row);
    this.controls.set(meta.id, control);
  }

  private createControl(meta: ClaudeCommonFieldMeta): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
    if (meta.options || meta.kind === 'boolean') {
      const select = document.createElement('select');
      select.add(new Option(t('settings.claudeCode.configuration.inherit'), ''));
      if (meta.options) {
        for (const option of meta.options) select.add(new Option(option, option));
      } else {
        select.add(new Option('true', 'true'));
        select.add(new Option('false', 'false'));
      }
      return select;
    }
    if (meta.kind === 'string-array' || meta.kind === 'string-record') {
      return document.createElement('textarea');
    }
    const input = document.createElement('input');
    input.type = meta.kind === 'number' ? 'number' : 'text';
    if (meta.min !== undefined) input.min = String(meta.min);
    return input;
  }

  private applyControlChange(meta: ClaudeCommonFieldMeta, control: HTMLElement): void {
    const value = this.parse(meta, this.readControlValue(control));
    if (value === undefined) {
      this.markControlInvalid(control);
      this.host.setInlineDiagnostic(t('settings.claudeCode.configuration.invalidField'));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.host.getDraft() || '{}');
    } catch {
      return;
    }
    const edit = buildClaudeSettingsCommonFieldEdit(parsed, meta.id, value);
    if (!edit.ok) {
      this.markControlInvalid(control);
      this.host.setInlineDiagnostic(t('settings.claudeCode.configuration.invalidField'));
      return;
    }
    this.clearControlInvalid(control);
    this.host.applyDraftEdit(edit.edit);
  }

  private markControlInvalid(control: HTMLElement): void {
    control.setAttribute('aria-invalid', 'true');
    const diagnosticId = this.host.diagnosticId();
    if (diagnosticId) control.setAttribute('aria-describedby', diagnosticId);
  }

  private clearControlInvalid(control: HTMLElement): void {
    control.removeAttribute('aria-invalid');
    control.removeAttribute('aria-describedby');
  }

  private parse(meta: ClaudeCommonFieldMeta, raw: string): unknown {
    if (raw.trim() === '') return null;
    if (meta.kind === 'string') return raw;
    if (meta.kind === 'number') {
      const number = Number(raw);
      return Number.isFinite(number) && (meta.min === undefined || number >= meta.min) ? number : undefined;
    }
    if (meta.kind === 'boolean') return raw === 'true' ? true : raw === 'false' ? false : undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (meta.kind === 'string-array') {
        return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string') ? parsed : undefined;
      }
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        && Object.values(parsed).every((entry) => typeof entry === 'string') ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private serialize(meta: ClaudeCommonFieldMeta, value: unknown): string {
    if (value === null || value === undefined) return '';
    if (meta.kind === 'boolean') return value ? 'true' : 'false';
    if (meta.kind === 'string' || meta.kind === 'number') return String(value);
    try {
      return meta.kind === 'string-array' && !Array.isArray(value) ? '' : JSON.stringify(value);
    } catch {
      return '';
    }
  }

  private readPath(value: unknown, path: readonly (string | number)[]): unknown {
    let cursor = value;
    for (const key of path) {
      if (cursor === null || typeof cursor !== 'object') return undefined;
      cursor = (cursor as Record<string, unknown>)[key as string];
    }
    return cursor;
  }

  private readControlValue(control: HTMLElement): string {
    if (control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement || control instanceof HTMLInputElement) {
      return control.value;
    }
    return '';
  }

  private writeControlValue(control: HTMLElement, value: string): void {
    if (control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement || control instanceof HTMLInputElement) {
      control.value = value;
    }
  }

  private setDisabled(control: HTMLElement, disabled: boolean): void {
    if (control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement || control instanceof HTMLInputElement) {
      control.disabled = disabled;
    }
  }
}

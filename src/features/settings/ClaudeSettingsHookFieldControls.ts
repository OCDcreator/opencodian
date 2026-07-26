/**
 * Handler-field controls for the Claude settings hooks builder.
 *
 * Owns the per-field label/input rendering, typed value parsing, and the
 * type-switch replacement for one hook handler. All mutations still flow back
 * through the builder's single `applyEdit` path, so the advanced JSON draft
 * and the structured form can never diverge.
 */
import { buildClaudeHookHandlerEdit, inspectClaudeSettingsHooks } from '../../core/agents/backend/ClaudeSettingsHookModel';
import {
  CLAUDE_HOOK_COMMON_FIELDS,
  CLAUDE_HOOK_HANDLER_TYPES,
  CLAUDE_HOOK_TYPE_FIELDS,
} from '../../core/agents/backend/ClaudeSettingsHookSchema';
import type { JsoncPathEdit } from '../../core/agents/backend/ProjectResourceSecureWrite';
import { t } from '../../i18n';

export type ClaudeHookEditResult = { ok: true; edit: JsoncPathEdit } | { ok: false; diagnostics: readonly { message: string }[] };
export type ClaudeHookHandlerView = ReturnType<typeof inspectClaudeSettingsHooks>['events'][number]['groups'][number]['hooks'][number];
export type ClaudeHookField = (typeof CLAUDE_HOOK_COMMON_FIELDS)[number] | (typeof CLAUDE_HOOK_TYPE_FIELDS)[keyof typeof CLAUDE_HOOK_TYPE_FIELDS][number];

export interface ClaudeHookHandlerFieldContext {
  parsed: unknown;
  event: string;
  groupIndex: number;
  handler: ClaudeHookHandlerView;
  disabled: boolean;
}

export interface ClaudeSettingsHookFieldControlsHost {
  applyEdit(result: ClaudeHookEditResult, refocus: readonly string[]): void;
  setInlineDiagnostic(message: string): void;
  /** Stable id of the shared diagnostic element for aria-describedby wiring. */
  diagnosticId(): string;
}

/** Builds the minimal valid handler for a schema type; unknown types fall back to command. */
export function defaultClaudeHookHandler(type: string): Record<string, unknown> {
  if (type === 'http') return { type, url: '' };
  if (type === 'mcp_tool') return { type, server: '', tool: '' };
  if (type === 'prompt' || type === 'agent') return { type, prompt: '' };
  return { type: 'command', command: '' };
}

/** Renders and validates the known handler fields of one hook handler row. */
export class ClaudeSettingsHookFieldControls {
  constructor(private readonly host: ClaudeSettingsHookFieldControlsHost) {}

  renderField(root: HTMLElement, context: ClaudeHookHandlerFieldContext, field: ClaudeHookField): void {
    const { event, groupIndex, handler, disabled } = context;
    const id = `claude-hook-field-${event}-${groupIndex}-${handler.index}-${field.name}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = field.name;
    root.appendChild(label);
    const input =
      field.name === 'type' || (field.type === 'boolean' && field.requirement === 'optional')
        ? document.createElement('select')
        : document.createElement('input');
    input.id = id;
    input.disabled = disabled;
    input.setAttribute(
      'aria-label',
      field.name === 'type'
        ? t('settings.claudeCode.configuration.hooks.handlerTypeFor', { event, group: groupIndex + 1, index: handler.index + 1 })
        : `${event}:${groupIndex + 1}:${handler.index + 1} ${handler.type ?? ''} ${field.name}`,
    );
    input.setAttribute('data-claude-hooks-handler-field', `${event}:${groupIndex}:${handler.index}:${field.name}`);
    this.initializeField(input, field, handler.raw[field.name], handler.type ?? '');
    input.addEventListener('change', () => this.applyFieldChange(input, context, field));
    root.appendChild(input);
  }

  private initializeField(input: HTMLInputElement | HTMLSelectElement, field: ClaudeHookField, rawValue: unknown, handlerType: string): void {
    if (input instanceof HTMLSelectElement) {
      if (field.name === 'type') {
        for (const type of CLAUDE_HOOK_HANDLER_TYPES) input.add(new Option(type, type));
        input.value = typeof rawValue === 'string' ? rawValue : handlerType;
      } else if (field.type === 'boolean') {
        input.add(new Option(t('settings.claudeCode.configuration.inherit'), ''));
        input.add(new Option('true', 'true'));
        input.add(new Option('false', 'false'));
        input.value = rawValue === true ? 'true' : rawValue === false ? 'false' : '';
      }
      return;
    }
    input.type = field.type === 'number' ? 'number' : field.type === 'boolean' ? 'checkbox' : 'text';
    if (input.type === 'checkbox') input.checked = rawValue === true;
    else if (field.type === 'string-array' || field.type === 'string-record' || field.type === 'json-object')
      input.value = rawValue === undefined ? '' : JSON.stringify(rawValue);
    else input.value = rawValue === undefined ? '' : String(rawValue);
  }

  private applyFieldChange(input: HTMLInputElement | HTMLSelectElement, context: ClaudeHookHandlerFieldContext, field: ClaudeHookField): void {
    const { parsed, event, groupIndex, handler } = context;
    if (field.name === 'type' && input instanceof HTMLSelectElement) {
      this.switchHandlerType({
        parsed,
        event,
        groupIndex,
        handlerIndex: handler.index,
        current: handler.raw,
        type: input.value,
      });
      return;
    }
    const value = this.readFieldValue(input, field.type, field.requirement === 'optional');
    if (value === null) {
      this.markControlInvalid(input);
      this.host.setInlineDiagnostic(t('settings.claudeCode.configuration.invalidField'));
      return;
    }
    this.host.applyEdit(
      buildClaudeHookHandlerEdit(parsed, event, groupIndex, {
        type: 'update-field',
        index: handler.index,
        field: field.name,
        value,
      }),
      [`[data-claude-hooks-handler-field="${event}:${groupIndex}:${handler.index}:${field.name}"]`],
    );
  }

  private switchHandlerType(args: {
    parsed: unknown;
    event: string;
    groupIndex: number;
    handlerIndex: number;
    current: Readonly<Record<string, unknown>>;
    type: string;
  }): void {
    if (!CLAUDE_HOOK_HANDLER_TYPES.includes(args.type as (typeof CLAUDE_HOOK_HANDLER_TYPES)[number])) {
      this.host.setInlineDiagnostic(t('settings.claudeCode.configuration.invalidField'));
      return;
    }
    const replacement = {
      ...args.current,
      ...defaultClaudeHookHandler(args.type),
      type: args.type,
    };
    this.host.applyEdit({
      ok: true,
      edit: {
        path: ['hooks', args.event, args.groupIndex, 'hooks', args.handlerIndex],
        value: replacement,
      },
    }, [`[data-claude-hooks-handler-field="${args.event}:${args.groupIndex}:${args.handlerIndex}:type"]`]);
  }

  private readFieldValue(input: HTMLInputElement | HTMLSelectElement, type: string, allowRemove: boolean): unknown {
    if (input instanceof HTMLSelectElement && type === 'boolean') {
      return this.readBooleanSelectValue(input, allowRemove);
    }
    if (input instanceof HTMLSelectElement) return input.value;
    if (type === 'boolean') return input.checked;
    if (input.value === '') return allowRemove ? undefined : null;
    if (type === 'number') {
      const value = Number(input.value);
      return Number.isFinite(value) ? value : null;
    }
    if (type === 'string') return input.value;
    try {
      const value: unknown = JSON.parse(input.value);
      if (type === 'string-array') return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null;
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  }

  private readBooleanSelectValue(input: HTMLSelectElement, allowRemove: boolean): boolean | undefined | null {
    if (input.value === '') return allowRemove ? undefined : null;
    if (input.value === 'true') return true;
    return input.value === 'false' ? false : null;
  }

  private markControlInvalid(control: HTMLElement): void {
    control.setAttribute('aria-invalid', 'true');
    const diagnosticId = this.host.diagnosticId();
    if (diagnosticId) control.setAttribute('aria-describedby', diagnosticId);
  }
}

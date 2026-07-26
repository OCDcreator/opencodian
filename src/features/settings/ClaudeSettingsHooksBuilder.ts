/**
 * Native-DOM builder for the Claude CLI settings-JSON hooks schema.
 *
 * It is deliberately a projection of its host's raw strict-JSON draft. The
 * builder never stores hook data itself, which keeps unknown fields and the
 * advanced editor's exact source authoritative.
 */
import { buildClaudeHookGroupEdit, buildClaudeHookHandlerEdit, inspectClaudeSettingsHooks } from '../../core/agents/backend/ClaudeSettingsHookModel';
import {
  CLAUDE_HOOK_COMMON_FIELDS,
  CLAUDE_HOOK_EVENT_CATALOG,
  CLAUDE_HOOK_EVENTS,
  CLAUDE_HOOK_HANDLER_TYPES,
  CLAUDE_HOOK_SCHEMA_EVIDENCE,
  CLAUDE_HOOK_TYPE_FIELDS,
} from '../../core/agents/backend/ClaudeSettingsHookSchema';
import type { JsoncPathEdit } from '../../core/agents/backend/ProjectResourceSecureWrite';
import { t } from '../../i18n';

export interface ClaudeSettingsHooksBuilderHost {
  getDraft(): string;
  isDraftValid(): boolean;
  isReadOnly(): boolean;
  applyDraftEdit(edit: JsoncPathEdit): boolean;
  setInlineDiagnostic(message: string): void;
}

type HookEditResult = { ok: true; edit: JsoncPathEdit } | { ok: false; diagnostics: readonly { message: string }[] };

type HookEventView = ReturnType<typeof inspectClaudeSettingsHooks>['events'][number];
type HookGroupView = HookEventView['groups'][number];
type HookHandlerView = HookGroupView['hooks'][number];
type ClaudeHookField = (typeof CLAUDE_HOOK_COMMON_FIELDS)[number] | (typeof CLAUDE_HOOK_TYPE_FIELDS)[keyof typeof CLAUDE_HOOK_TYPE_FIELDS][number];

interface HookGroupRenderContext {
  parsed: unknown;
  event: string;
  group: HookGroupView;
  supportsMatcher: boolean;
  disabled: boolean;
  groupCount: number;
}

interface HookHandlerRenderContext {
  parsed: unknown;
  event: string;
  groupIndex: number;
  handler: HookHandlerView;
  disabled: boolean;
  handlerCount: number;
}

/** Owns the visible event/group/handler editor and its schema-safe mutations. */
export class ClaudeSettingsHooksBuilder {
  private root: HTMLElement | null = null;

  constructor(private readonly host: ClaudeSettingsHooksBuilderHost) {}

  render(root: HTMLElement): void {
    this.root = root;
    while (root.firstChild) root.removeChild(root.firstChild);

    const title = document.createElement('h4');
    title.textContent = t('settings.claudeCode.configuration.hooks');
    root.appendChild(title);
    this.appendText(
      root,
      'opencodian-claude-configuration-hooks-evidence',
      `${t('settings.claudeCode.configuration.hooksEvidence')}: CLI ${CLAUDE_HOOK_SCHEMA_EVIDENCE.cliVersion}; SDK ${CLAUDE_HOOK_SCHEMA_EVIDENCE.sdkVersion}; bundled ${CLAUDE_HOOK_SCHEMA_EVIDENCE.sdkBundledClaudeCodeVersion}. ${t('settings.claudeCode.configuration.documentOrder')}`,
      { name: 'data-claude-hooks-evidence', value: 'true' },
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.host.getDraft() || '{}');
    } catch {
      return;
    }
    const disabled = !this.host.isDraftValid() || this.host.isReadOnly();
    const view = inspectClaudeSettingsHooks(parsed);
    this.renderAddGroup(root, parsed, disabled);
    for (const eventView of view.events) {
      this.renderEvent(root, parsed, eventView, disabled);
    }
  }

  refresh(): void {
    if (this.root) this.render(this.root);
  }

  private renderAddGroup(root: HTMLElement, parsed: unknown, disabled: boolean): void {
    const actions = document.createElement('div');
    actions.className = 'opencodian-claude-configuration-hooks-actions';
    const eventSelect = document.createElement('select');
    eventSelect.setAttribute('data-claude-hooks-event-select', 'true');
    eventSelect.setAttribute('aria-label', t('settings.claudeCode.configuration.hookEvent'));
    for (const event of CLAUDE_HOOK_EVENTS) eventSelect.add(new Option(event, event));
    eventSelect.disabled = disabled;
    actions.appendChild(eventSelect);
    this.appendAction(actions, {
      text: t('settings.claudeCode.configuration.addGroup'),
      dataName: 'data-claude-hooks-group-add',
      disabled,
      action: () => {
        const event = eventSelect.value;
        const catalog = CLAUDE_HOOK_EVENT_CATALOG[event as keyof typeof CLAUDE_HOOK_EVENT_CATALOG];
        const matcher = catalog?.supportsMatcher ? '' : undefined;
        this.applyEdit(
          buildClaudeHookGroupEdit(parsed, event, {
            type: 'add',
            group: { ...(matcher === undefined ? {} : { matcher }), hooks: [] },
          }),
        );
      },
    });
    root.appendChild(actions);
  }

  private renderEvent(root: HTMLElement, parsed: unknown, eventView: HookEventView, disabled: boolean): void {
    const event = document.createElement('div');
    event.className = 'opencodian-claude-configuration-hook-event';
    event.setAttribute('data-claude-hooks-event', eventView.event);
    this.appendText(event, 'opencodian-claude-configuration-hook-event-name', eventView.event);
    if (!eventView.supported) {
      const raw = document.createElement('pre');
      raw.setAttribute('data-claude-hooks-unknown-event', eventView.event);
      raw.textContent = JSON.stringify(
        eventView.groups.map((group) => group.raw),
        null,
        2,
      );
      event.appendChild(raw);
      root.appendChild(event);
      return;
    }
    const matcherMeta = CLAUDE_HOOK_EVENT_CATALOG[eventView.event as keyof typeof CLAUDE_HOOK_EVENT_CATALOG];
    for (const group of eventView.groups) {
      this.renderGroup(event, {
        parsed,
        event: eventView.event,
        group,
        supportsMatcher: matcherMeta.supportsMatcher,
        disabled,
        groupCount: eventView.groups.length,
      });
    }
    root.appendChild(event);
  }

  private renderGroup(eventRoot: HTMLElement, context: HookGroupRenderContext): void {
    const { event, group, supportsMatcher } = context;
    const root = document.createElement('div');
    root.className = 'opencodian-claude-configuration-hook-group';
    root.setAttribute('data-claude-hooks-group', `${event}:${group.index}`);
    if (supportsMatcher) this.renderMatcher(root, context);
    this.renderGroupActions(root, context);
    this.renderNewHandler(root, context);
    for (const handler of group.hooks) {
      this.renderHandler(root, {
        parsed: context.parsed,
        event,
        groupIndex: group.index,
        handler,
        disabled: context.disabled,
        handlerCount: group.hooks.length,
      });
    }
    eventRoot.appendChild(root);
  }

  private renderMatcher(root: HTMLElement, context: HookGroupRenderContext): void {
    const { parsed, event, group, disabled } = context;
    const groupIndex = group.index;
    const id = `claude-hook-matcher-${event}-${groupIndex}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = t('settings.claudeCode.configuration.matcher');
    root.appendChild(label);
    const input = document.createElement('input');
    input.id = id;
    input.type = 'text';
    input.value = group.matcher ?? '';
    input.disabled = disabled;
    input.setAttribute('aria-label', `${event} ${t('settings.claudeCode.configuration.matcher')}`);
    input.setAttribute('data-claude-hooks-matcher', `${event}:${groupIndex}`);
    input.addEventListener('change', () =>
      this.applyEdit(
        buildClaudeHookGroupEdit(parsed, event, {
          type: 'update-matcher',
          index: groupIndex,
          matcher: input.value.trim() === '' ? null : input.value,
        }),
      ),
    );
    root.appendChild(input);
  }

  private renderGroupActions(root: HTMLElement, context: HookGroupRenderContext): void {
    const { parsed, event, group, disabled, groupCount } = context;
    const groupIndex = group.index;
    this.appendAction(root, {
      text: t('settings.claudeCode.configuration.delete'),
      dataName: 'data-claude-hooks-group-delete',
      disabled,
      action: () =>
        this.applyEdit(
          buildClaudeHookGroupEdit(parsed, event, {
            type: 'delete',
            index: groupIndex,
          }),
        ),
    });
    this.appendAction(root, {
      text: '↑',
      label: t('settings.claudeCode.configuration.moveUp'),
      dataName: 'data-claude-hooks-group-move-up',
      disabled: disabled || groupIndex === 0,
      action: () =>
        this.applyEdit(
          buildClaudeHookGroupEdit(parsed, event, {
            type: 'move',
            fromIndex: groupIndex,
            toIndex: groupIndex - 1,
          }),
        ),
    });
    this.appendAction(root, {
      text: '↓',
      label: t('settings.claudeCode.configuration.moveDown'),
      dataName: 'data-claude-hooks-group-move-down',
      disabled: disabled || groupIndex >= groupCount - 1,
      action: () =>
        this.applyEdit(
          buildClaudeHookGroupEdit(parsed, event, {
            type: 'move',
            fromIndex: groupIndex,
            toIndex: groupIndex + 1,
          }),
        ),
    });
  }

  private renderNewHandler(root: HTMLElement, context: HookGroupRenderContext): void {
    const { parsed, event, group, disabled } = context;
    const groupIndex = group.index;
    const id = `claude-hook-new-type-${event}-${groupIndex}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = t('settings.claudeCode.configuration.handlerType');
    root.appendChild(label);
    const select = document.createElement('select');
    select.id = id;
    select.disabled = disabled;
    select.setAttribute('aria-label', t('settings.claudeCode.configuration.handlerType'));
    select.setAttribute('data-claude-hooks-handler-type', `${event}:${groupIndex}`);
    for (const type of CLAUDE_HOOK_HANDLER_TYPES) select.add(new Option(type, type));
    root.appendChild(select);
    this.appendAction(root, {
      text: t('settings.claudeCode.configuration.addHandler'),
      dataName: 'data-claude-hooks-handler-add',
      disabled,
      action: () =>
        this.applyEdit(
          buildClaudeHookHandlerEdit(parsed, event, groupIndex, {
            type: 'add',
            handler: this.defaultHandler(select.value),
          }),
        ),
    });
  }

  private renderHandler(groupRoot: HTMLElement, context: HookHandlerRenderContext): void {
    const { event, groupIndex, handler } = context;
    const root = document.createElement('div');
    root.className = 'opencodian-claude-configuration-hook-handler';
    root.setAttribute('data-claude-hooks-handler', `${event}:${groupIndex}:${handler.index}`);
    if (!handler.supported || handler.type === null) {
      const raw = document.createElement('pre');
      raw.setAttribute('data-claude-hooks-unknown-handler', `${event}:${groupIndex}:${handler.index}`);
      raw.textContent = JSON.stringify(handler.raw, null, 2);
      root.appendChild(raw);
    } else {
      const fields = [...CLAUDE_HOOK_COMMON_FIELDS, ...CLAUDE_HOOK_TYPE_FIELDS[handler.type as keyof typeof CLAUDE_HOOK_TYPE_FIELDS]];
      for (const field of fields) this.renderHandlerField(root, context, field);
    }
    this.renderHandlerActions(root, context);
    groupRoot.appendChild(root);
  }

  private renderHandlerField(root: HTMLElement, context: HookHandlerRenderContext, field: ClaudeHookField): void {
    const { parsed, event, groupIndex, handler, disabled } = context;
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
    input.setAttribute('aria-label', `${handler.type} ${field.name}`);
    input.setAttribute('data-claude-hooks-handler-field', `${event}:${groupIndex}:${handler.index}:${field.name}`);
    this.initializeHandlerField(input, field, handler.raw[field.name], handler.type ?? '');
    input.addEventListener('change', () =>
      this.applyHandlerFieldChange({
        input,
        parsed,
        event,
        groupIndex,
        handler,
        field,
      }),
    );
    root.appendChild(input);
  }

  private initializeHandlerField(input: HTMLInputElement | HTMLSelectElement, field: ClaudeHookField, rawValue: unknown, handlerType: string): void {
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

  private applyHandlerFieldChange(args: {
    input: HTMLInputElement | HTMLSelectElement;
    parsed: unknown;
    event: string;
    groupIndex: number;
    handler: HookHandlerView;
    field: ClaudeHookField;
  }): void {
    const { input, parsed, event, groupIndex, handler, field } = args;
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
      this.host.setInlineDiagnostic(t('settings.claudeCode.configuration.invalidField'));
      return;
    }
    this.applyEdit(
      buildClaudeHookHandlerEdit(parsed, event, groupIndex, {
        type: 'update-field',
        index: handler.index,
        field: field.name,
        value,
      }),
    );
  }

  private renderHandlerActions(root: HTMLElement, context: HookHandlerRenderContext): void {
    const { parsed, event, groupIndex, handler, disabled, handlerCount } = context;
    const handlerIndex = handler.index;
    this.appendAction(root, {
      text: t('settings.claudeCode.configuration.delete'),
      dataName: 'data-claude-hooks-handler-delete',
      disabled,
      action: () =>
        this.applyEdit(
          buildClaudeHookHandlerEdit(parsed, event, groupIndex, {
            type: 'delete',
            index: handlerIndex,
          }),
        ),
    });
    this.appendAction(root, {
      text: '↑',
      label: t('settings.claudeCode.configuration.moveUp'),
      dataName: 'data-claude-hooks-handler-move-up',
      disabled: disabled || handlerIndex === 0,
      action: () =>
        this.applyEdit(
          buildClaudeHookHandlerEdit(parsed, event, groupIndex, {
            type: 'move',
            fromIndex: handlerIndex,
            toIndex: handlerIndex - 1,
          }),
        ),
    });
    this.appendAction(root, {
      text: '↓',
      label: t('settings.claudeCode.configuration.moveDown'),
      dataName: 'data-claude-hooks-handler-move-down',
      disabled: disabled || handlerIndex >= handlerCount - 1,
      action: () =>
        this.applyEdit(
          buildClaudeHookHandlerEdit(parsed, event, groupIndex, {
            type: 'move',
            fromIndex: handlerIndex,
            toIndex: handlerIndex + 1,
          }),
        ),
    });
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
      ...this.defaultHandler(args.type),
      type: args.type,
    };
    this.applyEdit({
      ok: true,
      edit: {
        path: ['hooks', args.event, args.groupIndex, 'hooks', args.handlerIndex],
        value: replacement,
      },
    });
  }

  private defaultHandler(type: string): Record<string, unknown> {
    if (type === 'http') return { type, url: '' };
    if (type === 'mcp_tool') return { type, server: '', tool: '' };
    if (type === 'prompt' || type === 'agent') return { type, prompt: '' };
    return { type: 'command', command: '' };
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

  private applyEdit(result: HookEditResult): void {
    if (!result.ok) {
      this.host.setInlineDiagnostic(result.diagnostics.map((entry) => entry.message).join('\n'));
      return;
    }
    if (!this.host.applyDraftEdit(result.edit)) {
      this.host.setInlineDiagnostic(t('settings.claudeCode.configuration.invalidField'));
    }
  }

  private appendAction(
    parent: HTMLElement,
    options: {
      text: string;
      dataName: string;
      disabled: boolean;
      action: () => void;
      label?: string;
    },
  ): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = options.text;
    button.disabled = options.disabled;
    button.title = options.label ?? options.text;
    button.setAttribute('aria-label', options.label ?? options.text);
    button.setAttribute(options.dataName, 'true');
    button.addEventListener('click', options.action);
    parent.appendChild(button);
  }

  private appendText(parent: HTMLElement, className: string, text: string, attr?: { name: string; value: string }): HTMLElement {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = text;
    if (attr) node.setAttribute(attr.name, attr.value);
    parent.appendChild(node);
    return node;
  }
}

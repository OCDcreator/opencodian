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
import { appendText } from './ClaudeSettingsContextSourcesPresenter';
import {
  type ClaudeHookEditResult,
  type ClaudeHookHandlerView,
  ClaudeSettingsHookFieldControls,
  defaultClaudeHookHandler,
} from './ClaudeSettingsHookFieldControls';

export interface ClaudeSettingsHooksBuilderHost {
  getDraft(): string;
  isDraftValid(): boolean;
  isReadOnly(): boolean;
  applyDraftEdit(edit: JsoncPathEdit): boolean;
  setInlineDiagnostic(message: string): void;
  /** Stable id of the shared diagnostic element for aria-describedby wiring. */
  diagnosticId(): string;
}

type HookEventView = ReturnType<typeof inspectClaudeSettingsHooks>['events'][number];
type HookGroupView = HookEventView['groups'][number];

/** Long catalogs get an accessible filter; short ones stay a plain select. */
const HOOK_EVENT_FILTER_THRESHOLD = 6;

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
  handler: ClaudeHookHandlerView;
  disabled: boolean;
  handlerCount: number;
}

/** Owns the visible event/group/handler editor and its schema-safe mutations. */
export class ClaudeSettingsHooksBuilder {
  private root: HTMLElement | null = null;
  private readonly fieldControls: ClaudeSettingsHookFieldControls;

  constructor(private readonly host: ClaudeSettingsHooksBuilderHost) {
    this.fieldControls = new ClaudeSettingsHookFieldControls({
      applyEdit: (result, refocus) => this.applyEdit(result, refocus),
      setInlineDiagnostic: (message) => this.host.setInlineDiagnostic(message),
      diagnosticId: () => this.host.diagnosticId(),
    });
  }

  render(root: HTMLElement): void {
    this.root = root;
    while (root.firstChild) root.removeChild(root.firstChild);

    const title = document.createElement('h4');
    title.textContent = t('settings.claudeCode.configuration.hooks');
    root.appendChild(title);
    appendText(
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
    if (CLAUDE_HOOK_EVENTS.length > HOOK_EVENT_FILTER_THRESHOLD) {
      const filter = document.createElement('input');
      filter.type = 'search';
      filter.className = 'opencodian-claude-configuration-hooks-event-filter';
      filter.setAttribute('data-claude-hooks-event-filter', 'true');
      filter.setAttribute('aria-label', t('settings.claudeCode.configuration.hooks.filterEvents'));
      filter.setAttribute('placeholder', t('settings.claudeCode.configuration.hooks.filterEvents'));
      filter.disabled = disabled;
      filter.addEventListener('input', () => this.filterEventOptions(eventSelect, filter.value));
      actions.appendChild(filter);
    }
    actions.appendChild(eventSelect);
    this.appendAction(actions, {
      text: t('settings.claudeCode.configuration.addGroup'),
      dataName: 'data-claude-hooks-group-add',
      disabled,
      action: () => {
        const event = eventSelect.value;
        const catalog = CLAUDE_HOOK_EVENT_CATALOG[event as keyof typeof CLAUDE_HOOK_EVENT_CATALOG];
        if (!catalog) return;
        const matcher = catalog.supportsMatcher ? '' : undefined;
        const newIndex = inspectClaudeSettingsHooks(parsed).events.find((entry) => entry.event === event)?.groups.length ?? 0;
        this.applyEdit(
          buildClaudeHookGroupEdit(parsed, event, {
            type: 'add',
            group: { ...(matcher === undefined ? {} : { matcher }), hooks: [] },
          }),
          [`[data-claude-hooks-group="${event}:${newIndex}"]`],
        );
      },
    });
    root.appendChild(actions);
  }

  /** Narrows the catalog select to matching events; an empty match gets one disabled marker option. */
  private filterEventOptions(eventSelect: HTMLSelectElement, query: string): void {
    const previous = eventSelect.value;
    const needle = query.trim().toLowerCase();
    const matches = CLAUDE_HOOK_EVENTS.filter((event) => needle === '' || event.toLowerCase().includes(needle));
    while (eventSelect.firstChild) eventSelect.removeChild(eventSelect.firstChild);
    if (matches.length === 0) {
      const none = new Option(t('settings.claudeCode.configuration.hooks.noMatchingEvents'), '');
      none.disabled = true;
      eventSelect.add(none);
      return;
    }
    for (const event of matches) eventSelect.add(new Option(event, event));
    eventSelect.value = matches.includes(previous as (typeof matches)[number]) ? previous : matches[0];
  }

  private renderEvent(root: HTMLElement, parsed: unknown, eventView: HookEventView, disabled: boolean): void {
    const event = document.createElement('div');
    event.className = 'opencodian-claude-configuration-hook-event';
    event.setAttribute('data-claude-hooks-event', eventView.event);
    appendText(event, 'opencodian-claude-configuration-hook-event-name', eventView.event);
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
    root.setAttribute('aria-label', t('settings.claudeCode.configuration.hooks.groupLabel', { event, index: group.index + 1 }));
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
    input.setAttribute('aria-label', t('settings.claudeCode.configuration.hooks.matcherFor', { event, index: groupIndex + 1 }));
    input.setAttribute('data-claude-hooks-matcher', `${event}:${groupIndex}`);
    input.addEventListener('change', () =>
      this.applyEdit(
        buildClaudeHookGroupEdit(parsed, event, {
          type: 'update-matcher',
          index: groupIndex,
          matcher: input.value.trim() === '' ? null : input.value,
        }),
        [`[data-claude-hooks-matcher="${event}:${groupIndex}"]`],
      ),
    );
    root.appendChild(input);
  }

  private renderGroupActions(root: HTMLElement, context: HookGroupRenderContext): void {
    const { parsed, event, group, disabled, groupCount } = context;
    const groupIndex = group.index;
    const humanIndex = groupIndex + 1;
    this.appendAction(root, {
      text: t('settings.claudeCode.configuration.delete'),
      label: t('settings.claudeCode.configuration.hooks.deleteGroup', { event, index: humanIndex }),
      dataName: 'data-claude-hooks-group-delete',
      disabled,
      action: () =>
        this.applyEdit(
          buildClaudeHookGroupEdit(parsed, event, {
            type: 'delete',
            index: groupIndex,
          }),
          [
            `[data-claude-hooks-group="${event}:${groupIndex}"]`,
            `[data-claude-hooks-group="${event}:${groupIndex - 1}"]`,
            '[data-claude-hooks-group-add]',
          ],
        ),
    });
    this.appendAction(root, {
      text: '↑',
      label: t('settings.claudeCode.configuration.hooks.moveGroupUp', { event, index: humanIndex }),
      dataName: 'data-claude-hooks-group-move-up',
      disabled: disabled || groupIndex === 0,
      action: () =>
        this.applyEdit(
          buildClaudeHookGroupEdit(parsed, event, {
            type: 'move',
            fromIndex: groupIndex,
            toIndex: groupIndex - 1,
          }),
          [`[data-claude-hooks-group="${event}:${groupIndex - 1}"]`],
        ),
    });
    this.appendAction(root, {
      text: '↓',
      label: t('settings.claudeCode.configuration.hooks.moveGroupDown', { event, index: humanIndex }),
      dataName: 'data-claude-hooks-group-move-down',
      disabled: disabled || groupIndex >= groupCount - 1,
      action: () =>
        this.applyEdit(
          buildClaudeHookGroupEdit(parsed, event, {
            type: 'move',
            fromIndex: groupIndex,
            toIndex: groupIndex + 1,
          }),
          [`[data-claude-hooks-group="${event}:${groupIndex + 1}"]`],
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
    select.setAttribute('aria-label', `${t('settings.claudeCode.configuration.handlerType')} — ${t('settings.claudeCode.configuration.hooks.groupLabel', { event, index: groupIndex + 1 })}`);
    select.setAttribute('data-claude-hooks-handler-type', `${event}:${groupIndex}`);
    for (const type of CLAUDE_HOOK_HANDLER_TYPES) select.add(new Option(type, type));
    root.appendChild(select);
    this.appendAction(root, {
      text: t('settings.claudeCode.configuration.addHandler'),
      label: `${t('settings.claudeCode.configuration.addHandler')} — ${t('settings.claudeCode.configuration.hooks.groupLabel', { event, index: groupIndex + 1 })}`,
      dataName: 'data-claude-hooks-handler-add',
      disabled,
      action: () =>
        this.applyEdit(
          buildClaudeHookHandlerEdit(parsed, event, groupIndex, {
            type: 'add',
            handler: defaultClaudeHookHandler(select.value),
          }),
          [`[data-claude-hooks-handler="${event}:${groupIndex}:${group.hooks.length}"]`],
        ),
    });
  }

  private renderHandler(groupRoot: HTMLElement, context: HookHandlerRenderContext): void {
    const { event, groupIndex, handler } = context;
    const root = document.createElement('div');
    root.className = 'opencodian-claude-configuration-hook-handler';
    root.setAttribute('data-claude-hooks-handler', `${event}:${groupIndex}:${handler.index}`);
    root.setAttribute('aria-label', t('settings.claudeCode.configuration.hooks.handlerLabel', { event, group: groupIndex + 1, index: handler.index + 1 }));
    if (!handler.supported || handler.type === null) {
      const raw = document.createElement('pre');
      raw.setAttribute('data-claude-hooks-unknown-handler', `${event}:${groupIndex}:${handler.index}`);
      raw.textContent = JSON.stringify(handler.raw, null, 2);
      root.appendChild(raw);
    } else {
      const fields = [...CLAUDE_HOOK_COMMON_FIELDS, ...CLAUDE_HOOK_TYPE_FIELDS[handler.type as keyof typeof CLAUDE_HOOK_TYPE_FIELDS]];
      for (const field of fields) this.fieldControls.renderField(root, context, field);
    }
    this.renderHandlerActions(root, context);
    groupRoot.appendChild(root);
  }

  private renderHandlerActions(root: HTMLElement, context: HookHandlerRenderContext): void {
    const { parsed, event, groupIndex, handler, disabled, handlerCount } = context;
    const handlerIndex = handler.index;
    const names = { event, group: groupIndex + 1, index: handlerIndex + 1 };
    this.appendAction(root, {
      text: t('settings.claudeCode.configuration.delete'),
      label: t('settings.claudeCode.configuration.hooks.deleteHandler', names),
      dataName: 'data-claude-hooks-handler-delete',
      disabled,
      action: () =>
        this.applyEdit(
          buildClaudeHookHandlerEdit(parsed, event, groupIndex, {
            type: 'delete',
            index: handlerIndex,
          }),
          [
            `[data-claude-hooks-handler="${event}:${groupIndex}:${handlerIndex}"]`,
            `[data-claude-hooks-handler="${event}:${groupIndex}:${handlerIndex - 1}"]`,
            `[data-claude-hooks-group="${event}:${groupIndex}"]`,
          ],
        ),
    });
    this.appendAction(root, {
      text: '↑',
      label: t('settings.claudeCode.configuration.hooks.moveHandlerUp', names),
      dataName: 'data-claude-hooks-handler-move-up',
      disabled: disabled || handlerIndex === 0,
      action: () =>
        this.applyEdit(
          buildClaudeHookHandlerEdit(parsed, event, groupIndex, {
            type: 'move',
            fromIndex: handlerIndex,
            toIndex: handlerIndex - 1,
          }),
          [`[data-claude-hooks-handler="${event}:${groupIndex}:${handlerIndex - 1}"]`],
        ),
    });
    this.appendAction(root, {
      text: '↓',
      label: t('settings.claudeCode.configuration.hooks.moveHandlerDown', names),
      dataName: 'data-claude-hooks-handler-move-down',
      disabled: disabled || handlerIndex >= handlerCount - 1,
      action: () =>
        this.applyEdit(
          buildClaudeHookHandlerEdit(parsed, event, groupIndex, {
            type: 'move',
            fromIndex: handlerIndex,
            toIndex: handlerIndex + 1,
          }),
          [`[data-claude-hooks-handler="${event}:${groupIndex}:${handlerIndex + 1}"]`],
        ),
    });
  }

  /**
   * Applies one schema-safe edit, then restores focus to the first surviving
   * selector so structural re-renders never strand keyboard users on <body>.
   */
  private applyEdit(result: ClaudeHookEditResult, refocus: readonly string[] = []): void {
    if (!result.ok) {
      this.host.setInlineDiagnostic(result.diagnostics.map((entry) => entry.message).join('\n'));
      return;
    }
    if (!this.host.applyDraftEdit(result.edit)) {
      this.host.setInlineDiagnostic(t('settings.claudeCode.configuration.invalidField'));
      return;
    }
    this.refocusFirst(refocus);
  }

  private refocusFirst(selectors: readonly string[]): void {
    if (!this.root) return;
    for (const selector of selectors) {
      const target = this.root.querySelector(selector);
      if (!(target instanceof HTMLElement)) continue;
      const control = target.matches('button, input, select, textarea')
        ? target
        : target.querySelector<HTMLElement>('button, input, select, textarea');
      if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
        if (control.disabled || control.hidden || control.closest('[hidden]')) continue;
        control.focus();
        return;
      }
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

}

/**
 * Read-only document model for Claude settings hooks. Pure inspection only —
 * no parsing, no stringification, no mutation. Unknown events/types and
 * internal/unknown fields (once, rewakeMessage, ...) are preserved verbatim in
 * `raw`; the structured view never fabricates controls outside the catalog.
 */
import {
  CLAUDE_HOOK_COMMON_FIELDS,
  CLAUDE_HOOK_EVENT_CATALOG,
  CLAUDE_HOOK_EVENTS,
  CLAUDE_HOOK_HANDLER_TYPES,
  CLAUDE_HOOK_TYPE_FIELDS,
  type ClaudeHookEvent,
  type ClaudeHookFieldKind,
  type ClaudeHookFieldMeta,
  type ClaudeHookHandlerType,
} from './ClaudeSettingsHookSchema';
import { type JsoncPathEdit } from './ProjectResourceSecureWrite';

const KNOWN_EVENTS: ReadonlySet<string> = new Set(CLAUDE_HOOK_EVENTS);
const KNOWN_HANDLER_TYPES: ReadonlySet<string> = new Set(CLAUDE_HOOK_HANDLER_TYPES);

type RawObject = Readonly<Record<string, unknown>>;

export interface ClaudeHookHandlerView {
  readonly index: number;
  readonly raw: RawObject;
  readonly type: string | null;
  readonly supported: boolean;
}

export interface ClaudeHookGroupView {
  readonly index: number;
  readonly raw: RawObject;
  readonly matcher: string | undefined;
  readonly hooks: readonly ClaudeHookHandlerView[];
}

export interface ClaudeHookEventView {
  readonly event: string;
  readonly supported: boolean;
  readonly groups: readonly ClaudeHookGroupView[];
}

export interface ClaudeHookInspectionDiagnostic {
  readonly path: string;
  readonly message: string;
}

export interface ClaudeHookDocumentView {
  readonly events: readonly ClaudeHookEventView[];
  readonly diagnostics: readonly ClaudeHookInspectionDiagnostic[];
}

function isRawObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Inspect `settings.hooks` into a read-only document view. Document key order is
 * preserved (Object.entries). Known events/types are flagged `supported`; future
 * ones are flagged unsupported but kept raw. Invalid shapes produce path-based
 * diagnostics without throwing or dropping raw data. The input is never mutated.
 */
export function inspectClaudeSettingsHooks(settings: unknown): ClaudeHookDocumentView {
  const events: ClaudeHookEventView[] = [];
  const diagnostics: ClaudeHookInspectionDiagnostic[] = [];

  const root = isRawObject(settings) ? settings : {};
  const hooksRoot = root.hooks;
  if (hooksRoot === undefined || hooksRoot === null) {
    return { events, diagnostics };
  }
  if (!isRawObject(hooksRoot)) {
    diagnostics.push({ path: 'hooks', message: 'hooks must be an object keyed by event name' });
    return { events, diagnostics };
  }

  for (const [event, value] of Object.entries(hooksRoot)) {
    const supported = KNOWN_EVENTS.has(event);
    const groups: ClaudeHookGroupView[] = [];

    if (!Array.isArray(value)) {
      diagnostics.push({ path: `hooks.${event}`, message: 'event value must be a matcher-group array' });
      events.push({ event, supported, groups });
      continue;
    }

    value.forEach((group, groupIndex) => {
      const groupPath = `hooks.${event}[${groupIndex}]`;
      if (!isRawObject(group)) {
        diagnostics.push({ path: groupPath, message: 'matcher group must be an object' });
        return;
      }
      const matcherRaw = group.matcher;
      const matcher = typeof matcherRaw === 'string' ? matcherRaw : undefined;
      const hooksValue = group.hooks;

      const handlers: ClaudeHookHandlerView[] = [];
      if (hooksValue === undefined) {
        diagnostics.push({ path: `${groupPath}.hooks`, message: 'group has no hooks array' });
      } else if (!Array.isArray(hooksValue)) {
        diagnostics.push({ path: `${groupPath}.hooks`, message: 'hooks must be an array' });
      } else {
        hooksValue.forEach((handler, handlerIndex) => {
          const handlerPath = `${groupPath}.hooks[${handlerIndex}]`;
          if (!isRawObject(handler)) {
            diagnostics.push({ path: handlerPath, message: 'handler must be an object' });
            return;
          }
          const typeRaw = handler.type;
          const type = typeof typeRaw === 'string' ? typeRaw : null;
          handlers.push({
            index: handlerIndex,
            raw: handler,
            type,
            supported: type !== null && KNOWN_HANDLER_TYPES.has(type),
          });
        });
      }

      // Flag a matcher on a known no-matcher event (raw is still preserved).
      if (supported && matcher !== undefined) {
        const meta = CLAUDE_HOOK_EVENT_CATALOG[event as ClaudeHookEvent];
        if (meta !== undefined && !meta.supportsMatcher) {
          diagnostics.push({ path: `${groupPath}.matcher`, message: `event ${event} does not support a matcher` });
        }
      }

      groups.push({ index: groupIndex, raw: group, matcher, hooks: handlers });
    });

    events.push({ event, supported, groups });
  }

  return { events, diagnostics };
}

// ---------------------------------------------------------------------------
// Matcher-group mutations (produce a local array-replace JsoncPathEdit)
// ---------------------------------------------------------------------------

export type ClaudeHookGroupMutation =
  | { type: 'add'; group: Record<string, unknown>; index?: number }
  | { type: 'update-matcher'; index: number; matcher: string | null }
  | { type: 'delete'; index: number }
  | { type: 'move'; fromIndex: number; toIndex: number };

export type ClaudeHookGroupEditResult =
  | { ok: true; edit: JsoncPathEdit; groups: readonly unknown[] }
  | { ok: false; diagnostics: readonly ClaudeHookInspectionDiagnostic[] };

interface ClaudeHookGroupEditContext {
  readonly event: string;
  readonly groups: readonly unknown[];
  readonly supportsMatcher: boolean;
  readonly diagnostics: ClaudeHookInspectionDiagnostic[];
}

function isExistingCollectionIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

function isCollectionInsertionIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= length;
}

function failHookGroupEdit(diagnostics: readonly ClaudeHookInspectionDiagnostic[]): ClaudeHookGroupEditResult {
  return { ok: false, diagnostics };
}

function resolveHookGroupEditContext(settings: unknown, event: string, mutation: ClaudeHookGroupMutation, diagnostics: ClaudeHookInspectionDiagnostic[]): ClaudeHookGroupEditContext | null {
  if (!KNOWN_EVENTS.has(event)) {
    diagnostics.push({ path: `hooks.${event}`, message: 'unknown event is not a known settings hook event' });
    return null;
  }
  if (!isRawObject(settings)) {
    diagnostics.push({ path: 'settings', message: 'settings must be an object' });
    return null;
  }
  const hooksRoot = settings.hooks;
  if (hooksRoot !== undefined && hooksRoot !== null && !isRawObject(hooksRoot)) {
    diagnostics.push({ path: 'hooks', message: 'hooks must be an object keyed by event name' });
    return null;
  }
  const hooksObject = isRawObject(hooksRoot) ? hooksRoot : {};
  const value = hooksObject[event];
  if (mutation.type === 'add' && value === undefined) {
    return {
      event,
      groups: [],
      supportsMatcher: CLAUDE_HOOK_EVENT_CATALOG[event as ClaudeHookEvent].supportsMatcher,
      diagnostics,
    };
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ path: `hooks.${event}`, message: 'event value must be a matcher-group array' });
    return null;
  }
  return {
    event,
    groups: value,
    supportsMatcher: CLAUDE_HOOK_EVENT_CATALOG[event as ClaudeHookEvent].supportsMatcher,
    diagnostics,
  };
}

function buildAddHookGroupEdit(context: ClaudeHookGroupEditContext, mutation: Extract<ClaudeHookGroupMutation, { type: 'add' }>): ClaudeHookGroupEditResult {
  const { diagnostics, event, groups, supportsMatcher } = context;
  if (!isRawObject(mutation.group)) {
    diagnostics.push({ path: `hooks.${event}[add]`, message: 'group must be an object' });
    return failHookGroupEdit(diagnostics);
  }
  if (!Array.isArray(mutation.group.hooks)) {
    diagnostics.push({ path: `hooks.${event}[add].hooks`, message: 'group.hooks must be an array' });
    return failHookGroupEdit(diagnostics);
  }
  if (!supportsMatcher && mutation.group.matcher !== undefined) {
    diagnostics.push({ path: `hooks.${event}[add].matcher`, message: `event ${event} does not support a matcher` });
    return failHookGroupEdit(diagnostics);
  }
  const index = mutation.index ?? groups.length;
  if (!isCollectionInsertionIndex(index, groups.length)) {
    diagnostics.push({ path: `hooks.${event}[add]`, message: 'index out of range' });
    return failHookGroupEdit(diagnostics);
  }
  const newGroups = [...groups.slice(0, index), mutation.group, ...groups.slice(index)];
  return { ok: true, edit: { path: ['hooks', event], value: newGroups }, groups: newGroups };
}

function buildUpdateHookGroupMatcherEdit(context: ClaudeHookGroupEditContext, mutation: Extract<ClaudeHookGroupMutation, { type: 'update-matcher' }>): ClaudeHookGroupEditResult {
  const { diagnostics, event, groups, supportsMatcher } = context;
  const { index, matcher } = mutation;
  if (!isExistingCollectionIndex(index, groups.length)) {
    diagnostics.push({ path: `hooks.${event}[${index}]`, message: 'index out of range' });
    return failHookGroupEdit(diagnostics);
  }
  const target = groups[index];
  if (!isRawObject(target)) {
    diagnostics.push({ path: `hooks.${event}[${index}]`, message: 'group must be an object' });
    return failHookGroupEdit(diagnostics);
  }
  if (!supportsMatcher && matcher !== null) {
    diagnostics.push({ path: `hooks.${event}[${index}].matcher`, message: `event ${event} does not support a matcher` });
    return failHookGroupEdit(diagnostics);
  }
  const newGroup: Record<string, unknown> = { ...target };
  if (matcher === null) {
    delete newGroup.matcher;
  } else {
    newGroup.matcher = matcher;
  }
  const newGroups = groups.map((group, groupIndex) => (groupIndex === index ? newGroup : group));
  return {
    ok: true,
    edit: { path: ['hooks', event, index, 'matcher'], value: matcher === null ? undefined : matcher },
    groups: newGroups,
  };
}

function buildDeleteHookGroupEdit(context: ClaudeHookGroupEditContext, mutation: Extract<ClaudeHookGroupMutation, { type: 'delete' }>): ClaudeHookGroupEditResult {
  const { diagnostics, event, groups } = context;
  const { index } = mutation;
  if (!isExistingCollectionIndex(index, groups.length)) {
    diagnostics.push({ path: `hooks.${event}[${index}]`, message: 'index out of range' });
    return failHookGroupEdit(diagnostics);
  }
  const newGroups = groups.filter((_, groupIndex) => groupIndex !== index);
  return { ok: true, edit: { path: ['hooks', event], value: newGroups }, groups: newGroups };
}

function buildMoveHookGroupEdit(context: ClaudeHookGroupEditContext, mutation: Extract<ClaudeHookGroupMutation, { type: 'move' }>): ClaudeHookGroupEditResult {
  const { diagnostics, event, groups } = context;
  const { fromIndex, toIndex } = mutation;
  if (!isExistingCollectionIndex(fromIndex, groups.length)
    || !isExistingCollectionIndex(toIndex, groups.length)) {
    diagnostics.push({ path: `hooks.${event}[move]`, message: 'index out of range' });
    return failHookGroupEdit(diagnostics);
  }
  const newGroups = [...groups];
  const [moved] = newGroups.splice(fromIndex, 1);
  newGroups.splice(toIndex, 0, moved);
  return { ok: true, edit: { path: ['hooks', event], value: newGroups }, groups: newGroups };
}

/**
 * Build a local `JsoncPathEdit` that replaces the group array at
 * `['hooks', event]`. Pure: no stringification, no writing, no input mutation.
 * Existing group/handler raw fields are preserved (shallow copies); a no-matcher
 * event rejects matcher addition. Move is document-order only.
 */
export function buildClaudeHookGroupEdit(settings: unknown, event: string, mutation: ClaudeHookGroupMutation): ClaudeHookGroupEditResult {
  const diagnostics: ClaudeHookInspectionDiagnostic[] = [];
  const context = resolveHookGroupEditContext(settings, event, mutation, diagnostics);
  if (context === null) return failHookGroupEdit(diagnostics);

  if (mutation.type === 'add') {
    return buildAddHookGroupEdit(context, mutation);
  }
  if (mutation.type === 'update-matcher') {
    return buildUpdateHookGroupMatcherEdit(context, mutation);
  }
  if (mutation.type === 'delete') {
    return buildDeleteHookGroupEdit(context, mutation);
  }
  return buildMoveHookGroupEdit(context, mutation);
}

// ---------------------------------------------------------------------------
// Handler mutations (produce a JsoncPathEdit replacing the handler array)
// ---------------------------------------------------------------------------

export type ClaudeHookHandlerMutation =
  | { type: 'add'; handler: Record<string, unknown>; index?: number }
  | { type: 'update-field'; index: number; field: string; value: unknown }
  | { type: 'delete'; index: number }
  | { type: 'move'; fromIndex: number; toIndex: number };

export type ClaudeHookHandlerEditResult =
  | { ok: true; edit: JsoncPathEdit; handlers: readonly unknown[] }
  | { ok: false; diagnostics: readonly ClaudeHookInspectionDiagnostic[] };

interface ClaudeHookHandlerEditContext {
  readonly event: string;
  readonly groupIndex: number;
  readonly handlers: readonly unknown[];
  readonly diagnostics: ClaudeHookInspectionDiagnostic[];
}

function failHookHandlerEdit(diagnostics: readonly ClaudeHookInspectionDiagnostic[]): ClaudeHookHandlerEditResult {
  return { ok: false, diagnostics };
}

function resolveHookHandlerEditContext(settings: unknown, event: string, groupIndex: number, diagnostics: ClaudeHookInspectionDiagnostic[]): ClaudeHookHandlerEditContext | null {
  if (!KNOWN_EVENTS.has(event)) {
    diagnostics.push({ path: `hooks.${event}`, message: 'unknown event is not a known settings hook event' });
    return null;
  }
  if (!isRawObject(settings)) {
    diagnostics.push({ path: 'settings', message: 'settings must be an object' });
    return null;
  }
  const hooksRoot = settings.hooks;
  if (!isRawObject(hooksRoot)) {
    diagnostics.push({ path: 'hooks', message: 'hooks must be an object keyed by event name' });
    return null;
  }
  const groups = hooksRoot[event];
  if (!Array.isArray(groups)) {
    diagnostics.push({ path: `hooks.${event}`, message: 'event value must be a matcher-group array' });
    return null;
  }
  if (!isExistingCollectionIndex(groupIndex, groups.length)) {
    diagnostics.push({ path: `hooks.${event}[${groupIndex}]`, message: 'group index out of range' });
    return null;
  }
  const group = groups[groupIndex];
  if (!isRawObject(group)) {
    diagnostics.push({ path: `hooks.${event}[${groupIndex}]`, message: 'group must be an object' });
    return null;
  }
  const handlers = group.hooks;
  if (!Array.isArray(handlers)) {
    diagnostics.push({ path: `hooks.${event}[${groupIndex}].hooks`, message: 'group.hooks must be an array' });
    return null;
  }
  return { event, groupIndex, handlers, diagnostics };
}

/** Validate a value matches a documented field kind. No invented constraints. */
function matchesFieldKind(value: unknown, kind: ClaudeHookFieldKind): boolean {
  switch (kind) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case 'string-array': return Array.isArray(value) && value.every((e) => typeof e === 'string');
    case 'string-record': return isRawObject(value) && Object.values(value).every((v) => typeof v === 'string');
    case 'json-object': return isRawObject(value);
    default: return false;
  }
}

/**
 * Validate a handler against common + type-specific schema metadata. Required
 * fields must be present with the documented kind; optional structured fields,
 * when present, must match the kind; enumValues are enforced exactly. Unknown /
 * internal fields (once, rewakeMessage, custom) are ignored and preserved
 * verbatim by the caller. Diagnostics point at `basePath.<field>`.
 */
function validateHandlerSchema(
  handler: Record<string, unknown>,
  type: string,
  basePath: string,
): readonly ClaudeHookInspectionDiagnostic[] {
  const diagnostics: ClaudeHookInspectionDiagnostic[] = [];
  const check = (meta: ClaudeHookFieldMeta): void => {
    const present = Object.prototype.hasOwnProperty.call(handler, meta.name);
    if (!present) {
      if (meta.requirement === 'required') {
        diagnostics.push({ path: `${basePath}.${meta.name}`, message: `field ${meta.name} is required` });
      }
      return;
    }
    const value = handler[meta.name];
    if (!matchesFieldKind(value, meta.type)) {
      diagnostics.push({ path: `${basePath}.${meta.name}`, message: `field ${meta.name} must be of kind ${meta.type}` });
      return;
    }
    if (meta.enumValues !== undefined && typeof value === 'string' && !meta.enumValues.includes(value)) {
      diagnostics.push({ path: `${basePath}.${meta.name}`, message: `field ${meta.name} must be one of ${meta.enumValues.join('|')}` });
    }
  };
  for (const field of CLAUDE_HOOK_COMMON_FIELDS) check(field);
  for (const field of CLAUDE_HOOK_TYPE_FIELDS[type as ClaudeHookHandlerType]) check(field);
  return diagnostics;
}

function buildAddHookHandlerEdit(context: ClaudeHookHandlerEditContext, mutation: Extract<ClaudeHookHandlerMutation, { type: 'add' }>): ClaudeHookHandlerEditResult {
  const { diagnostics, event, groupIndex, handlers } = context;
  if (!isRawObject(mutation.handler)) {
    diagnostics.push({ path: `hooks.${event}[${groupIndex}].hooks[add]`, message: 'handler must be an object' });
    return failHookHandlerEdit(diagnostics);
  }
  const typeRaw = mutation.handler.type;
  if (typeof typeRaw !== 'string' || !KNOWN_HANDLER_TYPES.has(typeRaw)) {
    diagnostics.push({ path: `hooks.${event}[${groupIndex}].hooks[add].type`, message: 'handler type must be a known hook handler type' });
    return failHookHandlerEdit(diagnostics);
  }
  const basePath = `hooks.${event}[${groupIndex}].hooks[add]`;
  const fieldDiagnostics = validateHandlerSchema(mutation.handler, typeRaw, basePath);
  if (fieldDiagnostics.length > 0) {
    diagnostics.push(...fieldDiagnostics);
    return failHookHandlerEdit(diagnostics);
  }
  const index = mutation.index ?? handlers.length;
  if (!isCollectionInsertionIndex(index, handlers.length)) {
    diagnostics.push({ path: basePath, message: 'insertion index out of range' });
    return failHookHandlerEdit(diagnostics);
  }
  const newHandlers = [...handlers.slice(0, index), mutation.handler, ...handlers.slice(index)];
  return { ok: true, edit: { path: ['hooks', event, groupIndex, 'hooks'], value: newHandlers }, handlers: newHandlers };
}

function buildUpdateHookHandlerFieldEdit(context: ClaudeHookHandlerEditContext, mutation: Extract<ClaudeHookHandlerMutation, { type: 'update-field' }>): ClaudeHookHandlerEditResult {
  const { diagnostics, event, groupIndex, handlers } = context;
  const { index, field, value } = mutation;
  const basePath = `hooks.${event}[${groupIndex}].hooks[${index}]`;
  if (!isExistingCollectionIndex(index, handlers.length)) {
    diagnostics.push({ path: basePath, message: 'handler index out of range' });
    return failHookHandlerEdit(diagnostics);
  }
  const target = handlers[index];
  if (!isRawObject(target)) {
    diagnostics.push({ path: basePath, message: 'handler must be an object' });
    return failHookHandlerEdit(diagnostics);
  }
  const currentType = target.type;
  if (typeof currentType !== 'string' || !KNOWN_HANDLER_TYPES.has(currentType)) {
    diagnostics.push({ path: `${basePath}.type`, message: 'existing handler type must be a known hook handler type' });
    return failHookHandlerEdit(diagnostics);
  }
  let resultingType = currentType;
  if (field === 'type') {
    if (typeof value !== 'string' || !KNOWN_HANDLER_TYPES.has(value)) {
      diagnostics.push({ path: `${basePath}.type`, message: 'resulting handler type must be a known hook handler type' });
      return failHookHandlerEdit(diagnostics);
    }
    resultingType = value;
  }
  const allowedFields = [...CLAUDE_HOOK_COMMON_FIELDS, ...CLAUDE_HOOK_TYPE_FIELDS[resultingType as ClaudeHookHandlerType]];
  if (!allowedFields.some((allowedField) => allowedField.name === field)) {
    diagnostics.push({ path: `${basePath}.${field}`, message: `field ${field} is not a structured field for type ${resultingType}` });
    return failHookHandlerEdit(diagnostics);
  }
  const resultHandler: Record<string, unknown> = { ...target };
  if (value === undefined) {
    delete resultHandler[field];
  } else {
    resultHandler[field] = value;
  }
  const fieldDiagnostics = validateHandlerSchema(resultHandler, resultingType, basePath);
  if (fieldDiagnostics.length > 0) {
    diagnostics.push(...fieldDiagnostics);
    return failHookHandlerEdit(diagnostics);
  }
  const newHandlers = handlers.map((handler, handlerIndex) => (handlerIndex === index ? resultHandler : handler));
  return { ok: true, edit: { path: ['hooks', event, groupIndex, 'hooks', index, field], value }, handlers: newHandlers };
}

function buildDeleteHookHandlerEdit(context: ClaudeHookHandlerEditContext, mutation: Extract<ClaudeHookHandlerMutation, { type: 'delete' }>): ClaudeHookHandlerEditResult {
  const { diagnostics, event, groupIndex, handlers } = context;
  const { index } = mutation;
  if (!isExistingCollectionIndex(index, handlers.length)) {
    diagnostics.push({ path: `hooks.${event}[${groupIndex}].hooks[${index}]`, message: 'handler index out of range' });
    return failHookHandlerEdit(diagnostics);
  }
  const newHandlers = handlers.filter((_, handlerIndex) => handlerIndex !== index);
  return { ok: true, edit: { path: ['hooks', event, groupIndex, 'hooks'], value: newHandlers }, handlers: newHandlers };
}

function buildMoveHookHandlerEdit(context: ClaudeHookHandlerEditContext, mutation: Extract<ClaudeHookHandlerMutation, { type: 'move' }>): ClaudeHookHandlerEditResult {
  const { diagnostics, event, groupIndex, handlers } = context;
  const { fromIndex, toIndex } = mutation;
  if (!isExistingCollectionIndex(fromIndex, handlers.length)
    || !isExistingCollectionIndex(toIndex, handlers.length)) {
    diagnostics.push({ path: `hooks.${event}[${groupIndex}].hooks[move]`, message: 'index out of range' });
    return failHookHandlerEdit(diagnostics);
  }
  const newHandlers = [...handlers];
  const [moved] = newHandlers.splice(fromIndex, 1);
  newHandlers.splice(toIndex, 0, moved);
  return { ok: true, edit: { path: ['hooks', event, groupIndex, 'hooks'], value: newHandlers }, handlers: newHandlers };
}

/**
 * Add one supported handler to an existing known event / matcher group. Pure:
 * no input mutation, no stringification, no writing. The edit replaces only
 * `['hooks', event, groupIndex, 'hooks']` and is directly applicable, leaving
 * matcher, unknown group/handler fields, sibling groups/events, and unrelated
 * top-level settings unchanged. Handler fields are validated against the
 * schema metadata (common + type-specific) for both add and update-field.
 */
export function buildClaudeHookHandlerEdit(settings: unknown, event: string, groupIndex: number, mutation: ClaudeHookHandlerMutation): ClaudeHookHandlerEditResult {
  const diagnostics: ClaudeHookInspectionDiagnostic[] = [];
  const context = resolveHookHandlerEditContext(settings, event, groupIndex, diagnostics);
  if (context === null) return failHookHandlerEdit(diagnostics);

  if (mutation.type === 'add') {
    return buildAddHookHandlerEdit(context, mutation);
  }
  if (mutation.type === 'update-field') {
    return buildUpdateHookHandlerFieldEdit(context, mutation);
  }
  if (mutation.type === 'delete') {
    return buildDeleteHookHandlerEdit(context, mutation);
  }
  if (mutation.type === 'move') {
    return buildMoveHookHandlerEdit(context, mutation);
  }
  diagnostics.push({ path: `hooks.${event}[${groupIndex}].hooks`, message: 'unsupported handler mutation' });
  return failHookHandlerEdit(diagnostics);
}

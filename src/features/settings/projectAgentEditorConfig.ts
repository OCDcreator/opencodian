import { isRecord } from '../../core/config/modelConfig';
import type {
  OpencodeAgentConfig,
  OpencodeAgentMode,
  PermissionAction,
  PermissionConfig,
} from '../../core/types';

export interface ProjectAgentPermissionPatchState {
  permission: OpencodeAgentConfig['permission'];
  skillPermission: 'inherit' | PermissionAction;
  skillPermissionDirty: boolean;
  taskAllowlist: string;
  taskAllowlistDirty: boolean;
}

export interface ProjectAgentToolsPatchState {
  skillToolMode: 'inherit' | 'enabled' | 'disabled';
  skillToolModeDirty: boolean;
  tools: OpencodeAgentConfig['tools'];
}

export interface ProjectAgentOptionsPatchState {
  options: OpencodeAgentConfig['options'];
  optionsDirty: boolean;
  optionsJson: string;
}

export interface ProjectAgentOptionsPatchMessages {
  invalidJsonMessage: (message: string) => string;
  objectRequiredMessage: string;
}

export function normalizeProjectAgentEditorMode(value: unknown): OpencodeAgentMode | undefined {
  return value === 'primary' || value === 'all' || value === 'subagent'
    ? value
    : undefined;
}

export function optionalTrimmedText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function parseOptionalNumber(
  value: string,
  invalidNumberMessage: string,
): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(invalidNumberMessage);
  }
  return parsed;
}

export function stringifyConfigText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function stringifyConfigNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export function stringifyTaskAllowlist(permission: OpencodeAgentConfig['permission']): string {
  if (!isRecord(permission)) {
    return '';
  }

  const taskPermission = permission.task;
  if (!isRecord(taskPermission)) {
    return '';
  }

  return Object.entries(taskPermission)
    .filter(([pattern, action]) => pattern !== '*' && action === 'allow')
    .map(([pattern]) => pattern)
    .join('\n');
}

export function stringifySkillPermission(
  permission: OpencodeAgentConfig['permission'],
): 'inherit' | PermissionAction {
  if (!isRecord(permission)) {
    return 'inherit';
  }

  const skillPermission = permission.skill;
  return skillPermission === 'allow' || skillPermission === 'ask' || skillPermission === 'deny'
    ? skillPermission
    : 'inherit';
}

export function stringifySkillToolMode(
  tools: OpencodeAgentConfig['tools'],
): 'inherit' | 'enabled' | 'disabled' {
  if (!isRecord(tools) || typeof tools.skill !== 'boolean') {
    return 'inherit';
  }

  return tools.skill ? 'enabled' : 'disabled';
}

export function buildTaskAllowlistPermission(
  value: string,
): Record<string, PermissionAction> | undefined {
  const patterns = parseTaskAllowlistPatterns(value);
  if (patterns.length === 0) {
    return undefined;
  }

  const taskPermission: Record<string, PermissionAction> = {
    '*': 'deny',
  };
  for (const pattern of patterns) {
    taskPermission[pattern] = 'allow';
  }
  return taskPermission;
}

export function hasPermissionKeysOtherThanTask(permission: Record<string, unknown>): boolean {
  return Object.keys(permission).some((key) => key !== 'task');
}

export function buildProjectAgentPermissionPatch(
  state: ProjectAgentPermissionPatchState,
): Pick<OpencodeAgentConfig, 'permission'> | Record<string, never> {
  if (!state.taskAllowlistDirty && !state.skillPermissionDirty) {
    return {};
  }

  const taskPermission = buildTaskAllowlistPermission(state.taskAllowlist);
  const basePermission = state.permission;
  const permission: PermissionConfig = {};
  if (typeof basePermission === 'string') {
    permission['*'] = basePermission;
  }

  if (state.taskAllowlistDirty) {
    if (taskPermission) {
      permission.task = taskPermission;
    } else {
      permission.task = undefined;
    }
  }

  if (state.skillPermissionDirty) {
    if (state.skillPermission === 'inherit') {
      permission.skill = undefined;
    } else {
      permission.skill = state.skillPermission;
    }
  }

  return {
    permission: Object.keys(permission).length > 0 ? permission : undefined,
  };
}

export function buildProjectAgentToolsPatch(
  state: ProjectAgentToolsPatchState,
): Pick<OpencodeAgentConfig, 'tools'> | Record<string, never> {
  if (!state.skillToolModeDirty) {
    return {};
  }

  const tools = isRecord(state.tools)
    ? cloneJsonValue(state.tools) as Record<string, boolean>
    : {};
  if (state.skillToolMode === 'inherit') {
    delete tools.skill;
  } else {
    tools.skill = state.skillToolMode === 'enabled';
  }

  return {
    tools: Object.keys(tools).length > 0 ? tools : undefined,
  };
}

export function buildProjectAgentOptionsPatch(
  state: ProjectAgentOptionsPatchState,
  messages: ProjectAgentOptionsPatchMessages,
): Pick<OpencodeAgentConfig, 'options'> | Record<string, never> {
  if (!state.optionsDirty) {
    return {};
  }

  const nextOptions = parseProjectAgentOptionsJson(state.optionsJson, messages);
  if (!nextOptions) {
    return {
      options: undefined,
    };
  }

  return {
    options: buildObjectReplacementPatch(state.options, nextOptions),
  };
}

export function parseProjectAgentOptionsJson(
  value: string,
  messages: ProjectAgentOptionsPatchMessages,
): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(messages.invalidJsonMessage(message));
  }

  if (!isRecord(parsed)) {
    throw new Error(messages.objectRequiredMessage);
  }

  return cloneJsonValue(parsed);
}

export function buildObjectReplacementPatch(
  existing: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const allKeys = new Set<string>([
    ...Object.keys(isRecord(existing) ? existing : {}),
    ...Object.keys(next),
  ]);

  for (const key of allKeys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      patch[key] = undefined;
      continue;
    }

    const nextValue = next[key];
    const existingValue = existing?.[key];
    if (isRecord(existingValue) && isRecord(nextValue)) {
      patch[key] = buildObjectReplacementPatch(existingValue, nextValue);
      continue;
    }

    patch[key] = cloneJsonValue(nextValue);
  }

  return patch;
}

export function clonePermission(
  permission: OpencodeAgentConfig['permission'],
): OpencodeAgentConfig['permission'] {
  if (typeof permission === 'string') {
    return permission;
  }

  if (!isRecord(permission)) {
    return undefined;
  }

  return cloneJsonValue(permission) as PermissionConfig;
}

export function cloneOptions(
  options: OpencodeAgentConfig['options'],
): OpencodeAgentConfig['options'] {
  if (!isRecord(options)) {
    return undefined;
  }

  return cloneJsonValue(options);
}

export function cloneTools(
  tools: OpencodeAgentConfig['tools'],
): OpencodeAgentConfig['tools'] {
  if (!isRecord(tools)) {
    return undefined;
  }

  return cloneJsonValue(tools) as Record<string, boolean>;
}

export function stringifyOptions(options: OpencodeAgentConfig['options']): string {
  if (!isRecord(options)) {
    return '';
  }

  return JSON.stringify(options, null, 2);
}

function parseTaskAllowlistPatterns(value: string): string[] {
  const seen = new Set<string>();
  const patterns: string[] = [];
  for (const line of value.split(/\r?\n/u)) {
    const pattern = line.trim();
    if (!pattern || seen.has(pattern)) {
      continue;
    }
    seen.add(pattern);
    patterns.push(pattern);
  }
  return patterns;
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

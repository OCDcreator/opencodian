/**
 * CodexAppServerClient — typed app-server API wrappers + transcript readback.
 *
 * This client is the preferred Codex chat transport once experimental API
 * negotiation succeeds: it owns persisted thread lifecycle, turn streaming,
 * and authoritative `thread/tokenUsage/updated` context snapshots. The
 * TypeScript SDK remains the compatibility fallback when that negotiation
 * cannot be established.
 *
 * Process lifecycle and JSON-RPC plumbing live in the base `CodexAppServerTransport`;
 * this class adds the typed wrappers for thread/account/model/MCP/review routes
 * plus the static transcript normalization helpers consumed by AgentBackendRouting.
 *
 * Wire types live in `CodexAppServerClientTypes` and are re-exported here so
 * existing `import { ... } from './CodexAppServerClient'` calls keep working.
 */
/* eslint-disable max-lines -- This is the single typed app-server RPC facade; splitting endpoint wrappers into one-use adapters would weaken the protocol boundary. */

import { createLogger } from '../../../shared';
import {
  normalizeThreadList as normalizeThreadListImpl,
  normalizeTurnsToPreviewMessages as normalizeTurnsToPreviewMessagesImpl,
} from './CodexAppServerClientNormalization';
import type {
  AppServerAccountRateLimitsResult,
  AppServerAccountUsage,
  AppServerAccountUsageResult,
  AppServerApprovalPolicyEffective,
  AppServerCommandExecutionApprovalParams,
  AppServerCommandExecutionApprovalResponse,
  AppServerEffectivePermissionProfile,
  AppServerFileChangeApprovalParams,
  AppServerFileChangeApprovalResponse,
  AppServerForkResult,
  AppServerHookError,
  AppServerHookGroup,
  AppServerHookMetadata,
  AppServerHooksReadbackResult,
  AppServerListHooksOptions,
  AppServerListSkillsOptions,
  AppServerMcpElicitationParams,
  AppServerMcpElicitationResponse,
  AppServerMcpResourceContent,
  AppServerMcpResourceReadResult,
  AppServerMcpServerStatus,
  AppServerMcpToolCallContent,
  AppServerMcpToolCallResult,
  AppServerModel,
  AppServerModelProviderCapabilities,
  AppServerNotificationSubscription,
  AppServerPermissionProfile,
  AppServerPermissionsApprovalParams,
  AppServerPermissionsApprovalResponse,
  AppServerPluginInstallResult,
  AppServerPluginListOptions,
  AppServerPluginListResult,
  AppServerPluginReconcileResult,
  AppServerPluginSkillReadResult,
  AppServerRateLimits,
  AppServerReviewResult,
  AppServerReviewTarget,
  AppServerSandboxPolicy,
  AppServerSetThreadGoalOptions,
  AppServerSkill,
  AppServerSkillError,
  AppServerSkillGroup,
  AppServerSteerTurnError,
  AppServerSteerTurnErrorCode,
  AppServerSteerTurnResult,
  AppServerThread,
  AppServerThreadAttachmentAddResult,
  AppServerThreadAttachmentsPage,
  AppServerThreadCompactionAckResult,
  AppServerThreadCompactionStartOptions,
  AppServerThreadEffectiveSettings,
  AppServerThreadGoal,
  AppServerThreadItemsListOptions,
  AppServerThreadItemsPage,
  AppServerThreadNotification,
  AppServerThreadResumeOptions,
  AppServerThreadStartOptions,
  AppServerThreadTurnsListOptions,
  AppServerThreadTurnsPage,
  AppServerToolUserInputParams,
  AppServerToolUserInputResponse,
  AppServerTurn,
  AppServerTurnStartOptions,
  AppServerUserInput,
  McpOauthLoginResult,
} from './CodexAppServerClientTypes';
import { CodexAppServerTransport } from './CodexAppServerTransport';
import type { ConfigurationEvidence } from './ProjectResourceSecureWrite';

// Re-export all wire types so existing imports from this module stay valid.
export * from './CodexAppServerClientTypes';

const logger = createLogger('CodexAppServerClient');

/**
 * A group envelope returned by the Codex app-server `skills/list` route. The
 * real server replies with an array of these (one per resolved scope/cwd),
 * each carrying its own `skills` list — NOT a flat `AppServerSkill[]`. This
 * shape is best-effort and permissive: fields may be absent.
 */
interface AppServerSkillGroupEnvelope {
  cwd?: string;
  skills?: unknown[];
  errors?: unknown[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readOptionalStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return filtered.length > 0 ? filtered : undefined;
}

/**
 * Read the effective approval policy. Per the Codex 0.144.1 bindings this may
 * be a known scalar ('untrusted' | 'on-request' | 'never'), another string
 * (forward-compat), or a granular object. Captured verbatim; never fabricated.
 */
function readApprovalPolicyEffective(value: unknown): AppServerApprovalPolicyEffective | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (isPlainObject(value)) return value as Readonly<Record<string, unknown>>;
  return undefined;
}

/**
 * Read the effective sandbox policy. The binding is a discriminated object
 * keyed by `type` (dangerFullAccess | readOnly | workspaceWrite, or an unknown
 * variant). A bare string is NOT a valid binding shape and is dropped.
 */
function readSandboxPolicy(value: unknown): AppServerSandboxPolicy | undefined {
  if (!isPlainObject(value) || typeof value.type !== 'string' || value.type.length === 0) {
    return undefined;
  }
  return value as AppServerSandboxPolicy;
}

/** Read the effective permission profile { id, extends? }. */
function readEffectivePermissionProfile(value: unknown): AppServerEffectivePermissionProfile | undefined {
  if (!isPlainObject(value) || typeof value.id !== 'string' || value.id.length === 0) {
    return undefined;
  }
  const ext = value.extends;
  return {
    id: value.id,
    ...(typeof ext === 'string' ? { extends: ext } : ext === null ? { extends: null } : {}),
  };
}

/**
 * Defensively extract the effective-settings fields from a `thread/start` or
 * `thread/resume` response object. The response carries `thread` plus sibling
 * fields (model, modelProvider, cwd, runtimeWorkspaceRoots, instructionSources,
 * approvalPolicy, approvalsReviewer, sandbox, activePermissionProfile,
 * reasoningEffort). Older app-server versions omit some or all of them; every
 * field stays optional and absence means "runtime readback unavailable" (NOT
 * a verified echo of the request). Shapes match the Codex 0.144.1 bindings.
 */
function extractThreadEffectiveSettings(result: unknown): AppServerThreadEffectiveSettings | undefined {
  if (!isPlainObject(result)) return undefined;
  const effective: AppServerThreadEffectiveSettings = {
    ...(readOptionalString(result.model) ? { model: readOptionalString(result.model) } : {}),
    ...(readOptionalString(result.modelProvider) ? { modelProvider: readOptionalString(result.modelProvider) } : {}),
    ...(readOptionalString(result.cwd) ? { cwd: readOptionalString(result.cwd) } : {}),
    ...(readOptionalStringArray(result.runtimeWorkspaceRoots) ? { runtimeWorkspaceRoots: readOptionalStringArray(result.runtimeWorkspaceRoots) } : {}),
    ...(readOptionalStringArray(result.instructionSources) ? { instructionSources: readOptionalStringArray(result.instructionSources) } : {}),
    ...(readApprovalPolicyEffective(result.approvalPolicy) ? { approvalPolicy: readApprovalPolicyEffective(result.approvalPolicy) } : {}),
    ...(readOptionalString(result.approvalsReviewer) ? { approvalsReviewer: readOptionalString(result.approvalsReviewer) } : {}),
    ...(readSandboxPolicy(result.sandbox) ? { sandbox: readSandboxPolicy(result.sandbox) } : {}),
    ...(readEffectivePermissionProfile(result.activePermissionProfile) ? { activePermissionProfile: readEffectivePermissionProfile(result.activePermissionProfile) } : {}),
    ...(readOptionalString(result.reasoningEffort) ? { reasoningEffort: readOptionalString(result.reasoningEffort) } : {}),
  };
  return Object.keys(effective).length > 0 ? effective : undefined;
}

/**
 * Per-field runtime evidence for a thread's effective settings, reusing the
 * shared three-axis ConfigurationEvidence (persistence/application/runtime ×
 * verified|pending|unavailable|failed|not-applicable).
 *
 * For this session-level readback surface `persistence` is honestly
 * `not-applicable` (this evidence proves runtime confirmation, not a stored
 * source). `application`/`runtime` track the request lifecycle:
 *   - pending: a thread start/resume is in flight for this session
 *   - verified: the server returned this field in its response
 *   - unavailable: the app-server is not in use, or a successful response
 *     omitted the field (older server) — detail distinguishes the two
 *   - failed: the thread start/resume request failed
 *
 * Request-side turn options are NEVER reported as verified here.
 */
export interface AppServerThreadEffectiveEvidence {
  readonly model: ConfigurationEvidence;
  readonly modelProvider: ConfigurationEvidence;
  readonly cwd: ConfigurationEvidence;
  readonly sandbox: ConfigurationEvidence;
  readonly approvalPolicy: ConfigurationEvidence;
  readonly activePermissionProfile: ConfigurationEvidence;
  readonly reasoningEffort: ConfigurationEvidence;
}

export type EffectiveReadbackStatus = 'pending' | 'verified' | 'unavailable' | 'failed';

const EFFECTIVE_FIELD_KEYS = [
  'model',
  'modelProvider',
  'cwd',
  'sandbox',
  'approvalPolicy',
  'activePermissionProfile',
  'reasoningEffort',
] as const;

/**
 * Build uniform evidence for every field at one lifecycle status, RESPECTING
 * wiring: a field the plugin never wires (modelProvider, activePermissionProfile,
 * approval under `inherit`) is application `not-applicable` in every state —
 * never pending/failed/unavailable. `runtime` still tracks the lifecycle.
 */
export function buildUniformEffectiveEvidence(
  status: 'pending' | 'failed' | 'unavailable',
  wired: EffectiveFieldWiring,
  detail?: string,
): AppServerThreadEffectiveEvidence {
  const entries = EFFECTIVE_FIELD_KEYS.map((key) => {
    const w = wired[key as keyof EffectiveFieldWiring];
    const application: ConfigurationEvidence['application'] = w ? status : 'not-applicable';
    const ev: ConfigurationEvidence = { persistence: 'not-applicable', application, runtime: status, ...(detail ? { detail } : {}) };
    return [key, ev] as const;
  });
  return Object.fromEntries(entries) as unknown as AppServerThreadEffectiveEvidence;
}

/** Per-field application-axis status (computed from phase + wiring). */
export type FieldApplicationStatus = ConfigurationEvidence['application'];
export interface EffectiveFieldApplication {
  readonly model: FieldApplicationStatus;
  readonly modelProvider: FieldApplicationStatus;
  readonly cwd: FieldApplicationStatus;
  readonly sandbox: FieldApplicationStatus;
  readonly approvalPolicy: FieldApplicationStatus;
  readonly activePermissionProfile: FieldApplicationStatus;
  readonly reasoningEffort: FieldApplicationStatus;
}

/**
 * Build per-field evidence from an explicit per-field application map + a runtime
 * lifecycle status (+ captured response for verified/unavailable runtime). The
 * honest core: application decided by phase+wiring (caller), runtime by response.
 */
export function buildEffectiveEvidenceWithApplication(
  application: EffectiveFieldApplication,
  runtimeStatus: 'verified' | 'pending' | 'failed' | 'unavailable',
  effective: AppServerThreadEffectiveSettings | null,
): AppServerThreadEffectiveEvidence {
  const entries = EFFECTIVE_FIELD_KEYS.map((key) => {
    const val = effective ? (effective as Record<string, unknown>)[key] : undefined;
    const present = val !== undefined && val !== null;
    const runtime: ConfigurationEvidence['runtime'] =
      runtimeStatus === 'verified' ? (present ? 'verified' : 'unavailable') : runtimeStatus;
    const ev: ConfigurationEvidence = { persistence: 'not-applicable', application: application[key as keyof EffectiveFieldApplication], runtime };
    return [key, ev] as const;
  });
  return Object.fromEntries(entries) as unknown as AppServerThreadEffectiveEvidence;
}

/** Thread-phase application: thread-sent fields verified (if wired); effort pending (turn not done); never-wired NA. */
export function threadPhaseApplication(wired: EffectiveFieldWiring): EffectiveFieldApplication {
  const w = (b: boolean, threadField: boolean): FieldApplicationStatus =>
    !b ? 'not-applicable' : threadField ? 'verified' : 'pending';
  return {
    model: w(wired.model, true),
    modelProvider: 'not-applicable',
    cwd: w(wired.cwd, true),
    sandbox: w(wired.sandbox, true),
    approvalPolicy: w(wired.approvalPolicy, true),
    activePermissionProfile: 'not-applicable',
    reasoningEffort: w(wired.reasoningEffort, false), // effort is sent at turn/start, not thread
  };
}

/** Turn-success application: thread fields + effort all verified (if wired); never-wired NA. */
export function turnSuccessApplication(wired: EffectiveFieldWiring): EffectiveFieldApplication {
  const w = (b: boolean): FieldApplicationStatus => (b ? 'verified' : 'not-applicable');
  return {
    model: w(wired.model),
    modelProvider: 'not-applicable',
    cwd: w(wired.cwd),
    sandbox: w(wired.sandbox),
    approvalPolicy: w(wired.approvalPolicy),
    activePermissionProfile: 'not-applicable',
    reasoningEffort: w(wired.reasoningEffort),
  };
}

/** Per-field "did the plugin wire this into the app-server request/turn?" map. */
export interface EffectiveFieldWiring {
  readonly model: boolean;
  readonly modelProvider: boolean;
  readonly cwd: boolean;
  readonly sandbox: boolean;
  readonly approvalPolicy: boolean;
  readonly activePermissionProfile: boolean;
  readonly reasoningEffort: boolean;
}

function isGroupEnvelope(entry: unknown): entry is AppServerSkillGroupEnvelope {
  return isPlainObject(entry) && Array.isArray(entry.skills);
}

function isAppServerSkill(entry: unknown): entry is AppServerSkill {
  return isPlainObject(entry) && typeof entry.name === 'string' && entry.name.length > 0;
}

/** Preserve only known AppServerSkill fields, dropping unexpected extras. */
function pickSkillFields(entry: AppServerSkill): AppServerSkill {
  const out: AppServerSkill = { name: entry.name };
  if (entry.description !== undefined) {
    out.description = entry.description;
  }
  if (entry.path !== undefined) {
    out.path = entry.path;
  }
  if (entry.enabled !== undefined) {
    out.enabled = entry.enabled;
  }
  if (entry.scope !== undefined) {
    out.scope = entry.scope;
  }
  return out;
}

/** Preserve grouped settings metadata without expanding the legacy flat API. */
function pickGroupedSkillFields(entry: AppServerSkill): AppServerSkill {
  const out = pickSkillFields(entry);
  if (entry.shortDescription !== undefined) {
    out.shortDescription = entry.shortDescription;
  }
  if (entry.source !== undefined) {
    out.source = entry.source;
  }
  if (entry.interface !== undefined) {
    out.interface = entry.interface;
  }
  if (entry.dependencies !== undefined) {
    out.dependencies = entry.dependencies;
  }
  return out;
}

function isGroupedSkillCandidate(entry: unknown): entry is Record<string, unknown> {
  if (!isPlainObject(entry)) return false;
  return readOptionalString(entry.cwd) !== undefined
    || Array.isArray(entry.skills)
    || Array.isArray(entry.errors);
}

function normalizeSkillCandidates(value: unknown): AppServerSkill[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isAppServerSkill)
    .map(pickGroupedSkillFields);
}

function normalizeSkillError(entry: unknown): AppServerSkillError | null {
  if (typeof entry === 'string' && entry.length > 0) {
    return { message: entry };
  }
  if (!isPlainObject(entry)) return null;
  const message = readOptionalString(entry.message);
  if (!message) return null;
  const path = readOptionalString(entry.path);
  return path ? { path, message } : { message };
}

function normalizeSkillErrors(value: unknown): AppServerSkillError[] {
  if (!Array.isArray(value)) return [];
  const errors: AppServerSkillError[] = [];
  for (const entry of value) {
    const error = normalizeSkillError(entry);
    if (error) errors.push(error);
  }
  return errors;
}

/**
 * Normalize `skills/list` without discarding its cwd grouping or discovery
 * errors. Legacy flat replies are represented as one group, using only an
 * explicitly supplied fallback cwd; an absent cwd remains null.
 */
export function normalizeSkillsListGroupedResult(
  result: unknown,
  defaultCwd?: string,
): AppServerSkillGroup[] {
  let candidates: unknown[] | undefined;
  if (Array.isArray(result)) {
    candidates = result;
  } else if (isPlainObject(result)) {
    if (Array.isArray(result.data)) {
      candidates = result.data;
    } else if (isGroupedSkillCandidate(result)) {
      candidates = [result];
    }
  }
  if (!candidates) return [];

  const fallbackCwd = readOptionalString(defaultCwd) ?? null;
  const groups: AppServerSkillGroup[] = [];
  let looseSkills: AppServerSkill[] = [];
  const flushLooseSkills = (): void => {
    if (looseSkills.length === 0) return;
    groups.push({ cwd: fallbackCwd, skills: looseSkills, errors: [] });
    looseSkills = [];
  };

  for (const entry of candidates) {
    if (isGroupedSkillCandidate(entry)) {
      flushLooseSkills();
      groups.push({
        cwd: readOptionalString(entry.cwd) ?? fallbackCwd,
        skills: normalizeSkillCandidates(entry.skills),
        errors: normalizeSkillErrors(entry.errors),
      });
    } else if (isAppServerSkill(entry)) {
      looseSkills.push(pickGroupedSkillFields(entry));
    }
  }
  flushLooseSkills();
  return groups;
}

/**
 * Normalize the raw `skills/list` reply into a flat `AppServerSkill[]`.
 *
 * Accepts every observed runtime shape defensively, never fabricating skills:
 *   - a flat `AppServerSkill[]`;
 *   - a `{ data: AppServerSkill[] }` wrapper;
 *   - a single top-level group envelope `{ cwd, skills, errors }`;
 *   - an array of group envelopes `[{ cwd, skills, errors }, …]` (the actual
 *     current server shape).
 *
 * Malformed entries (no string `name`) are dropped. Group `errors` are ignored
 * (the menu only surfaces discovered skills; the empty-skill notice handles the
 * "none found" case).
 */
export function normalizeSkillsListResult(result: unknown): AppServerSkill[] {
  let candidates: unknown[] | undefined;
  if (Array.isArray(result)) {
    candidates = result;
  } else if (isPlainObject(result)) {
    if (Array.isArray(result.data)) {
      candidates = result.data;
    } else if (Array.isArray(result.skills)) {
      // Single top-level group envelope.
      candidates = result.skills;
    }
  }

  if (!candidates) {
    return [];
  }

  const flattened: AppServerSkill[] = [];
  for (const entry of candidates) {
    if (isGroupEnvelope(entry)) {
      for (const inner of entry.skills ?? []) {
        if (isAppServerSkill(inner)) {
          flattened.push(pickSkillFields(inner));
        }
      }
    } else if (isAppServerSkill(entry)) {
      flattened.push(pickSkillFields(entry));
    }
  }
  return flattened;
}

function errorToReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * True when a rejected request failed because the route does not exist on the
 * current app-server (-32601 `Method not found` or an equivalent server
 * message). Exported so capability owners can dynamically drop a route-backed
 * capability after optimistic probing instead of string-matching ad hoc.
 */
export function isAppServerMethodNotFoundError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === -32601) return true;
  const reason = errorToReason(error).toLowerCase();
  return reason.includes('method not found')
    || reason.includes('unknown method')
    || reason.includes('not supported');
}

/** Route absence/transport loss means the adjunct capability is unavailable. */
function isHooksRouteUnavailable(error: unknown): boolean {
  if (isAppServerMethodNotFoundError(error)) return true;
  const reason = errorToReason(error).toLowerCase();
  return reason.includes('websocket not open')
    || reason.includes('app-server start')
    || reason.includes('app-server exited')
    || reason.includes('websocket connection')
    || reason.includes('app-server client stopped');
}

function readHookNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function readHookNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function setHookMetadataField(metadata: AppServerHookMetadata, key: keyof AppServerHookMetadata, value: unknown): void {
  if (value !== undefined) {
    Object.assign(metadata, { [key]: value });
  }
}

/** Normalize one metadata object while intentionally dropping unknown fields. */
function normalizeHookMetadata(value: unknown): AppServerHookMetadata | null {
  if (!isPlainObject(value)) return null;
  const requiredFields = ['key', 'eventName', 'handlerType'] as const;
  if (!requiredFields.every((field) => isNonEmptyString(value[field]))) {
    return null;
  }
  const metadata: AppServerHookMetadata = {
    key: value.key as string,
    eventName: value.eventName as string,
    handlerType: value.handlerType as string,
  };
  setHookMetadataField(metadata, 'matcher', readHookNullableString(value.matcher));
  setHookMetadataField(metadata, 'command', readHookNullableString(value.command));
  setHookMetadataField(metadata, 'timeoutSec', readHookNumber(value.timeoutSec));
  setHookMetadataField(metadata, 'statusMessage', readHookNullableString(value.statusMessage));
  setHookMetadataField(metadata, 'sourcePath', typeof value.sourcePath === 'string' ? value.sourcePath : undefined);
  setHookMetadataField(metadata, 'source', typeof value.source === 'string' ? value.source : undefined);
  setHookMetadataField(metadata, 'pluginId', readHookNullableString(value.pluginId));
  setHookMetadataField(metadata, 'displayOrder', readHookNumber(value.displayOrder));
  setHookMetadataField(metadata, 'enabled', typeof value.enabled === 'boolean' ? value.enabled : undefined);
  setHookMetadataField(metadata, 'isManaged', typeof value.isManaged === 'boolean' ? value.isManaged : undefined);
  setHookMetadataField(metadata, 'currentHash', typeof value.currentHash === 'string' ? value.currentHash : undefined);
  setHookMetadataField(metadata, 'trustStatus', typeof value.trustStatus === 'string' ? value.trustStatus : undefined);
  return metadata;
}

function normalizeHookError(value: unknown): AppServerHookError | null {
  if (!isPlainObject(value) || typeof value.path !== 'string' || typeof value.message !== 'string') {
    return null;
  }
  return { path: value.path, message: value.message };
}

/** Normalize the exact `{ data: HooksListEntry[] }` response shape. */
function normalizeHooksListResult(result: unknown): AppServerHookGroup[] | null {
  if (!isPlainObject(result) || !Array.isArray(result.data)) return null;
  const groups: AppServerHookGroup[] = [];
  for (const value of result.data) {
    if (!isPlainObject(value) || typeof value.cwd !== 'string' || !Array.isArray(value.hooks)
      || !Array.isArray(value.warnings) || !Array.isArray(value.errors)) {
      return null;
    }
    const hooks: AppServerHookMetadata[] = [];
    for (const hook of value.hooks) {
      const normalized = normalizeHookMetadata(hook);
      if (!normalized) return null;
      hooks.push(normalized);
    }
    const warnings = value.warnings.filter((warning): warning is string => typeof warning === 'string');
    if (warnings.length !== value.warnings.length) return null;
    const errors: AppServerHookError[] = [];
    for (const error of value.errors) {
      const normalized = normalizeHookError(error);
      if (!normalized) return null;
      errors.push(normalized);
    }
    groups.push({ cwd: value.cwd, hooks, warnings, errors });
  }
  return groups;
}

function hooksReadbackFromGroups(groups: AppServerHookGroup[]): AppServerHooksReadbackResult {
  const empty = groups.every((group) => group.hooks.length === 0 && group.warnings.length === 0 && group.errors.length === 0);
  return { status: empty ? 'empty' : 'available', groups };
}

const STEER_ERROR_CODE_PATTERN =
  /no_active_turn|expected_turn_mismatch|non_steerable_review|non_steerable_compact|active_turn_not_steerable|empty_input|input_too_large/;

/**
 * Classify a rejected `turn/steer` request. The server delivers steer errors
 * inside the JSON-RPC error message and/or its free-form `data` payload; scan
 * both defensively and map the `non_steerable_*` codes to their turn kind.
 */
function classifySteerError(error: unknown): AppServerSteerTurnError {
  const message = errorToReason(error);
  const data = (error as { data?: unknown } | null)?.data;
  const haystack = `${message} ${typeof data === 'string' ? data : JSON.stringify(data ?? {})}`.toLowerCase();
  const match = STEER_ERROR_CODE_PATTERN.exec(haystack);
  const code: AppServerSteerTurnErrorCode = (match?.[0] as AppServerSteerTurnErrorCode | undefined) ?? 'unknown';
  let turnKind: AppServerSteerTurnError['turnKind'];
  if (haystack.includes('non_steerable_review') || (code === 'active_turn_not_steerable' && haystack.includes('review'))) {
    turnKind = 'review';
  } else if (haystack.includes('non_steerable_compact') || (code === 'active_turn_not_steerable' && haystack.includes('compact'))) {
    turnKind = 'compact';
  }
  let misalignment: AppServerSteerTurnError['misalignment'];
  if (haystack.includes('misalignment')) {
    const misalignmentMessage = isPlainObject(data) && typeof data.message === 'string'
      ? data.message
      : message;
    misalignment = { message: misalignmentMessage };
  }
  return {
    code,
    message,
    ...(turnKind ? { turnKind } : {}),
    ...(misalignment ? { misalignment } : {}),
  };
}

/** Normalize a raw `thread/items/list` response; null when it is not a page. */
function normalizeThreadItemsPage(result: unknown): AppServerThreadItemsPage | null {
  if (!isPlainObject(result) || !Array.isArray(result.data)) return null;
  return {
    data: result.data as AppServerThreadItemsPage['data'],
    nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : null,
    backwardsCursor: typeof result.backwardsCursor === 'string' ? result.backwardsCursor : null,
  };
}

/** Normalize a raw `thread/turns/list` response; null when it is not a page. */
function normalizeThreadTurnsPage(result: unknown): AppServerThreadTurnsPage | null {
  if (!isPlainObject(result) || !Array.isArray(result.data)) return null;
  return {
    data: result.data as AppServerThreadTurnsPage['data'],
    nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : null,
    backwardsCursor: typeof result.backwardsCursor === 'string' ? result.backwardsCursor : null,
  };
}

/** Normalize a raw `plugin/list` (or `plugin/installed`) response defensively. */
function normalizePluginListResult(result: unknown): AppServerPluginListResult | null {
  if (!isPlainObject(result) || !Array.isArray(result.marketplaces)) return null;
  return {
    marketplaces: result.marketplaces as AppServerPluginListResult['marketplaces'],
    featuredPluginIds: Array.isArray(result.featuredPluginIds)
      ? result.featuredPluginIds.filter((id): id is string => typeof id === 'string')
      : [],
    marketplaceLoadErrors: Array.isArray(result.marketplaceLoadErrors)
      ? result.marketplaceLoadErrors.filter(
        (entry): entry is { marketplacePath: string; message: string } =>
          isPlainObject(entry) && typeof entry.marketplacePath === 'string' && typeof entry.message === 'string',
      )
      : [],
  };
}

export class CodexAppServerClient extends CodexAppServerTransport {
  // ---------------------------------------------------------------------------
  // App-server API wrappers
  // ---------------------------------------------------------------------------

  /**
   * Effective settings defensively captured from the most recent
   * `thread/start` / `thread/resume` response for each thread id. Absent
   * entries mean no verified runtime readback is available for that thread.
   */
  private readonly threadEffectiveSettings = new Map<string, AppServerThreadEffectiveSettings | null>();

  async listThreads(options: { limit?: number; archived?: boolean | null } = {}): Promise<AppServerThread[]> {
    await this.start();
    const { limit = 50, archived } = options;
    const params: Record<string, unknown> = { limit };
    if (archived !== undefined) {
      params.archived = archived;
    }
    const result = (await this.request('thread/list', params)) as { data: AppServerThread[] } | undefined;
    return result?.data ?? [];
  }

  async readThread(threadId: string, includeTurns = true): Promise<AppServerThread | null> {
    await this.start();
    try {
      const result = (await this.request('thread/read', { threadId, includeTurns })) as { thread: AppServerThread } | undefined;
      return result?.thread ?? null;
    } catch (err) {
      logger.warn('Failed to read thread', { threadId, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /** Start a new persisted app-server thread using experimental API options. */
  async startThread(options: AppServerThreadStartOptions = {}): Promise<AppServerThread | null> {
    await this.start();
    try {
      const result = (await this.request(
        'thread/start',
        options as unknown as Record<string, unknown>,
        30000,
      )) as { thread?: AppServerThread } | undefined;
      const thread = result?.thread ?? null;
      if (thread?.id) {
        this.captureThreadEffectiveSettings(thread.id, result);
      }
      return thread;
    } catch (err) {
      logger.warn('Failed to start thread via app-server', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /** Resume an existing thread and apply the current backend options. */
  async resumeThread(threadId: string, options: AppServerThreadResumeOptions = {}): Promise<AppServerThread | null> {
    await this.start();
    try {
      const result = (await this.request('thread/resume', { threadId, ...options }, 30000)) as { thread: AppServerThread } | undefined;
      const thread = result?.thread ?? null;
      if (thread?.id) {
        this.captureThreadEffectiveSettings(thread.id, result);
      }
      return thread;
    } catch (err) {
      logger.warn('Failed to resume thread via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Defensively capture the effective-settings fields from a thread start/resume
   * response. ALWAYS replaces the thread's entry with the parsed result of THIS
   * response (null when the server echoed no effective fields), so a later
   * no-field response cannot leave a stale `verified` snapshot from an earlier
   * response.
   */
  private captureThreadEffectiveSettings(threadId: string, result: unknown): void {
    this.threadEffectiveSettings.set(threadId, extractThreadEffectiveSettings(result) ?? null);
  }

  /**
   * Read the most recently captured effective settings for a thread, or null
   * when the most recent response echoed no effective fields (older server) or
   * no readback exists. Request-side turn options are never reported here —
   * only server-confirmed fields.
   */
  getThreadEffectiveSettings(threadId: string): AppServerThreadEffectiveSettings | null {
    return this.threadEffectiveSettings.get(threadId) ?? null;
  }

  /**
   * Evict the cached effective settings for a thread (used by adapter
   * deleteSession to prevent stale readback for a deleted session).
   */
  clearThreadEffectiveSettings(threadId: string): void {
    this.threadEffectiveSettings.delete(threadId);
  }

  /** Stop the transport and clear all cached effective settings. */
  override async stop(): Promise<void> {
    await super.stop();
    this.threadEffectiveSettings.clear();
  }

  /** Start a turn. Progress arrives exclusively through async notifications. */
  async startTurn(options: AppServerTurnStartOptions): Promise<AppServerTurn | null> {
    await this.start();
    try {
      const result = (await this.request(
        'turn/start',
        options as unknown as Record<string, unknown>,
        30000,
      )) as { turn?: AppServerTurn } | undefined;
      return result?.turn ?? null;
    } catch (err) {
      logger.warn('Failed to start turn via app-server', {
        threadId: options.threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Request foreground context compaction for one persisted app-server thread.
   *
   * An empty object is the exact 0.144.1 ACK shape and means only that the
   * server accepted the request.  Runtime completion remains asynchronous and
   * is intentionally observed by `CodexAdapter` from thread notifications.
   */
  async startThreadCompaction(
    threadId: string,
    options: AppServerThreadCompactionStartOptions = {},
  ): Promise<AppServerThreadCompactionAckResult> {
    if (!threadId.trim()) {
      return { status: 'invalid-thread', acknowledged: false, errorReason: 'threadId is required' };
    }
    try {
      await this.start();
    } catch (err) {
      return { status: 'unavailable', acknowledged: false, errorReason: errorToReason(err) };
    }
    try {
      const result = await this.request(
        'thread/compact/start',
        { threadId },
        options.acknowledgementTimeoutMs ?? 30_000,
      );
      if (!isPlainObject(result) || Array.isArray(result) || Object.keys(result).length !== 0) {
        return {
          status: 'malformed',
          acknowledged: false,
          errorReason: 'thread/compact/start ACK did not match the empty object binding',
        };
      }
      return { status: 'accepted', acknowledged: true };
    } catch (err) {
      const reason = errorToReason(err);
      const normalized = reason.toLowerCase();
      if (normalized.includes('timeout')) {
        return { status: 'timed-out', acknowledged: false, errorReason: reason };
      }
      if (normalized.includes('thread not found') || normalized.includes('missing field')) {
        return { status: 'invalid-thread', acknowledged: false, errorReason: reason };
      }
      if (isHooksRouteUnavailable(err)) {
        return { status: 'unavailable', acknowledged: false, errorReason: reason };
      }
      return { status: 'failed', acknowledged: false, errorReason: reason };
    }
  }

  async interruptTurn(threadId: string, turnId: string): Promise<boolean> {
    await this.start();
    try {
      await this.request('turn/interrupt', { threadId, turnId }, 30000);
      return true;
    } catch (err) {
      logger.warn('Failed to interrupt turn via app-server', {
        threadId,
        turnId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Subscribe to notifications belonging to one thread. The app-server sends
   * all streaming output on this socket, so filtering at this boundary keeps
   * concurrent Codex conversations isolated.
   */
  subscribeToThreadNotifications(
    threadId: string,
    handler: (event: AppServerThreadNotification) => void,
  ): AppServerNotificationSubscription {
    const methods = [
      'thread/tokenUsage/updated',
      'turn/completed',
      'item/started',
      'item/completed',
      'item/agentMessage/delta',
      'item/reasoning/textDelta',
      'item/commandExecution/outputDelta',
      'item/fileChange/patchUpdated',
      'item/mcpToolCall/progress',
      'thread/name/updated',
      'thread/goal/updated',
      'thread/goal/cleared',
      'thread/deleted',
      'thread/attachment/updated',
      'warning',
      'error',
    ];
    const handlers = methods.map((method) => ({
      method,
      listener: (params: unknown) => {
        const candidate = params as { threadId?: unknown } | null;
        if (candidate?.threadId === threadId) {
          handler({ method, params });
        }
      },
    }));
    for (const entry of handlers) {
      this.addNotificationHandler(entry.method, entry.listener);
    }
    return {
      dispose: () => {
        for (const entry of handlers) {
          this.removeNotificationHandler(entry.method, entry.listener);
        }
      },
    };
  }

  async listPermissionProfiles(options?: { cwd?: string; limit?: number; cursor?: string }): Promise<AppServerPermissionProfile[]> {
    await this.start();
    try {
      const result = (await this.request('permissionProfile/list', { limit: options?.limit ?? 50, ...(options?.cwd ? { cwd: options.cwd } : {}), ...(options?.cursor ? { cursor: options.cursor } : {}) })) as { data: AppServerPermissionProfile[] } | undefined;
      return result?.data ?? [];
    } catch (err) {
      logger.warn('Failed to list permission profiles', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  async listModels(options?: { limit?: number; cursor?: string }): Promise<AppServerModel[]> {
    await this.start();
    try {
      const result = (await this.request('model/list', { limit: options?.limit ?? 50, ...(options?.cursor ? { cursor: options.cursor } : {}) })) as { data: AppServerModel[] } | undefined;
      return result?.data ?? [];
    } catch (err) {
      logger.warn('Failed to list models from app-server', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  async getAccountRead(): Promise<unknown | null> {
    await this.start();
    try {
      const result = await this.request('account/read', {});
      return result ?? null;
    } catch (err) {
      logger.warn('Failed to read account info from app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async getAccountRateLimits(): Promise<AppServerAccountRateLimitsResult> {
    await this.start();
    try {
      const result = (await this.request('account/rateLimits/read', {})) as AppServerRateLimits | undefined;
      if (result && typeof result === 'object' && 'rateLimits' in result) {
        return { rateLimits: result as AppServerRateLimits };
      }
      return { rateLimits: null };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to read account rate limits', { error: reason });
      return { rateLimits: null, errorReason: reason };
    }
  }

  /**
   * Read token usage via `account/usage/read`. Params are nullable
   * `{ threadId? }` on the wire (Codex 0.159.0): pass a thread id to get the
   * per-thread estimate (`usage.threadUsage`) instead of account-wide buckets.
   * With no options the request stays parameterless, matching the verified
   * wire assumption documented in the module doc.
   */
  async getAccountUsage(options?: { threadId?: string }): Promise<AppServerAccountUsageResult> {
    await this.start();
    try {
      const result = (await this.request(
        'account/usage/read',
        options?.threadId ? { threadId: options.threadId } : undefined,
      )) as AppServerAccountUsage | undefined;
      if (result && typeof result === 'object' && 'summary' in result) {
        return { usage: result as AppServerAccountUsage };
      }
      return { usage: null };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to read account usage from app-server', {
        error: reason,
      });
      return { usage: null, errorReason: reason };
    }
  }

  async getModelProviderCapabilities(): Promise<AppServerModelProviderCapabilities | null> {
    await this.start();
    try {
      const result = (await this.request('modelProvider/capabilities/read', {})) as AppServerModelProviderCapabilities | undefined;
      if (result && typeof result === 'object' && ('namespaceTools' in result || 'imageGeneration' in result || 'webSearch' in result)) {
        return result;
      }
      return null;
    } catch (err) {
      logger.warn('Failed to read model provider capabilities', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * List skills exposed by the Codex app-server via the `skills/list` route.
   *
   * Params: `{ cwd?, forceReload? }`. `cwd` scopes the query to the current
   * vault working directory (Codex resolves project-scoped skills relative to
   * it); `forceReload` asks the server to bypass its cache. Returns
   * `AppServerSkill[]` (name/description/path/enabled/scope) or an empty array
   * when the route is unreachable on the current Codex version.
   *
   * This API is read-only: it only describes runtime-discovered skills and
   * does not mutate resources. The current P0 surface exposes no global Codex
   * skill mutation API; a future P1 global CRUD owner would need the shared
   * secure-file contract with allowlisted-root validation.
   */
   async listSkills(options?: AppServerListSkillsOptions): Promise<AppServerSkill[]> {
    await this.start();
    try {
      const params: Record<string, unknown> = {};
      if (options?.cwd) {
        params.cwd = options.cwd;
      }
      if (options?.forceReload) {
        params.forceReload = true;
      }
      const result = await this.request('skills/list', params);
      return normalizeSkillsListResult(result);
    } catch (err) {
      logger.warn('Failed to list skills from app-server', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  /**
   * List skills while preserving each server-provided cwd group and its
   * discovery errors. This is an additive settings readback API; `listSkills`
   * remains the flat chat/catalog compatibility path.
   */
  async listSkillGroups(options?: AppServerListSkillsOptions): Promise<AppServerSkillGroup[] | null> {
    await this.start();
    try {
      const params: Record<string, unknown> = {};
      if (options?.cwd) {
        params.cwd = options.cwd;
      }
      if (options?.forceReload) {
        params.forceReload = true;
      }
      const result = await this.request('skills/list', params);
      return normalizeSkillsListGroupedResult(result, options?.cwd);
    } catch (err) {
      logger.warn('Failed to list grouped skills from app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Read Codex hook metadata via the read-only `hooks/list` route.
   *
   * `available` and `empty` are successful responses; `unavailable` means the
   * route or transport is absent; `failed` means the route rejected/timed out;
   * `malformed` means a successful reply did not match the generated binding.
   * No write/update/delete route is implied by this readback API.
   */
  async listHooks(options?: AppServerListHooksOptions): Promise<AppServerHooksReadbackResult> {
    try {
      await this.start();
    } catch (err) {
      const reason = errorToReason(err);
      return {
        status: 'unavailable',
        groups: [],
        ...(reason ? { errorReason: reason } : {}),
      };
    }

    try {
      const params: Record<string, unknown> = {};
      if (options?.cwds !== undefined) {
        params.cwds = options.cwds;
      }
      const result = await this.request('hooks/list', params);
      const groups = normalizeHooksListResult(result);
      if (!groups) {
        return { status: 'malformed', groups: [], errorReason: 'hooks/list response did not match the generated binding' };
      }
      return hooksReadbackFromGroups(groups);
    } catch (err) {
      const reason = errorToReason(err);
      return {
        status: isHooksRouteUnavailable(err) ? 'unavailable' : 'failed',
        groups: [],
        ...(reason ? { errorReason: reason } : {}),
      };
    }
  }

  /**
   * Subscribe to `skills/changed` notifications. The Codex app-server emits
   * this when its skill catalog changes (skill files added/removed/edited on
   * disk, or a project-scoped reload). The handler receives no useful payload
   * — it is purely a signal to invalidate any cached skill catalog and
   * re-fetch via `listSkills()`.
   *
   * Returns an unsubscribe function. Use it on teardown to avoid leaking the
   * handler (the same pattern as `addNotificationHandler` /
   * `removeNotificationHandler`, which this wraps).
   */
  subscribeToSkillsChanged(handler: () => void): () => void {
    const wrapped = (): void => handler();
    this.addNotificationHandler('skills/changed', wrapped);
    return () => {
      this.removeNotificationHandler('skills/changed', wrapped);
    };
  }

  async listMcpServerStatus(): Promise<AppServerMcpServerStatus[]> {
    await this.start();
    try {
      const result = (await this.request('mcpServerStatus/list', {}, 30000)) as { data: AppServerMcpServerStatus[] } | undefined;
      return result?.data ?? [];
    } catch (err) {
      logger.warn('Failed to list MCP server status from app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  async reloadMcpServers(): Promise<boolean> {
    await this.start();
    try {
      await this.request('config/mcpServer/reload', {});
      return true;
    } catch (err) {
      logger.warn('Failed to reload MCP servers via app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Read a single MCP server resource via the app-server
   * `mcpServer/resource/read` route.
   *
   * Params: `{ server, uri }` (note: the field is `server`, not `name`).
   * Returns the resource contents (text or base64 blob per the MCP spec),
   * or a result with `errorReason` when the route is unreachable / errors.
   */
  async readMcpServerResource(server: string, uri: string): Promise<AppServerMcpResourceReadResult | null> {
    await this.start();
    try {
      const result = (await this.request('mcpServer/resource/read', { server, uri }, 30000)) as
        | { contents?: AppServerMcpResourceContent[] }
        | undefined;
      if (result && Array.isArray(result.contents)) {
        return { contents: result.contents };
      }
      return { contents: [] };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to read MCP server resource', { server, uri, error: reason });
      return { contents: [], errorReason: reason };
    }
  }

  /**
   * Call an MCP tool directly via the app-server `mcpServer/tool/call` route.
   *
   * Params: `{ threadId, server, tool, arguments }`. The route requires a
   * *loaded* thread (one resumed via `thread/resume`), so this method resumes
   * the thread first (idempotent for already-loaded threads). Returns the
   * tool's content entries and error flag, or a result with `errorReason` when
   * the route itself is unreachable / rejects the request.
   */
  async mcpServerToolCall(
    threadId: string,
    server: string,
    tool: string,
    toolArguments: Record<string, unknown>,
  ): Promise<AppServerMcpToolCallResult | null> {
    await this.start();
    try {
      await this.request('thread/resume', { threadId }, 30000);
      const result = (await this.request(
        'mcpServer/tool/call',
        { threadId, server, tool, arguments: toolArguments },
        60000,
      )) as { content?: AppServerMcpToolCallContent[]; isError?: boolean } | undefined;
      const content = Array.isArray(result?.content) ? result!.content : [];
      const isError = result?.isError === true;
      return { content, isError };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to call MCP tool via app-server', { threadId, server, tool, error: reason });
      return { content: [], isError: true, errorReason: reason };
    }
  }

  async mcpServerOauthLogin(
    name: string,
    options?: { scopes?: string[]; timeoutSecs?: number; onAuthorizationUrl?: (url: string) => void },
  ): Promise<McpOauthLoginResult> {
    await this.start();
    let handler: ((params: unknown) => void) | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let browserOpened = false;
    try {
      const params: Record<string, unknown> = { name };
      if (options?.scopes) { params.scopes = options.scopes; }
      if (options?.timeoutSecs) { params.timeoutSecs = options.timeoutSecs; }

      const timeoutMs = (options?.timeoutSecs ?? 300) * 1000 + 5000;
      const completionPromise = new Promise<boolean>((resolve) => {
        handler = (notificationParams: unknown): void => {
          const p = notificationParams as Record<string, unknown> | undefined;
          if (p?.name === name) {
            resolve(true);
          }
        };
        this.addNotificationHandler('mcpServer/oauthLogin/completed', handler);
      });

      const response = await this.request('mcpServer/oauth/login', params, timeoutMs);
      const authUrl = (response as Record<string, unknown> | undefined)?.authorizationUrl;
      if (typeof authUrl === 'string' && authUrl.length > 0) {
        browserOpened = true;
        options?.onAuthorizationUrl?.(authUrl);
      } else {
        return {
          outcome: 'failed',
          browserOpened: false,
          errorReason: 'No authorizationUrl in response',
        };
      }

      const notificationArrived = await Promise.race([
        completionPromise,
        new Promise<boolean>((resolve) => {
          timeoutHandle = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);

      if (notificationArrived) {
        return { outcome: 'completed', browserOpened: true };
      }
      return { outcome: 'pending', browserOpened: true };
    } catch (err) {
      const errorReason = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to trigger MCP server OAuth login', { name, error: errorReason });
      return {
        outcome: 'failed',
        browserOpened,
        errorReason,
      };
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (handler) {
        this.removeNotificationHandler('mcpServer/oauthLogin/completed', handler);
      }
    }
  }

  async getThreadGoal(threadId: string): Promise<AppServerThreadGoal | null> {
    await this.start();
    try {
      const result = (await this.request('thread/goal/get', { threadId })) as { goal: AppServerThreadGoal | null } | undefined;
      return result?.goal ?? null;
    } catch (err) {
      logger.warn('Failed to read thread goal from app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Set, or update, a thread goal via `thread/goal/set` (Codex 0.159.0 accepts
   * `{ threadId, objective?, status?, tokenBudget? }`). Passing only
   * `options.status` pauses/resumes the existing goal without restating its
   * objective.
   */
  async setThreadGoal(
    threadId: string,
    objective?: string,
    options?: AppServerSetThreadGoalOptions,
  ): Promise<AppServerThreadGoal | null> {
    await this.start();
    try {
      const params: Record<string, unknown> = { threadId };
      if (objective !== undefined) {
        params.objective = objective;
      }
      if (options?.status !== undefined) {
        params.status = options.status;
      }
      if (options?.tokenBudget !== undefined) {
        params.tokenBudget = options.tokenBudget;
      }
      const result = (await this.request('thread/goal/set', params)) as { goal: AppServerThreadGoal } | undefined;
      return result?.goal ?? null;
    } catch (err) {
      logger.warn('Failed to set thread goal via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async clearThreadGoal(threadId: string): Promise<boolean> {
    await this.start();
    try {
      const result = (await this.request('thread/goal/clear', { threadId })) as { cleared: boolean } | undefined;
      return result?.cleared === true;
    } catch (err) {
      logger.warn('Failed to clear thread goal via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async listLoadedThreads(): Promise<Array<{ id: string }>> {
    await this.start();
    try {
      const result = (await this.request('thread/loaded/list', {})) as { data: Array<{ id: string }>; nextCursor: string | null } | undefined;
      return result?.data ?? [];
    } catch (err) {
      logger.warn('Failed to list loaded threads from app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  async forkThread(threadId: string): Promise<AppServerForkResult | null> {
    await this.start();
    try {
      const result = (await this.request('thread/fork', { threadId })) as AppServerForkResult | undefined;
      return result ?? null;
    } catch (err) {
      logger.warn('Failed to fork thread via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async archiveThread(threadId: string): Promise<boolean> {
    await this.start();
    try {
      await this.request('thread/archive', { threadId });
      return true;
    } catch (err) {
      logger.warn('Failed to archive thread via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async unarchiveThread(threadId: string): Promise<boolean> {
    await this.start();
    try {
      await this.request('thread/unarchive', { threadId });
      return true;
    } catch (err) {
      logger.warn('Failed to unarchive thread via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Resume (load) a thread in the app-server so that subsequent calls
   * (`review/start`, `turn/start`, etc.) can target it.  The app-server
   * maintains a set of "loaded" threads in memory; persisted-only threads
   * are not loaded until `thread/resume` is called.
   *
   * Returns the loaded thread shape on success, or null on failure.
   */
  /**
   * Start a code review on a loaded thread.
   *
   * `review/start` requires a **loaded** thread (one that has been resumed
   * via `thread/resume`).  The target determines what changes to review:
   * `uncommittedChanges`, `baseBranch` (with a branch name), `commit`
   * (with a SHA), or `custom` (with free-text instructions).
   *
   * Returns `{ turn, reviewThreadId }` synchronously.  Review progress and
   * results arrive as async notifications (`item/started`, `item/completed`,
   * `turn/completed`).  This method waits for `turn/completed` (default
   * 120 s) and collects `agentMessage` texts from `item/completed`
   * notifications, following the same subscribe-wait-cleanup pattern as
   * `mcpServerOauthLogin`.
   */
  async startReview(
    threadId: string,
    target: AppServerReviewTarget,
    options?: { timeoutMs?: number },
  ): Promise<AppServerReviewResult | null> {
    await this.start();
    let turnHandler: ((params: unknown) => void) | null = null;
    let itemHandler: ((params: unknown) => void) | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = (await this.request('review/start', { threadId, target }, 30000)) as AppServerReviewResult | undefined;
      if (!result?.turn?.id) {
        return result ?? null;
      }

      const waitTimeout = options?.timeoutMs ?? 120000;
      const reviewMessages: string[] = [];

      // Collect agentMessage texts from item/completed notifications on
      // this thread.  Items may arrive under the review turn ID or a
      // spawned execution turn ID, so match on threadId.
      itemHandler = (notificationParams: unknown): void => {
        const p = notificationParams as {
          threadId?: string;
          item?: { type?: string; text?: string };
        } | undefined;
        if (p?.threadId === threadId && p?.item?.type === 'agentMessage' && typeof p.item.text === 'string') {
          reviewMessages.push(p.item.text);
        }
      };
      this.addNotificationHandler('item/completed', itemHandler);

      // Wait for turn/completed on this thread.  The review may spawn a
      // new execution turn with a different ID, so match on threadId
      // rather than the initial reviewTurnId.
      const completionPromise = new Promise<AppServerReviewResult>((resolve) => {
        turnHandler = (notificationParams: unknown): void => {
          const p = notificationParams as {
            threadId?: string;
            turn?: { id?: string; status?: string; error?: string | null };
          } | undefined;
          if (p?.threadId === threadId && p?.turn) {
            result.turn.status = p.turn.status ?? result.turn.status;
            result.turn.error = p.turn.error ?? null;
            resolve({ ...result, reviewMessages: [...reviewMessages] });
          }
        };
        this.addNotificationHandler('turn/completed', turnHandler);
      });

      const finalResult = await Promise.race([
        completionPromise,
        new Promise<AppServerReviewResult>((resolve) => {
          timeoutHandle = setTimeout(
            () => resolve({ ...result, reviewMessages: [...reviewMessages] }),
            waitTimeout,
          );
        }),
      ]);

      return finalResult;
    } catch (err) {
      logger.warn('Failed to start review via app-server', {
        threadId,
        target,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (turnHandler) {
        this.removeNotificationHandler('turn/completed', turnHandler);
      }
      if (itemHandler) {
        this.removeNotificationHandler('item/completed', itemHandler);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Codex 0.159.0 additions (verified 2026-09-30 against the generated schema):
  // turn/steer, thread/items/list, thread/turns/list, thread/name/set,
  // thread/delete, thread/attachment/*, plugin/* routes, plus typed
  // registration for the five new server→client request routes.
  // ---------------------------------------------------------------------------

  /**
   * Steer the active turn of a thread via `turn/steer`. `expectedTurnId` is a
   * required precondition: the request fails when it does not match the
   * currently active turn. Review and compact turns are not steerable.
   *
   * The result discriminates a successful injection from a server rejection
   * (`active_turn_not_steerable` / misalignment / stale turn, with the
   * structured steer error) and from route/transport unavailability (-32601),
   * so the adapter can dynamically drop the turn-steering capability.
   */
  async steerTurn(
    threadId: string,
    expectedTurnId: string,
    input: AppServerUserInput[],
    options?: { clientUserMessageId?: string | null },
  ): Promise<AppServerSteerTurnResult> {
    try {
      await this.start();
    } catch (err) {
      return { ok: false, reason: 'unavailable', errorReason: errorToReason(err) };
    }
    try {
      const params: Record<string, unknown> = { threadId, expectedTurnId, input };
      if (options?.clientUserMessageId !== undefined) {
        params.clientUserMessageId = options.clientUserMessageId;
      }
      const result = (await this.request('turn/steer', params, 30000)) as { turnId?: string } | undefined;
      if (typeof result?.turnId === 'string' && result.turnId.length > 0) {
        return { ok: true, turnId: result.turnId };
      }
      return {
        ok: false,
        reason: 'rejected',
        error: { code: 'unknown', message: 'turn/steer response did not include a turnId' },
      };
    } catch (err) {
      const reason = errorToReason(err);
      if (isAppServerMethodNotFoundError(err)) {
        return { ok: false, reason: 'unavailable', errorReason: reason };
      }
      logger.warn('Failed to steer turn via app-server', { threadId, error: reason });
      return { ok: false, reason: 'rejected', error: classifySteerError(err) };
    }
  }

  /**
   * List items of a thread via `thread/items/list` (Codex 0.159.0). Supports
   * turn filtering, opaque or item-anchor cursors, and asc/desc pagination.
   * Returns null when the route is unavailable or the request fails.
   */
  async listThreadItems(
    threadId: string,
    options?: AppServerThreadItemsListOptions,
  ): Promise<AppServerThreadItemsPage | null> {
    await this.start();
    try {
      const params: Record<string, unknown> = { threadId };
      if (options?.turnId != null) params.turnId = options.turnId;
      if (options?.cursor != null) params.cursor = options.cursor;
      if (options?.limit !== undefined) params.limit = options.limit;
      if (options?.sortDirection !== undefined) params.sortDirection = options.sortDirection;
      const result = (await this.request('thread/items/list', params, 30000)) as
        | AppServerThreadItemsPage
        | undefined;
      return normalizeThreadItemsPage(result);
    } catch (err) {
      logger.warn('Failed to list thread items via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * List turns of a thread via `thread/turns/list` (Codex 0.159.0), newest
   * first by default. `itemsView` controls how much item detail each returned
   * turn carries (`summary` is the cheap option for session browsing).
   * Returns null when the route is unavailable or the request fails.
   */
  async listThreadTurns(
    threadId: string,
    options?: AppServerThreadTurnsListOptions,
  ): Promise<AppServerThreadTurnsPage | null> {
    await this.start();
    try {
      const params: Record<string, unknown> = { threadId };
      if (options?.cursor != null) params.cursor = options.cursor;
      if (options?.limit !== undefined) params.limit = options.limit;
      if (options?.sortDirection !== undefined) params.sortDirection = options.sortDirection;
      if (options?.itemsView !== undefined) params.itemsView = options.itemsView;
      const result = (await this.request('thread/turns/list', params, 30000)) as
        | AppServerThreadTurnsPage
        | undefined;
      return normalizeThreadTurnsPage(result);
    } catch (err) {
      logger.warn('Failed to list thread turns via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** Rename a thread via `thread/name/set`; the server emits `thread/name/updated`. */
  async setThreadName(threadId: string, name: string): Promise<boolean> {
    await this.start();
    try {
      await this.request('thread/name/set', { threadId, name }, 30000);
      return true;
    } catch (err) {
      logger.warn('Failed to set thread name via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /** Delete a thread via `thread/delete`; the server emits `thread/deleted`. */
  async deleteThread(threadId: string): Promise<boolean> {
    await this.start();
    try {
      await this.request('thread/delete', { threadId }, 30000);
      this.clearThreadEffectiveSettings(threadId);
      return true;
    } catch (err) {
      logger.warn('Failed to delete thread via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Attach (or fetch an existing) attachment via `thread/attachment/add`.
   * `identityKey` deduplicates: a matching existing attachment yields
   * `outcome: 'existing'`. Returns null when the route is unavailable or fails.
   */
  async addThreadAttachment(
    threadId: string,
    attachmentType: string,
    identityKey: string,
    payload: unknown,
  ): Promise<AppServerThreadAttachmentAddResult | null> {
    await this.start();
    try {
      const result = (await this.request(
        'thread/attachment/add',
        { threadId, attachmentType, identityKey, payload },
        30000,
      )) as AppServerThreadAttachmentAddResult | undefined;
      if (result && typeof result === 'object' && result.attachment && (result.outcome === 'created' || result.outcome === 'existing')) {
        return result;
      }
      return null;
    } catch (err) {
      logger.warn('Failed to add thread attachment via app-server', {
        threadId,
        attachmentType,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** List thread attachments via `thread/attachment/list` (paginated). */
  async listThreadAttachments(
    threadId: string,
    options?: { cursor?: string | null; limit?: number },
  ): Promise<AppServerThreadAttachmentsPage | null> {
    await this.start();
    try {
      const params: Record<string, unknown> = { threadId };
      if (options?.cursor != null) params.cursor = options.cursor;
      if (options?.limit !== undefined) params.limit = options.limit;
      const result = (await this.request('thread/attachment/list', params, 30000)) as
        | AppServerThreadAttachmentsPage
        | undefined;
      if (result && Array.isArray(result.data)) {
        return { data: result.data, nextCursor: result.nextCursor ?? null };
      }
      return null;
    } catch (err) {
      logger.warn('Failed to list thread attachments via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** Remove a thread attachment via `thread/attachment/remove` (by identity). */
  async removeThreadAttachment(
    threadId: string,
    attachmentType: string,
    identityKey: string,
  ): Promise<boolean> {
    await this.start();
    try {
      await this.request('thread/attachment/remove', { threadId, attachmentType, identityKey }, 30000);
      return true;
    } catch (err) {
      logger.warn('Failed to remove thread attachment via app-server', {
        threadId,
        attachmentType,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * List plugin marketplaces via `plugin/list` (Codex 0.159.0). Returns null
   * when the route is unavailable (-32601 on older servers) or fails; load
   * errors are reported per-marketplace inside the result.
   */
  async listPlugins(options?: AppServerPluginListOptions): Promise<AppServerPluginListResult | null> {
    try {
      await this.start();
    } catch (err) {
      logger.warn('Failed to start app-server for plugin/list', { error: errorToReason(err) });
      return null;
    }
    try {
      const params: Record<string, unknown> = {};
      if (options?.cwds) params.cwds = options.cwds;
      if (options?.forceRefetch) params.forceRefetch = true;
      if (options?.marketplaceKinds) params.marketplaceKinds = options.marketplaceKinds;
      const result = (await this.request('plugin/list', params, 30000)) as
        | AppServerPluginListResult
        | undefined;
      return normalizePluginListResult(result);
    } catch (err) {
      logger.warn('Failed to list plugins via app-server', { error: errorToReason(err) });
      return null;
    }
  }

  /** Read one plugin's full metadata via `plugin/read` (by plugin name). */
  async readPlugin(
    pluginName: string,
    options?: { marketplacePath?: string; remoteMarketplaceName?: string },
  ): Promise<unknown | null> {
    await this.start();
    try {
      const params: Record<string, unknown> = { pluginName };
      if (options?.marketplacePath) params.marketplacePath = options.marketplacePath;
      if (options?.remoteMarketplaceName) params.remoteMarketplaceName = options.remoteMarketplaceName;
      const result = (await this.request('plugin/read', params, 30000)) as { plugin?: unknown } | undefined;
      return result?.plugin ?? null;
    } catch (err) {
      logger.warn('Failed to read plugin via app-server', {
        pluginName,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** List installed plugins via `plugin/installed` (same shape as `plugin/list`). */
  async listInstalledPlugins(options?: {
    cwds?: string[];
    installSuggestionPluginNames?: string[];
  }): Promise<AppServerPluginListResult | null> {
    await this.start();
    try {
      const params: Record<string, unknown> = {};
      if (options?.cwds) params.cwds = options.cwds;
      if (options?.installSuggestionPluginNames) {
        params.installSuggestionPluginNames = options.installSuggestionPluginNames;
      }
      const result = (await this.request('plugin/installed', params, 30000)) as
        | AppServerPluginListResult
        | undefined;
      return normalizePluginListResult(result);
    } catch (err) {
      logger.warn('Failed to list installed plugins via app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Install a plugin via `plugin/install` (Codex 0.159.0). The response names
   * the apps that still need authorization plus the plugin's auth policy.
   * Returns null when the route is unavailable or the request fails.
   */
  async installPlugin(
    pluginName: string,
    options?: { marketplacePath?: string; remoteMarketplaceName?: string; installAttemptId?: string },
  ): Promise<AppServerPluginInstallResult | null> {
    await this.start();
    try {
      const params: Record<string, unknown> = { pluginName };
      if (options?.marketplacePath) params.marketplacePath = options.marketplacePath;
      if (options?.remoteMarketplaceName) params.remoteMarketplaceName = options.remoteMarketplaceName;
      if (options?.installAttemptId) params.installAttemptId = options.installAttemptId;
      const result = (await this.request('plugin/install', params, 60000)) as
        | AppServerPluginInstallResult
        | undefined;
      if (result && Array.isArray(result.appsNeedingAuth)) {
        return { appsNeedingAuth: result.appsNeedingAuth, authPolicy: result.authPolicy };
      }
      return null;
    } catch (err) {
      logger.warn('Failed to install plugin via app-server', {
        pluginName,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** Uninstall a plugin via `plugin/uninstall` (by plugin id). */
  async uninstallPlugin(pluginId: string): Promise<boolean> {
    await this.start();
    try {
      await this.request('plugin/uninstall', { pluginId }, 30000);
      return true;
    } catch (err) {
      logger.warn('Failed to uninstall plugin via app-server', {
        pluginId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /** Reconcile installed plugins against their sources via `plugin/reconcile`. */
  async reconcilePlugins(reason?: string): Promise<AppServerPluginReconcileResult | null> {
    await this.start();
    try {
      const result = (await this.request('plugin/reconcile', reason ? { reason } : {}, 60000)) as
        | AppServerPluginReconcileResult
        | undefined;
      if (result && Array.isArray(result.changedPlugins)) {
        return {
          changedPlugins: result.changedPlugins,
          failedRemotePluginIds: Array.isArray(result.failedRemotePluginIds) ? result.failedRemotePluginIds : [],
          failedMaterializationRemotePluginIds: Array.isArray(result.failedMaterializationRemotePluginIds)
            ? result.failedMaterializationRemotePluginIds
            : [],
        };
      }
      return null;
    } catch (err) {
      logger.warn('Failed to reconcile plugins via app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** Read a plugin skill's contents via `plugin/skill/read`; null when absent or unavailable. */
  async readPluginSkill(
    remoteMarketplaceName: string,
    remotePluginId: string,
    skillName: string,
  ): Promise<string | null> {
    await this.start();
    try {
      const result = (await this.request(
        'plugin/skill/read',
        { remoteMarketplaceName, remotePluginId, skillName },
        30000,
      )) as AppServerPluginSkillReadResult | undefined;
      return typeof result?.contents === 'string' ? result.contents : null;
    } catch (err) {
      logger.warn('Failed to read plugin skill via app-server', {
        remotePluginId,
        skillName,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  // ── Typed registration for the Codex 0.159.0 server→client request routes ──
  // Each wraps the generic transport registry (one handler per method). The
  // business logic that answers the requests (question cards, permission
  // profiles, elicitation bridging) lives in the adapter layer; when no
  // handler is registered the transport still replies -32601 Method not found.

  /** Register the handler for `item/commandExecution/requestApproval`. */
  registerCommandExecutionApprovalHandler(
    handler: (
      params: AppServerCommandExecutionApprovalParams,
    ) => AppServerCommandExecutionApprovalResponse | Promise<AppServerCommandExecutionApprovalResponse>,
  ): void {
    this.registerServerRequestHandler('item/commandExecution/requestApproval', (params) =>
      handler(params as AppServerCommandExecutionApprovalParams));
  }

  /** Register the handler for `item/fileChange/requestApproval`. */
  registerFileChangeApprovalHandler(
    handler: (
      params: AppServerFileChangeApprovalParams,
    ) => AppServerFileChangeApprovalResponse | Promise<AppServerFileChangeApprovalResponse>,
  ): void {
    this.registerServerRequestHandler('item/fileChange/requestApproval', (params) =>
      handler(params as AppServerFileChangeApprovalParams));
  }

  /** Register the handler for `item/permissions/requestApproval`. */
  registerPermissionsApprovalHandler(
    handler: (
      params: AppServerPermissionsApprovalParams,
    ) => AppServerPermissionsApprovalResponse | Promise<AppServerPermissionsApprovalResponse>,
  ): void {
    this.registerServerRequestHandler('item/permissions/requestApproval', (params) =>
      handler(params as AppServerPermissionsApprovalParams));
  }

  /** Register the handler for `item/tool/requestUserInput`. */
  registerToolUserInputHandler(
    handler: (
      params: AppServerToolUserInputParams,
    ) => AppServerToolUserInputResponse | Promise<AppServerToolUserInputResponse>,
  ): void {
    this.registerServerRequestHandler('item/tool/requestUserInput', (params) =>
      handler(params as AppServerToolUserInputParams));
  }

  /** Register the handler for `mcpServer/elicitation/request`. */
  registerMcpElicitationHandler(
    handler: (
      params: AppServerMcpElicitationParams,
    ) => AppServerMcpElicitationResponse | Promise<AppServerMcpElicitationResponse>,
  ): void {
    this.registerServerRequestHandler('mcpServer/elicitation/request', (params) =>
      handler(params as AppServerMcpElicitationParams));
  }

  /**
   * Subscribe to the top-level `deprecationNotice` notification (not
   * thread-scoped). Returns an unsubscribe function. The adapter uses this to
   * surface deprecation warnings in traces and settings UI.
   */
  subscribeToDeprecationNotice(handler: (notice: { summary: string; details?: string | null }) => void): () => void {
    const wrapped = (params: unknown): void => {
      const notice = params as { summary?: unknown; details?: unknown } | null;
      if (typeof notice?.summary === 'string') {
        handler({
          summary: notice.summary,
          ...(typeof notice.details === 'string' ? { details: notice.details } : {}),
        });
      }
    };
    this.addNotificationHandler('deprecationNotice', wrapped);
    return () => {
      this.removeNotificationHandler('deprecationNotice', wrapped);
    };
  }

  // ---------------------------------------------------------------------------
  // Normalization helpers live in `CodexAppServerClientNormalization`.
  // Backwards-compatible static delegates keep `CodexAppServerClient.normalize*`
  // call sites working; new code should import the standalone functions.
  // ---------------------------------------------------------------------------

  /** Normalize app-server threads into the shape expected by listBackendSessions. */
  static normalizeThreadList(threads: AppServerThread[]): Array<{
    id: string;
    title: string;
    updatedAt: number | null;
    shareUrl: null;
    archived?: boolean;
  }> {
    return normalizeThreadListImpl(threads);
  }

  /** Normalize app-server turns into the shape expected by getBackendSessionPreview. */
  static normalizeTurnsToPreviewMessages(
    turns: AppServerTurn[],
  ): Array<{ role: string; parts: Array<{ type: string; text: string }> }> {
    return normalizeTurnsToPreviewMessagesImpl(turns);
  }
}

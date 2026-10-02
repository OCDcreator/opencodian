/**
 * CodexAppServerClientTypes — wire shapes for the local Codex app-server client.
 *
 * These types were split out of `CodexAppServerClient` so the client module
 * stays under the project line budget. They are re-exported from
 * `CodexAppServerClient` for backwards-compatible imports.
 *
 * Shapes match the Codex 0.159.0 generated bindings
 * (`codex app-server generate-json-schema`), verified 2026-09-30. A few legacy
 * sections still note the older version they were first verified against; the
 * 0.159.0 schema is backwards-compatible for the routes this plugin uses.
 */

/** Raw thread shape from app-server thread/list and thread/read. */
export interface AppServerThread {
  id: string;
  sessionId: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  name: string | null;
  source: string;
  status?: { type: string };
  archived?: boolean;
  turns: AppServerTurn[];
}

/** Raw turn shape from app-server (only populated when includeTurns=true). */
export interface AppServerTurn {
  id: string;
  items: AppServerItem[];
  status?: string;
  error?: unknown;
  /** Codex 0.159.0 `thread/turns/list` extras (unix seconds / milliseconds). */
  startedAt?: number | null; completedAt?: number | null; durationMs?: number | null;
  /** How much of `items` this turn payload carries (0.159.0 itemsView). */
  itemsView?: AppServerTurnItemsView;
}

/** Exact token figures supplied by `thread/tokenUsage/updated`. */
export interface AppServerTokenUsageBreakdown {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

/** Per-thread token usage notification payload from the experimental API. */
export interface AppServerThreadTokenUsage {
  total: AppServerTokenUsageBreakdown;
  last: AppServerTokenUsageBreakdown;
  modelContextWindow: number | null;
}

export interface AppServerThreadTokenUsageUpdatedNotification {
  threadId: string;
  turnId: string;
  tokenUsage: AppServerThreadTokenUsage;
}

/**
 * Acknowledgement-only outcome for `thread/compact/start`.
 *
 * The real 0.144.1 app-server replies with `{}` when it has accepted the
 * request.  That reply is deliberately not a completion signal: callers must
 * wait for the matching `contextCompaction` item and a new token-usage event.
 */
export type AppServerThreadCompactionAckStatus =
  | 'accepted'
  | 'unavailable'
  | 'invalid-thread'
  | 'failed'
  | 'malformed'
  | 'timed-out';

export interface AppServerThreadCompactionAckResult {
  status: AppServerThreadCompactionAckStatus;
  acknowledged: boolean;
  errorReason?: string;
}

export interface AppServerThreadCompactionStartOptions {
  /** Bounded RPC ACK wait. Runtime completion is owned by the adapter. */
  acknowledgementTimeoutMs?: number;
}

export interface AppServerThreadStartOptions {
  model?: string;
  cwd?: string;
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approvalPolicy?: 'untrusted' | 'on-request' | 'never';
  config?: Record<string, unknown>;
  /**
   * Create a thread the app-server does not persist: no rollout on disk and no
   * `thread/list` entry. Used by the inline-edit auxiliary channel so auxiliary
   * work cannot leak into chat history.
   */
  ephemeral?: boolean;
  /**
   * Developer-message instructions for the thread, layered on top of Codex's own
   * base instructions (so the model keeps its tool knowledge).
   *
   * Verified against codex-cli 0.154.0 by observing model behaviour change; the
   * field is present in `codex app-server generate-json-schema` for
   * `ThreadStartParams`. The chat path still prepends memory injection to the
   * message text and does not use this seam.
   */
  developerInstructions?: string;
  /**
   * Replaces Codex's base instructions for the thread rather than adding to
   * them. Prefer `developerInstructions` unless the whole base prompt must go.
   */
  baseInstructions?: string;
}

export type AppServerThreadResumeOptions = AppServerThreadStartOptions;

/**
 * Effective settings defensively captured from a `thread/start` or
 * `thread/resume` response. Every field is optional because older Codex
 * app-server versions omit some or all of them; absence means the runtime
 * readback for that axis is *unavailable*, not verified. These are the only
 * honest runtime-evidence fields — request-side `TurnStartOptions` are NOT
 * verified readback.
 *
 * Shapes match the Codex 0.144.1 generated bindings:
 *   - sandbox is a discriminated SandboxPolicy object (not a string)
 *   - activePermissionProfile is { id, extends? }
 *   - approvalPolicy may be a known scalar OR a granular object
 */

/** Effective sandbox policy as reported by the server (discriminated by `type`). */
export type AppServerSandboxPolicy =
  | { readonly type: 'dangerFullAccess' }
  | { readonly type: 'readOnly'; readonly networkAccess?: boolean }
  | {
    readonly type: 'workspaceWrite';
    readonly writableRoots?: readonly string[];
    readonly networkAccess?: boolean;
    readonly excludeTmpdirEnvVar?: boolean;
    readonly excludeSlashTmp?: boolean;
  }
  // Forward-compatible: an unknown variant still carries its raw shape.
  | { readonly type: string; readonly [key: string]: unknown };

/** Effective permission profile as reported by the server (distinct from the permissionProfile/list entry). */
export interface AppServerEffectivePermissionProfile {
  readonly id: string;
  readonly extends?: string | null;
}

/** Effective approval policy: a known scalar or a granular object. */
export type AppServerApprovalPolicyEffective = string | Readonly<Record<string, unknown>>;

export interface AppServerThreadEffectiveSettings {
  readonly model?: string;
  readonly modelProvider?: string;
  readonly cwd?: string;
  readonly runtimeWorkspaceRoots?: readonly string[];
  readonly instructionSources?: readonly string[];
  readonly approvalPolicy?: AppServerApprovalPolicyEffective;
  readonly approvalsReviewer?: string;
  readonly sandbox?: AppServerSandboxPolicy;
  readonly activePermissionProfile?: AppServerEffectivePermissionProfile;
  readonly reasoningEffort?: string;
}

export interface AppServerTurnStartOptions {
  threadId: string;
  input: Array<
    | { type: 'text'; text: string; text_elements: [] }
    | { type: 'localImage'; path: string }
  >;
  cwd?: string;
  approvalPolicy?: 'untrusted' | 'on-request' | 'never';
  sandboxPolicy?:
    | { type: 'dangerFullAccess' }
    | { type: 'readOnly'; networkAccess: boolean }
    | {
      type: 'workspaceWrite';
      writableRoots: string[];
      networkAccess: boolean;
      excludeTmpdirEnvVar: boolean;
      excludeSlashTmp: boolean;
    };
  model?: string;
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra' | 'persistent';
  outputSchema?: unknown;
}

export interface AppServerThreadNotification {
  method: string;
  params: unknown;
}

export interface AppServerNotificationSubscription {
  dispose(): void;
}

/** Model shape from app-server model/list. */
export interface AppServerModel {
  id: string;
  model: string;
  displayName: string;
  description?: string | null;
  defaultReasoningEffort?: string | null;
  inputModalities?: string[];
  serviceTiers?: Array<{ id: string; name: string; description?: string }>;
  upgradeInfo?: { model: string; migrationMarkdown?: string | null } | null;
}

/** Permission profile shape from app-server permissionProfile/list. */
export interface AppServerPermissionProfile {
  id: string;
  description?: string;
}

/** Rate limits shape from app-server account/rateLimits/read. */
export interface AppServerRateLimits {
  rateLimits: Record<string, unknown>;
  rateLimitsByLimitId?: Record<string, Record<string, unknown>>;
}

/**
 * Account rate limits readback result. `rateLimits` is null when no payload is
 * available (app-server unreachable, account lacks ChatGPT auth, etc.).
 * `errorReason` carries the underlying app-server error message (e.g.
 * "chatgpt authentication required to read rate limits") so the readback UI can
 * show the honest reason instead of a generic "unavailable" string. It is
 * omitted when the request never reached the route (no app-server client).
 */
export interface AppServerAccountRateLimitsResult {
  rateLimits: AppServerRateLimits | null;
  errorReason?: string;
}

/** Account usage summary from app-server account/usage/read (Codex 0.159.0). Index signature keeps forward-compatible server fields. */
export interface AppServerAccountUsageSummary { lifetimeTokens?: number; currentStreakDays?: number; longestStreakDays?: number; peakDailyTokens?: number; longestRunningTurnSec?: number; readonly [key: string]: unknown }

/** One daily token bucket from account/usage/read (startDate = bucket day). */
export interface AppServerAccountUsageDailyBucket {
  startDate: string; tokens: number; readonly [key: string]: unknown;
}

/** Per-speed/model token breakdown group inside a thread usage estimate. */
export interface AppServerThreadUsageBreakdownGroup {
  speed?: string | null; model?: string | null; reasoningEffort?: string | null;
  netNewInputTokens?: number | null; cachedInputTokens?: number | null; inputTokens?: number | null;
  outputTokens?: number | null; totalTokens?: number | null; estimatedUsageCreditsMicros?: number;
  readonly [key: string]: unknown;
}

/** Estimated per-thread usage returned by account/usage/read when `threadId` was requested. */
export interface AppServerThreadUsage {
  threadId: string; estimatedUsageCreditsMicros: number; estimatedUsageUsdMicros?: number | null;
  groups: AppServerThreadUsageBreakdownGroup[];
}

/**
 * Account usage shape from app-server `account/usage/read`. Params are
 * nullable `{ threadId? }` (Codex 0.159.0): omit for account-wide activity,
 * pass a thread id for the per-thread estimate (`threadUsage`).
 */
export interface AppServerAccountUsage {
  summary: AppServerAccountUsageSummary;
  dailyUsageBuckets?: AppServerAccountUsageDailyBucket[];
  threadUsage?: AppServerThreadUsage | null;
}

/**
 * Account usage readback result. `usage` is null when no payload is available
 * (app-server unreachable, account lacks ChatGPT auth, etc.). `errorReason`
 * carries the underlying app-server error message (e.g.
 * "chatgpt authentication required to read token usage") so the readback UI can
 * show the honest reason instead of a generic "unavailable" string. It is
 * omitted when the request never reached the route (no app-server client).
 */
export interface AppServerAccountUsageResult {
  usage: AppServerAccountUsage | null;
  errorReason?: string;
}

/** Tool shape inside an MCP server status entry. */
export interface AppServerMcpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

/** Thread goal status from the Codex 0.159.0 ThreadGoal binding. */
export type AppServerThreadGoalStatus = 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited' | 'complete';

/** Thread goal shape from app-server thread/goal/get (Codex 0.159.0). */
export interface AppServerThreadGoal {
  threadId: string;
  objective: string;
  status: AppServerThreadGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Options for `thread/goal/set` beyond the thread id. All fields are optional
 * on the wire (Codex 0.159.0): `status` alone pauses/resumes an existing goal
 * without restating its objective; `objective` + `tokenBudget` create/update.
 */
export interface AppServerSetThreadGoalOptions {
  status?: AppServerThreadGoalStatus;
  tokenBudget?: number;
}

/** Fork result shape from app-server thread/fork. */
export interface AppServerForkResult {
  thread: AppServerThread;
}

/**
 * Review target discriminator — verified against codex-cli 0.139.0 app-server.
 * The `type` field is the internally-tagged enum discriminator.
 */
export type AppServerReviewTarget =
  | { type: 'uncommittedChanges' }
  | { type: 'baseBranch'; branch: string }
  | { type: 'commit'; sha: string }
  | { type: 'custom'; instructions: string };

/** Review turn returned by `review/start`. */
export interface AppServerReviewTurn {
  id: string;
  status: string;
  items: unknown[];
  error: string | null;
}

/** Result of `review/start`: the review turn plus the threadId it ran on. */
export interface AppServerReviewResult {
  turn: AppServerReviewTurn;
  reviewThreadId: string;
  /**
   * Agent message texts collected from `item/completed` notifications during
   * the review turn. Populated only when `startReview` waits for
   * `turn/completed`; empty when the review is still in progress or the wait
   * timed out.
   */
  reviewMessages?: string[];
}

/** Model provider capabilities from app-server modelProvider/capabilities/read. */
export interface AppServerModelProviderCapabilities {
  namespaceTools: boolean;
  imageGeneration: boolean;
  webSearch: boolean;
}

/** A single resource exposed by an MCP server (from mcpServerStatus/list). */
export interface AppServerMcpResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

/** A resource template exposed by an MCP server (URI templates with parameters). */
export interface AppServerMcpResourceTemplate {
  uriTemplate: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

/**
 * A single content entry returned by `mcpServer/resource/read`. The MCP spec
 * allows either a `text` field (for text resources) or a `blob` field
 * (base64-encoded binary resources). `mimeType` is optional but commonly
 * present.
 */
export interface AppServerMcpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

/** Result of `mcpServer/resource/read`. Returns null when unavailable. */
export interface AppServerMcpResourceReadResult {
  contents: AppServerMcpResourceContent[];
  errorReason?: string;
}

/**
 * A single content entry returned by `mcpServer/tool/call`. Mirrors the MCP
 * `CallToolResult.content` shape: each entry has a `type` (typically `text`)
 * and an optional `text` field.
 */
export interface AppServerMcpToolCallContent {
  type: string;
  text?: string;
}

/**
 * Result of `mcpServer/tool/call`. `content` holds the tool's response entries
 * (empty when the call failed before producing output). `isError` is `true`
 * when the MCP server reported the call as an error. `errorReason` carries the
 * underlying transport/protocol error message when the route itself failed
 * (app-server unreachable, route rejected the request, etc.).
 */
export interface AppServerMcpToolCallResult {
  content: AppServerMcpToolCallContent[];
  isError: boolean;
  errorReason?: string;
}

/** MCP server status shape from app-server mcpServerStatus/list. */
export interface AppServerMcpServerStatus {
  name: string;
  serverInfo?: {
    name?: string;
    title?: string | null;
    version?: string;
    description?: string | null;
    icons?: unknown;
    websiteUrl?: string | null;
  };
  tools: Record<string, AppServerMcpTool>;
  resources?: AppServerMcpResource[];
  resourceTemplates?: AppServerMcpResourceTemplate[];
  authStatus?: string;
}

export type McpOauthLoginOutcome = 'completed' | 'pending' | 'failed';

export interface McpOauthLoginResult {
  outcome: McpOauthLoginOutcome;
  browserOpened: boolean;
  errorReason?: string;
}

/**
 * A skill exposed by the Codex app-server `skills/list` route.
 *
 * Fields mirror the verified app-server output shape and are intentionally
 * permissive: the server may omit `description`, `path`, `enabled`, or
 * `scope` depending on the Codex version. Callers must treat all optional
 * fields as potentially absent.
 *
 * This is readback metadata only: it describes runtime-discovered skills for
 * display in the chat menu and resource settings. The current P0 surface has
 * no global mutation API; that read-only type does not prohibit a future P1
 * controlled owner, which would require the shared secure-file contract with
 * allowlisted-root validation.
 */
export interface AppServerSkill {
  name: string;
  description?: string;
  /** Optional compact label exposed by newer app-server builds. */
  shortDescription?: string;
  path?: string;
  enabled?: boolean;
  /** Best-effort scope label from the server (e.g. "project", "global", "user"). */
  scope?: string;
  /** Best-effort origin label retained for settings readback when supplied by the server. */
  source?: string;
  /** Forward-compatible display metadata from the generated SkillMetadata binding. */
  interface?: Readonly<Record<string, unknown>>;
  /** Forward-compatible tool dependency metadata from the generated SkillMetadata binding. */
  dependencies?: Readonly<Record<string, unknown>>;
}

/** A server-reported skill discovery error scoped to one cwd group. */
export interface AppServerSkillError {
  path?: string;
  message: string;
}

/** Stable grouped readback from one Codex app-server `skills/list` entry. */
export interface AppServerSkillGroup {
  /** Resolved directory for this group, or null when a legacy/malformed reply omitted it. */
  cwd: string | null;
  skills: AppServerSkill[];
  errors: AppServerSkillError[];
}

/** A server-reported hook discovery error scoped to one cwd group. */
export interface AppServerHookError {
  path: string;
  message: string;
}

/**
 * Hook metadata returned by Codex app-server `hooks/list`.
 *
 * Codex 0.144.1 requires the identity fields `key`, `eventName`, and
 * `handlerType`; the remaining fields are optional for defensive compatibility
 * with older/newer servers. Unknown wire properties are deliberately dropped
 * by the client normalizer instead of being exposed as raw JSON.
 */
export interface AppServerHookMetadata {
  key: string;
  eventName: string;
  handlerType: string;
  matcher?: string | null;
  command?: string | null;
  timeoutSec?: number;
  statusMessage?: string | null;
  sourcePath?: string;
  source?: string;
  pluginId?: string | null;
  displayOrder?: number;
  enabled?: boolean;
  isManaged?: boolean;
  currentHash?: string;
  trustStatus?: string;
}

/** Stable cwd-group readback from one Codex app-server `hooks/list` entry. */
export interface AppServerHookGroup {
  cwd: string;
  hooks: AppServerHookMetadata[];
  warnings: string[];
  errors: AppServerHookError[];
}

/** Params accepted by Codex app-server `hooks/list`. */
export interface AppServerListHooksOptions {
  /** Empty or omitted defaults to the app-server session cwd. */
  cwds?: string[];
}

/** Honest outcome states for the read-only hooks/list route. */
export type AppServerHooksReadbackStatus =
  | 'available'
  | 'empty'
  | 'unavailable'
  | 'failed'
  | 'malformed';

/**
 * Additive hooks/list readback result. `groups` is always present (and empty
 * for non-success outcomes), allowing consumers to branch on status without
 * conflating unavailable/failed with a successful empty catalog.
 */
export interface AppServerHooksReadbackResult {
  status: AppServerHooksReadbackStatus;
  groups: AppServerHookGroup[];
  errorReason?: string;
}

/** Params accepted by `CodexAppServerClient.listSkills()`. */
export interface AppServerListSkillsOptions {
  /** Working directory to scope the skill query (the current vault cwd). */
  cwd?: string;
  /** Bypass any server-side cache and force a fresh read. */
  forceReload?: boolean;
}

/** Union of possible item types in a turn (verified against real Codex app-server output). */
export type AppServerItem =
  | { type: 'userMessage'; id: string; content: Array<{ type: string; text?: string }> }
  | { type: 'agentMessage'; id: string; text: string; phase?: string; memoryCitation?: unknown }
  | { type: 'reasoning'; id: string; summary?: string[]; content?: unknown[] }
  | { type: 'mcpToolCall'; id: string; server: string; tool: string; arguments: unknown; result?: unknown; status?: string; pluginId?: string | null }
  | { type: 'webSearch'; id: string; query: string; action?: unknown }
  | { type: 'contextCompaction'; id: string }
  | { type: 'fileChange'; id: string; changes: Array<{ path: string; kind: unknown; diff?: string; move_path?: string | null }>; status?: string }
  | { type: string; [key: string]: unknown };

/**
 * Handler for a server-initiated JSON-RPC request (a message carrying both
 * `method` and `id`, such as `execCommandApproval` / `applyPatchApproval`).
 * Return a value (or a promise of one) to send it back as the JSON-RPC `result`;
 * throw to send an error reply. The server expects approval callbacks to reply
 * with `{ decision: ReviewDecision }`.
 */
export type AppServerServerRequestHandler = (params: unknown) => unknown | Promise<unknown>;

/**
 * Optional wire-traffic observer for the Codex app-server transport. When passed
 * to `CodexAppServerTransport` (and thus `CodexAppServerClient`), every method is
 * invoked at the corresponding JSON-RPC / connection-lifecycle point so a trace
 * service (e.g. `CodexWireTraceBridge`) can observe traffic WITHOUT affecting the
 * RPC main path. All methods are optional and guarded by the transport: an
 * observer exception is caught and logged, never propagated into the RPC path.
 *
 * Each callback receives a snapshot of the message that just crossed the wire;
 * `durationMs` on `onResponse` is measured transport-side from request-send to
 * response-receive. When the observer is `undefined` (the default), transport
 * behavior is byte-for-byte identical to the un-instrumented path.
 */
export interface CodexAppServerWireObserver {
  /** Fired just before a client request is sent over the WebSocket. */
  onRequest?(input: { id: number; method: string; params: unknown; timeoutMs?: number }): void;
  /** Fired when the response to a client request arrives (success or error). */
  onResponse?(input: { id: number; ok: boolean; durationMs: number; error?: string }): void;
  /** Fired when a server notification (method, no id) arrives. */
  onNotification?(input: { method: string; params: unknown }): void;
  /** Fired when a server-initiated request (method + id) arrives. */
  onServerRequest?(input: { id: number | string; method: string; params: unknown }): void;
  /** Fired after the reply to a server-initiated request is sent. */
  onServerReply?(input: { id: number | string; ok: boolean }): void;
  /** Fired at connection-lifecycle transitions. `detail` is best-effort. */
  onConnection?(input: {
    state:
      | 'starting'
      | 'ws-url'
      | 'connected'
      | 'initialized'
      | 'reconnecting'
      | 'closed'
      | 'error'
      | 'stopped';
    detail?: unknown;
  }): void;
  /**
   * Fired for each stdout/stderr chunk the spawned app-server process emits.
   * Used by the trace bridge to record (and redact) service output before it
   * is logged. Return `true` when the chunk was safely handled, or `false` to
   * request the legacy stderr behavior (for example while trace is disabled).
   * The transport catches exceptions and never propagates them into spawning.
   */
  onServiceOutput?(input: { stream: 'stdout' | 'stderr'; text: string }): boolean;
}


// ---------------------------------------------------------------------------
// Codex 0.159.0 additions (verified 2026-09-30 against
// `codex app-server generate-json-schema` output). Covers turn/steer,
// thread/items/list, thread/turns/list, thread/name/set, thread/delete,
// thread/attachment/*, plugin/* routes, the five new server→client request
// routes, and their notifications. Declarations are kept compact; the module
// is under a max-lines budget that excludes comments but not code.
// ---------------------------------------------------------------------------

/** UI-defined span within a text user input (Codex 0.159.0 TextElement). */
export interface AppServerUserInputTextElement { byteRange: { start: number; end: number }; placeholder?: string | null }

export type AppServerUserInputImageDetail = 'auto' | 'low' | 'high' | 'original';

/**
 * UserInput union accepted by `turn/steer` (and `turn/start`). Matches the
 * Codex 0.159.0 UserInput binding: text (with optional UI text elements),
 * image (by url or fileId), and localImage (by absolute path).
 */
export type AppServerUserInput = { type: 'text'; text: string; text_elements?: AppServerUserInputTextElement[] }
  | { type: 'image'; url?: string; fileId?: string; detail?: AppServerUserInputImageDetail | null }
  | { type: 'localImage'; path: string; detail?: AppServerUserInputImageDetail | null };

/** Turn kinds that can never be steered (Codex 0.159.0 NonSteerableTurnKind). */
export type AppServerNonSteerableTurnKind = 'review' | 'compact';

/** Misalignment payload attached to a rejected steer (MisalignmentSteer). */
export interface AppServerMisalignmentSteer { message: string }

/**
 * Steer failure codes observed in the codex 0.159.0 binary. The server sends
 * them inside the JSON-RPC error (message and/or `data`); `unknown` covers
 * forward-compatible additions. `turnKind` is set for the `non_steerable_*`
 * codes (and for `active_turn_not_steerable` when the server names the kind).
 */
export type AppServerSteerTurnErrorCode = 'no_active_turn' | 'expected_turn_mismatch' | 'non_steerable_review' | 'non_steerable_compact' | 'active_turn_not_steerable' | 'empty_input' | 'input_too_large' | 'unknown';

/** Structured reason a `turn/steer` call was rejected by the server. */
export interface AppServerSteerTurnError {
  code: AppServerSteerTurnErrorCode; message: string;
  /** Present when the active turn cannot be steered (review/compact). */
  turnKind?: AppServerNonSteerableTurnKind;
  /** Present when the server rejected the steer as a misalignment. */
  misalignment?: AppServerMisalignmentSteer;
}

/**
 * Result of `CodexAppServerClient.steerTurn()`. Distinguishes a successful
 * injection (`turnId` of the steered turn), a server rejection with the
 * structured steer error, and route/transport unavailability (-32601 or the
 * WebSocket being down) so callers can dynamically drop the capability.
 */
export type AppServerSteerTurnResult = { ok: true; turnId: string }
  | { ok: false; reason: 'rejected'; error: AppServerSteerTurnError }
  | { ok: false; reason: 'unavailable'; errorReason: string };

/** Catalog pagination follows the existing items/turns data + nextCursor contract. */
export interface AppServerCatalogPage<T> { data: T[]; nextCursor: string | null }
export interface AppServerCatalogListOptions { limit?: number; cursor?: string | null }
export interface AppServerThreadListOptions extends AppServerCatalogListOptions { archived?: boolean | null }
export interface AppServerPermissionProfilesListOptions extends AppServerCatalogListOptions { cwd?: string }

/** A failed full read retains complete pages and the cursor that could not be read. */
export interface AppServerCatalogReadFailure<T> extends AppServerCatalogPage<T> { status: 'partial' | 'failed' | 'unavailable'; errorReason: string }

/** Admission is an ACK; verified requires a matching native readback. */
export interface AppServerThreadMutationResult { operation: 'rename' | 'archive' | 'delete'; threadId: string; status: 'admitted' | 'verified' | 'failed' | 'unavailable'; errorReason?: string; readback?: { status: 'verified' | 'failed' | 'unavailable'; errorReason?: string } }

/** Item pagination cursor for `thread/items/list`: opaque string or item anchor. */
export type AppServerThreadItemsListCursor = string | { type: 'item'; itemId: string };

/** Shared pagination direction. Items default to asc, turns default to desc. */
export type AppServerListSortDirection = 'asc' | 'desc';

/** How much item detail a `thread/turns/list` turn payload carries. */
export type AppServerTurnItemsView = 'notLoaded' | 'summary' | 'full';

/** Options for `thread/items/list` (Codex 0.159.0 ThreadItemsListParams). */
export interface AppServerThreadItemsListOptions {
  /** Restrict to one turn; required when using an item-anchor cursor. */
  turnId?: string | null;
  cursor?: AppServerThreadItemsListCursor | null;
  limit?: number;
  sortDirection?: AppServerListSortDirection;
}

/** One entry of a `thread/items/list` page: the item plus its owning turn. */
export interface AppServerThreadItemEntry { item: AppServerItem; turnId: string; startedAtMs?: number | null; completedAtMs?: number | null }

/** A `thread/items/list` page. */
export interface AppServerThreadItemsPage { data: AppServerThreadItemEntry[]; nextCursor: string | null; backwardsCursor: string | null }

/** Options for `thread/turns/list` (Codex 0.159.0 ThreadTurnsListParams). */
export interface AppServerThreadTurnsListOptions {
  cursor?: string | null;
  limit?: number;
  sortDirection?: AppServerListSortDirection;
  itemsView?: AppServerTurnItemsView;
}

/** A `thread/turns/list` page of turns (status/items plus timing metadata). */
export interface AppServerThreadTurnsPage { data: AppServerTurn[]; nextCursor: string | null; backwardsCursor: string | null }

/** An independently persisted thread attachment (Codex 0.159.0 ThreadAttachment). */
export interface AppServerThreadAttachment { id: string; attachmentType: string; identityKey: string; payload: unknown; createdAt: number }

/** Result of `thread/attachment/add`. */
export interface AppServerThreadAttachmentAddResult { attachment: AppServerThreadAttachment; outcome: 'created' | 'existing' }

/** A `thread/attachment/list` page. */
export interface AppServerThreadAttachmentsPage { data: AppServerThreadAttachment[]; nextCursor: string | null }

/** Operation carried by the `thread/attachment/updated` notification. */
export type AppServerThreadAttachmentOperation = 'created' | 'deleted';

// ── Plugins (Codex 0.159.0 plugin/* routes) ────────────────────────────────

/** Marketplace kind filter for `plugin/list` (PluginListMarketplaceKind). */
export type AppServerPluginMarketplaceKind = 'local' | 'vertical' | 'workspace-directory' | 'shared-with-me' | 'created-by-me-remote';

/** Options for `plugin/list`. */
export interface AppServerPluginListOptions {
  /** Working directories used to discover repo marketplaces. */
  cwds?: string[];
  /** Request a fresh remote plugin catalog fetch. */
  forceRefetch?: boolean;
  /**
   * Marketplace kind filter. When omitted, only local marketplaces are
   * queried plus the default remote catalog when enabled server-side.
   */
  marketplaceKinds?: AppServerPluginMarketplaceKind[];
}

/** Plugin source discriminator (PluginSource union). */
export type AppServerPluginSource = { type: 'local'; path: string }
  | { type: 'git'; url: string; path?: string | null; refName?: string | null; sha?: string | null }
  | { type: 'npm'; package: string; version?: string | null; registry?: string | null }
  | { type: 'remote' };

/** Availability signal for remote plugins (includes the upstream ENABLED alias). */
export type AppServerPluginAvailability = 'DISABLED_BY_ADMIN' | 'AVAILABLE' | (string & {});

export type AppServerPluginInstallPolicy = 'NOT_AVAILABLE' | 'AVAILABLE' | 'INSTALLED_BY_DEFAULT';

export type AppServerPluginAuthPolicy = 'ON_INSTALL' | 'ON_USE' | (string & {});

export type AppServerPluginDisabledReason = 'disabled_by_admin' | 'plan_not_eligible' | 'required_app_unavailable' | 'unknown';

/** Plugin summary inside a marketplace entry (PluginSummary binding). */
export interface AppServerPluginSummary {
  id: string; name: string; installed: boolean; enabled: boolean;
  installPolicy: AppServerPluginInstallPolicy; authPolicy: AppServerPluginAuthPolicy; source: AppServerPluginSource;
  version?: string | null; localVersion?: string | null; remotePluginId?: string | null;
  availability?: AppServerPluginAvailability | null; disabledReason?: AppServerPluginDisabledReason | null;
  installPolicySource?: string; installedAt?: number | null; keywords?: string[]; eligiblePlanTypes?: string[];
  mustShowInstallationInterstitial?: boolean;
  /** Forward-compatible display/share metadata from the generated binding. */
  interface?: unknown;
  shareContext?: unknown;
}

/** One marketplace entry from `plugin/list` / `plugin/installed`. */
export interface AppServerPluginMarketplaceEntry {
  name: string; plugins: AppServerPluginSummary[]; path?: string | null;
  interface?: { displayName?: string | null } | null;
}

/** A server-reported marketplace load failure. */
export interface AppServerMarketplaceLoadErrorInfo { marketplacePath: string; message: string }

/** Response of `plugin/list` (and shape of `plugin/installed`). */
export interface AppServerPluginListResult {
  marketplaces: AppServerPluginMarketplaceEntry[];
  featuredPluginIds: string[];
  marketplaceLoadErrors: AppServerMarketplaceLoadErrorInfo[];
}

/** Minimal app metadata returned by `plugin/install` (AppSummary). */
export interface AppServerAppSummary {
  id: string; name: string; category?: string | null; description?: string | null; installUrl?: string | null;
}

/** Response of `plugin/install`: apps that still need authorization. */
export interface AppServerPluginInstallResult { appsNeedingAuth: AppServerAppSummary[]; authPolicy: AppServerPluginAuthPolicy }

/** One entry of the `plugin/reconcile` changedPlugins list. */
export interface AppServerPluginReconcileChangedPlugin { readonly [key: string]: unknown }

/** Response of `plugin/reconcile`. */
export interface AppServerPluginReconcileResult {
  changedPlugins: AppServerPluginReconcileChangedPlugin[];
  failedRemotePluginIds: string[];
  failedMaterializationRemotePluginIds: string[];
}

/** Response of `plugin/skill/read`: null contents when the skill is absent. */
export interface AppServerPluginSkillReadResult { contents: string | null }

// ── Server→client request routes (Codex 0.159.0 ServerRequest union) ──────
// Typed registration lives on CodexAppServerClient; the transport registry
// still answers unhandled routes with -32601.

/** Params of `item/commandExecution/requestApproval` (v2 command approval). */
export interface AppServerCommandExecutionApprovalParams {
  threadId: string; turnId: string; itemId: string; startedAtMs: number;
  command?: string[]; cwd?: string; reason?: string;
  /** Distinguishes a command approval from input to an existing terminal. */
  kind?: 'command' | 'writeStdin';
  approvalId?: string; environmentId?: string | null; commandActions?: unknown[];
  networkApprovalContext?: { host: string; protocol: string } | null;
  proposedExecpolicyAmendment?: string[] | null;
  proposedNetworkPolicyAmendments?: unknown[] | null;
}

/** Decision variants accepted by `item/commandExecution/requestApproval`. */
export type AppServerCommandExecutionApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel'
  | { acceptWithExecpolicyAmendment: { execpolicy_amendment: string[] } }
  | { applyNetworkPolicyAmendment: { network_policy_amendment: { action: 'allow' | 'deny'; host: string } } };

/** Reply body for `item/commandExecution/requestApproval`. */
export interface AppServerCommandExecutionApprovalResponse { decision: AppServerCommandExecutionApprovalDecision }

/** Params of `item/fileChange/requestApproval` (v2 patch approval). */
export interface AppServerFileChangeApprovalParams {
  threadId: string; turnId: string; itemId: string; startedAtMs: number;
  reason?: string;
  /** When set, the agent asks to allow writes under this root for the session. */
  grantRoot?: string | null;
}

/** Decision variants accepted by `item/fileChange/requestApproval`. */
export type AppServerFileChangeApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';

/** Reply body for `item/fileChange/requestApproval`. */
export interface AppServerFileChangeApprovalResponse { decision: AppServerFileChangeApprovalDecision }

/** Requested permission profile on `item/permissions/requestApproval`. */
export interface AppServerPermissionRequestProfile { fileSystem?: unknown; network?: unknown }

/** Params of `item/permissions/requestApproval`. */
export interface AppServerPermissionsApprovalParams {
  threadId: string; turnId: string; itemId: string; startedAtMs: number;
  cwd: string; permissions: AppServerPermissionRequestProfile; reason?: string; environmentId?: string | null;
}

/** Granted profile: approve → echo the requested profile; deny → empty grant. */
export interface AppServerGrantedPermissionProfile { fileSystem?: unknown; network?: unknown }

/** Reply body for `item/permissions/requestApproval`. */
export interface AppServerPermissionsApprovalResponse {
  permissions: AppServerGrantedPermissionProfile;
  scope?: 'turn' | 'session';
  strictAutoReview?: unknown;
}

/** One question on `item/tool/requestUserInput`. */
export interface AppServerToolUserInputQuestion {
  id: string; header: string; question: string; isOther?: boolean; isSecret?: boolean;
  options?: Array<{ label: string; description: string }> | null;
}

/** Params of `item/tool/requestUserInput`. */
export interface AppServerToolUserInputParams {
  threadId: string; turnId: string; itemId: string;
  questions: AppServerToolUserInputQuestion[];
  isBlocking: boolean;
  autoResolutionMs?: number | null;
}

/** Reply body for `item/tool/requestUserInput` (answers keyed by question id). */
export interface AppServerToolUserInputResponse { answers: Record<string, { answers: string[] }> }

/** Params of `mcpServer/elicitation/request`. */
export interface AppServerMcpElicitationParams { serverName: string; threadId: string; turnId?: string | null }

/** Reply body for `mcpServer/elicitation/request`. */
export interface AppServerMcpElicitationResponse { action: 'accept' | 'decline' | 'cancel'; content?: unknown; _meta?: unknown }

// ── New notifications (Codex 0.159.0 ServerNotification union) ─────────────

/** Payload of `thread/name/updated`. */
export interface AppServerThreadNameUpdatedNotification { threadId: string; threadName?: string | null }

/** Payload of `thread/goal/updated`. */
export interface AppServerThreadGoalUpdatedNotification { threadId: string; goal: AppServerThreadGoal; turnId?: string | null }

/** Payload of `thread/goal/cleared`. */
export interface AppServerThreadGoalClearedNotification { threadId: string }

/** Payload of `thread/deleted`. */
export interface AppServerThreadDeletedNotification { threadId: string }

/** Payload of `thread/attachment/updated`. */
export interface AppServerThreadAttachmentUpdatedNotification {
  threadId: string; attachmentId: string; attachmentType: string; identityKey: string;
  operation: AppServerThreadAttachmentOperation;
}

/**
 * Payload of the top-level `deprecationNotice` notification. Not thread-scoped;
 * surfaced through the dedicated deprecation callback so the adapter can log a
 * trace and (eventually) nudge settings UI.
 */
export interface AppServerDeprecationNotice { summary: string; details?: string | null }

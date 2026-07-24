/**
 * CodexAppServerClientTypes — wire shapes for the local Codex app-server client.
 *
 * These types were split out of `CodexAppServerClient` so the client module
 * stays under the project line budget. They are re-exported from
 * `CodexAppServerClient` for backwards-compatible imports.
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

export interface AppServerThreadStartOptions {
  model?: string;
  cwd?: string;
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approvalPolicy?: 'untrusted' | 'on-request' | 'never';
  config?: Record<string, unknown>;
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
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
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

/** Account usage shape from app-server account/usage/read. */
export interface AppServerAccountUsage {
  summary: Record<string, unknown>;
  dailyUsageBuckets?: Array<Record<string, unknown>>;
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

/** Thread goal shape from app-server thread/goal/get. */
export interface AppServerThreadGoal {
  threadId: string;
  objective: string;
  status: 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited' | 'complete';
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
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
  path?: string;
  enabled?: boolean;
  /** Best-effort scope label from the server (e.g. "project", "global", "user"). */
  scope?: string;
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

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

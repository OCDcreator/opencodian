/**
 * CodexAdapter — wraps the Codex SDK behind the AgentService interface.
 *
 * This adapter implements AgentChatCapability and AgentSessionCapability,
 * providing streaming chat and session management for OpenAI's Codex agent.
 *
 * The adapter uses a DI seam (CodexFactory) for the Codex SDK instance,
 * allowing tests to inject mocks without requiring a real API key or
 * network access.
 *
 * See docs/requirements/multi-agent-foundation/05-codex-adapter.md.
 */
/* eslint-disable max-lines -- CodexAdapter consolidates CLI diagnostic readback, SDK thread lifecycle, session tracking, and stream normalization behind a single AgentService boundary. Splitting these would add indirection without removing real complexity. */

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Codex, Thread, ThreadEvent, ThreadOptions, UserInput } from '@openai/codex-sdk';

import { createLogger } from '../../../shared';
import type { AgentBackendKind, ImageAttachment, StreamChunk } from '../../types/chat';
import { AgentCapability, type BackendCapabilities } from '../AgentCapability';
import type {
  AgentChatCapability,
  AgentChatSendRequest,
  AgentConnectionStatus,
  AgentForkCapability,
  AgentService,
  AgentSessionCapability,
  Disposable,
  StatusChangeHandler,
} from './AgentService';
import { type AppServerAccountRateLimitsResult, type AppServerAccountUsageResult, type AppServerMcpResourceReadResult, type AppServerMcpServerStatus, type AppServerMcpToolCallResult, type AppServerModel, type AppServerModelProviderCapabilities, type AppServerPermissionProfile, type AppServerReviewResult, type AppServerReviewTarget, type AppServerThreadGoal, CodexAppServerClient,type McpOauthLoginResult } from './CodexAppServerClient';
import { CodexStreamNormalizer } from './CodexStreamNormalizer';

const logger = createLogger('CodexAdapter');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Factory function for creating a Codex SDK instance. */
export type CodexFactory = () => Promise<Codex>;

export interface CodexAdapterOptions {
  /** OpenAI API key. Falls back to CODEX_API_KEY / OPENAI_API_KEY env vars. */
  apiKey?: string;
  /** Model name passed as ThreadOptions.model → SDK --model CLI arg. Empty/undefined = SDK default. */
  model?: string;
  /** Sandbox mode passed as ThreadOptions.sandboxMode → SDK --sandbox CLI arg. */
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  /** Reasoning effort passed as ThreadOptions.modelReasoningEffort → SDK --config CLI arg. */
  modelReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  /** Additional directories passed as ThreadOptions.additionalDirectories → SDK --add-dir per path. */
  additionalDirectories?: readonly string[];
  /** Network access passed as ThreadOptions.networkAccessEnabled → SDK --config CLI arg. */
  networkAccessEnabled?: boolean;
  /** Web search mode passed as ThreadOptions.webSearchMode → SDK --config CLI arg. */
  webSearchMode?: 'disabled' | 'cached' | 'live';
  /** Working directory for thread operations. */
  workingDirectory?: string;
  /**
   * Absolute path to the Codex CLI binary.
   * When provided, bypasses the SDK's require.resolve-based binary discovery
   * (which fails in Obsidian's plugin loader because __filename points to
   * Electron internals rather than the plugin directory).
   */
  codexPathOverride?: string;
  /**
   * Absolute path to the Obsidian plugin directory.
   * Used at runtime to resolve the Node `ws` package for the app-server
   * WebSocket client (Obsidian's renderer WebSocket is blocked for localhost).
   */
  pluginDir?: string;
  /** DI seam: override the Codex SDK instance factory. */
  createCodex?: CodexFactory;
}

export interface CodexModelSummary {
  slug: string;
  display_name: string;
  visibility: string;
  supported_in_api: boolean;
  default_reasoning_level: string | null;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Server-request approval bridge types
// ---------------------------------------------------------------------------

/**
 * The narrow server-request approval kinds wired in this slice. The Codex
 * app-server `ServerRequest` union defines additional approval variants
 * (`item/commandExecution/requestApproval`, `item/fileChange/requestApproval`,
 * `item/permissions/requestApproval`, etc.) which remain out of scope.
 */
export type CodexApprovalKind = 'execCommand' | 'applyPatch';

/**
 * Backend-neutral approval request surfaced to the UI host. Mirrors the
 * ClaudeCodePermissionBridge host-callback pattern, but the Codex approval
 * model is async server-push: approvals arrive as server-initiated JSON-RPC
 * requests (`method` + `id`) over the app-server WebSocket, not as inline
 * streaming callbacks. The `raw` field preserves the original server params
 * for advanced rendering.
 */
export interface CodexApprovalRequest {
  readonly kind: CodexApprovalKind;
  /** Human-readable label for any approval kind. */
  readonly summary: string;
  /** Command line for `execCommand` approvals; omitted for `applyPatch`. */
  readonly command?: string;
  /** Working directory for `execCommand` approvals; omitted otherwise. */
  readonly cwd?: string;
  /** Number of file changes for `applyPatch` approvals; omitted otherwise. */
  readonly changeCount?: number;
  /** Original server params, preserved for advanced rendering. */
  readonly raw: unknown;
}

/**
 * Scalar ReviewDecision the UI can produce. The full Codex `ReviewDecision`
 * union also includes object variants (`approved_execpolicy_amendment`,
 * `network_policy_amendment`) which are out of scope for this minimal wiring
 * slice.
 */
export type CodexApprovalDecision = {
  decision: 'approved' | 'approved_for_session' | 'denied' | 'abort';
};

/**
 * Host callback seam for surfacing server-request approvals to the UI. Set via
 * `CodexAdapter.setApprovalHost`. When the host returns `null` (cancelled) or
 * no callback is available, the bridge defaults to a safe `denied` decision.
 */
export interface CodexApprovalBridgeHost {
  collectApproval?(request: CodexApprovalRequest): Promise<CodexApprovalDecision | null>;
}

/** Internal session tracking entry. */
interface CodexSessionEntry {
  provisionalId: string;
  threadId: string | null;
  thread: Thread | null;
}

/** Narrow record guard for defensive approval-param normalization. */
function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read a command string from an approval param that may be a string, array, or object. */
function readCommandString(command: unknown): string {
  if (typeof command === 'string') {
    return command.trim();
  }
  if (Array.isArray(command)) {
    return command.map((c) => String(c)).join(' ').trim();
  }
  if (isRecordLike(command)) {
    const cmd = typeof command.command === 'string' ? command.command.trim() : '';
    const args = Array.isArray(command.args)
      ? command.args.map((a) => String(a)).join(' ').trim()
      : '';
    return [cmd, args].filter(Boolean).join(' ').trim();
  }
  return '';
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * Declared capabilities for the Codex adapter skeleton.
 *
 * Each capability is backed by evidence from the SDK smoke test
 * (scripts/codex-sdk-smoke.mjs, checkpoint 1).
 *
 * MCP TRANSCRIPT SEAM BOUNDARY (Checkpoint 8C):
 * AgentCapability.Mcp is intentionally NOT declared here.  The adapter
 * does translate real Codex mcp_tool_call items into visible tool_use
 * blocks (kind='mcp') via CodexStreamNormalizer — this transcript seam
 * is runtime-proven.  However, AgentMcpCapability implies a much stronger
 * management contract (getMcpServerSnapshot, connect/disconnect, auth
 * flows, catalog subscriptions, etc.) which Codex does not yet satisfy.
 * Do not add AgentCapability.Mcp until that stronger contract is truly
 * implemented and proven.
 */
const CODEX_CAPABILITIES: BackendCapabilities = Object.freeze(
  new Set<AgentCapability>([
    AgentCapability.Chat,      // thread.runStreamed()
    AgentCapability.Sessions,  // codex.startThread() / resumeThread()
    AgentCapability.Fork,      // app-server thread/fork
    AgentCapability.Thinking,  // reasoning items
    AgentCapability.FileOps,   // file_change items
    AgentCapability.Shell,     // command_execution items
    AgentCapability.Todos,     // todo_list items via tool_use → SessionTodoDock
    AgentCapability.Permissions, // sandbox mode selector (read-only/workspace-write/danger-full-access)
    AgentCapability.Images,    // local_image input via temp-file translation
  ]),
);

// ---------------------------------------------------------------------------
// CodexAdapter
// ---------------------------------------------------------------------------

/**
 * AgentService adapter for OpenAI Codex.
 *
 * Implements AgentChatCapability for streaming chat and
 * AgentSessionCapability for basic session lifecycle.
 */
export class CodexAdapter
  implements
    AgentService,
    AgentChatCapability,
    AgentSessionCapability,
    AgentForkCapability
{
  readonly kind: AgentBackendKind = 'codex';
  readonly displayName = 'Codex';
  readonly description = 'OpenAI Codex coding agent';
  readonly capabilities = CODEX_CAPABILITIES;

  private _status: AgentConnectionStatus = 'disconnected';
  private codex: Codex | null = null;
  private sessions = new Map<string, CodexSessionEntry>();
  private threadAlias = new Map<string, string>(); // threadId → provisionalId
  private activeControllers = new Map<string, AbortController>();
  private statusHandlers = new Set<StatusChangeHandler>();
  /**
   * Adjunct app-server client for persisted session discovery and
   * transcript readback.  Kept separate from the main TypeScript SDK
   * chat path per the multi-route architecture.
   */
  private appServerClient: CodexAppServerClient | null = null;

  /**
   * Server-request approval bridge host. Set via `setApprovalHost`. When set
   * (and the app-server client is available), `execCommandApproval` /
   * `applyPatchApproval` handlers are registered so server-initiated approval
   * requests reach this host callback and the decision is replied back as a
   * JSON-RPC `{ decision: ReviewDecision }` result.
   */
  private approvalHost: CodexApprovalBridgeHost = {};
  /** Whether approval handlers are currently registered on the client. */
  private approvalHandlersRegistered = false;

  /**
   * Mutable options reference. Most fields are set once at construction,
   * but `modelReasoningEffort` supports runtime updates from the chat
   * toolbar effort selector without re-creating the adapter.
   */
  private options: CodexAdapterOptions;

  constructor(options: CodexAdapterOptions = {}) {
    this.options = { ...options };
  }

  // -------------------------------------------------------------------------
  // AgentService core
  // -------------------------------------------------------------------------

  hasCapability(cap: AgentCapability): boolean {
    return this.capabilities.has(cap);
  }

  get status(): AgentConnectionStatus {
    return this._status;
  }

  async start(): Promise<void> {
    if (this.codex) {
      return;
    }
    this.setStatus('connecting');
    try {
      if (this.options.createCodex) {
        this.codex = await this.options.createCodex();
      } else {
        // Auth is deferred to the SDK runtime: the Codex CLI supports
        // multiple auth sources (explicit apiKey, OPENAI_API_KEY env var,
        // ~/.codex/auth.json ChatGPT login, etc.).  The adapter does NOT
        // pre-check for an API key — auth failures surface naturally when
        // thread.runStreamed() is called, which is the honest place to
        // report them.
        const { Codex: CodexClass } = await import('@openai/codex-sdk');
        this.codex = new CodexClass({
          ...(this.options.apiKey ? { apiKey: this.options.apiKey } : {}),
          ...(this.options.workingDirectory ? { cwd: this.options.workingDirectory } : {}),
          ...(this.options.codexPathOverride ? { codexPathOverride: this.options.codexPathOverride } : {}),
        });
      }

      // Start the adjunct app-server client for persisted session discovery.
      // This is best-effort: if the app-server fails to start, the adapter
      // still works for in-memory sessions and the main SDK chat path.
      if (this.options.codexPathOverride) {
        try {
          this.appServerClient = new CodexAppServerClient({
            codexPathOverride: this.options.codexPathOverride,
            pluginDir: this.options.pluginDir,
          });
          await this.appServerClient.start();
          // Wire approval handlers if a host was set before start.
          this.registerApprovalHandlers();
        } catch (err) {
          logger.warn('Codex app-server client failed to start; falling back to in-memory sessions only', {
            error: err instanceof Error ? err.message : String(err),
          });
          this.appServerClient = null;
        }
      }

      this.setStatus('connected');
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  async stop(): Promise<void> {
    for (const controller of this.activeControllers.values()) {
      controller.abort();
    }
    this.activeControllers.clear();
    this.codex = null;
    if (this.appServerClient) {
      try {
        this.unregisterApprovalHandlers();
        this.appServerClient.stop();
      } catch {
        // Best-effort cleanup
      }
      this.appServerClient = null;
    }
    this.setStatus('disconnected');
  }

  /**
   * Read-only account info readback, preferring the app-server
   * `account/read` route and falling back to `codex doctor --json`.
   *
   * The app-server route is the primary source because it queries the
   * running server directly, returning richer account/auth data without
   * spawning a CLI process.  The CLI diagnostic remains the fallback
   * when the app-server client is unavailable.
   *
   * Returns null if both sources are unavailable or fail.
   */
  async getAccountInfo(): Promise<unknown | null> {
    if (this.appServerClient) {
      try {
        const accountRead = await this.appServerClient.getAccountRead();
        if (accountRead !== null) {
          return accountRead;
        }
      } catch (err) {
        logger.warn('App-server account/read failed; falling back to CLI diagnostic', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const codexPath = this.options.codexPathOverride ?? 'codex';
    return new Promise((resolve) => {
      execFile(codexPath, ['doctor', '--json'], { timeout: 15000 }, (err, stdout, stderr) => {
        const output = stdout || stderr || '';
        try {
          const parsed = JSON.parse(output);
          resolve(parsed?.checks?.['auth.credentials']?.details ?? null);
        } catch {
          logger.debug('codex doctor output parse failed', {
            error: err instanceof Error ? err.message : String(err),
            outputLength: output.length,
          });
          resolve(null);
        }
      });
    });
  }

  /**
   * Read-only model list readback, preferring the app-server `model/list` route
   * and falling back to the `codex debug models` CLI diagnostic.
   *
   * The app-server route is richer (`displayName`, `supportedReasoningEfforts`,
   * `inputModalities`, `serviceTiers`, `upgradeInfo`) and is the preferred source
   * for the model selector. The CLI diagnostic remains the fallback when the
   * app-server client is unavailable.
   *
   * Returns null if neither source is available or returns no usable models.
   */
  async getModelList(): Promise<CodexModelSummary[] | null> {
    // Prefer app-server model/list when available.
    if (this.appServerClient) {
      try {
        const models = await this.appServerClient.listModels();
        const filtered = models
          .filter((m) => m.id && m.id.length > 0)
          .map((m) => this.normalizeAppServerModel(m));
        if (filtered.length > 0) {
          return filtered;
        }
      } catch (err) {
        logger.warn('App-server model/list failed; falling back to CLI diagnostic', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return this.getModelListFromCli();
  }

  private normalizeAppServerModel(m: AppServerModel): CodexModelSummary {
    return {
      slug: m.model || m.id,
      display_name: m.displayName || m.model || m.id,
      visibility: 'list',
      supported_in_api: true,
      default_reasoning_level: m.defaultReasoningEffort ?? null,
      description: m.description ?? null,
    };
  }

  private getModelListFromCli(): Promise<CodexModelSummary[] | null> {
    const codexPath = this.options.codexPathOverride ?? 'codex';
    return new Promise((resolve) => {
      execFile(codexPath, ['debug', 'models'], { timeout: 15000, maxBuffer: 512 * 1024 }, (err, stdout, stderr) => {
        const output = stdout || stderr || '';
        try {
          const parsed = JSON.parse(output);
          const models = Array.isArray(parsed?.models) ? parsed.models : [];
          const filtered = models
            .filter((m: Record<string, unknown>) => m.visibility !== 'hide' && m.supported_in_api === true)
            .map((m: Record<string, unknown>) => ({
              slug: String(m.slug ?? ''),
              display_name: String(m.display_name ?? ''),
              visibility: String(m.visibility ?? 'unknown'),
              supported_in_api: Boolean(m.supported_in_api),
              default_reasoning_level: m.default_reasoning_level != null ? String(m.default_reasoning_level) : null,
              description: m.description != null ? String(m.description) : null,
            }));
          resolve(filtered.length > 0 ? filtered : null);
        } catch {
          logger.debug('codex debug models output parse failed', {
            error: err instanceof Error ? err.message : String(err),
            outputLength: output.length,
          });
          resolve(null);
        }
      });
    });
  }

  /**
   * Read-only permission profile readback via the app-server adjunct client.
   *
   * Returns available permission profiles from the Codex app-server
   * `permissionProfile/list` route. Each entry contains `id` and optional
   * `description`.
   *
   * This is an app-server diagnostic surface, not a CLI command or SDK API.
   * Returns null if the app-server client is unavailable or the request fails.
   */
  async getPermissionProfiles(): Promise<AppServerPermissionProfile[] | null> {
    if (!this.appServerClient) {
      return null;
    }
    try {
      const profiles = await this.appServerClient.listPermissionProfiles({
        ...(this.options.workingDirectory ? { cwd: this.options.workingDirectory } : {}),
      });
      return profiles.length > 0 ? profiles : null;
    } catch (err) {
      logger.warn('Failed to read permission profiles from app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Read-only account rate limits readback via the app-server adjunct client.
   *
   * Returns account rate limit information from the Codex app-server
   * `account/rateLimits/read` route. The response contains `rateLimits`
   * and optional `rateLimitsByLimitId`.
   *
   * This is an app-server diagnostic surface, not a CLI command or SDK API.
   * The route is environment-dependent: it returns real rate limit data when the
   * active Codex account is signed in with ChatGPT auth, and returns a
   * "chatgpt authentication required" error when the account uses API-key auth
   * (or the ChatGPT session is absent). The result carries `errorReason` so the
   * readback UI can show the honest reason instead of a generic "unavailable".
   */
  async getAccountRateLimits(): Promise<AppServerAccountRateLimitsResult> {
    if (!this.appServerClient) {
      return { rateLimits: null };
    }
    try {
      return await this.appServerClient.getAccountRateLimits();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to read account rate limits from app-server', {
        error: reason,
      });
      return { rateLimits: null, errorReason: reason };
    }
  }

  /**
   * Read-only account usage readback via the app-server adjunct client.
   *
   * Returns account token usage information from the Codex app-server
   * `account/usage/read` route. The response contains `summary`
   * and optional `dailyUsageBuckets`.
   *
   * This is an app-server diagnostic surface, not a CLI command or SDK API.
   * The route is environment-dependent: it returns real token usage when the
   * active Codex account is signed in with ChatGPT auth, and returns a
   * "chatgpt authentication required" error when the account uses API-key auth
   * (or the ChatGPT session is absent). The result carries `errorReason` so the
   * readback UI can show the honest reason instead of a generic "unavailable".
   */
  async getAccountUsage(): Promise<AppServerAccountUsageResult> {
    if (!this.appServerClient) {
      return { usage: null };
    }
    try {
      return await this.appServerClient.getAccountUsage();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to read account usage from app-server', {
        error: reason,
      });
      return { usage: null, errorReason: reason };
    }
  }

  /**
   * Read-only model provider capabilities readback via the app-server adjunct client.
   *
   * Returns capability flags (`namespaceTools`, `imageGeneration`, `webSearch`)
   * from the Codex app-server `modelProvider/capabilities/read` route.
   * These are diagnostic flags indicating what the current model provider supports.
   *
   * This is an app-server diagnostic surface. Returns null if the app-server
   * client is unavailable or the request fails.
   */
  async getModelProviderCapabilities(): Promise<AppServerModelProviderCapabilities | null> {
    if (!this.appServerClient) {
      return null;
    }
    try {
      return await this.appServerClient.getModelProviderCapabilities();
    } catch (err) {
      logger.warn('Failed to read model provider capabilities from app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Read-only MCP server status readback via the app-server adjunct client.
   *
   * Returns MCP server runtime status from the Codex app-server
   * `mcpServerStatus/list` route. Each entry contains `name`, optional
   * `serverInfo`, `tools`, `resources`, `resourceTemplates`, and `authStatus`.
   *
   * This is an app-server diagnostic surface, not an MCP management or
   * authoring interface. Returns null if the app-server client is unavailable
   * or the request fails.
   */
  async getMcpServerStatus(): Promise<AppServerMcpServerStatus[] | null> {
    if (!this.appServerClient) {
      return null;
    }
    try {
      const statuses = await this.appServerClient.listMcpServerStatus();
      return statuses.length > 0 ? statuses : null;
    } catch (err) {
      logger.warn('Failed to read MCP server status from app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Ask the Codex app-server to reload its MCP server configuration.
   *
   * Calls the `config/mcpServer/reload` route. Returns `true` if the reload
   * request was accepted, `false` otherwise. This does not edit project-level
   * MCP settings; it only asks the running app-server to re-read its config.
   */
  async reloadMcpServers(): Promise<boolean> {
    if (!this.appServerClient) {
      return false;
    }
    try {
      return await this.appServerClient.reloadMcpServers();
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
   * Returns the resource contents (read-only inspection surface), or null if
   * the app-server client is unavailable.
   */
  async readMcpServerResource(server: string, uri: string): Promise<AppServerMcpResourceReadResult | null> {
    if (!this.appServerClient) {
      return null;
    }
    try {
      return await this.appServerClient.readMcpServerResource(server, uri);
    } catch (err) {
      logger.warn('Failed to read MCP server resource via app-server', {
        server,
        uri,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Retry a single MCP tool call via the app-server
   * `mcpServer/tool/call` route.
   *
   * Used by the inline chat recovery affordance: when a Codex MCP tool block
   * fails (e.g. with an auth error), the user can re-run the exact same
   * server/tool/arguments directly against the app-server to verify the fix.
   * The result is surfaced inline on the same block. This is a constrained
   * diagnostic retry — NOT a generic tool-call console and NOT a replacement
   * for re-sending the message (the agent's conversation context is untouched).
   * Returns null if the app-server client is unavailable.
   */
  async retryMcpToolCall(
    backendSessionId: string,
    server: string,
    tool: string,
    toolArguments: Record<string, unknown>,
  ): Promise<AppServerMcpToolCallResult | null> {
    if (!this.appServerClient) {
      return null;
    }
    try {
      return await this.appServerClient.mcpServerToolCall(backendSessionId, server, tool, toolArguments);
    } catch (err) {
      logger.warn('Failed to retry MCP tool call via app-server', {
        backendSessionId,
        server,
        tool,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async triggerMcpServerOAuth(
    name: string,
    options?: { scopes?: string[]; timeoutSecs?: number; onAuthorizationUrl?: (url: string) => void },
  ): Promise<McpOauthLoginResult | null> {
    if (!this.appServerClient) {
      return null;
    }
    try {
      return await this.appServerClient.mcpServerOauthLogin(name, options);
    } catch (err) {
      logger.warn('Failed to trigger MCP server OAuth via app-server', {
        name,
        error: err instanceof Error ? err.message : String(err),
      });
      return { outcome: 'failed', browserOpened: false, errorReason: err instanceof Error ? err.message : String(err) };
    }
  }

  async getThreadGoal(backendSessionId: string): Promise<AppServerThreadGoal | null> {
    if (!this.appServerClient) {
      return null;
    }
    try {
      return await this.appServerClient.getThreadGoal(backendSessionId);
    } catch (err) {
      logger.warn('Failed to read thread goal', {
        backendSessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async setThreadGoal(backendSessionId: string, objective: string, options?: { tokenBudget?: number }): Promise<AppServerThreadGoal | null> {
    if (!this.appServerClient) {
      return null;
    }
    try {
      return await this.appServerClient.setThreadGoal(backendSessionId, objective, options);
    } catch (err) {
      logger.warn('Failed to set thread goal', {
        backendSessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async clearThreadGoal(backendSessionId: string): Promise<boolean> {
    if (!this.appServerClient) {
      return false;
    }
    try {
      return await this.appServerClient.clearThreadGoal(backendSessionId);
    } catch (err) {
      logger.warn('Failed to clear thread goal', {
        backendSessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async listLoadedThreads(): Promise<Array<{ id: string }>> {
    if (!this.appServerClient) {
      return [];
    }
    try {
      return await this.appServerClient.listLoadedThreads();
    } catch (err) {
      logger.warn('Failed to list loaded threads', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Fork a persisted Codex thread via the app-server.
   *
   * Implements AgentForkCapability. The new thread is created on the app-server
   * and persisted to disk; the returned id can be used to resume it.
   */
  async forkSession(sessionId: string): Promise<{ id: string; title: string }> {
    if (!this.appServerClient) {
      throw new Error('Codex app-server client is not available');
    }
    const result = await this.appServerClient.forkThread(sessionId);
    if (!result?.thread?.id) {
      throw new Error(`Failed to fork Codex session ${sessionId}`);
    }
    const title = result.thread.name
      || (typeof result.thread.preview === 'string' ? result.thread.preview.slice(0, 80) : '')
      || '(untitled)';
    return { id: result.thread.id, title };
  }

  /**
   * Archive a persisted Codex thread via the app-server.
   *
   * Returns true if the archive request was accepted. Archives are visible in
   * the app-server thread list but marked as archived.
   */
  async archiveSession(sessionId: string): Promise<boolean> {
    if (!this.appServerClient) {
      return false;
    }
    return this.appServerClient.archiveThread(sessionId);
  }

  /**
   * Unarchive a previously archived Codex thread via the app-server.
   */
  async unarchiveSession(sessionId: string): Promise<boolean> {
    if (!this.appServerClient) {
      return false;
    }
    return this.appServerClient.unarchiveThread(sessionId);
  }

  /**
   * Start a code review on the given Codex session.
   *
   * The session must have a real backend `threadId` (not a provisional id).
   * The adapter first resumes (loads) the thread on the app-server, then
   * calls `review/start` with the given target.  Returns the review turn
   * info on success, or null if the app-server client is unavailable, the
   * thread cannot be loaded, or the review/start request fails.
   *
   * Review progress and results arrive as async app-server notifications
   * (`item/started`, `item/completed`, `turn/completed`); callers can
   * subscribe via `appServerClient.addNotificationHandler()` if they hold
   * a direct reference.
   */
  async startReview(
    sessionId: string,
    target: AppServerReviewTarget,
  ): Promise<AppServerReviewResult | null> {
    if (!this.appServerClient) {
      return null;
    }
    // `review/start` requires a loaded thread. Resume first, then review.
    await this.appServerClient.resumeThread(sessionId);
    return this.appServerClient.startReview(sessionId, target);
  }

  dispose(): void {
    this.stop();
    this.sessions.clear();
    this.threadAlias.clear();
    this.statusHandlers.clear();
  }

  /**
   * Invalidate the cached SDK `Thread` object for a live session so the next
   * `sendMessage()` re-resumes the backend thread with the adapter's CURRENT
   * options (model, sandbox, effort, network, webSearch, additionalDirs).
   *
   * The TypeScript SDK freezes thread options (`_threadOptions`) at the moment
   * a `Thread` is created via `startThread()` / `resumeThread()`, and each
   * `runStreamed()` spawns a fresh `codex exec resume <threadId>` subprocess
   * that reads those settings from CLI args. Mutating `this.options` via the
   * `update*()` methods therefore does NOT affect an already-cached thread.
   *
   * Calling this after a settings change drops the cached `Thread` while
   * keeping the real `threadId`, so the next turn re-resumes with the new
   * CLI args AND preserves the full conversation history stored in the
   * persisted rollout file. This is the honest "applies to the next turn in
   * the current conversation" path — it does NOT use the app-server
   * `thread/settings/update` route (which is app-server-only and unreachable
   * from the SDK's per-turn `codex exec` subprocess).
   *
   * Returns `true` when a cached thread was actually dropped, `false` when
   * there is no session, no real `threadId`, or no cached thread to drop.
   * Safe to call mid-stream: the running turn already captured its `Thread`
   * reference locally, so only the NEXT turn re-resumes.
   */
  invalidateLiveThread(sessionId: string): boolean {
    const entry = this.resolveSession(sessionId);
    if (!entry || !entry.threadId || !entry.thread) {
      return false;
    }
    entry.thread = null;
    return true;
  }

  /**
   * Update the reasoning effort used for subsequent thread creation.
   *
   * This does **not** affect existing/resumed threads — only threads
   * created or resumed after this call will use the new value.
   * The UI must be honest that this is a "next thread" boundary.
   */
  updateModelReasoningEffort(effort: CodexAdapterOptions['modelReasoningEffort']): void {
    this.options = {
      ...this.options,
      modelReasoningEffort: effort,
    };
  }

  /**
   * Update the sandbox mode used for subsequent thread creation/resume.
   *
   * This does **not** affect existing/resumed threads — only threads
   * created or resumed after this call will use the new value.
   * The UI must be honest that this is a "next thread" boundary.
   */
  updateSandboxMode(mode: CodexAdapterOptions['sandboxMode']): void {
    this.options = {
      ...this.options,
      sandboxMode: mode,
    };
  }

  updateModel(model: string | undefined): void {
    this.options = {
      ...this.options,
      model: model && model.trim().length > 0 ? model.trim() : undefined,
    };
  }

  /**
   * Update the additional directories used for subsequent thread creation.
   *
   * This does **not** affect existing/resumed threads — only threads
   * created or resumed after this call will use the new directories.
   */
  updateAdditionalDirectories(directories: readonly string[] | undefined): void {
    this.options = {
      ...this.options,
      additionalDirectories:
        directories && directories.length > 0 ? [...directories] : undefined,
    };
  }

  /**
   * Update whether network access is enabled for subsequent thread creation.
   *
   * This does **not** affect existing/resumed threads — only threads
   * created or resumed after this call will use the new value.
   */
  updateNetworkAccessEnabled(enabled: boolean | undefined): void {
    this.options = {
      ...this.options,
      networkAccessEnabled: enabled,
    };
  }

  updateWebSearchMode(mode: CodexAdapterOptions['webSearchMode']): void {
    this.options = {
      ...this.options,
      webSearchMode: mode,
    };
  }

  // -------------------------------------------------------------------------
  // Server-request approval bridge
  // -------------------------------------------------------------------------

  /**
   * Set the host callback that surfaces server-request approvals to the UI.
   * If the app-server client is already running, the `execCommandApproval` /
   * `applyPatchApproval` handlers are registered immediately; otherwise they
   * are registered on the next successful `start()`. Calling this replaces the
   * previous host; already-registered handlers read the host dynamically, so a
   * host that loses its `collectApproval` callback safely degrades to `denied`.
   */
  setApprovalHost(host: CodexApprovalBridgeHost): void {
    this.approvalHost = host;
    this.registerApprovalHandlers();
  }

  /**
   * Register `execCommandApproval` / `applyPatchApproval` server-request
   * handlers on the app-server client. Idempotent: a no-op when there is no
   * client, no host callback, or handlers are already registered.
   */
  private registerApprovalHandlers(): void {
    if (!this.appServerClient || this.approvalHandlersRegistered) {
      return;
    }
    if (!this.approvalHost.collectApproval) {
      return;
    }
    this.appServerClient.registerServerRequestHandler(
      'execCommandApproval',
      (params) => this.handleApproval('execCommand', params),
    );
    this.appServerClient.registerServerRequestHandler(
      'applyPatchApproval',
      (params) => this.handleApproval('applyPatch', params),
    );
    this.approvalHandlersRegistered = true;
  }

  /**
   * Remove the approval server-request handlers from the app-server client.
   * After removal, matching server requests receive a `-32601 Method not
   * found` reply (per the bridge contract) instead of being handled.
   */
  private unregisterApprovalHandlers(): void {
    if (!this.appServerClient || !this.approvalHandlersRegistered) {
      return;
    }
    this.appServerClient.unregisterServerRequestHandler('execCommandApproval');
    this.appServerClient.unregisterServerRequestHandler('applyPatchApproval');
    this.approvalHandlersRegistered = false;
  }

  /**
   * Handle a single server-request approval: normalize params into a UI
   * request, collect a decision from the host, and translate it into the
   * `{ decision: ReviewDecision }` payload the bridge replies with. Defaults
   * to a safe `denied` decision when the host is absent, throws, or cancels.
   */
  private async handleApproval(kind: CodexApprovalKind, params: unknown): Promise<{ decision: string }> {
    const collect = this.approvalHost.collectApproval;
    if (!collect) {
      return { decision: 'denied' };
    }
    const request = this.normalizeApprovalRequest(kind, params);
    let decision: CodexApprovalDecision | null;
    try {
      decision = await collect(request);
    } catch (err) {
      logger.warn('Approval host threw; defaulting to denied', {
        kind,
        error: err instanceof Error ? err.message : String(err),
      });
      return { decision: 'denied' };
    }
    if (!decision) {
      return { decision: 'denied' };
    }
    return { decision: decision.decision };
  }

  private normalizeApprovalRequest(kind: CodexApprovalKind, params: unknown): CodexApprovalRequest {
    return kind === 'execCommand'
      ? this.normalizeExecCommandApproval(params)
      : this.normalizeApplyPatchApproval(params);
  }

  private normalizeExecCommandApproval(params: unknown): CodexApprovalRequest {
    const p = isRecordLike(params) ? params : {};
    const cwd = typeof p.cwd === 'string' ? p.cwd : undefined;
    const command = readCommandString(p.command);
    return {
      kind: 'execCommand',
      summary: command || '(unknown command)',
      ...(command ? { command } : {}),
      ...(cwd ? { cwd } : {}),
      raw: params,
    };
  }

  private normalizeApplyPatchApproval(params: unknown): CodexApprovalRequest {
    const p = isRecordLike(params) ? params : {};
    const changes = Array.isArray(p.changes) ? p.changes : [];
    return {
      kind: 'applyPatch',
      summary: changes.length === 1 ? '1 file change' : `${changes.length} file changes`,
      changeCount: changes.length,
      raw: params,
    };
  }

  onStatusChange(handler: StatusChangeHandler): Disposable {
    this.statusHandlers.add(handler);
    return {
      dispose: () => {
        this.statusHandlers.delete(handler);
      },
    };
  }

  // -------------------------------------------------------------------------
  // AgentChatCapability
  // -------------------------------------------------------------------------

  async *sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    if (!this.codex) {
      yield { type: 'error', content: 'Codex adapter not started' };
      return;
    }

    let thread: Thread | null;
    try {
      thread = this.resolveOrCreateThread(request.sessionId);
    } catch (err) {
      yield {
        type: 'error',
        content: err instanceof Error ? err.message : String(err),
      };
      return;
    }

    if (!thread) {
      yield { type: 'error', content: `Failed to resolve session: ${request.sessionId}` };
      return;
    }

    const controller = new AbortController();
    this.activeControllers.set(request.sessionId, controller);

    // Extract structured-output schema from the backend-neutral outputFormat option.
    const outputFormat = request.options?.outputFormat;
    const outputSchema = outputFormat && typeof outputFormat === 'object' && 'schema' in outputFormat
      ? outputFormat.schema
      : undefined;

    const normalizer = new CodexStreamNormalizer({
      sessionId: request.sessionId,
      outputSchema,
    });

    let tempDir: string | undefined;
    try {
      // Build Codex input: string for text-only, UserInput[] when images are present.
      const input = this.buildCodexInput(request.content, request.images);
      tempDir = input.tempDir;

      const streamed = await thread.runStreamed(input.payload, {
        signal: controller.signal,
        ...(outputSchema !== undefined ? { outputSchema } : {}),
      });

      for await (const event of streamed.events as AsyncIterable<ThreadEvent>) {
        if (event.type === 'thread.started') {
          this.aliasSession(request.sessionId, event.thread_id);
        }

        const chunks = normalizer.transformEvent(event);
        for (const chunk of chunks) {
          yield chunk;
        }
      }
    } catch (err) {
      yield {
        type: 'error',
        content: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.activeControllers.delete(request.sessionId);
      if (tempDir) {
        this.safeRemoveTempDir(tempDir);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Image input helpers
  // -------------------------------------------------------------------------

  /**
   * Build Codex input from content and optional images.
   *
   * When images are present, writes each image to a temporary file and
   * returns a UserInput array: one text entry + one local_image entry per
   * image.  The temporary directory is returned so the caller can clean it
   * up after the stream completes.
   */
  private buildCodexInput(
    content: string,
    images: ImageAttachment[] | undefined,
  ): { payload: string | UserInput[]; tempDir?: string } {
    if (!images || images.length === 0) {
      return { payload: content };
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'opencodian-codex-image-'));
    const userInputs: UserInput[] = [{ type: 'text', text: content }];

    for (const image of images) {
      const ext = this.mediaTypeToExtension(image.mediaType);
      const fileName = image.filename ?? `image-${Date.now()}.${ext}`;
      const filePath = join(tempDir, fileName);
      const buffer = Buffer.from(image.data, 'base64');
      writeFileSync(filePath, buffer);
      userInputs.push({ type: 'local_image', path: filePath });
    }

    return { payload: userInputs, tempDir };
  }

  private mediaTypeToExtension(mediaType: ImageAttachment['mediaType']): string {
    switch (mediaType) {
      case 'image/jpeg': return 'jpg';
      case 'image/png': return 'png';
      case 'image/gif': return 'gif';
      case 'image/webp': return 'webp';
      default: return 'bin';
    }
  }

  private safeRemoveTempDir(tempDir: string): void {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; do not throw on failure.
    }
  }

  cancelStream(sessionId: string): void {
    const controller = this.activeControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(sessionId);
    }
  }

  // -------------------------------------------------------------------------
  // AgentSessionCapability
  // -------------------------------------------------------------------------

  async createSession(_title?: string, _options?: Record<string, unknown>): Promise<string> {
    const provisionalId = `codex-local-${crypto.randomUUID()}`;
    this.sessions.set(provisionalId, {
      provisionalId,
      threadId: null,
      thread: null,
    });
    return provisionalId;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (entry?.threadId) {
      this.threadAlias.delete(entry.threadId);
    }
    this.sessions.delete(sessionId);
  }

  async updateSessionTitle(
    _sessionId: string,
    _title: string,
  ): Promise<void> {
    // Codex SDK does not expose session title management.
    // No-op to satisfy the interface contract.
  }

  async listSessions(): Promise<unknown[]> {
    // Start with in-memory sessions
    const inMemorySessions = Array.from(this.sessions.values());
    const result: Array<Record<string, unknown>> = inMemorySessions.map(entry => ({
      id: entry.threadId ?? entry.provisionalId,
      provisionalId: entry.provisionalId,
      threadId: entry.threadId,
    }));

    // Query app-server for persisted threads and merge
    if (this.appServerClient) {
      try {
        const [activeThreads, archivedThreads] = await Promise.all([
          this.appServerClient.listThreads({ limit: 50, archived: false }),
          this.appServerClient.listThreads({ limit: 50, archived: true }),
        ]);
        const normalizedActive = CodexAppServerClient.normalizeThreadList(activeThreads);
        // The app-server `thread/list` response does not echo an `archived` field
        // on each thread row, even when queried with `archived: true`. The filter
        // semantic is the source of truth: every thread returned by an
        // `archived: true` query IS archived, so stamp it explicitly here.
        const normalizedArchived = CodexAppServerClient.normalizeThreadList(archivedThreads).map(
          (thread) => ({ ...thread, archived: true }),
        );
        const normalized = [...normalizedActive, ...normalizedArchived];
        // Merge: app-server threads take precedence for those that exist in both.
        // Update the dedup set as we add so the active query wins over any
        // overlap with the archived query (kept robust even though the
        // app-server partitions the two sets).
        const existingIds = new Set(result.map(r => String(r.id)));
        for (const thread of normalized) {
          if (!existingIds.has(thread.id)) {
            existingIds.add(thread.id);
            result.push({
              id: thread.id,
              title: thread.title,
              updatedAt: thread.updatedAt,
              provisionalId: null,
              threadId: thread.id,
              archived: thread.archived,
            });
          }
        }
      } catch (err) {
        logger.warn('Failed to list persisted threads from app-server', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  async getSession(sessionId: string): Promise<unknown | null> {
    // Check in-memory first
    const entry = this.resolveSession(sessionId);
    if (entry) {
      return {
        id: entry.threadId ?? entry.provisionalId,
        provisionalId: entry.provisionalId,
        threadId: entry.threadId,
      };
    }

    // Fall back to app-server for persisted threads
    if (this.appServerClient) {
      try {
        const thread = await this.appServerClient.readThread(sessionId, false);
        if (thread) {
          return {
            id: thread.id,
            title: thread.name ?? thread.preview.slice(0, 80) ?? '(untitled)',
            updatedAt: thread.updatedAt ? thread.updatedAt * 1000 : null,
            provisionalId: null,
            threadId: thread.id,
          };
        }
      } catch (err) {
        logger.warn('Failed to read persisted thread from app-server', {
          threadId: sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return null;
  }

  /**
   * Read messages from a backend session via the app-server.
   *
   * Returns normalized messages in a shape that AgentBackendRouting
   * can consume for preview/detail transcript readback.
   */
  async getSessionMessages(sessionId: string): Promise<unknown[]> {
    if (!this.appServerClient) {
      return [];
    }

    try {
      const thread = await this.appServerClient.readThread(sessionId, true);
      if (!thread || !thread.turns) {
        return [];
      }

      const previewMessages = CodexAppServerClient.normalizeTurnsToPreviewMessages(thread.turns);
      // Return parts array so activity types (tool_call, file_change, web_search)
      // survive the AgentBackendRouting.getBackendSessionPreview normalization.
      return previewMessages.map((msg) => ({
        role: msg.role,
        content: msg.parts,
      }));
    } catch (err) {
      logger.warn('Failed to read thread messages from app-server', {
        threadId: sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Check if a sessionId looks like a provisional local ID. */
  private isProvisionalId(id: string): boolean {
    return id.startsWith('codex-local-');
  }

  private buildThreadOptions(): ThreadOptions {
    return {
      ...(this.options.workingDirectory
        ? { workingDirectory: this.options.workingDirectory }
        : {}),
      ...(this.options.model
        ? { model: this.options.model }
        : {}),
      ...(this.options.sandboxMode
        ? { sandboxMode: this.options.sandboxMode }
        : {}),
      ...(this.options.modelReasoningEffort
        ? { modelReasoningEffort: this.options.modelReasoningEffort }
        : {}),
      ...(this.options.additionalDirectories?.length
        ? { additionalDirectories: [...this.options.additionalDirectories] }
        : {}),
      ...(this.options.networkAccessEnabled !== undefined
        ? { networkAccessEnabled: this.options.networkAccessEnabled }
        : {}),
      ...(this.options.webSearchMode
        ? { webSearchMode: this.options.webSearchMode }
        : {}),
      // Obsidian vaults are not typically Git repositories; skip the
      // Codex CLI's git-trust check to avoid immediate rejection.
      skipGitRepoCheck: true,
    };
  }

  private resolveOrCreateThread(sessionId: string): Thread | null {
    if (!this.codex) {
      return null;
    }

    const entry = this.resolveSession(sessionId);

    // Existing thread object
    if (entry?.thread) {
      return entry.thread;
    }

    // Session has a thread ID but no Thread object (adapter may have been restarted)
    if (entry?.threadId) {
      const thread = this.codex.resumeThread(entry.threadId, this.buildThreadOptions());
      entry.thread = thread;
      return thread;
    }

    // Known provisional session without thread → start new
    if (entry) {
      const thread = this.codex.startThread(this.buildThreadOptions());
      entry.thread = thread;
      return thread;
    }

    // Unknown session — distinguish provisional vs real thread ID:
    //  - provisional-looking → start new thread (caller explicitly created a local session)
    //  - anything else → treat as a real thread ID and attempt resume
    if (this.isProvisionalId(sessionId)) {
      const thread = this.codex.startThread(this.buildThreadOptions());
      this.sessions.set(sessionId, {
        provisionalId: sessionId,
        threadId: null,
        thread,
      });
      return thread;
    }

    // Treat as a real Codex thread ID → resume.
    // If the ID is invalid, the SDK will throw; sendMessage() will yield it as an error chunk.
    const thread = this.codex.resumeThread(sessionId, this.buildThreadOptions());
    this.sessions.set(sessionId, {
      provisionalId: sessionId,
      threadId: sessionId,
      thread,
    });
    return thread;
  }

  private resolveSession(sessionId: string): CodexSessionEntry | null {
    // Direct lookup by provisionalId
    const direct = this.sessions.get(sessionId);
    if (direct) {
      return direct;
    }
    // Alias lookup by threadId
    const provisionalId = this.threadAlias.get(sessionId);
    if (provisionalId) {
      return this.sessions.get(provisionalId) ?? null;
    }
    return null;
  }

  private aliasSession(provisionalId: string, threadId: string): void {
    const entry = this.sessions.get(provisionalId);
    if (entry) {
      entry.threadId = threadId;
    }
    this.threadAlias.set(threadId, provisionalId);
  }

  private setStatus(status: AgentConnectionStatus): void {
    if (this._status === status) {
      return;
    }
    this._status = status;
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch {
        // Swallow handler errors — must not break status propagation.
      }
    }
  }
}

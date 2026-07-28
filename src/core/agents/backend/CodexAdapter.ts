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
import type { AgentBackendKind, ContextUsageSnapshot, ImageAttachment, StreamChunk } from '../../types/chat';
import type { CodexApprovalPolicy } from '../../types/settings';
import { AgentCapability, type BackendCapabilities } from '../AgentCapability';
import type {
  AgentChatCapability,
  AgentChatSendRequest,
  AgentConnectionStatus,
  AgentForkCapability,
  AgentService,
  AgentSessionCapability,
  CapabilityChangeHandler,
  Disposable,
  StatusChangeHandler,
} from './AgentService';
import {
  type AppServerAccountRateLimitsResult,
  type AppServerAccountUsageResult,
  type AppServerHooksReadbackResult,
  type AppServerListHooksOptions,
  type AppServerMcpResourceReadResult,
  type AppServerMcpServerStatus,
  type AppServerMcpToolCallResult,
  type AppServerModel,
  type AppServerModelProviderCapabilities,
  type AppServerPermissionProfile,
  type AppServerReviewResult,
  type AppServerReviewTarget,
  type AppServerSkill,
  type AppServerSkillGroup,
  type AppServerThread,
  type AppServerThreadCompactionAckResult,
  type AppServerThreadEffectiveEvidence,
  type AppServerThreadEffectiveSettings,
  type AppServerThreadGoal,
  type AppServerThreadStartOptions,
  type AppServerTurnStartOptions,
  buildEffectiveEvidenceWithApplication,
  buildUniformEffectiveEvidence,
  CodexAppServerClient,
  type EffectiveFieldWiring,
  type McpOauthLoginResult,
  threadPhaseApplication,
  turnSuccessApplication,
} from './CodexAppServerClient';
import {
  type AppServerStreamState,
  mapAppServerNotification,
  readAppServerTurnError,
} from './CodexAppServerStreamMapper';
import { type CodexCliResolution,getCodexCliErrorMessage } from './CodexCliResolver';
import { CodexStreamNormalizer } from './CodexStreamNormalizer';

const logger = createLogger('CodexAdapter');

function isExecutableMissingError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Factory function for creating a Codex SDK instance. */
export type CodexFactory = () => Promise<Codex>;

/**
 * Optional app-server construction seam. Returning `null` explicitly models
 * a failed/unavailable negotiation while preserving the SDK chat fallback.
 */
export type CodexAppServerClientFactory = () => CodexAppServerClient | null;

/** Immutable snapshot of the option values that form one app-server attempt. */
export interface AttemptOptions {
  readonly model?: string;
  readonly workingDirectory?: string;
  readonly sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  readonly additionalDirectories?: readonly string[];
  readonly networkAccessEnabled?: boolean;
  readonly webSearchMode?: 'disabled' | 'cached' | 'live';
  readonly approvalPolicy?: CodexApprovalPolicy;
  readonly modelReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

interface AppServerAttempt {
  readonly sessionId: string;
  readonly epoch: number;
  readonly options: Readonly<AttemptOptions>;
}

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
  /**
   * Approval policy. 'inherit' (default) omits the override so the backend
   * uses its own policy; 'untrusted'/'on-request' require an available
   * app-server AND an approval bridge (fail closed otherwise); 'never' may
   * use the existing SDK fallback.
   */
  approvalPolicy?: CodexApprovalPolicy;
  /** Working directory for thread operations. */
  workingDirectory?: string;
  /**
   * Absolute path to the Codex CLI binary.
   * When provided, bypasses the SDK's require.resolve-based binary discovery
   * (which fails in Obsidian's plugin loader because __filename points to
   * Electron internals rather than the plugin directory).
   */
  codexPathOverride?: string;
  /** Verified user-installed CLI resolution supplied during plugin startup. */
  codexCliResolution?: CodexCliResolution;
  /** DI seam: override the Codex SDK instance factory. */
  createCodex?: CodexFactory;
  /** DI seam: provide or deliberately disable the local app-server client. */
  createAppServerClient?: CodexAppServerClientFactory;
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

/** Final two-axis outcome for a foreground `thread/compact/start` request. */
export interface CodexForegroundCompactionResult {
  status: 'verified' | 'unavailable' | 'invalid-thread' | 'busy' | 'failed' | 'malformed' | 'timed-out';
  /** True only after the server returned its empty `{}` ACK. */
  acknowledged: boolean;
  /** True only after matching compaction completion plus fresh token usage. */
  runtimeVerified: boolean;
  /** Whether a matching `item/started` was observed before completion. */
  started: boolean;
  /** Whether a matching `item/completed` was observed. */
  completed: boolean;
  /** Whether an authoritative post-request context snapshot was observed. */
  tokenUsageObserved: boolean;
  threadId?: string;
  errorReason?: string;
}

export interface CodexForegroundCompactionOptions {
  /** Bounded end-to-end wait for runtime evidence after the RPC request starts. */
  timeoutMs?: number;
  acknowledgementTimeoutMs?: number;
  /** Called exactly once after an empty ACK; it is never a success callback. */
  onAccepted?: () => void;
}

/** Side-effect-free preflight for foreground compaction controls. */
export interface CodexForegroundCompactionAvailability {
  status: 'available' | 'unavailable' | 'invalid-thread' | 'busy';
  threadId?: string;
}

interface ForegroundCompactionGate extends CodexForegroundCompactionAvailability {
  logicalSessionId?: string;
  client?: CodexAppServerClient;
}

interface PendingForegroundCompaction {
  readonly sessionId: string;
  readonly threadId: string;
  readonly epoch: number;
  acknowledged: boolean;
  /** False until immediately before the compact RPC is sent; pre-dispatch events are stale. */
  requestDispatched: boolean;
  started: boolean;
  completed: boolean;
  tokenUsageObserved: boolean;
  itemId: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  subscription: Disposable | null;
  resolve: (result: CodexForegroundCompactionResult) => void;
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
  private readonly capabilitySet = new Set<AgentCapability>(CODEX_CAPABILITIES);
  get capabilities(): BackendCapabilities { return this.capabilitySet; }

  private _status: AgentConnectionStatus = 'disconnected';
  private codex: Codex | null = null;
  private sessions = new Map<string, CodexSessionEntry>();
  private threadAlias = new Map<string, string>(); // threadId → provisionalId
  private activeControllers = new Map<string, AbortController>();
  private activeAppServerTurns = new Map<string, { threadId: string; turnId: string | null }>();
  private appServerContextSnapshots = new Map<string, ContextUsageSnapshot>();
  /** Independent from per-turn stream subscriptions; one foreground compaction per logical session. */
  private pendingForegroundCompactions = new Map<string, PendingForegroundCompaction>();
  /** Separate from turn-attempt epochs so compaction never invalidates a live stream. */
  private foregroundCompactionEpochs = new Map<string, number>();
  private nextForegroundCompactionEpoch = 0;
  /**
   * Per-session three-axis runtime evidence for thread effective settings,
   * keyed by sessionId (NOT threadId) so the lifecycle can be set to `pending`
   * before a start (when no thread id exists yet) and so concurrent sessions
   * never bleed state. Not a global singleton — instance state on this adapter.
   */
  private sessionEffectiveEvidence = new Map<string, AppServerThreadEffectiveEvidence>();
  /** Latest server-confirmed effective settings per session (for the readback consumer's value display). */
  private sessionEffectiveSettings = new Map<string, AppServerThreadEffectiveSettings | null>();
  /**
   * Per-session IMMUTABLE attempt options snapshot captured before any await.
   * Prevents mid-flight option mutations from fabricating false evidence or
   * sending inconsistent thread/turn options. The snapshot freezes the actual
   * VALUES (model, sandbox, approval, effort, etc.) that form the request.
   */
  private sessionAttemptOptions = new Map<string, Readonly<AttemptOptions>>();
  /** Per-session attempt epoch; stop/deleteSession invalidates the current epoch so in-flight attempts abort. */
  private sessionEpochs = new Map<string, number>();
  /** Monotonic across stop/start so an old attempt can never ABA-match a new one. */
  private nextAttemptEpoch = 0;
  private lastEvidenceSessionId: string | null = null;
  private statusHandlers = new Set<StatusChangeHandler>();
  private capabilityHandlers = new Set<CapabilityChangeHandler>();
  /**
   * Primary local app-server transport. It owns the chat turn whenever the
   * experimental protocol negotiates successfully, because that is where
   * Codex publishes authoritative thread context usage notifications.
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
   * Handlers notified when the Codex app-server emits `skills/changed`. The
   * chat slash-command menu cache subscribes to this so it can invalidate
   * immediately instead of waiting for the 120s TTL.
   */
  private skillsChangedHandlers = new Set<() => void>();
  /** Unsubscribe function for the `skills/changed` notification, or null. */
  private skillsChangedUnsubscribe: (() => void) | null = null;
  /**
   * One-shot flag: when set, the next `getRuntimeSkills()` call passes
   * `forceReload: true` to `skills/list` (bypassing the app-server's cache)
   * and then clears the flag. Set by `forceNextRuntimeSkillsReload()` after a
   * plugin-authored project skill mutation (create/update/delete), because the
   * app-server does not always emit `skills/changed` for files the plugin
   * wrote itself. Normal menu opens leave this false and keep caching.
   */
  private forceReloadNextSkills = false;

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
      if (this.options.codexCliResolution?.mode === 'missing') {
        throw new Error(getCodexCliErrorMessage(this.options.codexCliResolution));
      }
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

      // The app-server is the primary Codex chat transport because it is the
      // only local protocol that publishes authoritative context usage. The
      // SDK remains a compatibility fallback solely when negotiation fails.
      try {
        const appServerClient = this.options.createAppServerClient
          ? this.options.createAppServerClient()
          : new CodexAppServerClient({
            codexPathOverride: this.options.codexPathOverride,
            // Spawn the owned app-server inside the vault so project-scoped
            // skills/agents resolve. Injected factories manage their own cwd.
            ...(this.options.workingDirectory ? { workingDirectory: this.options.workingDirectory } : {}),
          });
        if (appServerClient) {
          this.appServerClient = appServerClient;
          await this.appServerClient.start();
          this.setContextCapabilityAvailable(true);
          // Wire approval handlers if a host was set before start.
          this.registerApprovalHandlers();
          // Subscribe to skills/changed so the chat menu cache can invalidate
          // immediately instead of relying solely on the 120s TTL.
          this.subscribeToAppServerSkillsChanged();
        } else {
          this.setContextCapabilityAvailable(false);
        }
      } catch (err) {
        if (isExecutableMissingError(err)) {
          this.appServerClient?.stop();
          this.appServerClient = null;
          this.setContextCapabilityAvailable(false);
          throw new Error(`Codex executable could not be started: ${err instanceof Error ? err.message : String(err)}. Verify the executable path in Codex settings, then reload OpenCodian.`);
        }
        logger.warn('Codex app-server negotiation failed; preserving SDK chat without context usage', {
          error: err instanceof Error ? err.message : String(err),
        });
        this.appServerClient = null;
        this.setContextCapabilityAvailable(false);
      }

      this.setStatus('connected');
    } catch (err) {
      this.codex = null;
      if (this.appServerClient) {
        try {
          this.unregisterApprovalHandlers();
          this.unsubscribeFromAppServerSkillsChanged();
          this.appServerClient.stop();
        } catch {
          // Best-effort cleanup after a failed startup.
        }
        this.appServerClient = null;
      }
      this.setContextCapabilityAvailable(false);
      this.setStatus('error');
      throw err;
    }
  }

  async stop(): Promise<void> {
    for (const controller of this.activeControllers.values()) {
      controller.abort();
    }
    this.activeControllers.clear();
    this.activeAppServerTurns.clear();
    this.clearPendingForegroundCompactions('unavailable', 'Codex adapter stopped');
    this.appServerContextSnapshots.clear();
    this.sessionEffectiveEvidence.clear();
    this.sessionEffectiveSettings.clear();
    this.sessionAttemptOptions.clear();
    this.sessionEpochs.clear();
    this.lastEvidenceSessionId = null;
    this.codex = null;
    if (this.appServerClient) {
      try {
        this.unregisterApprovalHandlers();
        this.unsubscribeFromAppServerSkillsChanged();
        this.appServerClient.stop();
      } catch {
        // Best-effort cleanup
      }
      this.appServerClient = null;
    }
    this.setContextCapabilityAvailable(false);
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
   * Read-only runtime skill discovery via the app-server `skills/list` route.
   *
   * Returns the skills Codex resolves for the current vault cwd, scoped by
   * `options.workingDirectory`. Each entry carries name/description/path/
   * enabled/scope. This is the sole runtime truth for the Codex chat `/skills`
   * and `$` menu — the plugin never invents candidates or writes global skills.
   *
   * Returns null when the app-server client is unavailable (e.g. negotiation
   * failed and the adapter fell back to SDK-only chat). Returns an empty array
   * when the route is reachable but reports no skills.
   */
  /**
   * Force the next `getRuntimeSkills()` to bypass the app-server cache
   * (`forceReload: true`). Used after a plugin-authored project skill mutation
   * so the next `/skills` or `$` menu open reflects the change even when the
   * app-server did not emit `skills/changed` for the plugin's own file write.
   * One-shot: only the next read is affected; normal menu opens keep caching.
   */
  forceNextRuntimeSkillsReload(): void {
    this.forceReloadNextSkills = true;
  }

  async getRuntimeSkills(): Promise<AppServerSkill[] | null> {
    if (!this.appServerClient) {
      // Still clear the one-shot flag so a later client attach doesn't carry it.
      this.forceReloadNextSkills = false;
      return null;
    }
    const forceReload = this.forceReloadNextSkills;
    this.forceReloadNextSkills = false;
    try {
      return await this.appServerClient.listSkills({
        ...(this.options.workingDirectory ? { cwd: this.options.workingDirectory } : {}),
        ...(forceReload ? { forceReload: true } : {}),
      });
    } catch (err) {
      logger.warn('App-server skills/list failed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * Read the same runtime skill catalog without flattening cwd groups or
   * discarding server discovery errors. Intended for settings readback only;
   * chat callers continue to use `getRuntimeSkills()`.
   */
  async getRuntimeSkillGroups(): Promise<AppServerSkillGroup[] | null> {
    const client = this.appServerClient;
    if (!client) return null;
    try {
      return await client.listSkillGroups({ cwd: this.options.workingDirectory });
    } catch (err) {
      logger.warn('Grouped app-server skills/list failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Read Codex app-server hook metadata without exposing write semantics.
   *
   * The outcome deliberately keeps `empty`, `unavailable`, `failed`, and
   * `malformed` distinct so settings/readback consumers never mistake a
   * missing route or rejected request for a successful empty catalog.
   */
  async getHooksReadback(options?: AppServerListHooksOptions): Promise<AppServerHooksReadbackResult> {
    const client = this.appServerClient;
    if (!client) {
      return { status: 'unavailable', groups: [] };
    }
    try {
      const cwds = options?.cwds ?? (this.options.workingDirectory ? [this.options.workingDirectory] : undefined);
      return await client.listHooks(cwds === undefined ? undefined : { cwds });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to read Codex hooks from app-server', { error: reason });
      return { status: 'failed', groups: [], errorReason: reason };
    }
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

  /**
   * Update the approval policy used for subsequent thread creation/resume.
   *
   * 'inherit' omits the approvalPolicy override; 'untrusted'/'on-request'
   * require the app-server + approval bridge at turn time (fail closed
   * otherwise); 'never' may use the SDK fallback. Does not affect an
   * already-cached thread — only the next thread/turn boundary.
   */
  updateApprovalPolicy(policy: CodexApprovalPolicy): void {
    this.options = {
      ...this.options,
      approvalPolicy: policy,
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

  onCapabilitiesChange(handler: CapabilityChangeHandler): Disposable {
    this.capabilityHandlers.add(handler);
    return { dispose: () => this.capabilityHandlers.delete(handler) };
  }

  /**
   * Register a handler invoked when the Codex app-server signals that its
   * skill catalog changed (`skills/changed`). The handler receives no payload
   * — it is a pure invalidation signal. Returns a Disposable that removes the
   * handler. The chat slash-command menu cache uses this to drop stale entries
   * immediately instead of waiting for the 120s TTL.
   *
   * No-op (returns a disposed Disposable) if there is no app-server client;
   * the subscription is established lazily in `start()` once the client exists.
   */
  onSkillsChanged(handler: () => void): Disposable {
    this.skillsChangedHandlers.add(handler);
    return { dispose: () => this.skillsChangedHandlers.delete(handler) };
  }

  private notifySkillsChanged(): void {
    for (const handler of this.skillsChangedHandlers) {
      try {
        handler();
      } catch (err) {
        logger.warn('skills/changed handler threw', { error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  private subscribeToAppServerSkillsChanged(): void {
    if (!this.appServerClient || this.skillsChangedUnsubscribe) {
      return;
    }
    if (typeof this.appServerClient.subscribeToSkillsChanged !== 'function') {
      return;
    }
    this.skillsChangedUnsubscribe = this.appServerClient.subscribeToSkillsChanged(() => this.notifySkillsChanged());
  }

  private unsubscribeFromAppServerSkillsChanged(): void {
    if (this.skillsChangedUnsubscribe) {
      try {
        this.skillsChangedUnsubscribe();
      } catch (err) {
        logger.warn('Failed to unsubscribe from skills/changed', { error: err instanceof Error ? err.message : String(err) });
      }
      this.skillsChangedUnsubscribe = null;
    }
  }

  // -------------------------------------------------------------------------
  // AgentChatCapability
  // -------------------------------------------------------------------------

  async *sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    if (!this.codex) {
      yield { type: 'error', content: 'Codex adapter not started' };
      return;
    }

    // Approval-policy gating. Explicit untrusted/on-request require an
    // available app-server AND a connected approval-collection bridge; if
    // either is missing the turn fails closed with an actionable error
    // instead of silently falling back to a less restrictive path. 'never'
    // may use the existing fallback; 'inherit' omits the override entirely.
    const policy = this.options.approvalPolicy ?? 'inherit';
    if (policy === 'untrusted' || policy === 'on-request') {
      if (!this.canUseAppServerChat() || typeof this.approvalHost.collectApproval !== 'function') {
        yield {
          type: 'error',
          content: `Codex approval policy "${policy}" requires the Codex app-server and an approval bridge, which are unavailable. Start the Codex backend or switch the approval policy to "inherit" or "never".`,
        };
        return;
      }
    }

    if (this.canUseAppServerChat()) {
      yield* this.sendMessageViaAppServer(request);
      return;
    }

    yield* this.sendMessageViaSdk(request);
  }

  /**
   * Resolve the wire approval policy for app-server thread/turn options.
   * Returns undefined for 'inherit' (omit the field) so the backend uses its
   * own default policy.
   */
  private resolveWireApprovalPolicy(): 'untrusted' | 'on-request' | 'never' | undefined {
    const policy = this.options.approvalPolicy ?? 'inherit';
    return policy === 'inherit' ? undefined : policy;
  }

  private async *sendMessageViaSdk(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
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

  /**
   * Primary app-server chat path. A successful protocol negotiation never
   * silently falls through to SDK chat on a turn error: the same thread owns
   * messages, approvals, cancellation, and authoritative context snapshots.
   */
  // eslint-disable-next-line complexity -- dense async-generator handling streaming + evidence lifecycle + error recovery in one cohesive method.
  private async *sendMessageViaAppServer(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    const client = this.appServerClient;
    if (!client) {
      yield { type: 'error', content: 'Codex app-server is not available' };
      return;
    }

    const outputFormat = request.options?.outputFormat;
    const outputSchema = outputFormat && typeof outputFormat === 'object' && 'schema' in outputFormat
      ? outputFormat.schema
      : undefined;
    let tempDir: string | undefined;
    let subscription: { dispose(): void } | null = null;
    let ownedThreadId: string | null = null;
    let ownedTurnId: string | null = null;
    const attempt = this.beginAppServerAttempt(request.sessionId);
    const sessionId = attempt.sessionId;
    const controller = new AbortController();
    this.activeControllers.get(sessionId)?.abort();
    this.activeControllers.set(sessionId, controller);

    const pending: StreamChunk[] = [];
    const streamedAgentMessageItemIds = new Set<string>();
    const streamedReasoningItemIds = new Set<string>();
    const streamState: AppServerStreamState = {
      streamedAgentMessageItemIds,
      streamedReasoningItemIds,
      startedTodoItemIds: new Set<string>(),
      outputSchema,
    };
    let wake: (() => void) | null = null;
    let completed = false;
    const pendingTurnCompletions: Array<{ id?: string; error?: unknown }> = [];
    const enqueue = (chunk: StreamChunk): void => {
      pending.push(chunk);
      const resolve = wake;
      wake = null;
      resolve?.();
    };
    const completeCurrentTurn = (completedTurn: { id?: string; error?: unknown }): void => {
      const active = this.activeAppServerTurns.get(sessionId);
      if (!active?.turnId || completedTurn.id !== active.turnId) {
        return;
      }
      const error = readAppServerTurnError(completedTurn.error);
      this.applyTurnCompletionEvidence(sessionId, error, (msg: string) => enqueue({ type: 'error', content: msg }));
      completed = true;
      const resolve = wake;
      wake = null;
      resolve?.();
    };
    controller.signal.addEventListener('abort', () => {
      const resolve = wake;
      wake = null;
      resolve?.();
    }, { once: true });

    try {
      const thread = await this.resolveOrStartAppServerThread(attempt);
      if (!thread) {
        if (this.isCurrentAppServerAttempt(attempt)) {
          yield { type: 'error', content: `Failed to resolve Codex session: ${request.sessionId}` };
        }
        return;
      }
      if (!this.isCurrentAppServerAttempt(attempt)) return;
      this.aliasSession(sessionId, thread.id);
      ownedThreadId = thread.id;

      subscription = client.subscribeToThreadNotifications(thread.id, (event) => {
        if (!this.isCurrentAppServerAttempt(attempt)) return;
        const params = event.params as { turn?: { id?: string; error?: unknown } } | null;
        const completedTurn = params?.turn;
        if (event.method === 'turn/completed') {
          const active = this.activeAppServerTurns.get(sessionId);
          if (!active?.turnId) {
            // The app-server can deliver notifications before turn/start
            // returns. Retain completions until the current turn ID is known,
            // then accept only that exact turn; a prior turn on this thread
            // must not finish or fail the new stream.
            pendingTurnCompletions.push(completedTurn ?? {});
            return;
          }
          if (completedTurn?.id !== active.turnId) {
            return;
          }
        }
        const mapping = mapAppServerNotification({
          event,
          modelId: attempt.options.model ?? null,
          sessionId,
          streamState,
          threadId: thread.id,
        });
        if (mapping.contextUsageSnapshot) {
          this.appServerContextSnapshots.set(thread.id, mapping.contextUsageSnapshot);
        }
        for (const chunk of mapping.chunks) {
          enqueue(chunk);
        }
        if (event.method === 'turn/completed') {
          completeCurrentTurn(completedTurn ?? {});
        }
      });

      const input = this.buildAppServerInput(request.content, request.images);
      tempDir = input.tempDir;
      const turnOptions: AppServerTurnStartOptions = {
        threadId: thread.id,
        input: input.payload,
        ...this.buildAppServerTurnOptions(attempt.options, outputSchema),
      };
      const turn = await client.startTurn(turnOptions);
      if (!this.isCurrentAppServerAttempt(attempt)) {
        if (turn?.id) {
          await client.interruptTurn(thread.id, turn.id);
        }
        return;
      }
      if (!turn?.id) {
        this.sessionEffectiveEvidence.set(sessionId, buildUniformEffectiveEvidence('failed', this.attemptWiringForSession(sessionId), 'turn did not start'));
        this.sessionEffectiveSettings.set(sessionId, null);
        yield { type: 'error', content: 'Codex app-server did not start a turn' };
        return;
      }
      this.activeAppServerTurns.set(sessionId, { threadId: thread.id, turnId: turn.id });
      ownedTurnId = turn.id;
      for (const pendingTurnCompletion of pendingTurnCompletions) {
        completeCurrentTurn(pendingTurnCompletion);
      }
      if (controller.signal.aborted) {
        await client.interruptTurn(thread.id, turn.id);
      }

      yield { type: 'message_start' };
      if (!this.isCurrentAppServerAttempt(attempt) || controller.signal.aborted) return;
      yield {
        type: 'message_metadata',
        messageId: `${thread.id}::${crypto.randomUUID()}`,
        timestamp: Date.now(),
        sessionId: thread.id,
        ...(attempt.options.model ? { modelId: attempt.options.model } : {}),
      };
      while (!completed && !controller.signal.aborted) {
        if (pending.length === 0) {
          await new Promise<void>((resolve) => { wake = resolve; });
        }
        while (pending.length > 0) {
          if (!this.isCurrentAppServerAttempt(attempt) || controller.signal.aborted) return;
          yield pending.shift()!;
        }
      }
      while (pending.length > 0) {
        if (!this.isCurrentAppServerAttempt(attempt) || controller.signal.aborted) return;
        yield pending.shift()!;
      }
      if (this.isCurrentAppServerAttempt(attempt) && !controller.signal.aborted) {
        yield { type: 'message_stop' };
      }
    } catch (err) {
      if (this.isCurrentAppServerAttempt(attempt)) {
        this.sessionEffectiveEvidence.set(sessionId, buildUniformEffectiveEvidence('failed', this.attemptWiringForSession(sessionId), err instanceof Error ? err.message : 'turn/stream failed'));
        this.sessionEffectiveSettings.set(sessionId, null);
        yield { type: 'error', content: err instanceof Error ? err.message : String(err) };
      }
    } finally {
      subscription?.dispose();
      if (this.activeControllers.get(sessionId) === controller) {
        this.activeControllers.delete(sessionId);
      }
      const activeTurn = this.activeAppServerTurns.get(sessionId);
      if (activeTurn?.threadId === ownedThreadId && activeTurn.turnId === ownedTurnId) {
        this.activeAppServerTurns.delete(sessionId);
      }
      if (tempDir) {
        this.safeRemoveTempDir(tempDir);
      }
    }
  }

  private canUseAppServerChat(): boolean {
    return Boolean(
      this.appServerClient
      && this.capabilitySet.has(AgentCapability.Context)
      && typeof this.appServerClient.startThread === 'function'
      && typeof this.appServerClient.startTurn === 'function',
    );
  }

  private async resolveOrStartAppServerThread(attempt: AppServerAttempt): Promise<AppServerThread | null> {
    const client = this.appServerClient;
    if (!client) {
      return null;
    }
    const { sessionId } = attempt;
    const entry = this.resolveSession(sessionId);
    const knownThreadId = entry?.threadId
      ?? (!this.isProvisionalId(sessionId) ? sessionId : null);
    const options = this.buildAppServerThreadOptions(attempt.options);
    let thread: AppServerThread | null;
    try {
      thread = knownThreadId
        ? await client.resumeThread(knownThreadId, options)
        : await client.startThread(options);
    } catch (err) {
      // A thrown rejection (e.g. transport failure before the client's inner
      // catch) must flip pending → failed; it must never stay pending.
      if (this.isCurrentAppServerAttempt(attempt)) {
        this.sessionEffectiveEvidence.set(sessionId, buildUniformEffectiveEvidence('failed', this.attemptWiringForSession(sessionId), err instanceof Error ? err.message : 'thread start/resume threw'));
        this.sessionEffectiveSettings.set(sessionId, null);
      }
      throw err;
    }
    // Check epoch: if stop/deleteSession invalidated this attempt, abort silently.
    if (!this.isCurrentAppServerAttempt(attempt)) return null;
    if (!thread?.id) {
      // Request failed (start/resume returned null after an internal error).
      this.sessionEffectiveEvidence.set(sessionId, buildUniformEffectiveEvidence('failed', this.attemptWiringForSession(sessionId), 'thread start/resume request failed'));
      return null;
    }
    // Success: rebuild per-field evidence from THIS response only, with
    // independent application (request wiring) and runtime (response echo)
    // axes. A field the server did not echo becomes runtime `unavailable`; a
    // field the plugin did not wire (e.g. approval under `inherit`) is
    // application `not-applicable`. Stale state from a prior response is never
    // inherited.
    const captured = client.getThreadEffectiveSettings(thread.id);
    this.sessionEffectiveSettings.set(sessionId, captured);
    this.sessionEffectiveEvidence.set(sessionId, buildEffectiveEvidenceWithApplication(threadPhaseApplication(this.attemptWiringForSession(sessionId)), 'verified', captured));
    const provisionalId = entry?.provisionalId ?? sessionId;
    const existing = this.sessions.get(provisionalId);
    if (existing) {
      existing.threadId = thread.id;
      existing.thread = null;
    } else {
      this.sessions.set(provisionalId, { provisionalId, threadId: thread.id, thread: null });
    }
    return thread;
  }

  private buildAppServerThreadOptions(opts: AttemptOptions): AppServerThreadStartOptions {
    const config: Record<string, unknown> = {};
    if (opts.webSearchMode) {
      config.web_search = opts.webSearchMode;
    }
    const wireApprovalPolicy = opts.approvalPolicy !== undefined && opts.approvalPolicy !== 'inherit' ? opts.approvalPolicy : undefined;
    return {
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.workingDirectory ? { cwd: opts.workingDirectory } : {}),
      ...(opts.sandboxMode ? { sandbox: opts.sandboxMode } : {}),
      ...(wireApprovalPolicy ? { approvalPolicy: wireApprovalPolicy } : {}),
      ...(Object.keys(config).length > 0 ? { config } : {}),
    };
  }

  private buildAppServerTurnOptions(opts: AttemptOptions, outputSchema: unknown): Omit<AppServerTurnStartOptions, 'threadId' | 'input'> {
    const writableRoots = [opts.workingDirectory, ...(opts.additionalDirectories ?? [])]
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .filter((p, index, paths) => paths.indexOf(p) === index);
    const networkAccess = opts.networkAccessEnabled === true;
    const sandboxPolicy = opts.sandboxMode === 'danger-full-access'
      ? { type: 'dangerFullAccess' as const }
      : opts.sandboxMode === 'read-only'
        ? { type: 'readOnly' as const, networkAccess }
        : {
          type: 'workspaceWrite' as const,
          writableRoots,
          networkAccess,
          excludeTmpdirEnvVar: false,
          excludeSlashTmp: false,
        };
    const wireApprovalPolicy = opts.approvalPolicy !== undefined && opts.approvalPolicy !== 'inherit' ? opts.approvalPolicy : undefined;
    return {
      ...(opts.workingDirectory ? { cwd: opts.workingDirectory } : {}),
      ...(wireApprovalPolicy ? { approvalPolicy: wireApprovalPolicy } : {}),
      sandboxPolicy,
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.modelReasoningEffort ? { effort: opts.modelReasoningEffort } : {}),
      ...(outputSchema !== undefined ? { outputSchema } : {}),
    };
  }

  private buildAppServerInput(
    content: string,
    images: ImageAttachment[] | undefined,
  ): {
    payload: AppServerTurnStartOptions['input'];
    tempDir?: string;
  } {
    if (!images || images.length === 0) {
      return { payload: [{ type: 'text', text: content, text_elements: [] }] };
    }
    const tempDir = mkdtempSync(join(tmpdir(), 'opencodian-codex-image-'));
    const payload: AppServerTurnStartOptions['input'] = [{ type: 'text', text: content, text_elements: [] }];
    for (const image of images) {
      const ext = this.mediaTypeToExtension(image.mediaType);
      const fileName = image.filename ?? `image-${Date.now()}.${ext}`;
      const filePath = join(tempDir, fileName);
      writeFileSync(filePath, Buffer.from(image.data, 'base64'));
      payload.push({ type: 'localImage', path: filePath });
    }
    return { payload, tempDir };
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
    const logicalKey = this.logicalSessionKey(sessionId);
    const activeTurn = this.activeAppServerTurns.get(logicalKey);
    if (activeTurn?.turnId && this.appServerClient) {
      void this.appServerClient.interruptTurn(activeTurn.threadId, activeTurn.turnId);
    }
    const controller = this.activeControllers.get(logicalKey);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(logicalKey);
    }
  }

  /** Return the most recent app-server-authoritative context snapshot. */
  async getContextUsageSnapshot(sessionId: string): Promise<ContextUsageSnapshot | null> {
    const entry = this.resolveSession(sessionId);
    const threadId = entry?.threadId ?? (!this.isProvisionalId(sessionId) ? sessionId : null);
    return threadId ? this.appServerContextSnapshots.get(threadId) ?? null : null;
  }

  /**
   * Read the same local gates enforced by `compactForegroundThread` without
   * creating a subscription, starting an RPC, or changing any runtime state.
   */
  getForegroundCompactionAvailability(sessionId: string): CodexForegroundCompactionAvailability {
    const gate = this.resolveForegroundCompactionGate(sessionId);
    return {
      status: gate.status,
      ...(gate.threadId ? { threadId: gate.threadId } : {}),
    };
  }

  /**
   * Request foreground context compaction on an app-server-owned current
   * thread. The empty RPC ACK is deliberately exposed only through
   * `onAccepted`; this promise resolves `verified` only after both independent
   * runtime notifications have arrived, in either order.
   */
  async compactForegroundThread(
    sessionId: string,
    options: CodexForegroundCompactionOptions = {},
  ): Promise<CodexForegroundCompactionResult> {
    const gate = this.resolveForegroundCompactionGate(sessionId);
    if (gate.status === 'unavailable') {
      return this.foregroundCompactionResult('unavailable', { errorReason: 'Codex app-server is unavailable' });
    }
    if (gate.status === 'invalid-thread') {
      return this.foregroundCompactionResult('invalid-thread', { errorReason: 'No app-server-owned thread is available for this session' });
    }
    if (gate.status === 'busy') {
      return this.foregroundCompactionResult('busy', { threadId: gate.threadId, errorReason: 'A foreground app-server turn or compaction is still active' });
    }
    const { client, logicalSessionId, threadId } = gate;
    // The `available` gate populates these fields atomically from the current
    // adapter mapping. Keep this defensive fallback so a future gate change
    // cannot turn a UI preflight race into an arbitrary RPC target.
    if (!client || !logicalSessionId || !threadId) {
      return this.foregroundCompactionResult('invalid-thread', { errorReason: 'Foreground compaction session changed before dispatch' });
    }

    const epoch = ++this.nextForegroundCompactionEpoch;
    this.foregroundCompactionEpochs.set(logicalSessionId, epoch);
    return new Promise<CodexForegroundCompactionResult>((resolve) => {
      const pending: PendingForegroundCompaction = {
        sessionId: logicalSessionId,
        threadId,
        epoch,
        acknowledged: false,
        requestDispatched: false,
        started: false,
        completed: false,
        tokenUsageObserved: false,
        itemId: null,
        timer: null,
        subscription: null,
        resolve,
      };
      this.pendingForegroundCompactions.set(logicalSessionId, pending);
      pending.subscription = client.subscribeToThreadNotifications(threadId, (event) => {
        this.observeForegroundCompactionNotification(pending, event);
      });
      pending.timer = setTimeout(() => {
        this.finishForegroundCompaction(pending, 'timed-out', 'Timed out waiting for Codex compaction runtime evidence');
      }, options.timeoutMs ?? 120_000);

      // This assignment is intentionally immediately before the RPC call:
      // pre-request notifications and the cached snapshot cannot be reused.
      pending.requestDispatched = true;
      void client.startThreadCompaction(threadId, {
        ...(options.acknowledgementTimeoutMs === undefined
          ? {}
          : { acknowledgementTimeoutMs: options.acknowledgementTimeoutMs }),
      }).then((ack) => {
        if (!this.isCurrentForegroundCompaction(pending)) return;
        if (!ack.acknowledged || ack.status !== 'accepted') {
          this.finishForegroundCompaction(pending, this.compactionAckFailureStatus(ack), ack.errorReason);
          return;
        }
        pending.acknowledged = true;
        try {
          options.onAccepted?.();
        } catch (err) {
          logger.warn('Codex compaction accepted callback failed', { error: err instanceof Error ? err.message : String(err) });
        }
        this.maybeVerifyForegroundCompaction(pending);
      }, (err) => {
        if (this.isCurrentForegroundCompaction(pending)) {
          this.finishForegroundCompaction(pending, 'failed', err instanceof Error ? err.message : String(err));
        }
      });
    });
  }

  /** Shared, synchronous, no-RPC gate for availability readback and dispatch. */
  private resolveForegroundCompactionGate(sessionId: string): ForegroundCompactionGate {
    const client = this.appServerClient;
    if (!client) return { status: 'unavailable' };
    const logicalSessionId = this.logicalSessionKey(sessionId);
    const entry = this.resolveSession(logicalSessionId);
    const threadId = entry?.threadId;
    // A provisional, arbitrary, or SDK-only session must never become an RPC
    // target merely because it looks like a thread ID.
    if (!entry || !threadId || this.threadAlias.get(threadId) !== logicalSessionId) {
      return { status: 'invalid-thread' };
    }
    if (this.activeAppServerTurns.has(logicalSessionId) || this.pendingForegroundCompactions.has(logicalSessionId)) {
      return { status: 'busy', threadId };
    }
    return { status: 'available', threadId, logicalSessionId, client };
  }

  private observeForegroundCompactionNotification(pending: PendingForegroundCompaction, event: import('./CodexAppServerClient').AppServerThreadNotification): void {
    if (!pending.requestDispatched || !this.isCurrentForegroundCompaction(pending)) return;
    const params = isRecordLike(event.params) ? event.params : null;
    if (!params) return;
    if (event.method === 'thread/tokenUsage/updated') {
      const mapping = mapAppServerNotification({
        event,
        modelId: this.options.model ?? null,
        sessionId: pending.sessionId,
        threadId: pending.threadId,
        streamState: { streamedAgentMessageItemIds: new Set(), streamedReasoningItemIds: new Set(), startedTodoItemIds: new Set(), outputSchema: undefined },
      });
      if (mapping.contextUsageSnapshot) {
        this.appServerContextSnapshots.set(pending.threadId, mapping.contextUsageSnapshot);
        pending.tokenUsageObserved = true;
        this.maybeVerifyForegroundCompaction(pending);
      }
      return;
    }
    if (event.method === 'item/started' || event.method === 'item/completed') {
      this.observeForegroundCompactionItem(pending, event.method, params);
    }
  }

  private observeForegroundCompactionItem(
    pending: PendingForegroundCompaction,
    method: 'item/started' | 'item/completed',
    params: Record<string, unknown>,
  ): void {
    const item = isRecordLike(params.item) ? params.item : null;
    const itemId = item && typeof item.id === 'string' && item.id.trim() ? item.id : null;
    if (!item || item.type !== 'contextCompaction' || !itemId) return;
    if (method === 'item/started') {
      if (pending.itemId && pending.itemId !== itemId) return;
      pending.itemId = itemId;
      pending.started = true;
      return;
    }
    // The compact-start ACK has no operation identifier. A completion is
    // therefore evidence only after this request observed a nonempty matching
    // contextCompaction start; completion-only/replayed events cannot bind to
    // the request and must remain unverified.
    if (!pending.started || pending.itemId !== itemId) return;
    pending.completed = true;
    this.maybeVerifyForegroundCompaction(pending);
  }

  private maybeVerifyForegroundCompaction(pending: PendingForegroundCompaction): void {
    if (pending.acknowledged && pending.started && pending.itemId && pending.completed && pending.tokenUsageObserved) {
      this.finishForegroundCompaction(pending, 'verified');
    }
  }

  private isCurrentForegroundCompaction(pending: PendingForegroundCompaction): boolean {
    return this.pendingForegroundCompactions.get(pending.sessionId) === pending
      && this.foregroundCompactionEpochs.get(pending.sessionId) === pending.epoch
      && this.resolveSession(pending.sessionId)?.threadId === pending.threadId;
  }

  private compactionAckFailureStatus(ack: AppServerThreadCompactionAckResult): Exclude<CodexForegroundCompactionResult['status'], 'verified' | 'busy'> {
    return ack.status === 'accepted' ? 'failed' : ack.status;
  }

  private foregroundCompactionResult(
    status: CodexForegroundCompactionResult['status'],
    details: Partial<Omit<CodexForegroundCompactionResult, 'status' | 'runtimeVerified'>> = {},
  ): CodexForegroundCompactionResult {
    return {
      status,
      acknowledged: details.acknowledged ?? false,
      runtimeVerified: status === 'verified',
      started: details.started ?? false,
      completed: details.completed ?? false,
      tokenUsageObserved: details.tokenUsageObserved ?? false,
      ...(details.threadId ? { threadId: details.threadId } : {}),
      ...(details.errorReason ? { errorReason: details.errorReason } : {}),
    };
  }

  private finishForegroundCompaction(
    pending: PendingForegroundCompaction,
    status: CodexForegroundCompactionResult['status'],
    errorReason?: string,
  ): void {
    if (this.pendingForegroundCompactions.get(pending.sessionId) !== pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    pending.subscription?.dispose();
    this.pendingForegroundCompactions.delete(pending.sessionId);
    this.foregroundCompactionEpochs.delete(pending.sessionId);
    pending.resolve(this.foregroundCompactionResult(status, {
      acknowledged: pending.acknowledged,
      started: pending.started,
      completed: pending.completed,
      tokenUsageObserved: pending.tokenUsageObserved,
      threadId: pending.threadId,
      ...(errorReason ? { errorReason } : {}),
    }));
  }

  private clearPendingForegroundCompactions(
    status: Exclude<CodexForegroundCompactionResult['status'], 'verified' | 'busy'>,
    errorReason: string,
    sessionId?: string,
  ): void {
    for (const pending of [...this.pendingForegroundCompactions.values()]) {
      if (sessionId === undefined || pending.sessionId === sessionId) {
        this.finishForegroundCompaction(pending, status, errorReason);
      }
    }
  }

  /**
   * Return the server-confirmed effective settings for a session's thread, or
   * null when no verified runtime readback is available (app-server
   * unavailable, or an older server that did not echo effective fields).
   * Request-side turn options are never reported here — only fields the
   * server actually confirmed in its `thread/start` / `thread/resume` response.
   */
  getThreadEffectiveSettings(sessionId: string): AppServerThreadEffectiveSettings | null {
    if (!this.appServerClient) {
      return null;
    }
    const entry = this.resolveSession(sessionId);
    const threadId = entry?.threadId ?? (!this.isProvisionalId(sessionId) ? sessionId : null);
    if (!threadId) {
      return null;
    }
    return this.appServerClient.getThreadEffectiveSettings(threadId);
  }

  /**
   * Return honest per-field runtime evidence for a session's thread, tracking
   * the request lifecycle (pending → verified/unavailable/failed). Reuses the
   * shared three-axis ConfigurationEvidence; for this readback surface
   * persistence is `not-applicable`. Never claims a request echo is runtime
   * proof. Sessions are isolated (per-sessionId map, no global singleton).
   */
  getThreadEffectiveEvidence(sessionId: string): AppServerThreadEffectiveEvidence {
    const logicalKey = this.logicalSessionKey(sessionId);
    return this.sessionEffectiveEvidence.get(logicalKey)
      ?? buildUniformEffectiveEvidence('unavailable', this.attemptWiringForSession(logicalKey), 'no app-server readback attempted for this session');
  }

  /**
   * Return the evidence + server-confirmed values for the most recently
   * started/resumed Codex session, or null when no session has attempted a
   * readback. Used by the Capability Lab production consumer.
   */
  getLatestThreadEffectiveEvidence(): { sessionId: string; evidence: AppServerThreadEffectiveEvidence; settings: AppServerThreadEffectiveSettings | null } | null {
    if (!this.lastEvidenceSessionId) {
      return null;
    }
    const sessionId = this.lastEvidenceSessionId;
    return {
      sessionId,
      evidence: this.getThreadEffectiveEvidence(sessionId),
      settings: this.sessionEffectiveSettings.get(sessionId) ?? null,
    };
  }

  /**
   * Compute which effective fields the plugin actually wires into the app-server
   * request/turn. Used for the `application` evidence axis — a field the plugin
   * does not send (e.g. approval under `inherit`, or server-only fields like
   * modelProvider) is `not-applicable`, never inferred from a runtime echo.
   */
  /**
   * Capture an immutable snapshot of the current option values that form one
   * app-server attempt. Called BEFORE any await so mid-flight mutations to
   * this.options do not leak into the attempt's thread/turn options or evidence.
   */
  private captureAttemptOptions(): AttemptOptions {
    return {
      ...(this.options.model !== undefined ? { model: this.options.model } : {}),
      ...(this.options.workingDirectory !== undefined ? { workingDirectory: this.options.workingDirectory } : {}),
      ...(this.options.sandboxMode !== undefined ? { sandboxMode: this.options.sandboxMode } : {}),
      ...(this.options.additionalDirectories ? { additionalDirectories: [...this.options.additionalDirectories] } : {}),
      ...(this.options.networkAccessEnabled !== undefined ? { networkAccessEnabled: this.options.networkAccessEnabled } : {}),
      ...(this.options.webSearchMode !== undefined ? { webSearchMode: this.options.webSearchMode } : {}),
      ...(this.options.approvalPolicy !== undefined ? { approvalPolicy: this.options.approvalPolicy } : {}),
      ...(this.options.modelReasoningEffort !== undefined ? { modelReasoningEffort: this.options.modelReasoningEffort } : {}),
    };
  }

  /** Resolve every provisional/thread alias to the one logical state-map key. */
  private logicalSessionKey(sessionId: string): string {
    return this.resolveSession(sessionId)?.provisionalId ?? sessionId;
  }

  /** Begin one immutable app-server attempt before its first await. */
  private beginAppServerAttempt(sessionId: string): AppServerAttempt {
    const logicalSessionId = this.logicalSessionKey(sessionId);
    const options = this.captureAttemptOptions();
    const epoch = ++this.nextAttemptEpoch;
    this.sessionEpochs.set(logicalSessionId, epoch);
    this.sessionAttemptOptions.set(logicalSessionId, options);
    this.sessionEffectiveEvidence.set(
      logicalSessionId,
      buildUniformEffectiveEvidence('pending', this.attemptWiringForSession(logicalSessionId), 'thread start/resume in flight'),
    );
    this.sessionEffectiveSettings.set(logicalSessionId, null);
    this.lastEvidenceSessionId = logicalSessionId;
    return { sessionId: logicalSessionId, epoch, options };
  }

  private isCurrentAppServerAttempt(attempt: AppServerAttempt): boolean {
    return this.sessionEpochs.get(attempt.sessionId) === attempt.epoch;
  }

  private invalidateAppServerAttempt(sessionId: string): void {
    this.sessionEpochs.delete(this.logicalSessionKey(sessionId));
  }

  /**
   * Compute wiring from the per-session attempt snapshot. If no snapshot exists
   * (no attempt has been made), returns all-false (honest: can't prove what
   * was sent). Never re-reads mutable this.options for an in-flight attempt.
   */
  private attemptWiringForSession(sessionId: string): EffectiveFieldWiring {
    const snap = this.sessionAttemptOptions.get(sessionId);
    if (!snap) {
      // No snapshot: cannot prove what was wired. For fields the plugin COULD
      // wire (model/cwd/sandbox/approval/effort), report the lifecycle status
      // honestly (unavailable — "can't tell"). Server-only fields that the
      // plugin NEVER wires stay not-applicable.
      return { model: true, modelProvider: false, cwd: true, sandbox: true, approvalPolicy: true, activePermissionProfile: false, reasoningEffort: true };
    }
    // Snapshot exists: use the frozen values from attempt start (immutable).
    return {
      model: !!snap.model,
      modelProvider: false,
      cwd: !!snap.workingDirectory,
      sandbox: true,
      approvalPolicy: snap.approvalPolicy !== undefined && snap.approvalPolicy !== 'inherit',
      activePermissionProfile: false,
      reasoningEffort: !!snap.modelReasoningEffort,
    };
  }

  private applyTurnCompletionEvidence(sessionId: string, error: string | null, enqueue: (msg: string) => void): void {
    const wiring = this.attemptWiringForSession(sessionId);
    if (error) {
      enqueue(error);
      this.sessionEffectiveEvidence.set(sessionId, buildUniformEffectiveEvidence('failed', wiring, error));
      this.sessionEffectiveSettings.set(sessionId, null);
    } else {
      const captured = this.sessionEffectiveSettings.get(sessionId) ?? null;
      this.sessionEffectiveEvidence.set(sessionId, buildEffectiveEvidenceWithApplication(turnSuccessApplication(wiring), 'verified', captured));
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
    const entry = this.resolveSession(sessionId);
    // The logical session key is the provisionalId; resolveSession finds the
    // entry whether sessionId is a provisional id or a real thread id/alias.
    const logicalKey = entry?.provisionalId ?? sessionId;
    const threadId = entry?.threadId ?? (!this.isProvisionalId(sessionId) ? sessionId : null);
    this.invalidateAppServerAttempt(logicalKey);
    this.clearPendingForegroundCompactions('invalid-thread', 'Codex session was deleted', logicalKey);
    const controller = this.activeControllers.get(logicalKey);
    controller?.abort();
    this.activeControllers.delete(logicalKey);
    const activeTurn = this.activeAppServerTurns.get(logicalKey);
    if (activeTurn?.turnId && this.appServerClient) {
      try {
        await this.appServerClient.interruptTurn(activeTurn.threadId, activeTurn.turnId);
      } catch {
        // Best-effort cancellation; the attempt fence still blocks late state.
      }
    }
    this.activeAppServerTurns.delete(logicalKey);
    if (entry?.threadId) {
      this.threadAlias.delete(entry.threadId);
    }
    this.sessions.delete(logicalKey);
    this.sessionEffectiveEvidence.delete(logicalKey);
    this.sessionEffectiveSettings.delete(logicalKey);
    this.sessionAttemptOptions.delete(logicalKey);
    // Also clean by the passed key in case it differs from the logical key.
    if (sessionId !== logicalKey) {
      this.sessions.delete(sessionId);
      this.sessionEffectiveEvidence.delete(sessionId);
      this.sessionEffectiveSettings.delete(sessionId);
    }
    // Evict client readback cache + context snapshot by thread id (full chain).
    if (threadId) {
      this.appServerClient?.clearThreadEffectiveSettings?.(threadId);
      this.appServerContextSnapshots.delete(threadId);
    }
    if (this.lastEvidenceSessionId === logicalKey || this.lastEvidenceSessionId === sessionId) {
      this.lastEvidenceSessionId = null;
    }
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

  private setContextCapabilityAvailable(available: boolean): void {
    const changed = available
      ? !this.capabilitySet.has(AgentCapability.Context)
      : this.capabilitySet.delete(AgentCapability.Context);
    if (available) {
      this.capabilitySet.add(AgentCapability.Context);
    }
    if (!changed) {
      return;
    }
    for (const handler of this.capabilityHandlers) {
      try {
        handler(new Set(this.capabilitySet));
      } catch {
        // Capability changes must not be blocked by a UI subscriber.
      }
    }
  }
}

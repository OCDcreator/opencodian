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
  AppServerForkResult,
  AppServerListSkillsOptions,
  AppServerMcpResourceContent,
  AppServerMcpResourceReadResult,
  AppServerMcpServerStatus,
  AppServerMcpToolCallContent,
  AppServerMcpToolCallResult,
  AppServerModel,
  AppServerModelProviderCapabilities,
  AppServerNotificationSubscription,
  AppServerPermissionProfile,
  AppServerRateLimits,
  AppServerReviewResult,
  AppServerReviewTarget,
  AppServerSkill,
  AppServerThread,
  AppServerThreadGoal,
  AppServerThreadNotification,
  AppServerThreadResumeOptions,
  AppServerThreadStartOptions,
  AppServerTurn,
  AppServerTurnStartOptions,
  McpOauthLoginResult,
} from './CodexAppServerClientTypes';
import { CodexAppServerTransport } from './CodexAppServerTransport';

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

export class CodexAppServerClient extends CodexAppServerTransport {
  // ---------------------------------------------------------------------------
  // App-server API wrappers
  // ---------------------------------------------------------------------------

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
      return result?.thread ?? null;
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
      return result?.thread ?? null;
    } catch (err) {
      logger.warn('Failed to resume thread via app-server', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
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

  async getAccountUsage(): Promise<AppServerAccountUsageResult> {
    await this.start();
    try {
      const result = (await this.request('account/usage/read')) as AppServerAccountUsage | undefined;
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
   * This is read-only: the plugin never writes global Codex skills. The
   * returned entries only describe runtime-discovered skills for the chat
   * menu and resource settings.
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

  async setThreadGoal(threadId: string, objective: string, options?: { tokenBudget?: number }): Promise<AppServerThreadGoal | null> {
    await this.start();
    try {
      const params: Record<string, unknown> = { threadId, objective };
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

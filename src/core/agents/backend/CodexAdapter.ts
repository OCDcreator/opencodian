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
  AgentService,
  AgentSessionCapability,
  Disposable,
  StatusChangeHandler,
} from './AgentService';
import { type AppServerAccountUsage, type AppServerPermissionProfile, type AppServerRateLimits, CodexAppServerClient } from './CodexAppServerClient';
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

/** Internal session tracking entry. */
interface CodexSessionEntry {
  provisionalId: string;
  threadId: string | null;
  thread: Thread | null;
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
    AgentSessionCapability
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
        this.appServerClient.stop();
      } catch {
        // Best-effort cleanup
      }
      this.appServerClient = null;
    }
    this.setStatus('disconnected');
  }

  /**
   * Read-only account info readback via `codex doctor --json`.
   *
   * Extracts the `auth.credentials` section from the CLI diagnostic.
   * This is a CLI diagnostic surface, not an SDK API — the Codex SDK
   * does not expose account info directly.
   *
   * Returns null if the CLI is unavailable or the command fails.
   */
  async getAccountInfo(): Promise<unknown | null> {
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
   * Read-only model list readback via `codex debug models`.
   *
   * Returns a filtered summary of models from the CLI's debug catalog.
   * Only models with `visibility !== 'hide'` and `supported_in_api === true`
   * are included. Each entry contains `slug`, `display_name`, `visibility`,
   * `supported_in_api`, `default_reasoning_level`, and `description`.
   *
   * This is a CLI diagnostic surface, not an SDK API.
   * Returns null if the CLI is unavailable or the command fails.
   */
  async getModelList(): Promise<CodexModelSummary[] | null> {
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
   * Returns null if the app-server client is unavailable or the request fails.
   */
  async getAccountRateLimits(): Promise<AppServerRateLimits | null> {
    if (!this.appServerClient) {
      return null;
    }
    try {
      const rateLimits = await this.appServerClient.getAccountRateLimits();
      return rateLimits;
    } catch (err) {
      logger.warn('Failed to read account rate limits from app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
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
   * Returns null if the app-server client is unavailable or the request fails.
   */
  async getAccountUsage(): Promise<AppServerAccountUsage | null> {
    if (!this.appServerClient) {
      return null;
    }
    try {
      const usage = await this.appServerClient.getAccountUsage();
      return usage;
    } catch (err) {
      logger.warn('Failed to read account usage from app-server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  dispose(): void {
    this.stop();
    this.sessions.clear();
    this.threadAlias.clear();
    this.statusHandlers.clear();
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
        const threads = await this.appServerClient.listThreads(50);
        const normalized = CodexAppServerClient.normalizeThreadList(threads);
        // Merge: app-server threads take precedence for those that exist in both
        const existingIds = new Set(result.map(r => String(r.id)));
        for (const thread of normalized) {
          if (!existingIds.has(thread.id)) {
            result.push({
              id: thread.id,
              title: thread.title,
              updatedAt: thread.updatedAt,
              provisionalId: null,
              threadId: thread.id,
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
      // Convert to a shape that AgentBackendRouting.getBackendSessionPreview understands:
      // { role, content: string } where content is the concatenated text parts.
      return previewMessages.map((msg) => ({
        role: msg.role,
        content: msg.parts.map((p) => p.text).join('\n'),
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

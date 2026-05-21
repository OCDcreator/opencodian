/* eslint-disable max-lines -- Claude Code adapter owns SDK query lifecycle, session identity, permissions, MCP refresh, and model catalog wiring for the same backend boundary. */
import type { ElicitationRequest, ElicitationResult, Query } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'child_process';

import type { AgentBackendKind, StreamChunk } from '../../types/chat';
import type { ClaudeCodeBackendSettings } from '../../types/settings';
import { AgentCapability, type BackendCapabilities } from '../AgentCapability';
import type {
  AgentChatCapability,
  AgentChatSendRequest,
  AgentConnectionStatus,
  AgentService,
  AgentServiceInfo,
  AgentSessionCapability,
  Disposable,
  StatusChangeHandler,
} from './AgentService';
import type { ClaudeCodeMcpServersMap } from './ClaudeCodeMcpConfigAdapter';
import {
  buildClaudeCodeOptions,
  type ClaudeCodeSdkOptionsShape,
  type ClaudeCodeSpawnRequest,
} from './ClaudeCodeOptionsBuilder';
import { ClaudeCodePermissionBridge } from './ClaudeCodePermissionBridge';
import {
  ClaudeCodeAsyncQueue,
  type ClaudeCodeQueuedPrompt,
  type ClaudeCodeRuntimeOutput,
  type ClaudeCodeSessionRuntime,
  createSessionId,
  createUserPrompt,
  isTurnBoundaryMessage,
} from './ClaudeCodeQueue';
import { ClaudeCodeStreamNormalizer } from './ClaudeCodeStreamNormalizer';

export interface ClaudeCodeSdkQueryInput {
  prompt: string | AsyncIterable<unknown>;
  options: ClaudeCodeSdkOptionsShape;
}

type ClaudeCodeQueryHandle = Query & {
  supportedModels(): Promise<ClaudeCodeSdkModelInfo[]>;
};

type ClaudeCodeModelCatalogQuery = {
  supportedModels(): Promise<ClaudeCodeSdkModelInfo[]>;
  close?: () => void;
};

export interface ClaudeCodeSdkFacade {
  query(input: ClaudeCodeSdkQueryInput): ClaudeCodeQueryHandle;
  listSessions?(options?: { dir?: string; limit?: number; offset?: number }): Promise<ClaudeCodeSdkSessionInfo[]>;
  getSessionInfo?(sessionId: string, options?: { dir?: string }): Promise<ClaudeCodeSdkSessionInfo | undefined>;
  forkSession?(sessionId: string, options?: { dir?: string; upToMessageId?: string; title?: string }): Promise<{ sessionId: string }>;
  renameSession?(sessionId: string, title: string, options?: { dir?: string }): Promise<void>;
}

export type ClaudeCodeSdkModelInfo = {
  id?: string;
  name?: string;
  provider?: string;
  value?: string;
  displayName?: string;
};

export interface ClaudeCodeSdkSessionInfo {
  sessionId: string;
  summary: string;
  lastModified: number;
  createdAt?: number;
}

export type ClaudeCodeSdkLoader = () => Promise<ClaudeCodeSdkFacade>;

export type ClaudeCodeMcpConfigLoader = () => Promise<ClaudeCodeMcpServersMap>;

export interface ClaudeCodeAdapterOptions {
  vaultPath: string;
  settings: ClaudeCodeBackendSettings;
  pathToClaudeCodeExecutable?: string;
  sdk?: ClaudeCodeSdkFacade;
  sdkLoader?: ClaudeCodeSdkLoader;
  permissionBridge?: ClaudeCodePermissionBridge;
  onElicitation?: (request: ElicitationRequest, options: { signal: AbortSignal }) => Promise<ElicitationResult>;
  mcpServers?: ClaudeCodeMcpServersMap;
  /** Dynamic MCP config loader — called at runtime when building SDK options. */
  mcpConfigLoader?: ClaudeCodeMcpConfigLoader;
}

const CLAUDE_CODE_PHASE1_CAPABILITIES: BackendCapabilities = Object.freeze(
  new Set<AgentCapability>([
    AgentCapability.Chat,
    AgentCapability.Sessions,
    AgentCapability.Models,
    AgentCapability.Thinking,
    AgentCapability.FileOps,
    AgentCapability.Shell,
  ]),
);

interface ClaudeCodeSessionState {
  id: string;
  title: string;
  messages: ClaudeCodeQueuedPrompt[];
  sdkSessionId?: string;
  runtime?: ClaudeCodeSessionRuntime;
}

export class ClaudeCodeRuntimeAbortController {
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;

  abort(reason?: unknown): void {
    this.controller.abort(reason);
  }
}

export class ClaudeCodeAdapter
  implements AgentService, AgentChatCapability, AgentSessionCapability
{
  readonly kind: AgentBackendKind = 'claude-code';
  readonly displayName = 'Claude Code';
  readonly description = 'Claude Code official Agent SDK backend';
  readonly capabilities = CLAUDE_CODE_PHASE1_CAPABILITIES;

  private statusValue: AgentConnectionStatus = 'disconnected';
  private readonly statusChangeHandlers = new Set<StatusChangeHandler>();
  private readonly sessions = new Map<string, ClaudeCodeSessionState>();
  private readonly cancelledSessions = new Set<string>();
  private readonly invalidatedSessions = new Set<string>();
  private sdkLoadPromise: Promise<ClaudeCodeSdkFacade> | null = null;

  constructor(private readonly options: ClaudeCodeAdapterOptions) {}

  hasCapability(cap: AgentCapability): boolean {
    return this.capabilities.has(cap);
  }

  get status(): AgentConnectionStatus {
    return this.statusValue;
  }

  getInfo(): AgentServiceInfo {
    return {
      kind: this.kind,
      displayName: this.displayName,
      description: this.description,
      status: this.status,
      capabilities: this.capabilities,
    };
  }

  async start(): Promise<void> {
    await this.loadMcpConfig();
    this.setStatus('connected');
  }

  async stop(): Promise<void> {
    this.cancelledSessions.clear();
    for (const session of this.sessions.values()) {
      this.closeRuntime(session);
    }
    this.setStatus('disconnected');
  }

  dispose(): void {
    this.cancelledSessions.clear();
    for (const sessionId of this.sessions.keys()) {
      this.invalidatedSessions.add(sessionId);
    }
    for (const session of this.sessions.values()) {
      this.closeRuntime(session);
    }
    this.sessions.clear();
    this.statusChangeHandlers.clear();
    this.statusValue = 'disconnected';
  }

  onStatusChange(handler: StatusChangeHandler): Disposable {
    this.statusChangeHandlers.add(handler);
    return { dispose: () => this.statusChangeHandlers.delete(handler) };
  }

  async createSession(title = 'New Claude Code chat'): Promise<string> {
    const id = createSessionId();
    this.invalidatedSessions.delete(id);
    this.sessions.set(id, {
      id,
      title,
      messages: [],
    });
    return id;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.cancelledSessions.add(sessionId);
    this.invalidatedSessions.add(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) {
      this.closeRuntime(session);
    }
    this.sessions.delete(sessionId);
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.title = title;
    if (session.sdkSessionId) {
      const sdk = await this.getSdk();
      await sdk.renameSession?.(session.sdkSessionId, title, { dir: this.options.vaultPath });
    }
  }

  async listSessions(): Promise<ClaudeCodeSdkSessionInfo[]> {
    const sdk = await this.getSdk();
    return sdk.listSessions?.({ dir: this.options.vaultPath }) ?? [];
  }

  async supportedModels(): Promise<Array<{ id: string; name: string; provider: string }>> {
    let query: ClaudeCodeModelCatalogQuery | undefined;
    try {
      query = await this.getModelCatalogQuery();
      const models = await query.supportedModels();
      return models.map((rawModel) => {
        const model = rawModel as ClaudeCodeSdkModelInfo;
        return {
          id: model.id ?? model.value ?? '',
          name: model.name ?? model.displayName ?? model.id ?? model.value ?? '',
          provider: model.provider ?? 'claude',
        };
      }).filter((model) => model.id.length > 0);
    } catch {
      return [];
    } finally {
      query?.close?.();
    }
  }

  async getSession(sessionId: string): Promise<ClaudeCodeSdkSessionInfo | null> {
    const sdk = await this.getSdk();
    const state = this.sessions.get(sessionId);
    const sdkSessionId = state?.sdkSessionId ?? sessionId;
    return await sdk.getSessionInfo?.(sdkSessionId, { dir: this.options.vaultPath }) ?? null;
  }

  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    const sdk = await this.getSdk();
    const state = this.getOrRestoreSession(sessionId);
    const sourceSessionId = state.sdkSessionId ?? sessionId;
    if (!sdk.forkSession) {
      throw new Error('Claude Code forkSession is unavailable in this SDK.');
    }
    const result = await sdk.forkSession(sourceSessionId, {
      dir: this.options.vaultPath,
      ...(messageID ? { upToMessageId: messageID } : {}),
      title: `${state.title} (fork)`,
    });
    const forkedState: ClaudeCodeSessionState = {
      id: result.sessionId,
      title: `${state.title} (fork)`,
      messages: [],
      sdkSessionId: result.sessionId,
    };
    this.sessions.set(result.sessionId, forkedState);
    return { id: result.sessionId, title: forkedState.title };
  }

  async *sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    const session = this.getOrRestoreSession(request.sessionId);
    this.cancelledSessions.delete(request.sessionId);
    const prompt = createUserPrompt(request.content);
    session.messages.push(prompt);
    let runtime: ClaudeCodeSessionRuntime;
    try {
      runtime = await this.getOrStartRuntime(session);
    } catch (error) {
      yield {
        type: 'error',
        content: `Claude Code SDK unavailable: ${error instanceof Error ? error.message : String(error)}`,
      };
      return;
    }

    runtime.input.push(prompt);

    let sawChunk = false;
    try {
      for await (const item of runtime.output) {
        if (this.cancelledSessions.has(request.sessionId)) {
          return;
        }
        if (item.type === 'error') {
          yield {
            type: 'error',
            content: `Claude Code stream failed: ${item.error instanceof Error ? item.error.message : String(item.error)}`,
          };
          return;
        }

        const chunks = runtime.normalizer.transformSDKMessage(item.message);
        this.captureSdkSessionId(session, chunks);
        for (const chunk of chunks) {
          sawChunk = true;
          yield chunk;
        }
        if (isTurnBoundaryMessage(item.message)) {
          return;
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        content: `Claude Code stream failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      if (!sawChunk) { return; }
    }
  }

  cancelStream(sessionId: string): void {
    this.cancelledSessions.add(sessionId);
    const session = this.sessions.get(sessionId);
    void session?.runtime?.query?.interrupt?.();
    if (session) {
      this.closeRuntime(session);
    }
  }

  async setModel(model?: string): Promise<void> {
    await this.applyToActiveQueries((runtime) => runtime.query?.setModel?.(model));
  }

  async setPermissionMode(mode: ClaudeCodeBackendSettings['permissionMode']): Promise<void> {
    await this.applyToActiveQueries((runtime) => runtime.query?.setPermissionMode?.(mode));
  }

  async reloadMcpServers(): Promise<void> {
    this.refreshMcpConfig();
    await this.loadMcpConfig();
    await this.applyToActiveQueries((runtime) =>
      runtime.query?.setMcpServers?.(this.options.mcpServers ?? this.cachedMcpServers ?? {}));
  }

  private cachedMcpServers: ClaudeCodeMcpServersMap | undefined;

  private buildSdkOptions(
    abortController?: AbortController,
    session?: ClaudeCodeSessionState,
  ): ClaudeCodeSdkOptionsShape {
    return buildClaudeCodeOptions({
      vaultPath: this.options.vaultPath,
      settings: this.options.settings,
      pathToClaudeCodeExecutable: this.options.pathToClaudeCodeExecutable,
      abortController,
      spawnClaudeCodeProcess: this.spawnClaudeCodeProcess,
      canUseTool: this.options.permissionBridge
        ? this.options.permissionBridge.canUseTool.bind(this.options.permissionBridge)
        : undefined,
      onElicitation: this.options.onElicitation
        ? async (request: ElicitationRequest, context: { signal: AbortSignal }) =>
          await this.options.onElicitation!(request, context)
        : undefined,
      mcpServers: this.options.mcpServers ?? this.cachedMcpServers,
      resumeSessionId: session?.sdkSessionId,
    });
  }

  /**
   * Load MCP server config from the loader callback and cache it for
   * subsequent SDK query calls. Call this before the first send or after
   * MCP settings change. Safe to call multiple times.
   */
  async loadMcpConfig(): Promise<void> {
    if (this.options.mcpServers) {
      return;
    }
    if (!this.options.mcpConfigLoader) {
      return;
    }
    try {
      this.cachedMcpServers = await this.options.mcpConfigLoader();
    } catch {
      this.cachedMcpServers = undefined;
    }
  }

  /** Invalidate the cached MCP config so the next loadMcpConfig reloads it. */
  refreshMcpConfig(): void {
    this.cachedMcpServers = undefined;
  }

  private async applyToActiveQueries(
    apply: (runtime: ClaudeCodeSessionRuntime) => Promise<unknown> | void | undefined,
  ): Promise<void> {
    const updates: Array<Promise<unknown>> = [];
    for (const session of this.sessions.values()) {
      const runtime = session.runtime;
      if (!runtime || runtime.closed) {
        continue;
      }
      const result = apply(runtime);
      if (result) {
        updates.push(result);
      }
    }
    await Promise.all(updates);
  }

  private captureSdkSessionId(
    session: ClaudeCodeSessionState,
    chunks: readonly StreamChunk[],
  ): void {
    const metadata = chunks.find((chunk): chunk is Extract<StreamChunk, { type: 'message_metadata' }> =>
      chunk.type === 'message_metadata' && typeof chunk.sessionId === 'string' && chunk.sessionId.length > 0);
    const sdkSessionId = metadata?.sessionId;
    if (!sdkSessionId || sdkSessionId === session.sdkSessionId) {
      return;
    }
    session.sdkSessionId = sdkSessionId;
    this.sessions.set(sdkSessionId, session);
  }

  private async getOrStartRuntime(
    session: ClaudeCodeSessionState,
  ): Promise<ClaudeCodeSessionRuntime> {
    if (session.runtime && !session.runtime.closed) {
      return session.runtime;
    }

    const sdk = await this.getSdk();
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const runtime: ClaudeCodeSessionRuntime = {
      input: new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>(),
      output: new ClaudeCodeAsyncQueue<ClaudeCodeRuntimeOutput>(),
      normalizer: new ClaudeCodeStreamNormalizer({
        sessionId: session.sdkSessionId ?? session.id,
      }),
      abortController,
      closed: false,
    };
    runtime.query = sdk.query({
      prompt: runtime.input,
      options: this.buildSdkOptions(abortController, session),
    });
    session.runtime = runtime;
    void this.pumpRuntimeOutput(session, runtime);
    return runtime;
  }

  private async getModelCatalogQuery(): Promise<ClaudeCodeModelCatalogQuery> {
    for (const session of this.sessions.values()) {
      const query = session.runtime?.query;
      if (query?.supportedModels) {
        return {
          supportedModels: query.supportedModels,
          close: query.close,
        };
      }
    }

    const sdk = await this.getSdk();
    return sdk.query({
      prompt: new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>(),
      options: buildClaudeCodeOptions({
        vaultPath: this.options.vaultPath,
        settings: this.options.settings,
        pathToClaudeCodeExecutable: this.options.pathToClaudeCodeExecutable,
        mcpServers: this.options.mcpServers ?? this.cachedMcpServers,
      }),
    });
  }

  private async pumpRuntimeOutput(
    session: ClaudeCodeSessionState,
    runtime: ClaudeCodeSessionRuntime,
  ): Promise<void> {
    try {
      for await (const message of runtime.query ?? []) {
        runtime.output.push({ type: 'message', message });
      }
    } catch (error) {
      runtime.output.push({ type: 'error', error });
    } finally {
      runtime.closed = true;
      runtime.input.close();
      runtime.output.close();
      if (session.runtime === runtime) {
        delete session.runtime;
      }
    }
  }

  private closeRuntime(session: ClaudeCodeSessionState): void {
    const runtime = session.runtime;
    if (!runtime) {
      return;
    }
    runtime.closed = true;
    runtime.abortController.abort();
    runtime.input.close();
    runtime.output.close();
    runtime.query?.close?.();
    delete session.runtime;
  }

  private readonly spawnClaudeCodeProcess = (request: ClaudeCodeSpawnRequest) => {
    const child = spawn(request.command, request.args, {
      cwd: request.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: request.env as NodeJS.ProcessEnv,
      windowsHide: true,
    });

    request.signal?.addEventListener('abort', () => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }, { once: true });

    return {
      stdin: child.stdin,
      stdout: child.stdout,
      get killed() {
        return child.killed;
      },
      get exitCode() {
        return child.exitCode;
      },
      kill: child.kill.bind(child),
      on: child.on.bind(child),
      once: child.once.bind(child),
      off: child.off.bind(child),
    };
  };

  private getSdk(): Promise<ClaudeCodeSdkFacade> {
    if (this.options.sdk) {
      return Promise.resolve(this.options.sdk);
    }
    if (!this.options.sdkLoader) {
      return Promise.reject(new Error('No Claude Code SDK loader configured'));
    }
    this.sdkLoadPromise ??= this.options.sdkLoader();
    return this.sdkLoadPromise;
  }

  private requireSession(sessionId: string): ClaudeCodeSessionState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Claude Code session not found: ${sessionId}`);
    }
    return session;
  }

  private getOrRestoreSession(sessionId: string): ClaudeCodeSessionState {
    const session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }
    if (this.invalidatedSessions.has(sessionId)) {
      throw new Error(`Claude Code session not found: ${sessionId}`);
    }

    const restoredSession: ClaudeCodeSessionState = {
      id: sessionId,
      title: 'Restored Claude Code chat',
      messages: [],
      sdkSessionId: sessionId,
    };
    this.sessions.set(sessionId, restoredSession);
    return restoredSession;
  }

  private setStatus(status: AgentConnectionStatus): void {
    if (this.statusValue === status) {
      return;
    }
    this.statusValue = status;
    for (const handler of this.statusChangeHandlers) {
      handler(status);
    }
  }
}

/* eslint-disable max-lines -- Claude Code adapter owns SDK query lifecycle, session identity, permissions, MCP refresh, and model catalog wiring for the same backend boundary. */
import type { ElicitationRequest, ElicitationResult, Query } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'child_process';

import { createLogger } from '../../../shared';
import type { AgentBackendKind, StreamChunk } from '../../types/chat';
import type { ClaudeCodeBackendSettings, ClaudeCodeEffort } from '../../types/settings';
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
  type ClaudeCodeOptionsBuilderInput,
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

const runtimeLogger = createLogger('ClaudeCodeAdapter', { moduleKey: 'claudeCode', channel: 'runtime' });
const sessionLogger = createLogger('ClaudeCodeAdapter', { moduleKey: 'claudeCode', channel: 'sessions' });
const mcpLogger = createLogger('ClaudeCodeAdapter', { moduleKey: 'claudeCode', channel: 'mcp' });

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
  listSessions?(options?: { dir?: string; limit?: number; offset?: number; sessionStore?: unknown }): Promise<ClaudeCodeSdkSessionInfo[]>;
  getSessionInfo?(sessionId: string, options?: { dir?: string; sessionStore?: unknown }): Promise<ClaudeCodeSdkSessionInfo | undefined>;
  getSessionMessages?(sessionId: string, options?: { dir?: string; limit?: number; offset?: number; includeSystemMessages?: boolean; sessionStore?: unknown }): Promise<unknown[]>;
  listSubagents?(sessionId: string, options?: { dir?: string; sessionStore?: unknown }): Promise<string[]>;
  getSubagentMessages?(sessionId: string, agentId: string, options?: { dir?: string; limit?: number; offset?: number; sessionStore?: unknown }): Promise<unknown[]>;
  importSessionToStore?(sessionId: string, store: unknown, options?: { dir?: string; includeSubagents?: boolean; batchSize?: number }): Promise<void>;
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

export interface ClaudeCodeDiagnosticPromptRequest {
  prompt: string;
  hooks?: ClaudeCodeOptionsBuilderInput['hooks'];
  sessionStore?: ClaudeCodeOptionsBuilderInput['sessionStore'];
  sessionStoreFlush?: ClaudeCodeOptionsBuilderInput['sessionStoreFlush'];
  outputFormat?: ClaudeCodeOptionsBuilderInput['outputFormat'];
  enableFileCheckpointing?: boolean;
  includeHookEvents?: boolean;
  forwardSubagentText?: boolean;
  agentProgressSummaries?: boolean;
  persistSession?: boolean;
  fallbackModel?: string;
  /**
   * Diagnostic-only model override. Intentionally invalid model names may be used
   * to provoke fallback behavior. Never leaks into ordinary chat send paths.
   */
  model?: string;
  /**
   * Diagnostic resume-at only: resumes the diagnostic prompt from this SDK session id.
   * This is intentionally gated behind runDiagnosticPrompt() and must never be used
   * for ordinary chat resume. The diagnostic result is validated but not stored in
   * ordinary session state, preventing resume-at from rebinding stable chat sessions.
   */
  resumeSessionId?: string;
  /**
   * Explicit diagnostic gate: must be set to `true` when using `resumeSessionId`.
   * This flag keeps resume-at behind an explicit opt-in diagnostic boundary,
   * preventing accidental stable usage of arbitrary session resume.
   */
  _diagnosticResumeAt?: boolean;
}

export interface ClaudeCodeDiagnosticPromptResult {
  sessionId?: string;
  rawMessages: unknown[];
  chunks: StreamChunk[];
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
  /** Runtime-only Claude SDK callbacks. Not persisted to user settings. */
  hooks?: ClaudeCodeOptionsBuilderInput['hooks'];
  /** Runtime-only transcript mirror adapter. Not persisted to user settings. */
  sessionStore?: ClaudeCodeOptionsBuilderInput['sessionStore'];
  sessionStoreFlush?: ClaudeCodeOptionsBuilderInput['sessionStoreFlush'];
  /** Runtime-only structured output request shape for diagnostic/experimental callers. */
  outputFormat?: ClaudeCodeOptionsBuilderInput['outputFormat'];
  /** Runtime-only Claude plugin declarations. Stable authoring UI remains hidden. */
  plugins?: ClaudeCodeOptionsBuilderInput['plugins'];
  /** Runtime-only Claude skills allowlist. Stable authoring UI remains hidden. */
  skills?: ClaudeCodeOptionsBuilderInput['skills'];
  /** Runtime-only main-thread agent selector. Stable authoring UI remains hidden. */
  agent?: ClaudeCodeOptionsBuilderInput['agent'];
  /** Runtime-only Claude agent definitions. Stable authoring UI remains hidden. */
  agents?: ClaudeCodeOptionsBuilderInput['agents'];
}

const CLAUDE_CODE_EFFORT_VALUES = new Set<ClaudeCodeEffort>(['low', 'medium', 'high', 'xhigh', 'max']);

function trimOptionalOptionString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveSendOptionOverrides(options: Record<string, unknown> | undefined): {
  model?: string;
  effort?: ClaudeCodeEffort;
} {
  const model = trimOptionalOptionString(options?.model);
  const variant = trimOptionalOptionString(options?.variant);
  const effort = variant && CLAUDE_CODE_EFFORT_VALUES.has(variant as ClaudeCodeEffort)
    ? variant as ClaudeCodeEffort
    : undefined;
  return {
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  };
}

function summarizeError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error && error.name.trim()
    ? error.name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 48)
    : typeof error;
  const lowerMessage = rawMessage.toLowerCase();
  const category =
    lowerMessage.includes('abort') ? 'abort'
      : lowerMessage.includes('timeout') || lowerMessage.includes('timed out') ? 'timeout'
        : lowerMessage.includes('eacces') || lowerMessage.includes('permission') || lowerMessage.includes('denied') ? 'permission'
          : lowerMessage.includes('enoent') || lowerMessage.includes('not found') ? 'not-found'
            : lowerMessage.includes('network') || lowerMessage.includes('connection') || lowerMessage.includes('econn') ? 'network'
              : 'generic';
  return `${errorName}(category=${category}, messageLength=${rawMessage.length})`;
}

function summarizeSendOptions(options: Record<string, unknown> | undefined): Record<string, unknown> {
  const overrides = resolveSendOptionOverrides(options);
  return {
    optionKeyCount: Object.keys(options ?? {}).length,
    hasModelOverride: Boolean(overrides.model),
    effort: overrides.effort,
  };
}

function summarizeSession(session: ClaudeCodeSessionState): Record<string, unknown> {
  return {
    sessionId: session.id,
    sdkSessionId: session.sdkSessionId,
    messageCount: session.messages.length,
    hasRuntime: Boolean(session.runtime && !session.runtime.closed),
  };
}

function resolveDiagnosticSessionId(message: unknown, chunks: readonly StreamChunk[]): string | undefined {
  for (const chunk of chunks) {
    if (chunk.type === 'message_metadata' && chunk.sessionId) {
      return chunk.sessionId;
    }
    if (chunk.type === 'usage' && chunk.sessionId) {
      return chunk.sessionId;
    }
    if (chunk.type === 'backend_event' && chunk.sessionId) {
      return chunk.sessionId;
    }
  }
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return undefined;
  }
  const record = message as {
    session_id?: unknown;
    sessionId?: unknown;
    message?: { session_id?: unknown; sessionId?: unknown };
  };
  const candidates = [
    record.session_id,
    record.sessionId,
    record.message?.session_id,
    record.message?.sessionId,
  ];
  const resolved = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return typeof resolved === 'string' ? resolved : undefined;
}

function resolveComparableSessionIds(sessionInfo: ClaudeCodeSdkSessionInfo): string[] {
  const record = sessionInfo as ClaudeCodeSdkSessionInfo & { id?: unknown };
  return [record.sessionId, record.id]
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
    .map((candidate) => candidate.trim());
}

const CLAUDE_CODE_PHASE1_CAPABILITIES: BackendCapabilities = Object.freeze(
  new Set<AgentCapability>([
    AgentCapability.Chat,
    AgentCapability.Sessions,
    AgentCapability.Fork,
    AgentCapability.Models,
    AgentCapability.Thinking,
    AgentCapability.FileOps,
    AgentCapability.Shell,
  ]),
);

function isOpenCodianLocalClaudeSessionId(sessionId: string): boolean {
  return sessionId.startsWith('claude-code-');
}

interface ClaudeCodeSessionState {
  id: string;
  title: string;
  messages: ClaudeCodeQueuedPrompt[];
  sdkSessionId?: string;
  resumeValidationRequired?: boolean;
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
    runtimeLogger.debug('start', { vaultPath: this.options.vaultPath });
    await this.loadMcpConfig();
    this.setStatus('connected');
  }

  async stop(): Promise<void> {
    runtimeLogger.debug('stop', { sessionCount: this.sessions.size });
    this.cancelledSessions.clear();
    for (const session of this.sessions.values()) {
      this.closeRuntime(session);
    }
    this.setStatus('disconnected');
  }

  dispose(): void {
    runtimeLogger.debug('dispose', { sessionCount: this.sessions.size });
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
    sessionLogger.debug('create session', { sessionId: id, titleLength: title.length });
    return id;
  }

  async deleteSession(sessionId: string): Promise<void> {
    sessionLogger.debug('delete session', { sessionId, existed: this.sessions.has(sessionId) });
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
    sessionLogger.debug('update session', {
      sessionId,
      sdkSessionId: session.sdkSessionId,
      titleLength: title.length,
    });
    if (session.sdkSessionId) {
      const sdk = await this.getSdk();
      await sdk.renameSession?.(session.sdkSessionId, title, { dir: this.options.vaultPath });
    }
  }

  async listSessions(options?: { limit?: number; offset?: number; sessionStore?: unknown }): Promise<ClaudeCodeSdkSessionInfo[]> {
    sessionLogger.debug('list session', {
      vaultPath: this.options.vaultPath,
      limit: options?.limit,
      offset: options?.offset,
      hasSessionStore: Boolean(options?.sessionStore),
    });
    const sdk = await this.getSdk();
    const sessions = await sdk.listSessions?.({
      dir: this.options.vaultPath,
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.offset !== undefined ? { offset: options.offset } : {}),
      ...(options?.sessionStore ? { sessionStore: options.sessionStore } : {}),
    }) ?? [];
    sessionLogger.debug('list session complete', { count: sessions.length });
    return sessions;
  }

  async supportedModels(): Promise<Array<{ id: string; name: string; provider: string }>> {
    let query: ClaudeCodeModelCatalogQuery | undefined;
    try {
      query = await this.getModelCatalogQuery();
      const models = await query.supportedModels();
      const normalizedModels = models.map((rawModel) => {
        const model = rawModel as ClaudeCodeSdkModelInfo;
        return {
          id: model.id ?? model.value ?? '',
          name: model.name ?? model.displayName ?? model.id ?? model.value ?? '',
          provider: model.provider ?? 'claude',
        };
      }).filter((model) => model.id.length > 0);
      runtimeLogger.debug('supportedModels count', { count: normalizedModels.length });
      return normalizedModels;
    } catch (error) {
      runtimeLogger.debug('supportedModels error', { error: summarizeError(error) });
      return [];
    } finally {
      query?.close?.();
    }
  }

  async getSession(sessionId: string, options?: { sessionStore?: unknown }): Promise<ClaudeCodeSdkSessionInfo | null> {
    sessionLogger.debug('get session', { sessionId, hasSessionStore: Boolean(options?.sessionStore) });
    const sdk = await this.getSdk();
    const state = this.sessions.get(sessionId);
    const sdkSessionId = state?.sdkSessionId ?? sessionId;
    const session = await sdk.getSessionInfo?.(sdkSessionId, {
      dir: this.options.vaultPath,
      ...(options?.sessionStore ? { sessionStore: options.sessionStore } : {}),
    }) ?? null;
    sessionLogger.debug('get session complete', {
      sessionId,
      sdkSessionId,
      found: Boolean(session),
    });
    return session;
  }

  async getSessionMessages(
    sessionId: string,
    options?: { limit?: number; offset?: number; includeSystemMessages?: boolean; sessionStore?: unknown },
  ): Promise<unknown[]> {
    this.assertSessionNotInvalidated(sessionId);
    const sdk = await this.getSdk();
    if (!sdk.getSessionMessages) {
      throw new Error('Claude Code getSessionMessages is unavailable in this SDK.');
    }
    const state = this.sessions.get(sessionId);
    const sdkSessionId = state?.sdkSessionId ?? sessionId;
    sessionLogger.debug('get session messages', {
      sessionId,
      sdkSessionId,
      includeSystemMessages: options?.includeSystemMessages === true,
      hasSessionStore: Boolean(options?.sessionStore),
    });
    return await sdk.getSessionMessages(sdkSessionId, {
      dir: this.options.vaultPath,
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.offset !== undefined ? { offset: options.offset } : {}),
      ...(options?.includeSystemMessages !== undefined ? { includeSystemMessages: options.includeSystemMessages } : {}),
      ...(options?.sessionStore ? { sessionStore: options.sessionStore } : {}),
    });
  }

  async listSubagents(sessionId: string, options?: { sessionStore?: unknown }): Promise<string[]> {
    this.assertSessionNotInvalidated(sessionId);
    const sdk = await this.getSdk();
    if (!sdk.listSubagents) {
      throw new Error('Claude Code listSubagents is unavailable in this SDK.');
    }
    const state = this.sessions.get(sessionId);
    const sdkSessionId = state?.sdkSessionId ?? sessionId;
    sessionLogger.debug('list subagents', {
      sessionId,
      sdkSessionId,
      hasSessionStore: Boolean(options?.sessionStore),
    });
    return await sdk.listSubagents(sdkSessionId, {
      dir: this.options.vaultPath,
      ...(options?.sessionStore ? { sessionStore: options.sessionStore } : {}),
    });
  }

  async getSubagentMessages(
    sessionId: string,
    agentId: string,
    options?: { limit?: number; offset?: number; sessionStore?: unknown },
  ): Promise<unknown[]> {
    this.assertSessionNotInvalidated(sessionId);
    const sdk = await this.getSdk();
    if (!sdk.getSubagentMessages) {
      throw new Error('Claude Code getSubagentMessages is unavailable in this SDK.');
    }
    const state = this.sessions.get(sessionId);
    const sdkSessionId = state?.sdkSessionId ?? sessionId;
    sessionLogger.debug('get subagent messages', {
      sessionId,
      sdkSessionId,
      agentId,
      hasSessionStore: Boolean(options?.sessionStore),
    });
    return await sdk.getSubagentMessages(sdkSessionId, agentId, {
      dir: this.options.vaultPath,
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.offset !== undefined ? { offset: options.offset } : {}),
      ...(options?.sessionStore ? { sessionStore: options.sessionStore } : {}),
    });
  }

  async importSessionToStore(
    sessionId: string,
    store: unknown,
    options?: { includeSubagents?: boolean; batchSize?: number },
  ): Promise<void> {
    this.assertSessionNotInvalidated(sessionId);
    const sdk = await this.getSdk();
    if (!sdk.importSessionToStore) {
      throw new Error('Claude Code importSessionToStore is unavailable in this SDK.');
    }
    const state = this.sessions.get(sessionId);
    const sdkSessionId = state?.sdkSessionId ?? sessionId;
    sessionLogger.debug('import session to store', {
      sessionId,
      sdkSessionId,
      includeSubagents: options?.includeSubagents !== false,
      batchSize: options?.batchSize,
    });
    await sdk.importSessionToStore(sdkSessionId, store, {
      dir: this.options.vaultPath,
      ...(options?.includeSubagents !== undefined ? { includeSubagents: options.includeSubagents } : {}),
      ...(options?.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
    });
  }

  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    const sdk = await this.getSdk();
    const state = this.getOrRestoreSession(sessionId);
    const sourceSessionId = state.sdkSessionId ?? sessionId;
    sessionLogger.debug('fork session', { sessionId, sourceSessionId, upToMessageId: messageID });
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
    sessionLogger.debug('fork session complete', { sessionId, forkedSessionId: result.sessionId });
    return { id: result.sessionId, title: forkedState.title };
  }

  async rewindFiles(
    sessionId: string,
    userMessageId: string,
    options?: { dryRun?: boolean },
  ): Promise<unknown> {
    if (!userMessageId.trim()) {
      throw new Error('Claude Code rewindFiles requires a non-empty userMessageId.');
    }
    const session = this.getOrRestoreSession(sessionId);
    const effectiveDryRun = options?.dryRun !== false;
    if (!effectiveDryRun) {
      sessionLogger.warn('rewind called with dryRun=false - this is a real rewind, not a preview', {
        sessionId,
        userMessageId,
      });
    }
    sessionLogger.debug('rewind session', { sessionId, userMessageId, dryRun: effectiveDryRun });
    const rewindFiles = session.runtime?.query?.rewindFiles;
    if (!rewindFiles) {
      throw new Error('Claude Code rewindFiles is unavailable. Start a checkpoint-enabled runtime first.');
    }
    return await rewindFiles(userMessageId, { ...options, dryRun: effectiveDryRun });
  }

  async runDiagnosticPrompt(
    request: ClaudeCodeDiagnosticPromptRequest,
  ): Promise<ClaudeCodeDiagnosticPromptResult> {
    if (request.sessionStore && request.enableFileCheckpointing === true) {
      throw new Error('Claude Code sessionStore diagnostics cannot enable file checkpointing.');
    }
    // Diagnostic flag gate: resume-at requires explicit opt-in.
    // This keeps arbitrary session resume behind a diagnostic boundary
    // and prevents accidental stable usage.
    if (request.resumeSessionId && request._diagnosticResumeAt !== true) {
      throw new Error(
        'Claude Code diagnostic resume-at requires _diagnosticResumeAt flag. ' +
        'Resume-at is diagnostic-only and must not be used for ordinary chat resume.',
      );
    }
    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    await this.validateDiagnosticResumeSession(sdk, request.resumeSessionId);
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const query = sdk.query({
      prompt: request.prompt,
      options: this.buildDiagnosticSdkOptions(abortController, request),
    });
    const normalizer = new ClaudeCodeStreamNormalizer();
    const rawMessages: unknown[] = [];
    const chunks: StreamChunk[] = [];
    let sessionId: string | undefined;

    try {
      for await (const message of query ?? []) {
        rawMessages.push(message);
        const nextChunks = normalizer.transformSDKMessage(message);
        if (!sessionId) {
          sessionId = resolveDiagnosticSessionId(message, nextChunks);
        }
        chunks.push(...nextChunks);
      }
    } finally {
      query.close?.();
    }

    const validatedSessionId = this.validateDiagnosticResumeResult(request.resumeSessionId, sessionId);

    // Explicit isolation: diagnostic resume-at must never modify ordinary session state.
    // The diagnostic result is returned to the caller but is not stored in this.sessions
    // and cannot rebind any ordinary chat session's sdkSessionId.
    if (validatedSessionId) {
      for (const session of this.sessions.values()) {
        if (session.sdkSessionId === validatedSessionId) {
          runtimeLogger.debug('diagnostic resume-at collision with ordinary session', {
            diagnosticSessionId: validatedSessionId,
            ordinarySessionId: session.id,
          });
        }
      }
    }

    return {
      sessionId: validatedSessionId,
      rawMessages,
      chunks,
    };
  }

  private async validateDiagnosticResumeSession(
    sdk: ClaudeCodeSdkFacade,
    resumeSessionId: string | undefined,
  ): Promise<void> {
    const trimmedResumeSessionId = resumeSessionId?.trim();
    if (!trimmedResumeSessionId) {
      return;
    }
    if (!sdk.getSessionInfo) {
      throw new Error('Claude Code diagnostic resume validation failed: SDK session lookup is unavailable.');
    }
    const sessionInfo = await sdk.getSessionInfo(trimmedResumeSessionId, { dir: this.options.vaultPath });
    if (!sessionInfo) {
      throw new Error(`Claude Code diagnostic resume validation failed: session "${trimmedResumeSessionId}" was not found in the Claude SDK session catalog.`);
    }
    const comparableSessionIds = resolveComparableSessionIds(sessionInfo);
    const mismatchedSessionId = comparableSessionIds.find((sessionId) => sessionId !== trimmedResumeSessionId);
    if (mismatchedSessionId) {
      throw new Error(`Claude Code diagnostic resume validation failed: SDK session lookup returned "${mismatchedSessionId}" for requested session "${trimmedResumeSessionId}".`);
    }
  }

  private validateDiagnosticResumeResult(
    resumeSessionId: string | undefined,
    resultingSessionId: string | undefined,
  ): string | undefined {
    const trimmedResumeSessionId = resumeSessionId?.trim();
    if (!trimmedResumeSessionId) {
      return resultingSessionId;
    }
    if (resultingSessionId !== trimmedResumeSessionId) {
      throw new Error(`Claude Code diagnostic resume validation failed: resumed query returned session "${resultingSessionId ?? '(none)'}" for requested session "${trimmedResumeSessionId}".`);
    }
    return resultingSessionId;
  }

  async *sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    const session = this.getOrRestoreSession(request.sessionId);
    runtimeLogger.debug('sendMessage start', {
      sessionId: request.sessionId,
      contentLength: request.content.length,
      ...summarizeSendOptions(request.options),
    });
    this.cancelledSessions.delete(request.sessionId);
    // Prompt hardening for structured-output sends: explicitly constrain the model
    // to return ONLY through the StructuredOutput tool and avoid any visible text
    // outside the structured output (markdown code fences, explanations, prose).
    const hasOutputFormat = request.options?.outputFormat != null
      && typeof request.options.outputFormat === 'object'
      && Object.keys(request.options.outputFormat).length > 0;
    const promptContent = hasOutputFormat
      ? `You MUST return your complete response ONLY through the StructuredOutput tool using the provided JSON schema. Do NOT output markdown code blocks, JSON fences, explanations, or any conversational text outside the structured output.\n\n${request.content}`
      : request.content;
    const prompt = createUserPrompt(promptContent);
    session.messages.push(prompt);
    let runtime: ClaudeCodeSessionRuntime;
    try {
      runtime = await this.getOrStartRuntime(session, request.options);
      runtimeLogger.debug('sendMessage runtime-ready', summarizeSession(session));
    } catch (error) {
      this.setStatus('error');
      runtimeLogger.debug('sendMessage error', {
        sessionId: request.sessionId,
        phase: 'runtime-ready',
        error: summarizeError(error),
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield {
        type: 'error',
        content: errorMessage.startsWith('Claude Code resume validation failed')
          ? errorMessage
          : `Claude Code SDK unavailable: ${errorMessage}`,
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
          runtimeLogger.debug('sendMessage error', {
            sessionId: request.sessionId,
            phase: 'runtime-output',
            error: summarizeError(item.error),
          });
          yield {
            type: 'error',
            content: `Claude Code stream failed: ${item.error instanceof Error ? item.error.message : String(item.error)}`,
          };
          return;
        }

        const chunks = runtime.normalizer.transformSDKMessage(item.message);
        this.captureSdkSessionId(session, item.message, chunks);
        for (const chunk of chunks) {
          sawChunk = true;
          yield chunk;
        }
        if (isTurnBoundaryMessage(item.message)) {
          runtimeLogger.debug('sendMessage complete', {
            sessionId: request.sessionId,
            sawChunk,
            boundary: true,
          });
          return;
        }
      }
    } catch (error) {
      runtimeLogger.debug('sendMessage error', {
        sessionId: request.sessionId,
        phase: 'stream',
        error: summarizeError(error),
      });
      yield {
        type: 'error',
        content: `Claude Code stream failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      if (!sawChunk) { return; }
    }
    runtimeLogger.debug('sendMessage complete', {
      sessionId: request.sessionId,
      sawChunk,
      boundary: false,
    });
  }

  cancelStream(sessionId: string): void {
    runtimeLogger.debug('close runtime', { sessionId, reason: 'cancelStream' });
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
    mcpLogger.debug('MCP config reload', { hadCachedConfig: this.cachedMcpServers !== undefined });
    this.refreshMcpConfig();
    await this.loadMcpConfig();
    await this.applyToActiveQueries((runtime) =>
      runtime.query?.setMcpServers?.(this.options.mcpServers ?? this.cachedMcpServers ?? {}));
  }

  async restartPersistentQueries(reason = 'manual'): Promise<void> {
    runtimeLogger.debug('runtime restart requested', {
      reason,
      sessionCount: this.sessions.size,
    });
    for (const session of this.sessions.values()) {
      if (session.runtime && !session.runtime.closed) {
        runtimeLogger.debug('runtime close', {
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
          reason: `restart:${reason}`,
        });
        this.closeRuntime(session);
      }
    }
  }

  private cachedMcpServers: ClaudeCodeMcpServersMap | undefined;

  private buildSdkOptions(
    abortController?: AbortController,
    session?: ClaudeCodeSessionState,
    sendOptions?: Record<string, unknown>,
  ): ClaudeCodeSdkOptionsShape {
    const overrides = resolveSendOptionOverrides(sendOptions);
    const options = buildClaudeCodeOptions({
      vaultPath: this.options.vaultPath,
      settings: {
        ...this.options.settings,
        ...(overrides.model ? { model: overrides.model } : {}),
        ...(overrides.effort ? { effort: overrides.effort } : {}),
      },
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
      hooks: this.options.hooks,
      sessionStore: this.options.sessionStore,
      sessionStoreFlush: this.options.sessionStoreFlush,
      // One-shot structured-output trigger from ordinary chat `/json` prefix takes
      // precedence over the adapter-level default. Diagnostic probes still use
      // buildDiagnosticSdkOptions which has its own override path.
      outputFormat: sendOptions?.outputFormat && typeof sendOptions.outputFormat === 'object'
        ? sendOptions.outputFormat as Record<string, unknown>
        : this.options.outputFormat,
      plugins: this.options.plugins,
      skills: this.options.skills,
      agent: this.options.agent,
      agents: this.options.agents,
      // Ordinary resume path: only the session's own captured sdkSessionId is used.
      // Arbitrary resume-at ids are rejected; use runDiagnosticPrompt() for diagnostic resume.
      resumeSessionId: session?.sdkSessionId,
    });
    runtimeLogger.debug('buildSdkOptions tool config', {
      allowedToolCount: options.allowedTools?.length ?? 0,
      disallowedToolCount: options.disallowedTools?.length ?? 0,
      allowedTools: options.allowedTools,
      disallowedTools: options.disallowedTools,
    });
    runtimeLogger.debug('buildSdkOptions limits config', {
      maxTurns: options.maxTurns ?? null,
      maxBudgetUsd: options.maxBudgetUsd ?? null,
    });
    runtimeLogger.debug('buildSdkOptions fallback model', {
      fallbackModel: options.fallbackModel ?? null,
    });
    return options;
  }

  private buildDiagnosticSdkOptions(
    abortController: AbortController | undefined,
    request: ClaudeCodeDiagnosticPromptRequest,
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
        ? async (promptRequest: ElicitationRequest, context: { signal: AbortSignal }) =>
          await this.options.onElicitation!(promptRequest, context)
        : undefined,
      mcpServers: this.options.mcpServers ?? this.cachedMcpServers,
      hooks: request.hooks ?? this.options.hooks,
      sessionStore: request.sessionStore ?? this.options.sessionStore,
      sessionStoreFlush: request.sessionStoreFlush ?? this.options.sessionStoreFlush,
      outputFormat: request.outputFormat ?? this.options.outputFormat,
      enableFileCheckpointing: request.sessionStore ? false : request.enableFileCheckpointing,
      includeHookEvents: request.includeHookEvents,
      forwardSubagentText: request.forwardSubagentText,
      agentProgressSummaries: request.agentProgressSummaries,
      persistSession: request.persistSession,
      // Diagnostic resume-at path: accepts arbitrary session id for diagnostic probes only.
      // Intentionally separate from ordinary session resume in buildSdkOptions above.
      resumeSessionId: request.resumeSessionId,
      fallbackModel: request.fallbackModel,
      model: request.model,
    });
  }

  /**
   * Load MCP server config from the loader callback and cache it for
   * subsequent SDK query calls. Call this before the first send or after
   * MCP settings change. Safe to call multiple times.
   */
  async loadMcpConfig(): Promise<void> {
    if (this.options.mcpServers) {
      mcpLogger.debug('MCP config load', {
        source: 'static',
        serverCount: Object.keys(this.options.mcpServers).length,
      });
      return;
    }
    if (this.cachedMcpServers !== undefined) {
      mcpLogger.debug('MCP config load', {
        source: 'cache',
        serverCount: Object.keys(this.cachedMcpServers).length,
      });
      return;
    }
    if (!this.options.mcpConfigLoader) {
      mcpLogger.debug('MCP config load', { source: 'none', serverCount: 0 });
      return;
    }
    try {
      this.cachedMcpServers = await this.options.mcpConfigLoader();
      mcpLogger.debug('MCP config load', {
        source: 'loader',
        serverCount: Object.keys(this.cachedMcpServers).length,
      });
    } catch (error) {
      this.cachedMcpServers = undefined;
      mcpLogger.debug('MCP config load', {
        source: 'loader',
        error: summarizeError(error),
      });
    }
  }

  /** Invalidate the cached MCP config so the next loadMcpConfig reloads it. */
  refreshMcpConfig(): void {
    mcpLogger.debug('MCP config reload', { action: 'refresh-cache' });
    this.cachedMcpServers = undefined;
  }

  /**
   * Return the number of MCP servers currently loaded into the adapter.
   * Returns 0 if no config has been loaded yet. Includes both static
   * (options.mcpServers) and dynamically loaded (mcpConfigLoader) servers.
   */
  getMcpServerCount(): number {
    const servers = this.options.mcpServers ?? this.cachedMcpServers;
    return servers ? Object.keys(servers).length : 0;
  }

  /**
   * Return the number of plugins currently wired into the adapter.
   * Returns 0 if no plugins have been configured.
   */
  getPluginCount(): number {
    return this.options.plugins?.length ?? 0;
  }

  /**
   * Return the number of skills currently wired into the adapter.
   * Returns 0 if no skills have been configured.
   * Returns -1 to indicate "all skills" when `skills` is set to `'all'`.
   */
  getSkillCount(): number {
    const skills = this.options.skills;
    if (skills === 'all') {
      return -1;
    }
    return skills?.length ?? 0;
  }

  /**
   * Return the list of skill names currently wired into the adapter.
   * Returns `'all'` when all skills are enabled.
   * Returns a copy of the names array, or an empty array if none configured.
   * Diagnostic read-only surface — no authoring UI.
   */
  getSkillsList(): string[] | 'all' {
    const skills = this.options.skills;
    if (skills === 'all') {
      return 'all';
    }
    return skills ? [...skills] : [];
  }

  /**
   * Return the list of plugin identifiers currently wired into the adapter.
   * Returns stringified identifiers (plugin items may be strings or objects).
   * Returns an empty array if none configured.
   * Diagnostic read-only surface — no authoring UI.
   */
  getPluginsList(): string[] {
    return this.options.plugins
      ? this.options.plugins.map(p => typeof p === 'string' ? p : JSON.stringify(p))
      : [];
  }

  /**
   * Return the number of agent definitions currently wired into the adapter.
   * Counts both the single `agent` selector and entries in the `agents` map.
   * Returns 0 if neither is configured.
   * Diagnostic read-only surface — no authoring UI.
   */
  getAgentDefinitionCount(): number {
    let count = 0;
    if (typeof this.options.agent === 'string' && this.options.agent.trim().length > 0) {
      count += 1;
    }
    if (this.options.agents && typeof this.options.agents === 'object') {
      count += Object.keys(this.options.agents).length;
    }
    return count;
  }

  /**
   * Return the list of agent definition names currently wired into the adapter.
   * Includes the single `agent` selector (if set) followed by keys from the
   * `agents` map. Returns an empty array if neither is configured.
   * Diagnostic read-only surface — no authoring UI.
   */
  getAgentDefinitionsList(): string[] {
    const names: string[] = [];
    if (typeof this.options.agent === 'string' && this.options.agent.trim().length > 0) {
      names.push(this.options.agent.trim());
    }
    if (this.options.agents && typeof this.options.agents === 'object') {
      names.push(...Object.keys(this.options.agents));
    }
    return names;
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
    message: unknown,
    chunks: readonly StreamChunk[],
  ): void {
    const sdkSessionId = resolveDiagnosticSessionId(message, chunks);
    if (!sdkSessionId || sdkSessionId === session.sdkSessionId) {
      return;
    }
    if (session.sdkSessionId) {
      this.closeRuntime(session);
      throw new Error(`Claude Code resume validation failed: resumed query returned session "${sdkSessionId}" for requested session "${session.sdkSessionId}".`);
    }
    session.sdkSessionId = sdkSessionId;
    this.sessions.set(sdkSessionId, session);
  }

  private async validateUserResumeSession(
    sdk: ClaudeCodeSdkFacade,
    session: ClaudeCodeSessionState,
  ): Promise<void> {
    const sdkSessionId = session.sdkSessionId?.trim();
    if (!sdkSessionId || !session.resumeValidationRequired) {
      return;
    }
    if (!sdk.getSessionInfo) {
      throw new Error('Claude Code resume validation failed: SDK session lookup is unavailable.');
    }
    const sessionInfo = await sdk.getSessionInfo(sdkSessionId, { dir: this.options.vaultPath });
    if (!sessionInfo) {
      throw new Error(`Claude Code resume validation failed: session "${sdkSessionId}" was not found in the Claude SDK session catalog.`);
    }
    const comparableSessionIds = resolveComparableSessionIds(sessionInfo);
    if (comparableSessionIds.length === 0) {
      throw new Error(`Claude Code resume validation failed: SDK session lookup returned no comparable identity for requested session "${sdkSessionId}".`);
    }
    const mismatchedSessionId = comparableSessionIds.find((sessionId) => sessionId !== sdkSessionId);
    if (mismatchedSessionId) {
      throw new Error(`Claude Code resume validation failed: SDK session lookup returned "${mismatchedSessionId}" for requested session "${sdkSessionId}".`);
    }
    session.resumeValidationRequired = false;
  }

  private async getOrStartRuntime(
    session: ClaudeCodeSessionState,
    sendOptions?: Record<string, unknown>,
  ): Promise<ClaudeCodeSessionRuntime> {
    const overrides = resolveSendOptionOverrides(sendOptions);
    if (session.runtime && !session.runtime.closed) {
      const nextEffort = overrides.effort ?? this.options.settings.effort;
      if (nextEffort !== session.runtime.effort) {
        runtimeLogger.debug('runtime close', {
          sessionId: session.id,
          reason: 'effort-change',
          previousEffort: session.runtime.effort,
          nextEffort,
        });
        this.closeRuntime(session);
      } else {
        if (overrides.model) {
          await session.runtime.query?.setModel?.(overrides.model);
        }
        runtimeLogger.debug('runtime reuse', {
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
          effort: session.runtime.effort,
          hasModelOverride: Boolean(overrides.model),
        });
        return session.runtime;
      }
    }

    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    await this.validateUserResumeSession(sdk, session);
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const runtime: ClaudeCodeSessionRuntime = {
      input: new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>(),
      output: new ClaudeCodeAsyncQueue<ClaudeCodeRuntimeOutput>(),
      normalizer: new ClaudeCodeStreamNormalizer({
        sessionId: session.sdkSessionId ?? session.id,
      }),
      abortController,
      effort: overrides.effort ?? this.options.settings.effort,
      closed: false,
    };
    runtimeLogger.debug('runtime create', {
      sessionId: session.id,
      sdkSessionId: session.sdkSessionId,
      effort: runtime.effort,
    });
    runtimeLogger.debug('SDK query creation', {
      sessionId: session.id,
      sdkSessionId: session.sdkSessionId,
      cwd: this.options.vaultPath,
      ...summarizeSendOptions(sendOptions),
    });
    runtime.query = sdk.query({
      prompt: runtime.input,
      options: this.buildSdkOptions(abortController, session, sendOptions),
    });
    session.runtime = runtime;
    void this.pumpRuntimeOutput(session, runtime);
    return runtime;
  }

  private async getModelCatalogQuery(): Promise<ClaudeCodeModelCatalogQuery> {
    for (const session of this.sessions.values()) {
      const query = session.runtime?.query;
      if (query?.supportedModels) {
        runtimeLogger.debug('SDK query creation', {
          source: 'runtime-reuse',
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
        });
        return {
          supportedModels: query.supportedModels,
          close: query.close,
        };
      }
    }

    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    runtimeLogger.debug('SDK query creation', {
      source: 'model-catalog',
      cwd: this.options.vaultPath,
    });
    return sdk.query({
      prompt: new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>(),
      options: this.buildSdkOptions(abortController),
    });
  }

  private async ensureReadyForQuery(): Promise<void> {
    await this.loadMcpConfig();
    this.setStatus('connected');
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
      runtimeLogger.debug('sendMessage error', {
        sessionId: session.id,
        phase: 'runtime-pump',
        error: summarizeError(error),
      });
      runtime.output.push({ type: 'error', error });
    } finally {
      runtime.closed = true;
      runtime.input.close();
      runtime.output.close();
      if (session.runtime === runtime) {
        delete session.runtime;
      }
      runtimeLogger.debug('runtime close', {
        sessionId: session.id,
        sdkSessionId: session.sdkSessionId,
        reason: 'pump-finally',
      });
    }
  }

  private closeRuntime(session: ClaudeCodeSessionState): void {
    const runtime = session.runtime;
    if (!runtime) {
      return;
    }
    runtimeLogger.debug('runtime close', {
      sessionId: session.id,
      sdkSessionId: session.sdkSessionId,
      reason: 'closeRuntime',
    });
    runtime.closed = true;
    runtime.abortController.abort();
    runtime.input.close();
    runtime.output.close();
    runtime.query?.close?.();
    delete session.runtime;
  }

  private readonly spawnClaudeCodeProcess = (request: ClaudeCodeSpawnRequest) => {
    const envKeys = Object.keys(request.env ?? {});
    runtimeLogger.debug('spawn command', {
      command: request.command,
      cwd: request.cwd,
      argCount: request.args.length,
      envKeyCount: envKeys.length,
      envKeys,
    });
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

    child.on('exit', (code, signal) => {
      runtimeLogger.debug('spawn exit', {
        command: request.command,
        cwd: request.cwd,
        code,
        signal,
      });
    });
    child.on('error', (error) => {
      runtimeLogger.debug('spawn error', {
        command: request.command,
        cwd: request.cwd,
        error: summarizeError(error),
      });
    });

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
      runtimeLogger.debug('SDK load', { source: 'injected' });
      return Promise.resolve(this.options.sdk);
    }
    if (!this.options.sdkLoader) {
      runtimeLogger.debug('SDK load', { source: 'missing-loader' });
      return Promise.reject(new Error('No Claude Code SDK loader configured'));
    }
    if (!this.sdkLoadPromise) {
      runtimeLogger.debug('SDK load', { source: 'loader' });
      this.sdkLoadPromise = this.options.sdkLoader();
    } else {
      runtimeLogger.debug('SDK load', { source: 'cache' });
    }
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
    this.assertSessionNotInvalidated(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }

    const restoredSession: ClaudeCodeSessionState = {
      id: sessionId,
      title: 'Restored Claude Code chat',
      messages: [],
      ...(isOpenCodianLocalClaudeSessionId(sessionId)
        ? {}
        : { sdkSessionId: sessionId, resumeValidationRequired: true }),
    };
    this.sessions.set(sessionId, restoredSession);
    sessionLogger.debug('get session', {
      sessionId,
      restored: true,
      sdkSessionId: restoredSession.sdkSessionId,
    });
    return restoredSession;
  }

  private assertSessionNotInvalidated(sessionId: string): void {
    if (this.invalidatedSessions.has(sessionId)) {
      throw new Error(`Claude Code session not found: ${sessionId}`);
    }
  }

  private setStatus(status: AgentConnectionStatus): void {
    if (this.statusValue === status) {
      return;
    }
    runtimeLogger.debug('status change', {
      from: this.statusValue,
      to: status,
    });
    this.statusValue = status;
    for (const handler of this.statusChangeHandlers) {
      handler(status);
    }
  }
}

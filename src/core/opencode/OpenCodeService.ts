/**
 * OpenCode Service
 *
 * Main service for interacting with OpenCode Server via HTTP API.
 * Uses Obsidian's requestUrl to bypass CORS restrictions.
 * Now supports SSE streaming for real-time message updates.
 */

import { requestUrl } from 'obsidian';

import {
  createLogger,
  isInternalStructuredOutputTool,
} from '../../shared';
import { normalizeContextPath } from '../../shared/contextPath';
import type {
  ChatMessage,
  ImageAttachment,
  OpencodeModelConfigSubset,
  PermissionReply,
  PermissionRequest,
  QuestionRequest as ChatQuestionRequest,
  SessionDiffEntry,
  SessionTodo,
  StreamChunk,
} from '../types';
import type { OpenCodianSettings } from '../types/settings';
import { getServerBaseUrl, isLocalServerMode } from '../types/settings';
import { createSdkClient } from './createSdkClient';
import {
  OpenCodeCatalogStateStore,
  type CatalogUpdateListener,
  type OpenCodeCatalogToolIdentityContext,
} from './OpenCodeCatalogStateStore';
import {
  OpenCodeEventSubscriptionCoordinator,
  type OpenCodeEventListener,
} from './OpenCodeEventSubscriptionCoordinator';
import {
  OpenCodeContextPartSerializer,
} from './OpenCodeContextPartSerializer';
import { OpenCodeMessageNormalizationMapper } from './OpenCodeMessageNormalizationMapper';
import {
  OpenCodePromptRequestBuilder,
} from './OpenCodePromptRequestBuilder';
import {
  OpenCodeSessionLifecycleCoordinator,
  type Message,
  type Part,
  type Session,
} from './OpenCodeSessionLifecycleCoordinator';
import {
  OpenCodeStreamEventTransformer,
  type OpenCodeSSEEvent,
  type OpenCodeStreamEvent,
  type OpenCodeStreamEventState,
} from './OpenCodeStreamEventTransformer';
import {
  OpenCodeStreamingRuntimeCoordinator,
  OpenCodeStreamingRuntimeContext,
} from './OpenCodeStreamingRuntimeCoordinator';
import {
  OpenCodeSyncEventRuntimeCoordinator,
  type SessionActivityStatus,
  type SessionSyncEventUpdate,
} from './OpenCodeSyncEventRuntimeCoordinator';
import { OpenCodeSdkFacade } from './OpenCodeSdkFacade';
import type { SdkFeatureFlags } from './sdkFeatureFlags';
import { resolveSdkFeatureFlags } from './sdkFeatureFlags';
import type { SdkEvent, SdkOpencodeClient } from './sdkTypes';
import { ServerManager } from './ServerManager';
import type {
  ManagedServerState,
  McpServerSnapshot,
  McpServerStatus,
  OpenCodeCapabilitySnapshot,
  OpenCodeServerConfig,
  QueryOptions,
  ResponseHandler,
  ServerDiagnostics,
  ServerStatus,
  ToolCatalogEntry,
  ToolCatalogSnapshot,
} from './types';

const logger = createLogger('OpenCodeService');
const TRANSIENT_CONNECTIVITY_ERROR_PATTERNS = [
  /net::ERR_CONNECTION_REFUSED/i,
  /net::ERR_CONNECTION_RESET/i,
  /\bECONNREFUSED\b/i,
  /\bECONNRESET\b/i,
];

export type { SessionActivityStatus, SessionSyncEventUpdate } from './OpenCodeSyncEventRuntimeCoordinator';

function cloneSettings(settings: OpenCodianSettings): OpenCodianSettings {
  return JSON.parse(JSON.stringify(settings)) as OpenCodianSettings;
}

/** Service events */
interface OpenCodeServiceEvents {
  onServerStatusChange?: (status: string) => void;
  onError?: (error: Error) => void;
  onModelsLoaded?: (providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>) => void;
}

interface OpenCodeServiceRuntimeOptions {
  initialManagedServerState?: ManagedServerState | null;
  onManagedServerStateChange?: (state: ManagedServerState | null) => void;
  sdkFeatureFlags?: Partial<SdkFeatureFlags>;
}

interface ToolStateData {
  status: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface ToolPartData extends Part {
  callID?: string;
  tool?: string;
  state?: ToolStateData;
}

function getDebugTextPreview(text: string, maxLength = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function stringifyDebugPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable]';
  }
}

function logAssistantFinalizationDebug(label: string, payload: unknown): void {
  logger.debug(`Assistant stream finalization [${label}]: ${stringifyDebugPayload(payload)}`);
}

function summarizeAssistantParts(parts: Part[]): {
  totalParts: number;
  textPartCount: number;
  textLength: number;
  toolPartCount: number;
  reasoningPartCount: number;
  filePartCount: number;
} {
  let textPartCount = 0;
  let textLength = 0;
  let toolPartCount = 0;
  let reasoningPartCount = 0;
  let filePartCount = 0;

  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      textPartCount += 1;
      textLength += part.text.length;
    } else if (part.type === 'tool') {
      toolPartCount += 1;
    } else if (part.type === 'reasoning' || part.type === 'thinking') {
      reasoningPartCount += 1;
    } else if (part.type === 'file') {
      filePartCount += 1;
    }
  }

  return {
    totalParts: parts.length,
    textPartCount,
    textLength,
    toolPartCount,
    reasoningPartCount,
    filePartCount,
  };
}

interface AssistantMessageResponse {
  info: Message;
  parts: Part[];
}

interface ProviderSendProbeResult {
  providerId: string;
  modelId: string;
  success: boolean;
  responsePreview?: string;
  error?: string;
}

function extractStructuredErrorName(errorLike: unknown): string | null {
  if (!errorLike || typeof errorLike !== 'object') {
    return null;
  }

  const errorRecord = errorLike as { name?: unknown };
  return typeof errorRecord.name === 'string' && errorRecord.name.trim()
    ? errorRecord.name.trim()
    : null;
}

function extractStructuredErrorMessage(errorLike: unknown): string | null {
  if (!errorLike || typeof errorLike !== 'object') {
    return null;
  }

  const errorRecord = errorLike as {
    message?: unknown;
    data?: {
      message?: unknown;
      statusCode?: unknown;
      responseBody?: unknown;
    };
    name?: unknown;
  };

  const baseMessage = typeof errorRecord.data?.message === 'string' && errorRecord.data.message.trim()
    ? errorRecord.data.message.trim()
    : typeof errorRecord.message === 'string' && errorRecord.message.trim()
      ? errorRecord.message.trim()
      : typeof errorRecord.name === 'string' && errorRecord.name.trim()
        ? errorRecord.name.trim()
        : null;

  if (!baseMessage) {
    return null;
  }

  const statusCode = typeof errorRecord.data?.statusCode === 'number'
    ? errorRecord.data.statusCode
    : null;

  if (statusCode === null || baseMessage.toLowerCase().includes(`http ${statusCode}`)) {
    return baseMessage;
  }

  return `${baseMessage} (HTTP ${statusCode})`;
}

interface SessionContextUsageSnapshot {
  sessionId: string;
  sessionTitle: string;
  createdAt: number;
  updatedAt: number;
  providerId: string | null;
  providerName: string | null;
  modelId: string | null;
  modelName: string | null;
  contextWindow: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
}

type StreamingState = OpenCodeStreamEventState;

type SessionTodoUpdate = {
  sessionId: string;
  todos: SessionTodo[];
};

type SessionStatusUpdate = {
  sessionId: string;
  status: SessionActivityStatus;
};

interface TransientConnectivityLogState {
  suppressedCount: number;
}

export class OpenCodeService {
  private static readonly messageNormalizationMapper = new OpenCodeMessageNormalizationMapper();
  readonly sdk: OpenCodeSdkFacade;
  private settings: OpenCodianSettings;
  private events: OpenCodeServiceEvents;
  private serverManager: ServerManager;
  private sessionLifecycle: OpenCodeSessionLifecycleCoordinator;
  private responseHandlers: ResponseHandler[] = [];
  private baseUrl: string;
  private sdkFeatureFlags: SdkFeatureFlags;
  private syncEventRuntime: OpenCodeSyncEventRuntimeCoordinator;
  private catalogState: OpenCodeCatalogStateStore;
  private contextPartSerializer: OpenCodeContextPartSerializer;
  private promptRequestBuilder: OpenCodePromptRequestBuilder;
  private streamEventTransformer: OpenCodeStreamEventTransformer;
  private streamingRuntime: OpenCodeStreamingRuntimeCoordinator;
  private openCodeEventRuntime: OpenCodeEventSubscriptionCoordinator;
  private vaultPath?: string;
  private transientConnectivityLogState: TransientConnectivityLogState | null = null;

  constructor(
    settings: OpenCodianSettings,
    events: OpenCodeServiceEvents = {},
    runtimeOptions: OpenCodeServiceRuntimeOptions = {},
  ) {
    this.settings = cloneSettings(settings);
    this.events = events;
    this.baseUrl = getServerBaseUrl(settings.server);
    this.sdkFeatureFlags = resolveSdkFeatureFlags(runtimeOptions.sdkFeatureFlags);
    this.sdk = new OpenCodeSdkFacade(() => ({
      baseUrl: this.baseUrl,
      authHeaders: this.getAuthHeaders(),
      directory: this.getScopedDirectoryPath(),
    }));
    this.syncEventRuntime = new OpenCodeSyncEventRuntimeCoordinator({
      shouldUseSdkSync: () => this.shouldUseSdk('sdkSync'),
      subscribeToSyncEvents: async (signal) => {
        const response = await this.sdk.global.syncEvent.subscribe({ signal });
        return (response as { stream: AsyncIterable<unknown> }).stream;
      },
      normalizeSessionTodos: (response) => this.normalizeSessionTodos(response),
      normalizeSessionStatus: (status) => this.normalizeSessionStatus(status),
      isTransientConnectivityError: (error) => this.isTransientConnectivityError(error),
      logSyncEventStreamFailure: (error) =>
        this.logServiceWarning('global.sync-event', 'SDK sync event stream failed', error),
      checkHealth: () => this.checkHealth(),
      delay: (ms, signal) => this.delay(ms, signal),
    });
    this.sessionLifecycle = new OpenCodeSessionLifecycleCoordinator({
      shouldUseSdkCrud: () => this.shouldUseSdk('sdkCrud'),
      getSdkSession: () => this.sdk.session,
      postLegacy: (path, body) => this.post(path, body),
      getLegacy: (path) => this.get(path),
      patchLegacy: (path, body) => this.patch(path, body),
      deleteLegacy: (path) => this.delete(path),
      normalizeSessionId: (response) => this.normalizeSessionId(response),
      normalizeSessionMessages: (response) => this.normalizeSessionMessages(response),
      normalizeSessionTodos: (response) => this.normalizeSessionTodos(response),
      normalizeSessionStatuses: (response) => this.normalizeSessionStatuses(response),
      applySessionRevertState: (sessionId, messages) => this.applySessionRevertState(sessionId, messages),
      observeToolNamesInMessages: (messages) => this.observeToolNamesInMessages(messages),
      logServiceWarning: (key, message, error) => this.logServiceWarning(key, message, error),
      logServiceError: (key, message, error) => this.logServiceError(key, message, error),
    }, this.syncEventRuntime);
    this.catalogState = new OpenCodeCatalogStateStore({
      syncOpenCodeEventSubscriptions: () => {
        if (this.openCodeEventRuntime.hasListeners()) {
          this.openCodeEventRuntime.ensureSubscriptions();
          return;
        }

        this.openCodeEventRuntime.stopSubscriptions();
      },
    });
    this.contextPartSerializer = new OpenCodeContextPartSerializer({
      isLocalServerMode: () => this.settings.server.mode === 'local',
      getVaultPath: () => this.vaultPath,
    });
    this.promptRequestBuilder = new OpenCodePromptRequestBuilder({
      getDefaultModelSelection: () => ({
        providerID: this.settings.defaultProvider,
        modelID: this.settings.defaultModel,
      }),
      observeRuntimeToolNames: (toolNames) => this.observeRuntimeToolNames(toolNames),
    });
    this.streamEventTransformer = new OpenCodeStreamEventTransformer({
      observeRuntimeToolNames: (toolNames) => this.observeRuntimeToolNames(toolNames),
      getOpenCodeToolKind: (toolName) =>
        OpenCodeService.messageNormalizationMapper.getOpenCodeToolKind(
          toolName,
          this.buildOpenCodeToolIdentityContext(),
        ),
      normalizeQuestionRequest: (raw) =>
        OpenCodeService.messageNormalizationMapper.normalizeQuestionRequest(raw),
      logStreamingDebug: (label, payload) => logAssistantFinalizationDebug(label, payload),
    });
    this.streamingRuntime = new OpenCodeStreamingRuntimeCoordinator({
      abortSessionOnServer: (sessionId) => this.abortSessionOnServer(sessionId),
    });
    this.openCodeEventRuntime = new OpenCodeEventSubscriptionCoordinator({
      subscribeToEvents: async (source, signal) => {
        const subscription = source === 'event'
          ? await this.getSdkFacade().event.subscribe(undefined, { signal } as never)
          : await this.getSdkFacade({ includeDirectory: false }).global.event({ signal } as never);

        if (!subscription || typeof subscription !== 'object' || !('stream' in subscription)) {
          throw new Error(`Invalid ${source} subscription payload`);
        }

        return (subscription as { stream: AsyncIterable<unknown> }).stream;
      },
      hasCatalogUpdateListeners: () => this.catalogState.hasCatalogUpdateListeners(),
      observeRuntimeToolNames: (toolNames) => this.observeRuntimeToolNames(toolNames),
      emitCatalogUpdate: () => this.catalogState.emitCatalogUpdate(),
      refreshMcpServerStatus: () => this.refreshMcpServerStatus(),
      logEventSubscriptionFailure: (source, error) =>
        this.logServiceWarning(`${source}.subscribe`, `SDK ${source} subscription failed, retrying`, error),
      delay: (ms, signal) => this.delay(ms, signal),
    });

    this.serverManager = new ServerManager(
      this.buildServerConfig(settings),
      {
        onStatusChange: (status) => {
          events.onServerStatusChange?.(status);
          // Auto-fetch models when server starts running
          if (status === 'running') {
            this.resetTransientConnectivityLogState();
            void this.autoFetchModels();
          }
        },
        onError: (error) => {
          events.onError?.(error);
        },
      },
      {
        initialManagedServerState: runtimeOptions.initialManagedServerState,
        onManagedServerStateChange: runtimeOptions.onManagedServerStateChange,
      },
    );
  }

  private static describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private isTransientConnectivityError(error: unknown): boolean {
    const message = OpenCodeService.describeError(error);
    return TRANSIENT_CONNECTIVITY_ERROR_PATTERNS.some((pattern) => pattern.test(message));
  }

  private logTransientConnectivityIssue(level: 'warn' | 'error', message: string, error: unknown): void {
    if (this.transientConnectivityLogState) {
      this.transientConnectivityLogState.suppressedCount += 1;
      return;
    }

    this.transientConnectivityLogState = {
      suppressedCount: 0,
    };

    const nextMessage = `${message} (subsequent offline logs suppressed until the server recovers)`;

    if (level === 'warn') {
      logger.warn(nextMessage, error);
      return;
    }

    logger.error(nextMessage, error);
  }

  private logServiceWarning(key: string, message: string, error: unknown): void {
    if (this.isTransientConnectivityError(error)) {
      this.logTransientConnectivityIssue('warn', message, error);
      return;
    }

    logger.warn(message, error);
  }

  private logServiceError(key: string, message: string, error: unknown): void {
    if (this.isTransientConnectivityError(error)) {
      this.logTransientConnectivityIssue('error', message, error);
      return;
    }

    logger.error(message, error);
  }

  private resetTransientConnectivityLogState(): void {
    this.transientConnectivityLogState = null;
  }

  /** Initialize the service */
  async initialize(): Promise<void> {
    if (isLocalServerMode(this.settings.server) && this.settings.server.local.autoStart) {
      await this.start();
    }
  }

  /** Set the vault path for OpenCode server to use project config */
  setVaultPath(path: string): void {
    const previousDirectory = this.getScopedDirectoryPath();
    this.vaultPath = path;
    this.serverManager.setWorkingDirectory(path);
    if (previousDirectory !== this.getScopedDirectoryPath()) {
      this.catalogState.clearToolSchemaCache();
    }
    this.syncEventRuntime.restartSubscription();
    this.openCodeEventRuntime.restartSubscriptions();
  }

  getSettingsSnapshot(): OpenCodianSettings {
    return cloneSettings(this.settings);
  }

  /** Auto-fetch models when server starts and notify listeners */
  private async autoFetchModels(): Promise<void> {
    try {
      const result = await this.getAvailableModels();
      await Promise.allSettled([
        this.refreshToolIds(),
        this.refreshMcpServerStatus(),
      ]);

      if (result.providers.length === 0) {
        logger.warn('No providers available from server');
      }

      // Notify listeners that models are loaded
      this.events.onModelsLoaded?.(result.providers);
    } catch (error) {
      logger.error('Failed to auto-fetch models:', error);
    }
  }

  /** Start the service and server */
  async start(): Promise<void> {
    if (!this.baseUrl) {
      throw new Error('OpenCode server URL is not configured');
    }

    await this.serverManager.start();
    this.syncEventRuntime.ensureSubscription();
    this.openCodeEventRuntime.ensureSubscriptions();
  }

  /** Stop the service */
  async stop(): Promise<void> {
    this.syncEventRuntime.stopSubscription();
    this.openCodeEventRuntime.stopSubscriptions();
    await this.serverManager.stop();
  }

  dispose(): void {
    this.syncEventRuntime.stopSubscription();
    this.openCodeEventRuntime.stopSubscriptions();
    this.serverManager.dispose();
  }

  /** Check if service is ready */
  isReady(): boolean {
    return this.serverManager.getStatus() === 'running';
  }

  /** Get server status */
  getServerStatus(): ServerStatus {
    return this.serverManager.getStatus();
  }

  getServerDiagnostics(): ServerDiagnostics {
    return this.serverManager.getServerDiagnosticsSnapshot();
  }

  /** Check server health directly */
  async checkHealth(): Promise<boolean> {
    if (!this.baseUrl) {
      return false;
    }

    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const response = await this.getSdkClient().global.health();
        const healthy = this.normalizeHealthResponse(response);
        if (healthy) {
          this.resetTransientConnectivityLogState();
        }
        return healthy;
      } catch (error) {
        this.logServiceWarning('health', 'SDK health check failed, falling back to ServerManager health probe', error);
      }
    }

    const healthy = await this.serverManager.checkHealth(3000);
    if (healthy) {
      this.resetTransientConnectivityLogState();
    }
    return healthy;
  }

  /** Check if plugin has a server process running */
  isServerProcessRunning(): boolean {
    return this.serverManager.isRunning();
  }

  /** HTTP GET helper using Obsidian's requestUrl */
  private async get<T>(path: string, options: { includeDirectory?: boolean } = {}): Promise<T> {
    this.ensureBaseUrl();

    const response = await requestUrl({
      url: this.buildScopedUrl(path, options.includeDirectory ?? false),
      method: 'GET',
      headers: this.getRequestHeaders(),
    });
    
    // Check for error status codes
    if (response.status >= 400) {
      const errorText = response.text?.substring(0, 200) ?? 'Unknown error';
      throw new Error(`HTTP ${response.status} from ${path}: ${errorText}`);
    }
    
    if (typeof response.json === 'object' && response.json !== null) {
      return response.json as T;
    }
    
    // If response is not JSON, try to parse it
    try {
      return JSON.parse(response.text) as T;
    } catch {
      throw new Error(`Invalid JSON response from ${path}: ${response.text.substring(0, 100)}`);
    }
  }

  /** HTTP POST helper using Obsidian's requestUrl */
  private async post<T>(path: string, body: unknown, options: { includeDirectory?: boolean } = {}): Promise<T> {
    this.ensureBaseUrl();

    const response = await requestUrl({
      url: this.buildScopedUrl(path, options.includeDirectory ?? false),
      method: 'POST',
      headers: this.getRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    
    // Check for error status codes
    if (response.status >= 400) {
      const errorText = response.text?.substring(0, 200) ?? 'Unknown error';
      throw new Error(`HTTP ${response.status} from ${path}: ${errorText}`);
    }
    
    // For 204 No Content, return empty object
    if (response.status === 204) {
      return {} as T;
    }
    
    if (typeof response.json === 'object' && response.json !== null) {
      return response.json as T;
    }
    
    // If response is not JSON, try to parse it
    try {
      return JSON.parse(response.text) as T;
    } catch {
      throw new Error(`Invalid JSON response from ${path}: ${response.text.substring(0, 100)}`);
    }
  }

  /** HTTP PATCH helper using Obsidian's requestUrl */
  private async patch<T>(path: string, body: unknown, options: { includeDirectory?: boolean } = {}): Promise<T> {
    this.ensureBaseUrl();

    const response = await requestUrl({
      url: this.buildScopedUrl(path, options.includeDirectory ?? false),
      method: 'PATCH',
      headers: this.getRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });

    if (response.status >= 400) {
      const errorText = response.text?.substring(0, 200) ?? 'Unknown error';
      throw new Error(`HTTP ${response.status} from ${path}: ${errorText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    if (typeof response.json === 'object' && response.json !== null) {
      return response.json as T;
    }

    try {
      return JSON.parse(response.text) as T;
    } catch {
      throw new Error(`Invalid JSON response from ${path}: ${response.text.substring(0, 100)}`);
    }
  }

  /** HTTP DELETE helper using Obsidian's requestUrl */
  private async delete(path: string, options: { includeDirectory?: boolean } = {}): Promise<void> {
    this.ensureBaseUrl();

    await requestUrl({
      url: this.buildScopedUrl(path, options.includeDirectory ?? false),
      method: 'DELETE',
      headers: this.getRequestHeaders(),
    });
  }

  /** Create a new session - returns Session object with id property */
  async createSession(title?: string, options: { setCurrent?: boolean } = {}): Promise<string> {
    return this.sessionLifecycle.createSession(title, options);
  }

  /** Set current session */
  setSessionId(sessionId: string): void {
    this.sessionLifecycle.setSessionId(sessionId);
  }

  /** Get current session ID */
  getSessionId(): string | null {
    return this.sessionLifecycle.getSessionId();
  }

  /** Cancel the current streaming response */
  cancelStream(sessionId?: string): void {
    this.streamingRuntime.cancelStream(sessionId ?? this.sessionLifecycle.getSessionId());
  }

  /** Stop watching the current stream locally without aborting the server-side session */
  detachStream(sessionId?: string): void {
    this.streamingRuntime.detachStream(sessionId ?? this.sessionLifecycle.getSessionId());
  }

  /** List all sessions */
  async listSessions(): Promise<Session[]> {
    return this.sessionLifecycle.listSessions();
  }

  /** Get session messages - OpenCode API returns {info: Message, parts: Part[]}[] */
  async getSessionMessages(sessionId: string): Promise<{ info: Message; parts: Part[] }[]> {
    return this.sessionLifecycle.getSessionMessages(sessionId);
  }

  async getSessionTodos(sessionId: string): Promise<SessionTodo[]> {
    return this.sessionLifecycle.getSessionTodos(sessionId);
  }

  async getSessionStatuses(): Promise<Record<string, SessionActivityStatus>> {
    return this.sessionLifecycle.getSessionStatuses();
  }

  subscribeToSessionTodoUpdates(
    listener: (update: SessionTodoUpdate) => void,
  ): () => void {
    return this.sessionLifecycle.subscribeToSessionTodoUpdates(listener);
  }

  subscribeToSessionStatusUpdates(
    listener: (update: SessionStatusUpdate) => void,
  ): () => void {
    return this.sessionLifecycle.subscribeToSessionStatusUpdates(listener);
  }

  subscribeToSessionSyncEvents(
    listener: (update: SessionSyncEventUpdate) => void,
  ): () => void {
    return this.sessionLifecycle.subscribeToSessionSyncEvents(listener);
  }

  /** Delete a session */
  async deleteSession(sessionId: string): Promise<void> {
    return this.sessionLifecycle.deleteSession(sessionId);
  }

  /** Update a session title */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    return this.sessionLifecycle.updateSessionTitle(sessionId, title);
  }

  /** Send a message and wait for the full assistant response */
  async requestAssistantResponse(
    message: string,
    options: QueryOptions & { sessionId?: string; system?: string },
  ): Promise<ChatMessage | null> {
    const sessionId = options.sessionId ?? this.sessionLifecycle.getSessionId();
    if (!sessionId) {
      throw new Error('No active session');
    }

    const parts = this.contextPartSerializer.buildPromptRequestParts(message, options);

    if (this.shouldUseSdk('sdkPrompt')) {
      const response = await this.getSdkClient().session.prompt(
        this.promptRequestBuilder.buildSdkPromptParameters(sessionId, parts, options),
      );
      if (response && typeof response === 'object' && 'info' in response && 'parts' in response) {
        const typedResponse = response as AssistantMessageResponse;
        const assistantError = extractStructuredErrorMessage(typedResponse.info.error);
        if (assistantError) {
          throw new Error(assistantError);
        }
        return OpenCodeService.openCodeMessageToChatMessage(
          typedResponse.info,
          typedResponse.parts,
          this.vaultPath,
          this.buildOpenCodeToolIdentityContext(),
        );
      }

      throw new Error('Invalid assistant response payload');
    }

    const requestBody = this.promptRequestBuilder.buildLegacyMessageRequestBody(parts, options);

    const response = await this.post<unknown>(`/session/${sessionId}/message`, requestBody);
    if (
      typeof response === 'object'
      && response !== null
      && 'info' in response
      && 'parts' in response
    ) {
      const typedResponse = response as AssistantMessageResponse;
      const assistantError = extractStructuredErrorMessage(typedResponse.info.error);
      if (assistantError) {
        throw new Error(assistantError);
      }
      return OpenCodeService.openCodeMessageToChatMessage(
        typedResponse.info,
        typedResponse.parts,
        this.vaultPath,
        this.buildOpenCodeToolIdentityContext(),
      );
    }

    throw new Error('Invalid assistant response payload');
  }

  async probeProviderResponse(providerId: string, modelId: string): Promise<ProviderSendProbeResult> {
    const normalizedProviderId = providerId.trim();
    const normalizedModelId = modelId.trim();
    if (!normalizedProviderId || !normalizedModelId) {
      throw new Error('Provider probe requires both providerId and modelId');
    }

    const probeSessionId = await this.createSession(`Provider probe: ${normalizedProviderId}`, {
      setCurrent: false,
    });

    try {
      const response = await this.requestAssistantResponse('ping', {
        sessionId: probeSessionId,
        provider: normalizedProviderId,
        model: normalizedModelId,
        system: 'Connectivity probe. Reply with the single word OK.',
        format: { type: 'text' },
      });
      const responsePreview = response?.content?.trim() ?? '';
      if (!responsePreview) {
        throw new Error('OpenCode returned no response.');
      }

      return {
        providerId: normalizedProviderId,
        modelId: normalizedModelId,
        success: true,
        responsePreview: getDebugTextPreview(responsePreview, 120),
      };
    } catch (error) {
      return {
        providerId: normalizedProviderId,
        modelId: normalizedModelId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      try {
        await this.deleteSession(probeSessionId);
      } catch (error) {
        logger.warn(`Failed to delete provider probe session ${probeSessionId}`, error);
      }
    }
  }

  /** Send a message and get streaming response using SSE */
  async *sendMessage(message: string, options: QueryOptions = {}): AsyncGenerator<StreamChunk> {
    const sessionId = options.sessionId ?? this.sessionLifecycle.getSessionId();
    if (!sessionId) {
      yield { type: 'error', content: 'No active session' };
      return;
    }

    if (this.shouldUseSdk('sdkStream')) {
      yield* this.sendMessageWithSdk(message, options, sessionId);
      return;
    }

    const parts = this.contextPartSerializer.buildPromptRequestParts(message, options);

    try {
      const requestBody = this.promptRequestBuilder.buildLegacyStreamRequestBody(parts, options);

      await this.post<void>(`/session/${sessionId}/prompt_async`, requestBody);

      const streamContext = this.streamingRuntime.createActiveStreamContext(sessionId);
      yield { type: 'message_start' };
      try {
        yield* this.consumeLegacyEventStream(sessionId, streamContext);
      } finally {
        this.streamingRuntime.releaseActiveStreamContext(streamContext);
        logger.debug(`Legacy stream ended for session ${sessionId}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
    }
  }

  private shouldUseSdk(flag: keyof SdkFeatureFlags): boolean {
    return this.sdkFeatureFlags[flag];
  }

  private getSdkFacade(options: { includeDirectory?: boolean } = {}): OpenCodeSdkFacade {
    const { includeDirectory = true } = options;
    return new OpenCodeSdkFacade(() => ({
      baseUrl: this.baseUrl,
      authHeaders: this.getAuthHeaders(),
      directory: includeDirectory ? this.getScopedDirectoryPath() : undefined,
    }));
  }

  private getSdkClient(options: { includeDirectory?: boolean } = {}): SdkOpencodeClient {
    const { includeDirectory = true } = options;
    this.ensureBaseUrl();
    return createSdkClient({
      baseUrl: this.baseUrl,
      authHeaders: this.getAuthHeaders(),
      directory: includeDirectory ? this.getScopedDirectoryPath() : undefined,
    });
  }

  private createStreamingState(): StreamingState {
    return {
      lastContent: '',
      lastErrorMessage: null,
      processedToolIds: new Set<string>(),
      toolInputSnapshots: new Map(),
      debugChunkSequence: 0,
      lastTextDelta: null,
    };
  }

  private observeToolNamesInMessages(messages: Array<{ info: Message; parts: Part[] }>): void {
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type !== 'tool') {
          continue;
        }

        const toolName = typeof (part as ToolPartData).tool === 'string'
          ? (part as ToolPartData).tool?.trim()
          : '';
        if (!toolName || isInternalStructuredOutputTool(toolName)) {
          continue;
        }

        this.observeRuntimeToolNames([toolName]);
      }
    }
  }

  private normalizeHealthResponse(response: unknown): boolean {
    if (typeof response === 'boolean') {
      return response;
    }

    if (response && typeof response === 'object' && 'healthy' in response) {
      return Boolean((response as { healthy?: unknown }).healthy);
    }

    return false;
  }

  private normalizeSessionId(response: unknown): string {
    if (typeof response === 'object' && response !== null && 'id' in response) {
      return String((response as { id: unknown }).id);
    }

    throw new Error(`Invalid session response: ${JSON.stringify(response)}`);
  }

  private normalizeSessionMessages(response: unknown): Array<{ info: Message; parts: Part[] }> {
    return Array.isArray(response) ? response as Array<{ info: Message; parts: Part[] }> : [];
  }

  private normalizeSessionTodos(response: unknown): SessionTodo[] {
    const rawTodos = Array.isArray(response)
      ? response
      : response && typeof response === 'object' && 'data' in response && Array.isArray((response as { data?: unknown }).data)
        ? (response as { data: unknown[] }).data
        : [];

    return rawTodos.reduce<SessionTodo[]>((todos, rawTodo) => {
      const todo = this.normalizeSessionTodo(rawTodo);
      if (todo) {
        todos.push(todo);
      }
      return todos;
    }, []);
  }

  private normalizeSessionStatuses(response: unknown): Record<string, SessionActivityStatus> {
    const rawStatuses = response && typeof response === 'object' && 'data' in response
      ? (response as { data?: unknown }).data
      : response;
    if (!rawStatuses || typeof rawStatuses !== 'object' || Array.isArray(rawStatuses)) {
      return {};
    }

    return Object.entries(rawStatuses).reduce<Record<string, SessionActivityStatus>>((statuses, [sessionId, rawStatus]) => {
      const status = this.normalizeSessionStatus(rawStatus);
      if (status) {
        statuses[sessionId] = status;
      }
      return statuses;
    }, {});
  }

  private normalizeSessionTodo(todo: unknown): SessionTodo | null {
    if (!todo || typeof todo !== 'object') {
      return null;
    }

    const raw = todo as Record<string, unknown>;
    const content = typeof raw.content === 'string' ? raw.content.trim() : '';
    const status = raw.status;
    if (!content) {
      return null;
    }

    if (
      status !== 'pending'
      && status !== 'in_progress'
      && status !== 'completed'
      && status !== 'cancelled'
    ) {
      return null;
    }

    const priority = raw.priority;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined;

    return {
      id,
      content,
      status,
      priority: priority === 'low' || priority === 'medium' || priority === 'high'
        ? priority
        : undefined,
    };
  }

  private normalizeSessionStatus(status: unknown): SessionActivityStatus | null {
    if (!status || typeof status !== 'object') {
      return null;
    }

    const raw = status as Record<string, unknown>;
    if (raw.type === 'idle' || raw.type === 'busy') {
      return { type: raw.type };
    }

    if (
      raw.type === 'retry'
      && typeof raw.attempt === 'number'
      && typeof raw.message === 'string'
      && typeof raw.next === 'number'
    ) {
      return {
        type: 'retry',
        attempt: raw.attempt,
        message: raw.message,
        next: raw.next,
      };
    }

    return null;
  }

  private unwrapSdkData<T>(response: unknown): T | undefined {
    if (response && typeof response === 'object' && 'data' in response) {
      return (response as { data?: T }).data;
    }

    return response as T | undefined;
  }

  private async delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (!signal) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(new DOMException('Aborted', 'AbortError'));
      };

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async applySessionRevertState(
    sessionId: string,
    messages: Array<{ info: Message; parts: Part[] }>,
  ): Promise<Array<{ info: Message; parts: Part[] }>> {
    if (messages.length === 0) {
      return messages;
    }

    try {
      const session = await this.getSessionInfo(sessionId);
      const filtered = this.filterMessagesByRevertState(messages, session.revert);
      if (filtered.length !== messages.length && session.revert?.messageID) {
        logger.debug('Applied session revert state while loading messages', {
          sessionId,
          originalCount: messages.length,
          filteredCount: filtered.length,
          revertMessageId: session.revert.messageID,
          revertPartId: session.revert.partID ?? null,
        });
      }
      return filtered;
    } catch (error) {
      this.logServiceWarning('session.get', `Failed to load session info for ${sessionId} while applying revert state`, error);
      return messages;
    }
  }

  private filterMessagesByRevertState(
    messages: Array<{ info: Message; parts: Part[] }>,
    revert: Session['revert'],
  ): Array<{ info: Message; parts: Part[] }> {
    if (!revert?.messageID) {
      return messages;
    }

    const filteredMessages: Array<{ info: Message; parts: Part[] }> = [];
    for (const message of messages) {
      if (message.info.id < revert.messageID) {
        filteredMessages.push(message);
        continue;
      }

      if (message.info.id > revert.messageID) {
        continue;
      }

      if (!revert.partID) {
        continue;
      }

      const removeStart = message.parts.findIndex((part) => part.id === revert.partID);
      if (removeStart < 0) {
        filteredMessages.push(message);
        continue;
      }

      filteredMessages.push({
        ...message,
        parts: message.parts.slice(0, removeStart),
      });
    }

    return filteredMessages;
  }

  private normalizeForkResponse(response: unknown): { id: string; title: string } {
    if (typeof response === 'object' && response !== null && 'id' in response) {
      const typedResponse = response as { id: unknown; title?: unknown };
      return {
        id: String(typedResponse.id),
        title: typeof typedResponse.title === 'string'
          ? typedResponse.title
          : '',
      };
    }

    throw new Error('Invalid fork session response');
  }

  private normalizeRevertResponse(response: unknown): boolean {
    if (response === false) {
      return false;
    }

    if (typeof response === 'object' && response !== null && Object.keys(response).length === 0) {
      return true;
    }

    if (typeof response === 'object' && response !== null && 'id' in response) {
      const responseId = String((response as { id: unknown }).id);
      return responseId.length > 0;
    }

    return response === true;
  }

  private normalizeAvailableModels(
    data: unknown,
  ): {
    providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow?: number }> }>;
    defaults: Record<string, string>;
  } {
    const source = this.unwrapSdkData(data) as {
      providers?: Array<{ id: string; name?: string; models: unknown }>;
      all?: Array<{ id: string; name?: string; models: unknown }>;
      default?: Record<string, string>;
    } | undefined;
    const providers = Array.isArray(source?.providers)
      ? source.providers
      : Array.isArray(source?.all)
        ? source.all
        : [];

    return {
      providers: providers.map((provider) => {
        let models: Array<{ id: string; name: string; contextWindow?: number }> = [];

        if (Array.isArray(provider.models)) {
          models = provider.models.map((modelId) => ({
            id: String(modelId),
            name: String(modelId),
          }));
        } else if (provider.models && typeof provider.models === 'object') {
          models = Object.entries(
            provider.models as Record<string, { name?: string; limit?: { context?: number } }>,
          ).map(([id, info]) => ({
            id,
            name: info.name ?? id,
            contextWindow: typeof info.limit?.context === 'number' ? info.limit.context : undefined,
          }));
        }

        return {
          id: provider.id,
          name: provider.name ?? provider.id,
          models,
        };
      }),
      defaults: this.normalizeProviderDefaults(source?.default),
    };
  }

  private normalizeProviderDefaults(source: unknown): Record<string, string> {
    if (!source || typeof source !== 'object') {
      return {};
    }

    const defaultRecord = source as Record<string, unknown>;
    if (typeof defaultRecord.provider === 'string' && typeof defaultRecord.model === 'string') {
      const providerId = defaultRecord.provider.trim();
      const modelId = defaultRecord.model.trim();
      return providerId && modelId
        ? { [providerId]: modelId }
        : {};
    }

    return Object.fromEntries(
      Object.entries(defaultRecord)
        .map(([providerId, modelId]) => [providerId.trim(), typeof modelId === 'string' ? modelId.trim() : ''] as const)
        .filter(([providerId, modelId]) => providerId.length > 0 && modelId.length > 0),
    );
  }

  private normalizeProviderDirectory(
    data: unknown,
  ): {
    providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow?: number }> }>;
    defaults: Record<string, string>;
    connected: string[];
  } {
    const source = this.unwrapSdkData(data) as {
      connected?: unknown;
    } | undefined;

    return {
      ...this.normalizeAvailableModels(data),
      connected: Array.isArray(source?.connected)
        ? source.connected.filter((item): item is string => typeof item === 'string')
        : [],
    };
  }

  private normalizeResolvedModelConfigData(data: unknown): OpencodeModelConfigSubset {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {};
    }

    const record = data as Record<string, unknown>;
    return {
      model: typeof record.model === 'string' ? record.model : undefined,
      small_model: typeof record.small_model === 'string' ? record.small_model : undefined,
      provider: typeof record.provider === 'object' && record.provider !== null
        ? record.provider as OpencodeModelConfigSubset['provider']
        : undefined,
      enabled_providers: Array.isArray(record.enabled_providers)
        ? record.enabled_providers.filter((item): item is string => typeof item === 'string')
        : undefined,
      disabled_providers: Array.isArray(record.disabled_providers)
        ? record.disabled_providers.filter((item): item is string => typeof item === 'string')
        : undefined,
    };
  }

  private observeRuntimeToolNames(toolNames: Iterable<string>): boolean {
    return this.catalogState.observeRuntimeToolNames(toolNames);
  }

  private buildOpenCodeToolIdentityContext(): OpenCodeCatalogToolIdentityContext {
    return this.catalogState.buildToolIdentityContext();
  }

  private async *consumeLegacyEventStream(
    sessionId: string,
    streamContext: OpenCodeStreamingRuntimeContext,
  ): AsyncGenerator<StreamChunk> {
    const signal = streamContext.signal;
    const eventStream = this.connectSSE(`${this.baseUrl}/event`, signal);
    const state = this.createStreamingState();

    for await (const event of eventStream) {
      if (signal?.aborted) {
        logger.debug('Stream aborted, breaking loop');
        break;
      }

      let eventData: OpenCodeStreamEvent;
      try {
        eventData = JSON.parse(event.data) as OpenCodeStreamEvent;
      } catch {
        continue;
      }

      const outcome = this.streamEventTransformer.handleStreamingEvent(
        eventData,
        sessionId,
        state,
        streamContext,
      );
      for (const chunk of outcome.chunks) {
        yield chunk;
      }

      if (outcome.stop) {
        streamContext.abort();
        break;
      }
    }

    logAssistantFinalizationDebug('service-legacy-event-stream-ended', {
      sessionId,
      accumulatedTextLength: state.lastContent.length,
      lastTextDelta: state.lastTextDelta,
    });
    yield* this.finishStreamingResponse(sessionId, state.lastContent, state.lastErrorMessage);
  }

  private async *sendMessageWithSdk(
    message: string,
    options: QueryOptions,
    sessionId: string,
  ): AsyncGenerator<StreamChunk> {
    const client = this.getSdkClient();
    const parts = this.contextPartSerializer.buildPromptRequestParts(message, options);

    try {
      await client.session.promptAsync(
        this.promptRequestBuilder.buildSdkPromptParameters(sessionId, parts, options),
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
      return;
    }

    const streamContext = this.streamingRuntime.createActiveStreamContext(sessionId);
    const state = this.createStreamingState();
    let yieldedMessageStart = false;

    try {
      const subscription = await client.event.subscribe(undefined, {
        signal: streamContext.signal,
      });
      const iterator = subscription.stream[Symbol.asyncIterator]();

      while (true) {
        let result: IteratorResult<SdkEvent>;
        try {
          result = await iterator.next() as IteratorResult<SdkEvent>;
        } catch (error) {
          if (!yieldedMessageStart) {
            this.logServiceWarning('session.event-stream', 'SDK event stream failed before first event, falling back to legacy SSE', error);
            yield { type: 'message_start' };
            yieldedMessageStart = true;
            yield* this.consumeLegacyEventStream(sessionId, streamContext);
            return;
          }

          throw error;
        }

        if (result.done) {
          break;
        }

        if (!yieldedMessageStart) {
          yield { type: 'message_start' };
          yieldedMessageStart = true;
        }

        const outcome = this.streamEventTransformer.handleStreamingEvent(
          result.value as unknown as OpenCodeStreamEvent,
          sessionId,
          state,
          streamContext,
        );
        for (const chunk of outcome.chunks) {
          yield chunk;
        }

        if (outcome.stop) {
          streamContext.abort();
          break;
        }
      }

      if (!yieldedMessageStart) {
        yield { type: 'message_start' };
      }

      logAssistantFinalizationDebug('service-sdk-event-stream-ended', {
        sessionId,
        accumulatedTextLength: state.lastContent.length,
        lastTextDelta: state.lastTextDelta,
      });
      yield* this.finishStreamingResponse(sessionId, state.lastContent, state.lastErrorMessage);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
    } finally {
      this.streamingRuntime.releaseActiveStreamContext(streamContext);
      logger.debug(`SDK stream ended for session ${sessionId}`);
    }
  }

  private async *finishStreamingResponse(
    sessionId: string,
    lastContent: string,
    priorErrorMessage: string | null = null,
  ): AsyncGenerator<StreamChunk> {
    logAssistantFinalizationDebug('service-finish-start', {
      sessionId,
      lastContentLength: lastContent.length,
      lastContentPreview: getDebugTextPreview(lastContent, 120),
      priorErrorMessage,
    });

    let assistantMessageId: string | null = null;
    try {
      const messages = await this.getSessionMessages(sessionId);
      const assistantMsg = messages.reverse().find((item) => item.info.role === 'assistant');
      if (assistantMsg) {
        assistantMessageId = assistantMsg.info.id;
        logAssistantFinalizationDebug('service-finish-loaded-assistant', {
          sessionId,
          messageCount: messages.length,
          assistantMessageId,
          messageCreatedAt: assistantMsg.info.time.created,
          modelId: OpenCodeMessageNormalizationMapper.formatModelIdentifier(
            assistantMsg.info.providerID,
            assistantMsg.info.modelID,
          ) ?? null,
          structuredPresent: assistantMsg.info.structured !== undefined,
          assistantError: extractStructuredErrorMessage(assistantMsg.info.error),
          partSummary: summarizeAssistantParts(assistantMsg.parts),
        });
        const assistantError = extractStructuredErrorMessage(assistantMsg.info.error);
        if (assistantError && !priorErrorMessage && !lastContent.trim()) {
          logAssistantFinalizationDebug('service-finish-emitting-assistant-error', {
            sessionId,
            assistantMessageId,
            assistantError,
          });
          yield {
            type: 'error',
            content: assistantError,
          };
          priorErrorMessage = assistantError;
        }
        for (const part of assistantMsg.parts) {
          if (part.type !== 'text' || typeof part.text !== 'string') {
            continue;
          }

          const currentText = part.text;
          if (currentText.length <= lastContent.length) {
            continue;
          }

          const delta = currentText.slice(lastContent.length);
          logAssistantFinalizationDebug('service-finish-emitting-trailing-text', {
            sessionId,
            assistantMessageId,
            partId: part.id,
            deltaLength: delta.length,
            previousLength: lastContent.length,
            nextLength: currentText.length,
            deltaPreview: getDebugTextPreview(delta, 120),
          });
          yield { type: 'text', content: delta };
          lastContent = currentText;
        }

        logAssistantFinalizationDebug('service-finish-emitting-message-metadata', {
          sessionId,
          assistantMessageId,
          timestamp: assistantMsg.info.time.created,
          modelId: OpenCodeMessageNormalizationMapper.formatModelIdentifier(
            assistantMsg.info.providerID,
            assistantMsg.info.modelID,
          ) ?? null,
          finalTextLength: lastContent.length,
        });
        yield {
          type: 'message_metadata',
          messageId: assistantMsg.info.id,
          timestamp: assistantMsg.info.time.created,
          modelId: OpenCodeMessageNormalizationMapper.formatModelIdentifier(
            assistantMsg.info.providerID,
            assistantMsg.info.modelID,
          ),
        };
      } else {
        logger.warn('No assistant message found when finalizing stream response', {
          sessionId,
          messageCount: messages.length,
          roles: messages.map((item) => item.info.role),
          lastUserId: messages.filter((item) => item.info.role === 'user').at(-1)?.info.id ?? null,
        });
      }
    } catch (error) {
      logger.error('Final message check failed:', error);
    }

    logAssistantFinalizationDebug('service-finish-emitting-message-stop', {
      sessionId,
      assistantMessageId,
      finalTextLength: lastContent.length,
      finalTextPreview: getDebugTextPreview(lastContent, 120),
    });
    yield { type: 'message_stop' };
  }

  private async abortSessionOnServer(sessionId: string): Promise<void> {
    if (!sessionId) {
      return;
    }

    if (this.shouldUseSdk('sdkAbort')) {
      try {
        await this.getSdkClient().session.abort({ sessionID: sessionId });
        return;
      } catch (error) {
        this.logServiceWarning('session.abort', `SDK session.abort failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    try {
      await this.post(`/session/${sessionId}/abort`, {});
    } catch (error) {
      this.logServiceWarning('session.abort', `Failed to abort session ${sessionId} via legacy HTTP`, error);
    }
  }

  /** Connect to SSE endpoint and yield events */
  private async *connectSSE(url: string, signal?: AbortSignal): AsyncGenerator<OpenCodeSSEEvent> {
    this.ensureBaseUrl();

    
    // Check if already aborted
    if (signal?.aborted) {

      return;
    }
    
    // Use native fetch for streaming support

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getRequestHeaders({
        'Accept': 'text/event-stream',
      }),
      signal, // Pass signal to fetch to allow cancellation
    });


    
    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('SSE response has no body');
    }


    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aborted = false;

    // Handle abort signal
    const abortHandler = () => {

      aborted = true;
      void reader.cancel();
    };
    
    signal?.addEventListener('abort', abortHandler);

    try {
      while (true) {
        // Check if aborted before reading
        if (aborted || signal?.aborted) {
  
          break;
        }

        let readResult: ReadableStreamReadResult<Uint8Array>;
        try {
          readResult = await reader.read();
        } catch (readError) {
          // Handle abort error gracefully
          if (signal?.aborted || aborted) {

            break;
          }
          // Re-throw other errors
          throw readError;
        }
        
        const { done, value } = readResult;
        
        if (done) {

          break;
        }

        // Check abort again after read
        if (aborted || signal?.aborted) {

          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        // Print full chunk if it contains message.part.delta
/*         if (chunk.includes('message.part.delta')) {

        } else {

        } */
        buffer += chunk;
        
        // Process complete events in buffer
        const events = this.streamEventTransformer.parseSSEEvents(buffer);
        buffer = events.remaining;
        
/*         if (events.events.length > 0) {

        } */
        
        for (const event of events.events) {
          yield event;
        }
      }

      // Process any remaining data
      if (buffer.trim() && !aborted && !signal?.aborted) {
        const events = this.streamEventTransformer.parseSSEEvents(buffer + '\n\n');
        for (const event of events.events) {
          yield event;
        }
      }
    } catch (error) {
      // Handle abort errors gracefully - don't throw when aborted
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {

        return;
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', abortHandler);
      reader.releaseLock();

    }
  }

  /** Get available models - Handles both string array and object formats */
  async getAvailableModels(
    options: { includeDirectory?: boolean; debugReason?: string | null } = {},
  ): Promise<{ providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow?: number }> }>; defaults: Record<string, string> }> {
    const { includeDirectory = true, debugReason = null } = options;
    const shouldLogDebug = typeof debugReason === 'string' && debugReason.trim().length > 0;
    if (shouldLogDebug) {
      logger.debug('getAvailableModels request', {
        debugReason,
        includeDirectory,
        baseUrl: this.baseUrl,
        vaultPath: this.vaultPath ?? null,
        serverStatus: this.serverManager.getStatus(),
        isManagedServerRunning: this.serverManager.isRunning(),
        managedServerState: this.serverManager.getManagedServerStateSnapshot(),
        sdkCrudEnabled: this.shouldUseSdk('sdkCrud'),
      });
    }
    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const data = await this.getSdkClient({ includeDirectory }).config.providers();
        const normalized = this.normalizeAvailableModels(data);
        if (shouldLogDebug) {
          logger.debug('getAvailableModels sdk response', {
            debugReason,
            includeDirectory,
            providerIds: normalized.providers.map((provider) => provider.id),
            providerModelCounts: normalized.providers.map((provider) => ({
              id: provider.id,
              modelCount: provider.models.length,
            })),
            defaults: normalized.defaults,
          });
        }
        return normalized;
      } catch (error) {
        this.logServiceWarning('config.providers', 'SDK config.providers failed, falling back to legacy HTTP', error);
      }
    }

    try {
      const data = await this.get<{ providers: Array<{ id: string; name: string; models: unknown }>; default: { provider?: string; model?: string } }>(
        '/config/providers',
        { includeDirectory },
      );
      

      
      const normalized = this.normalizeAvailableModels({
        providers: data.providers,
        default: data.default?.provider && data.default?.model
          ? { [data.default.provider]: data.default.model }
          : {},
      });
      if (shouldLogDebug) {
        logger.debug('getAvailableModels legacy response', {
          debugReason,
          includeDirectory,
          providerIds: normalized.providers.map((provider) => provider.id),
          providerModelCounts: normalized.providers.map((provider) => ({
            id: provider.id,
            modelCount: provider.models.length,
          })),
          defaults: normalized.defaults,
        });
      }
      return normalized;
    } catch (error) {
      this.logServiceError('config.providers', 'Failed to get models:', error);
      return { providers: [], defaults: {} };
    }
  }

  async getProviderDirectory(
    options: { includeDirectory?: boolean; debugReason?: string | null } = {},
  ): Promise<{
    providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow?: number }> }>;
    defaults: Record<string, string>;
    connected: string[];
  }> {
    const { includeDirectory = true, debugReason = null } = options;
    const shouldLogDebug = typeof debugReason === 'string' && debugReason.trim().length > 0;
    if (shouldLogDebug) {
      logger.debug('getProviderDirectory request', {
        debugReason,
        includeDirectory,
        baseUrl: this.baseUrl,
        vaultPath: this.vaultPath ?? null,
        serverStatus: this.serverManager.getStatus(),
        isManagedServerRunning: this.serverManager.isRunning(),
        managedServerState: this.serverManager.getManagedServerStateSnapshot(),
        sdkCrudEnabled: this.shouldUseSdk('sdkCrud'),
      });
    }

    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const data = await this.getSdkClient({ includeDirectory }).provider.list();
        const normalized = this.normalizeProviderDirectory(data);
        if (shouldLogDebug) {
          logger.debug('getProviderDirectory sdk response', {
            debugReason,
            includeDirectory,
            providerIds: normalized.providers.map((provider) => provider.id),
            providerModelCounts: normalized.providers.map((provider) => ({
              id: provider.id,
              modelCount: provider.models.length,
            })),
            connected: normalized.connected,
            defaults: normalized.defaults,
          });
        }
        return normalized;
      } catch (error) {
        this.logServiceWarning('provider.list', 'SDK provider.list failed, falling back to legacy HTTP', error);
      }
    }

    try {
      const data = await this.get<{
        all: Array<{ id: string; name: string; models: unknown }>;
        default: Record<string, string>;
        connected?: string[];
      }>('/provider', { includeDirectory });
      const normalized = this.normalizeProviderDirectory(data);
      if (shouldLogDebug) {
        logger.debug('getProviderDirectory legacy response', {
          debugReason,
          includeDirectory,
          providerIds: normalized.providers.map((provider) => provider.id),
          providerModelCounts: normalized.providers.map((provider) => ({
            id: provider.id,
            modelCount: provider.models.length,
          })),
          connected: normalized.connected,
          defaults: normalized.defaults,
        });
      }
      return normalized;
    } catch (error) {
      this.logServiceError('provider.list', 'Failed to get provider directory:', error);
      return { providers: [], defaults: {}, connected: [] };
    }
  }

  async getResolvedModelConfig(
    options: { includeDirectory?: boolean; debugReason?: string | null } = {},
  ): Promise<OpencodeModelConfigSubset> {
    const { includeDirectory = true, debugReason = null } = options;
    const shouldLogDebug = typeof debugReason === 'string' && debugReason.trim().length > 0;
    if (shouldLogDebug) {
      logger.debug('getResolvedModelConfig request', {
        debugReason,
        includeDirectory,
        baseUrl: this.baseUrl,
        vaultPath: this.vaultPath ?? null,
        serverStatus: this.serverManager.getStatus(),
        isManagedServerRunning: this.serverManager.isRunning(),
        managedServerState: this.serverManager.getManagedServerStateSnapshot(),
        sdkCrudEnabled: this.shouldUseSdk('sdkCrud'),
      });
    }

    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const data = await this.getSdkClient({ includeDirectory }).config.get();
        const resolved = this.normalizeResolvedModelConfigData(this.unwrapSdkData(data));
        if (shouldLogDebug) {
          logger.debug('getResolvedModelConfig sdk response', {
            debugReason,
            includeDirectory,
            providerIds: Object.keys(resolved.provider ?? {}),
            enabledProviders: [...(resolved.enabled_providers ?? [])],
            disabledProviders: [...(resolved.disabled_providers ?? [])],
          });
        }
        return resolved;
      } catch (error) {
        this.logServiceWarning('config.get', 'SDK config.get failed, falling back to legacy HTTP', error);
      }
    }

    try {
      const data = await this.get<Record<string, unknown>>('/config', { includeDirectory });
      const resolved = this.normalizeResolvedModelConfigData(data);
      if (shouldLogDebug) {
        logger.debug('getResolvedModelConfig legacy response', {
          debugReason,
          includeDirectory,
          providerIds: Object.keys(resolved.provider ?? {}),
          enabledProviders: [...(resolved.enabled_providers ?? [])],
          disabledProviders: [...(resolved.disabled_providers ?? [])],
        });
      }
      return resolved;
    } catch (error) {
      this.logServiceError('config.get', 'Failed to get resolved model config:', error);
      return {};
    }
  }

  /** Update settings */
  async updateSettings(settings: OpenCodianSettings): Promise<void> {
    const previousSettings = this.settings;
    const previousMode = previousSettings.server.mode;
    const nextMode = settings.server.mode;
    const previousToolCatalogScope = this.getToolCatalogScopeKey();
    const serverConfigChanged =
      previousSettings.server.local.host !== settings.server.local.host ||
      previousSettings.server.local.port !== settings.server.local.port;
    const authChanged =
      previousSettings.server.auth.type !== settings.server.auth.type ||
      previousSettings.server.auth.username !== settings.server.auth.username ||
      previousSettings.server.auth.password !== settings.server.auth.password ||
      previousSettings.server.auth.token !== settings.server.auth.token;
    const shouldRestartManagedServer =
      this.serverManager.isRunning() &&
      nextMode === 'local' &&
      (
        previousMode !== nextMode
        || serverConfigChanged
        || authChanged
        || previousSettings.modelSourceMode !== settings.modelSourceMode
        || previousSettings.pluginIsolationMode !== settings.pluginIsolationMode
      );
    const shouldStopManagedServer =
      this.serverManager.isRunning() &&
      previousMode === 'local' &&
      nextMode !== 'local';

    if (
      this.serverManager.isRunning() &&
      previousMode === 'local' &&
      nextMode === 'local' &&
      serverConfigChanged
    ) {
      const endpointAvailable = await this.serverManager.canBindLocalEndpoint(
        settings.server.local.host,
        settings.server.local.port,
      );
      if (!endpointAvailable) {
        throw new Error(`Cannot switch to ${settings.server.local.host}:${settings.server.local.port}. The target port is already in use.`);
      }
    }

    const nextSettings = cloneSettings(settings);
    const previousBaseUrl = this.baseUrl;
    const shouldResumeSyncEvents = this.syncEventRuntime.hasListeners();
    const shouldResumeOpenCodeEvents = this.openCodeEventRuntime.hasListeners();
    this.settings = nextSettings;
    this.baseUrl = getServerBaseUrl(nextSettings.server);
    this.serverManager.updateConfig(this.buildServerConfig(nextSettings));
    if (previousToolCatalogScope !== this.getToolCatalogScopeKey()) {
      this.catalogState.clearToolSchemaCache();
    }
    this.syncEventRuntime.stopSubscription(shouldResumeSyncEvents);
    this.openCodeEventRuntime.stopSubscriptions(shouldResumeOpenCodeEvents);

    try {
      if (shouldStopManagedServer) {
        await this.serverManager.stop();
        this.syncEventRuntime.ensureSubscription();
        this.openCodeEventRuntime.ensureSubscriptions();
        return;
      }

      if (shouldRestartManagedServer) {
        await this.serverManager.restart();
      }

      this.syncEventRuntime.ensureSubscription();
      this.openCodeEventRuntime.ensureSubscriptions();
    } catch (error) {
      this.settings = previousSettings;
      this.baseUrl = previousBaseUrl;
      this.serverManager.updateConfig(this.buildServerConfig(previousSettings));
      if (previousToolCatalogScope !== this.getToolCatalogScopeKey()) {
        this.catalogState.clearToolSchemaCache();
      }
      this.syncEventRuntime.stopSubscription(shouldResumeSyncEvents);
      this.openCodeEventRuntime.stopSubscriptions(shouldResumeOpenCodeEvents);
      if (previousMode === 'local' && (shouldRestartManagedServer || shouldStopManagedServer)) {
        try {
          await this.serverManager.start();
        } catch (restoreError) {
          logger.error('Failed to restore previous OpenCode server after settings update failure:', restoreError);
        }
      }
      this.syncEventRuntime.ensureSubscription();
      this.openCodeEventRuntime.ensureSubscriptions();
      throw error;
    }
  }

  async getSessionContextUsageSnapshot(sessionId: string): Promise<SessionContextUsageSnapshot | null> {
    if (!sessionId) {
      return null;
    }

    try {
      const [session, messages, providersResult] = await Promise.all([
        this.getSessionInfo(sessionId),
        this.getSessionMessages(sessionId),
        this.getAvailableModels(),
      ]);

      const totalCost = messages.reduce(
        (sum, message) => sum + (message.info.role === 'assistant' ? (message.info.cost ?? 0) : 0),
        0,
      );

      const latestAssistantWithTokens = OpenCodeService.findLatestAssistantWithTokens(messages);

      const providerId = latestAssistantWithTokens?.info.providerID ?? null;
      const modelId = latestAssistantWithTokens?.info.modelID ?? null;
      const provider = providerId
        ? providersResult.providers.find((item) => item.id === providerId)
        : undefined;
      const model = provider && modelId
        ? provider.models.find((item) => item.id === modelId)
        : undefined;
      const tokens = latestAssistantWithTokens?.info.tokens;

      return {
        sessionId,
        sessionTitle: session.title,
        createdAt: session.time.created,
        updatedAt: latestAssistantWithTokens?.info.time.created ?? session.time.updated,
        providerId,
        providerName: provider?.name ?? providerId,
        modelId,
        modelName: model?.name ?? modelId,
        contextWindow: model?.contextWindow ?? 0,
        inputTokens: tokens?.input ?? 0,
        outputTokens: tokens?.output ?? 0,
        reasoningTokens: tokens?.reasoning ?? 0,
        cacheReadTokens: tokens?.cache?.read ?? 0,
        cacheWriteTokens: tokens?.cache?.write ?? 0,
        totalCost,
      };
    } catch (error) {
      this.logServiceError('session.context-usage', `Failed to get session context usage snapshot for ${sessionId}:`, error);
      return null;
    }
  }

  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    if (this.shouldUseSdk('sdkCrud')) {
      const response = await this.getSdkClient().session.fork({
        sessionID: sessionId,
        messageID,
      });
      return this.normalizeForkResponse(response);
    }

    const response = await this.post<unknown>(`/session/${sessionId}/fork`, messageID ? { messageID } : {});
    return this.normalizeForkResponse(response);
  }

  async revertSession(sessionId: string, messageID: string, partID?: string): Promise<boolean> {
    const payload: Record<string, string> = { messageID };
    if (partID) {
      payload.partID = partID;
    }

    logger.debug('Revert session request', {
      sessionId,
      messageID,
      partID: partID ?? null,
    });

    const response = this.shouldUseSdk('sdkCrud')
      ? await this.getSdkClient().session.revert({
          sessionID: sessionId,
          messageID,
          partID,
        })
      : await this.post<unknown>(`/session/${sessionId}/revert`, payload);
    logger.debug('Revert session raw response', {
      sessionId,
      messageID,
      response,
    });

    const normalized = this.normalizeRevertResponse(response);
    logger.debug('Revert session normalized boolean result', {
      sessionId,
      messageID,
      normalized,
    });
    return normalized;
  }

  async unrevertSession(sessionId: string): Promise<boolean> {
    const response = this.shouldUseSdk('sdkCrud')
      ? await this.getSdkClient().session.unrevert({
          sessionID: sessionId,
        })
      : await this.post<unknown>(`/session/${sessionId}/unrevert`, {});

    return this.normalizeRevertResponse(response);
  }

  async getSessionRevertState(
    sessionId: string,
  ): Promise<{ messageID: string; partID?: string } | null> {
    const session = await this.getSessionInfo(sessionId);
    return session.revert?.messageID ? session.revert : null;
  }

  async getPendingQuestions(): Promise<ChatQuestionRequest[]> {
    const normalizeResponse = (response: unknown): ChatQuestionRequest[] => {
      const rawRequests = Array.isArray(response)
        ? response
        : response && typeof response === 'object' && 'data' in response && Array.isArray((response as { data?: unknown }).data)
          ? (response as { data: unknown[] }).data
          : [];

      return rawRequests.reduce<ChatQuestionRequest[]>((requests, rawRequest) => {
        const normalized = OpenCodeService.messageNormalizationMapper.normalizeQuestionRequest(rawRequest);
        if (normalized) {
          requests.push(normalized);
        }
        return requests;
      }, []);
    };

    if (this.shouldUseSdk('sdkQuestions')) {
      try {
        const response = await this.getSdkClient().question.list();
        return normalizeResponse(response);
      } catch (error) {
        this.logServiceWarning('question.list', 'SDK question.list failed, falling back to legacy HTTP', error);
      }
    }

    try {
      const response = await this.get<unknown>('/question');
      return normalizeResponse(response);
    } catch (error) {
      this.logServiceError('question.list', 'Failed to get pending questions:', error);
      return [];
    }
  }

  async replyToQuestion(requestID: string, answers: string[][]): Promise<void> {
    if (this.shouldUseSdk('sdkQuestions')) {
      try {
        await this.getSdkClient().question.reply({
          requestID,
          answers,
        });
        return;
      } catch (error) {
        this.logServiceWarning('question.reply', 'SDK question.reply failed, falling back to legacy HTTP', error);
      }
    }

    await this.post(`/question/${requestID}/reply`, { answers });
  }

  async rejectQuestion(requestID: string): Promise<void> {
    if (this.shouldUseSdk('sdkQuestions')) {
      try {
        await this.getSdkClient().question.reject({
          requestID,
        });
        return;
      } catch (error) {
        this.logServiceWarning('question.reject', 'SDK question.reject failed, falling back to legacy HTTP', error);
      }
    }

    await this.post(`/question/${requestID}/reject`, {});
  }

  async getSessionDiff(sessionId: string, messageID?: string): Promise<SessionDiffEntry[]> {
    const normalizeResponse = (response: unknown): SessionDiffEntry[] => {
      const rawEntries = this.unwrapSdkData<unknown[]>(response);
      const normalizedEntries = Array.isArray(rawEntries) ? rawEntries : [];

      return normalizedEntries.reduce<SessionDiffEntry[]>((entries, rawEntry) => {
        if (!rawEntry || typeof rawEntry !== 'object') {
          return entries;
        }

        const entry = rawEntry as {
          file?: unknown;
          patch?: unknown;
          before?: unknown;
          after?: unknown;
          additions?: unknown;
          deletions?: unknown;
          status?: unknown;
        };
        if (typeof entry.file !== 'string' || !entry.file.trim()) {
          return entries;
        }

        entries.push({
          file: entry.file,
          patch: typeof entry.patch === 'string' ? entry.patch : undefined,
          before: typeof entry.before === 'string' ? entry.before : undefined,
          after: typeof entry.after === 'string' ? entry.after : undefined,
          additions: typeof entry.additions === 'number' ? entry.additions : 0,
          deletions: typeof entry.deletions === 'number' ? entry.deletions : 0,
          status: entry.status === 'added' || entry.status === 'deleted' || entry.status === 'modified'
            ? entry.status
            : undefined,
        });
        return entries;
      }, []);
    };

    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const response = await this.getSdkClient().session.diff({
          sessionID: sessionId,
          messageID,
        });
        return normalizeResponse(response);
      } catch (error) {
        this.logServiceWarning('session.diff', `SDK session.diff failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    const query = messageID ? `?messageID=${encodeURIComponent(messageID)}` : '';
    try {
      const response = await this.get<unknown>(`/session/${sessionId}/diff${query}`);
      return normalizeResponse(response);
    } catch (error) {
      this.logServiceError('session.diff', `Failed to get session diff for ${sessionId}:`, error);
      return [];
    }
  }

  private async getSessionInfo(sessionId: string): Promise<Session> {
    if (this.shouldUseSdk('sdkCrud')) {
      try {
        return await this.getSdkClient().session.get({ sessionID: sessionId }) as unknown as Session;
      } catch (error) {
        this.logServiceWarning('session.get', `SDK session.get failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    return this.get<Session>(`/session/${sessionId}`);
  }

  private buildServerConfig(settings: OpenCodianSettings): OpenCodeServerConfig {
    return {
      mode: settings.server.mode,
      baseUrl: getServerBaseUrl(settings.server),
      local: settings.server.local,
      auth: settings.server.auth,
      modelSourceMode: settings.modelSourceMode,
      pluginIsolationMode: settings.pluginIsolationMode,
    };
  }

  private ensureBaseUrl(): void {
    if (!this.baseUrl) {
      throw new Error('OpenCode server URL is not configured');
    }
  }

  private buildScopedUrl(path: string, includeDirectory: boolean): string {
    const url = new URL(`${this.baseUrl}${path}`);
    const directory = includeDirectory ? this.getScopedDirectoryPath() : undefined;
    if (directory && !url.searchParams.has('directory')) {
      url.searchParams.set('directory', directory);
    }
    return url.toString();
  }

  private getScopedDirectoryPath(): string | undefined {
    if (!this.vaultPath) {
      return undefined;
    }

    return normalizeContextPath(this.vaultPath);
  }

  private getRequestHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const authHeaders = this.getAuthHeaders();
    return {
      ...authHeaders,
      ...extraHeaders,
    };
  }

  private getAuthHeaders(): Record<string, string> {
    const { auth } = this.settings.server;

    if (auth.type === 'basic') {
      const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      return {
        Authorization: `Basic ${credentials}`,
      };
    }

    if (auth.type === 'bearer' && auth.token.trim()) {
      return {
        Authorization: `Bearer ${auth.token.trim()}`,
      };
    }

    return {};
  }

  private static findLatestAssistantWithTokens(
    messages: Array<{ info: Message; parts: Part[] }>,
  ): { info: Message; parts: Part[] } | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.info.role !== 'assistant') {
        continue;
      }

      const tokens = message.info.tokens;
      if (!tokens) {
        continue;
      }

      const total = (tokens.input ?? 0)
        + (tokens.output ?? 0)
        + (tokens.reasoning ?? 0)
        + (tokens.cache?.read ?? 0)
        + (tokens.cache?.write ?? 0);
      if (total <= 0) {
        continue;
      }

      return message;
    }

    return null;
  }

  /** Convert OpenCode message to ChatMessage */
  static openCodeMessageToChatMessage(
    info: Message,
    parts: Part[],
    vaultPath?: string,
    toolIdentityContext: OpenCodeCatalogToolIdentityContext = {},
  ): ChatMessage {
    return OpenCodeService.messageNormalizationMapper.openCodeMessageToChatMessage(
      info,
      parts,
      vaultPath,
      toolIdentityContext,
    );
  }

  async refreshToolIds(): Promise<string[]> {
    const toolIds = await this.sdk.tool.ids();
    return this.catalogState.updateRegistryToolIds(Array.isArray(toolIds) ? toolIds : []);
  }

  async listTools(
    providerID: string,
    modelID: string,
    options: { refresh?: boolean } = {},
  ): Promise<ToolCatalogEntry[]> {
    const normalizedProviderID = providerID.trim();
    const normalizedModelID = modelID.trim();
    const modelKey = this.getToolSchemaCacheKey(normalizedProviderID, normalizedModelID);

    if (!options.refresh && this.catalogState.hasToolSchemaCache(modelKey)) {
      return this.catalogState.getToolSchemaCache(modelKey);
    }

    const response = await this.sdk.tool.list({
      provider: normalizedProviderID,
      model: normalizedModelID,
    });
    const tools = Array.isArray(response)
      ? response.reduce<ToolCatalogEntry[]>((items, item) => {
        if (!item || typeof item !== 'object') {
          return items;
        }

        const candidate = item as { id?: unknown; description?: unknown; parameters?: unknown };
        if (typeof candidate.id !== 'string' || typeof candidate.description !== 'string') {
          return items;
        }

        items.push({
          id: candidate.id,
          description: candidate.description,
          parameters: candidate.parameters,
        });
        return items;
      }, [])
      : [];

    return this.catalogState.updateToolSchemaCache(modelKey, tools);
  }

  private getToolCatalogScopeKey(): string {
    return `${this.baseUrl}::${this.getScopedDirectoryPath() ?? ''}`;
  }

  private getToolSchemaCacheKey(providerID: string, modelID: string): string {
    return `${this.getToolCatalogScopeKey()}::${providerID}::${modelID}`;
  }

  async refreshMcpServerStatus(): Promise<Record<string, McpServerStatus>> {
    return this.catalogState.updateMcpServerStatus(
      this.catalogState.normalizeMcpServerStatusMap(await this.sdk.mcp.status()),
    );
  }

  getToolCatalogSnapshot(): ToolCatalogSnapshot {
    return this.catalogState.getToolCatalogSnapshot();
  }

  getMcpServerSnapshot(): McpServerSnapshot {
    return this.catalogState.getMcpServerSnapshot();
  }

  getCapabilitySnapshot(): OpenCodeCapabilitySnapshot {
    return this.catalogState.getCapabilitySnapshot();
  }

  subscribeToOpenCodeEvents(listener: OpenCodeEventListener): () => void {
    return this.openCodeEventRuntime.subscribeToOpenCodeEvents(listener);
  }

  subscribeToCatalogUpdates(listener: CatalogUpdateListener): () => void {
    return this.catalogState.subscribeToCatalogUpdates(listener);
  }

  hydrateOpenCodeMessage(
    info: Message,
    parts: Part[],
    vaultPath = this.vaultPath,
  ): ChatMessage {
    return OpenCodeService.openCodeMessageToChatMessage(
      info,
      parts,
      vaultPath,
      this.buildOpenCodeToolIdentityContext(),
    );
  }

  async getMcpStatus(): Promise<Record<string, McpServerStatus>> {
    return this.refreshMcpServerStatus();
  }

  async addMcpServer(name: string, config: Record<string, unknown>): Promise<Record<string, McpServerStatus>> {
    const response = await this.sdk.mcp.add({ name, config: config as never });
    return this.catalogState.updateMcpServerStatus(this.catalogState.normalizeMcpServerStatusMap(response));
  }

  async connectMcpServer(name: string): Promise<boolean> {
    const response = await this.sdk.mcp.connect({ name });
    await this.refreshMcpServerStatus();
    return response === true;
  }

  async disconnectMcpServer(name: string): Promise<boolean> {
    const response = await this.sdk.mcp.disconnect({ name });
    await this.refreshMcpServerStatus();
    return response === true;
  }

  async startMcpAuth(name: string): Promise<unknown> {
    return this.sdk.mcp.auth.start({ name });
  }

  async completeMcpAuth(name: string, code: string): Promise<McpServerStatus> {
    const response = await this.sdk.mcp.auth.callback({ name, code });
    await this.refreshMcpServerStatus();
    return this.catalogState.normalizeMcpServerStatusMap({ [name]: response })[name]
      ?? { status: 'failed', error: 'Unknown MCP auth result' };
  }

  async authenticateMcp(name: string): Promise<McpServerStatus> {
    const response = await this.sdk.mcp.auth.authenticate({ name });
    await this.refreshMcpServerStatus();
    return this.catalogState.normalizeMcpServerStatusMap({ [name]: response })[name]
      ?? { status: 'failed', error: 'Unknown MCP auth result' };
  }

  async removeMcpAuth(name: string): Promise<{ success: true }> {
    const response = await this.sdk.mcp.auth.remove({ name });
    return response && typeof response === 'object' && 'success' in (response as Record<string, unknown>)
      ? (response as unknown as { success: true })
      : { success: true };
  }

  async initializeSession(sessionId: string, providerID: string, modelID: string, messageID: string): Promise<boolean> {
    return (await this.sdk.session.init({ sessionID: sessionId, providerID, modelID, messageID })) === true;
  }

  async getSessionChildren(sessionId: string): Promise<Session[]> {
    const response = await this.sdk.session.children({ sessionID: sessionId });
    return Array.isArray(response) ? response as Session[] : [];
  }

  async shareSession(sessionId: string): Promise<Session> {
    return await this.sdk.session.share({ sessionID: sessionId }) as unknown as Session;
  }

  async unshareSession(sessionId: string): Promise<Session> {
    return await this.sdk.session.unshare({ sessionID: sessionId }) as unknown as Session;
  }

  async summarizeSession(sessionId: string, providerID: string, modelID: string, auto = false): Promise<boolean> {
    return (await this.sdk.session.summarize({ sessionID: sessionId, providerID, modelID, auto })) === true;
  }

  async getSessionMessage(sessionId: string, messageId: string): Promise<{ info: Message; parts: Part[] }> {
    return this.sdk.session.message({ sessionID: sessionId, messageID: messageId }) as Promise<{ info: Message; parts: Part[] }>;
  }

  async deleteSessionMessage(sessionId: string, messageId: string): Promise<boolean> {
    return (await this.sdk.session.deleteMessage({ sessionID: sessionId, messageID: messageId })) === true;
  }

  async runSessionCommand(
    sessionId: string,
    input: { command: string; arguments: string; agent?: string; model?: string; messageID?: string; variant?: string; parts?: unknown[] },
  ): Promise<{ info: Message; parts: Part[] }> {
    return this.sdk.session.command({
      sessionID: sessionId,
      ...input,
    } as never) as Promise<{ info: Message; parts: Part[] }>;
  }

  async runSessionShell(
    sessionId: string,
    input: { agent: string; command: string; model?: { providerID: string; modelID: string }; messageID?: string },
  ): Promise<{ info: Message; parts: Part[] }> {
    return this.sdk.session.shell({
      sessionID: sessionId,
      ...input,
    }) as Promise<{ info: Message; parts: Part[] }>;
  }

  async updateMessagePart(sessionId: string, messageId: string, partId: string, part: Part): Promise<Part> {
    return await this.sdk.part.update({
      sessionID: sessionId,
      messageID: messageId,
      partID: partId,
      body: part as never,
    } as never) as Part;
  }

  async deleteMessagePart(sessionId: string, messageId: string, partId: string): Promise<boolean> {
    return (await this.sdk.part.delete({
      sessionID: sessionId,
      messageID: messageId,
      partID: partId,
    })) === true;
  }

  async getProviderAuthMethods(): Promise<unknown> {
    return this.sdk.provider.auth();
  }

  async authorizeProviderOAuth(providerID: string): Promise<unknown> {
    return this.sdk.provider.oauth.authorize({ providerID });
  }

  async completeProviderOAuth(providerID: string, code: string, method?: number): Promise<unknown> {
    return this.sdk.provider.oauth.callback({ providerID, code, method });
  }

  async listProjects(): Promise<unknown> {
    return this.sdk.project.list();
  }

  async getCurrentProject(): Promise<unknown> {
    return this.sdk.project.current();
  }

  async initializeProjectGit(): Promise<unknown> {
    return this.sdk.project.initGit();
  }

  async updateProject(projectID: string, input: Record<string, unknown>): Promise<unknown> {
    return this.sdk.project.update({ projectID, ...input });
  }

  async listFiles(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.sdk.file.list(input as never);
  }

  async readFile(input: Record<string, unknown>): Promise<unknown> {
    return this.sdk.file.read(input as never);
  }

  async getFileStatus(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.sdk.file.status(input as never);
  }

  async findText(input: Record<string, unknown>): Promise<unknown> {
    return this.sdk.find.text(input as never);
  }

  async findFiles(input: Record<string, unknown>): Promise<unknown> {
    return this.sdk.find.files(input as never);
  }

  async findSymbols(input: Record<string, unknown>): Promise<unknown> {
    return this.sdk.find.symbols(input as never);
  }

  async getPaths(): Promise<unknown> {
    return this.sdk.path.get();
  }

  async getVcsInfo(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.sdk.vcs.get(input as never);
  }

  async getVcsDiff(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.sdk.vcs.diff(input as never);
  }

  async getFormatterStatus(): Promise<unknown> {
    return this.sdk.formatter.status();
  }

  async getLspStatus(): Promise<unknown> {
    return this.sdk.lsp.status();
  }

  async respondToSessionPermission(
    sessionId: string,
    permissionId: string,
    reply: PermissionReply,
  ): Promise<void> {
    await this.sdk.permission.respond({
      sessionID: sessionId,
      permissionID: permissionId,
      response: reply,
    });
  }

  // ==================== Permission API Methods ====================

  /** Get pending permission requests */
  async getPendingPermissions(): Promise<PermissionRequest[]> {
    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const response = await this.getSdkClient().permission.list();
        return Array.isArray(response) ? response as PermissionRequest[] : [];
      } catch (error) {
        this.logServiceWarning('permission.list', 'SDK permission.list failed, falling back to legacy HTTP', error);
      }
    }

    try {
      return await this.get<PermissionRequest[]>('/permission');
    } catch (error) {
      this.logServiceError('permission.list', 'Failed to get pending permissions:', error);
      return [];
    }
  }

  /** Respond to a permission request */
  async respondToPermission(
    requestID: string,
    reply: PermissionReply,
    message?: string
  ): Promise<void> {
    try {
      if (this.shouldUseSdk('sdkCrud')) {
        await this.getSdkClient().permission.reply({
          requestID,
          reply,
          message,
        });
        return;
      }

      await this.post(`/permission/${requestID}/reply`, { reply, message });
    } catch (error) {
      logger.error('Failed to respond to permission:', error);
      throw error;
    }
  }

}

// Extend QueryOptions to include sessionId and images
declare module './types' {
  interface QueryOptions {
    sessionId?: string;
    images?: ImageAttachment[];
  }
}

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
import { OpenCodeCatalogQueryCoordinator } from './OpenCodeCatalogQueryCoordinator';
import {
  type CatalogUpdateListener,
  OpenCodeCatalogStateStore,
  type OpenCodeCatalogToolIdentityContext,
} from './OpenCodeCatalogStateStore';
import {
  OpenCodeContextPartSerializer,
} from './OpenCodeContextPartSerializer';
import {
  type OpenCodeEventListener,
  OpenCodeEventSubscriptionCoordinator,
} from './OpenCodeEventSubscriptionCoordinator';
import { OpenCodeMessageNormalizationMapper } from './OpenCodeMessageNormalizationMapper';
import {
  OpenCodePromptRequestBuilder,
} from './OpenCodePromptRequestBuilder';
import {
  OpenCodeQueryGateway,
} from './OpenCodeQueryGateway';
import {
  OpenCodeQuestionPermissionHub,
} from './OpenCodeQuestionPermissionHub';
import { OpenCodeSdkFacade } from './OpenCodeSdkFacade';
import {
  OpenCodeSessionControlOrchestrator,
  type SessionContextUsageSnapshot,
} from './OpenCodeSessionControlOrchestrator';
import {
  type Message,
  OpenCodeSessionLifecycleCoordinator,
  type Part,
  type Session,
} from './OpenCodeSessionLifecycleCoordinator';
import {
  type OpenCodeSSEEvent,
  type OpenCodeStreamEvent,
  type OpenCodeStreamEventState,
  OpenCodeStreamEventTransformer,
} from './OpenCodeStreamEventTransformer';
import {
  OpenCodeStreamingRuntimeContext,
  OpenCodeStreamingRuntimeCoordinator,
} from './OpenCodeStreamingRuntimeCoordinator';
import {
  OpenCodeSyncEventRuntimeCoordinator,
  type SessionActivityStatus,
  type SessionSyncEventUpdate,
} from './OpenCodeSyncEventRuntimeCoordinator';
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

interface OpenCodeSseReadState {
  aborted: boolean;
  buffer: string;
}

interface OpenCodeSseStreamContext {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  signal?: AbortSignal;
  state: OpenCodeSseReadState;
}

interface OpenCodeSettingsUpdatePlan {
  previousSettings: OpenCodianSettings;
  nextSettings: OpenCodianSettings;
  previousMode: OpenCodianSettings['server']['mode'];
  nextMode: OpenCodianSettings['server']['mode'];
  previousToolCatalogScope: string;
  previousBaseUrl: string;
  shouldResumeSyncEvents: boolean;
  shouldResumeOpenCodeEvents: boolean;
  serverConfigChanged: boolean;
  shouldRestartManagedServer: boolean;
  shouldStopManagedServer: boolean;
}

interface OpenCodeSettingsRestartDecision {
  previousSettings: OpenCodianSettings;
  nextSettings: OpenCodianSettings;
  previousMode: OpenCodianSettings['server']['mode'];
  nextMode: OpenCodianSettings['server']['mode'];
  serverConfigChanged: boolean;
  authChanged: boolean;
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
  private sessionControl: OpenCodeSessionControlOrchestrator;
  private questionPermissionHub: OpenCodeQuestionPermissionHub;
  private queryGateway: OpenCodeQueryGateway;
  private responseHandlers: ResponseHandler[] = [];
  private baseUrl: string;
  private sdkFeatureFlags: SdkFeatureFlags;
  private syncEventRuntime: OpenCodeSyncEventRuntimeCoordinator;
  private catalogState: OpenCodeCatalogStateStore;
  private catalogQueries: OpenCodeCatalogQueryCoordinator;
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
    this.sessionControl = new OpenCodeSessionControlOrchestrator({
      shouldUseSdkCrud: () => this.shouldUseSdk('sdkCrud'),
      getSdkSession: () => this.sdk.session,
      getSdkPart: () => this.sdk.part,
      postLegacy: (path, body) => this.post(path, body),
      getLegacy: (path) => this.get(path),
      getSessionInfo: (sessionId) => this.getSessionInfo(sessionId),
      getSessionMessages: (sessionId) => this.sessionLifecycle.getSessionMessages(sessionId),
      getAvailableModels: () => this.getAvailableModels(),
      logServiceWarning: (key, message, error) => this.logServiceWarning(key, message, error),
      logServiceError: (key, message, error) => this.logServiceError(key, message, error),
    });
    this.questionPermissionHub = new OpenCodeQuestionPermissionHub({
      shouldUseSdkQuestions: () => this.shouldUseSdk('sdkQuestions'),
      shouldUseSdkCrud: () => this.shouldUseSdk('sdkCrud'),
      getSdkQuestion: () => this.sdk.question,
      getSdkPermission: () => this.sdk.permission,
      getLegacy: (path) => this.get(path),
      postLegacy: (path, body) => this.post(path, body),
      normalizeQuestionRequest: (raw) =>
        OpenCodeService.messageNormalizationMapper.normalizeQuestionRequest(raw),
      logServiceWarning: (key, message, error) => this.logServiceWarning(key, message, error),
      logServiceError: (key, message, error) => this.logServiceError(key, message, error),
    });
    this.catalogState = new OpenCodeCatalogStateStore({
      syncOpenCodeEventSubscriptions: () => {
        if (this.openCodeEventRuntime.hasListeners()) {
          this.openCodeEventRuntime.ensureSubscriptions();
          return;
        }

        this.openCodeEventRuntime.stopSubscriptions();
      },
    });
    this.catalogQueries = new OpenCodeCatalogQueryCoordinator(this.catalogState, {
      shouldUseSdkCrud: () => this.shouldUseSdk('sdkCrud'),
      getSdkFacade: (options = {}) => options.includeDirectory === false
        ? this.getSdkFacade(options)
        : this.sdk,
      getLegacy: <T>(path: string, options?: { includeDirectory?: boolean }) => this.get<T>(path, options),
      logServiceWarning: (key, message, error) => this.logServiceWarning(key, message, error),
      logServiceError: (key, message, error) => this.logServiceError(key, message, error),
      getDebugMetadata: () => ({
        baseUrl: this.baseUrl,
        vaultPath: this.vaultPath ?? null,
        serverStatus: this.serverManager.getStatus(),
        isManagedServerRunning: this.serverManager.isRunning(),
        managedServerState: this.serverManager.getManagedServerStateSnapshot(),
      }),
      getToolCatalogScopeKey: () => `${this.baseUrl}::${this.getScopedDirectoryPath() ?? ''}`,
    });
    this.queryGateway = new OpenCodeQueryGateway({
      getMcpSdk: () => this.sdk.mcp,
      getProviderSdk: () => this.sdk.provider,
      getProjectSdk: () => this.sdk.project,
      getFileSdk: () => this.sdk.file,
      getFindSdk: () => this.sdk.find,
      getPathSdk: () => this.sdk.path,
      getVcsSdk: () => this.sdk.vcs,
      getFormatterSdk: () => this.sdk.formatter,
      getLspSdk: () => this.sdk.lsp,
      normalizeMcpServerStatusMap: (input) => this.catalogState.normalizeMcpServerStatusMap(input),
      updateMcpServerStatus: (statusMap) => this.catalogState.updateMcpServerStatus(statusMap),
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
      observeRuntimeToolNames: (toolNames) => this.catalogQueries.observeRuntimeToolNames(toolNames),
    });
    this.streamEventTransformer = new OpenCodeStreamEventTransformer({
      observeRuntimeToolNames: (toolNames) => this.catalogQueries.observeRuntimeToolNames(toolNames),
      getOpenCodeToolKind: (toolName) =>
        OpenCodeService.messageNormalizationMapper.getOpenCodeToolKind(
          toolName,
          this.catalogQueries.buildOpenCodeToolIdentityContext(),
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
      observeRuntimeToolNames: (toolNames) => this.catalogQueries.observeRuntimeToolNames(toolNames),
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
    const previousToolCatalogScope = this.catalogQueries.getToolCatalogScopeKey();
    this.vaultPath = path;
    this.serverManager.setWorkingDirectory(path);
    this.catalogQueries.clearToolSchemaCacheIfScopeChanged(previousToolCatalogScope);
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
          this.catalogQueries.buildOpenCodeToolIdentityContext(),
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
        this.catalogQueries.buildOpenCodeToolIdentityContext(),
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

        this.catalogQueries.observeRuntimeToolNames([toolName]);
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

  private observeRuntimeToolNames(toolNames: Iterable<string>): boolean {
    return this.catalogQueries.observeRuntimeToolNames(toolNames);
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

    if (signal?.aborted) {
      return;
    }

    const reader = await this.openSseReader(url, signal);
    const context: OpenCodeSseStreamContext = {
      reader,
      decoder: new TextDecoder(),
      signal,
      state: {
        aborted: false,
        buffer: '',
      },
    };
    const abortHandler = this.createSseAbortHandler(reader, context.state);
    signal?.addEventListener('abort', abortHandler);

    try {
      yield* this.readSseStream(context);
    } catch (error) {
      if (this.isAbortedSseRead(error, context)) {
        return;
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', abortHandler);
      reader.releaseLock();
    }
  }

  private async openSseReader(
    url: string,
    signal?: AbortSignal,
  ): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getRequestHeaders({
        'Accept': 'text/event-stream',
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('SSE response has no body');
    }

    return response.body.getReader();
  }

  private createSseAbortHandler(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    state: OpenCodeSseReadState,
  ): () => void {
    return () => {
      state.aborted = true;
      void reader.cancel();
    };
  }

  private async *readSseStream(context: OpenCodeSseStreamContext): AsyncGenerator<OpenCodeSSEEvent> {
    while (!this.shouldStopSseStream(context)) {
      const readResult = await this.readSseChunk(context);
      if (!readResult) {
        break;
      }

      const { done, value } = readResult;
      if (done || this.shouldStopSseStream(context)) {
        break;
      }

      context.state.buffer += context.decoder.decode(value, { stream: true });
      yield* this.emitParsedSseEvents(context.state);
    }

    if (context.state.buffer.trim() && !this.shouldStopSseStream(context)) {
      yield* this.emitRemainingSseEvents(context.state.buffer);
    }
  }

  private async readSseChunk(
    context: Pick<OpenCodeSseStreamContext, 'reader' | 'signal' | 'state'>,
  ): Promise<ReadableStreamReadResult<Uint8Array> | null> {
    try {
      return await context.reader.read();
    } catch (error) {
      if (this.isAbortedSseRead(error, context)) {
        return null;
      }
      throw error;
    }
  }

  private shouldStopSseStream(
    context: Pick<OpenCodeSseStreamContext, 'signal' | 'state'>,
  ): boolean {
    return context.state.aborted || context.signal?.aborted === true;
  }

  private isAbortedSseRead(
    error: unknown,
    context: Pick<OpenCodeSseStreamContext, 'signal' | 'state'>,
  ): boolean {
    return this.shouldStopSseStream(context) || (error instanceof Error && error.name === 'AbortError');
  }

  private *emitParsedSseEvents(state: OpenCodeSseReadState): Generator<OpenCodeSSEEvent, void, void> {
    const events = this.streamEventTransformer.parseSSEEvents(state.buffer);
    state.buffer = events.remaining;
    yield* events.events;
  }

  private *emitRemainingSseEvents(buffer: string): Generator<OpenCodeSSEEvent, void, void> {
    const events = this.streamEventTransformer.parseSSEEvents(buffer + '\n\n');
    yield* events.events;
  }

  /** Get available models - Handles both string array and object formats */
  async getAvailableModels(
    options: { includeDirectory?: boolean; debugReason?: string | null } = {},
  ): Promise<{ providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow?: number }> }>; defaults: Record<string, string> }> {
    return this.catalogQueries.getAvailableModels(options);
  }

  async getProviderDirectory(
    options: { includeDirectory?: boolean; debugReason?: string | null } = {},
  ): Promise<{
    providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow?: number }> }>;
    defaults: Record<string, string>;
    connected: string[];
  }> {
    return this.catalogQueries.getProviderDirectory(options);
  }

  async getResolvedModelConfig(
    options: { includeDirectory?: boolean; debugReason?: string | null } = {},
  ): Promise<OpencodeModelConfigSubset> {
    return this.catalogQueries.getResolvedModelConfig(options);
  }

  /** Update settings */
  async updateSettings(settings: OpenCodianSettings): Promise<void> {
    const plan = this.createSettingsUpdatePlan(settings);
    await this.validateSettingsUpdatePlan(plan);
    this.applySettingsUpdatePlan(plan);

    try {
      await this.completeSettingsUpdatePlan(plan);
    } catch (error) {
      await this.rollbackSettingsUpdatePlan(plan);
      throw error;
    }
  }

  async getSessionContextUsageSnapshot(sessionId: string): Promise<SessionContextUsageSnapshot | null> {
    return this.sessionControl.getSessionContextUsageSnapshot(sessionId);
  }

  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    return this.sessionControl.forkSession(sessionId, messageID);
  }

  async revertSession(sessionId: string, messageID: string, partID?: string): Promise<boolean> {
    return this.sessionControl.revertSession(sessionId, messageID, partID);
  }

  async unrevertSession(sessionId: string): Promise<boolean> {
    return this.sessionControl.unrevertSession(sessionId);
  }

  async getSessionRevertState(
    sessionId: string,
  ): Promise<{ messageID: string; partID?: string } | null> {
    return this.sessionControl.getSessionRevertState(sessionId);
  }

  async getPendingQuestions(): Promise<ChatQuestionRequest[]> {
    return this.questionPermissionHub.getPendingQuestions();
  }

  async replyToQuestion(requestID: string, answers: string[][]): Promise<void> {
    return this.questionPermissionHub.replyToQuestion(requestID, answers);
  }

  async rejectQuestion(requestID: string): Promise<void> {
    return this.questionPermissionHub.rejectQuestion(requestID);
  }

  async getSessionDiff(sessionId: string, messageID?: string): Promise<SessionDiffEntry[]> {
    return this.sessionControl.getSessionDiff(sessionId, messageID);
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

  private createSettingsUpdatePlan(settings: OpenCodianSettings): OpenCodeSettingsUpdatePlan {
    const previousSettings = this.settings;
    const previousMode = previousSettings.server.mode;
    const nextMode = settings.server.mode;
    const serverConfigChanged = this.hasLocalServerConfigChanged(previousSettings, settings);
    const authChanged = this.hasServerAuthChanged(previousSettings, settings);

    return {
      previousSettings,
      nextSettings: cloneSettings(settings),
      previousMode,
      nextMode,
      previousToolCatalogScope: this.catalogQueries.getToolCatalogScopeKey(),
      previousBaseUrl: this.baseUrl,
      shouldResumeSyncEvents: this.syncEventRuntime.hasListeners(),
      shouldResumeOpenCodeEvents: this.openCodeEventRuntime.hasListeners(),
      serverConfigChanged,
      shouldRestartManagedServer: this.shouldRestartManagedServerForSettingsUpdate({
        previousSettings,
        nextSettings: settings,
        previousMode,
        nextMode,
        serverConfigChanged,
        authChanged,
      }),
      shouldStopManagedServer: this.shouldStopManagedServerForSettingsUpdate(previousMode, nextMode),
    };
  }

  private hasLocalServerConfigChanged(
    previousSettings: OpenCodianSettings,
    nextSettings: OpenCodianSettings,
  ): boolean {
    return (
      previousSettings.server.local.host !== nextSettings.server.local.host
      || previousSettings.server.local.port !== nextSettings.server.local.port
    );
  }

  private hasServerAuthChanged(
    previousSettings: OpenCodianSettings,
    nextSettings: OpenCodianSettings,
  ): boolean {
    return (
      previousSettings.server.auth.type !== nextSettings.server.auth.type
      || previousSettings.server.auth.username !== nextSettings.server.auth.username
      || previousSettings.server.auth.password !== nextSettings.server.auth.password
      || previousSettings.server.auth.token !== nextSettings.server.auth.token
    );
  }

  private shouldRestartManagedServerForSettingsUpdate(
    decision: OpenCodeSettingsRestartDecision,
  ): boolean {
    if (!this.serverManager.isRunning() || decision.nextMode !== 'local') {
      return false;
    }

    return (
      decision.previousMode !== decision.nextMode
      || decision.serverConfigChanged
      || decision.authChanged
      || decision.previousSettings.modelSourceMode !== decision.nextSettings.modelSourceMode
      || decision.previousSettings.pluginIsolationMode !== decision.nextSettings.pluginIsolationMode
    );
  }

  private shouldStopManagedServerForSettingsUpdate(
    previousMode: OpenCodianSettings['server']['mode'],
    nextMode: OpenCodianSettings['server']['mode'],
  ): boolean {
    return this.serverManager.isRunning() && previousMode === 'local' && nextMode !== 'local';
  }

  private async validateSettingsUpdatePlan(plan: OpenCodeSettingsUpdatePlan): Promise<void> {
    if (
      !this.serverManager.isRunning()
      || plan.previousMode !== 'local'
      || plan.nextMode !== 'local'
      || !plan.serverConfigChanged
    ) {
      return;
    }

    const endpointAvailable = await this.serverManager.canBindLocalEndpoint(
      plan.nextSettings.server.local.host,
      plan.nextSettings.server.local.port,
    );
    if (!endpointAvailable) {
      throw new Error(
        `Cannot switch to ${plan.nextSettings.server.local.host}:${plan.nextSettings.server.local.port}. The target port is already in use.`,
      );
    }
  }

  private applySettingsUpdatePlan(plan: OpenCodeSettingsUpdatePlan): void {
    this.settings = plan.nextSettings;
    this.baseUrl = getServerBaseUrl(plan.nextSettings.server);
    this.serverManager.updateConfig(this.buildServerConfig(plan.nextSettings));
    this.catalogQueries.clearToolSchemaCacheIfScopeChanged(plan.previousToolCatalogScope);
    this.pauseSettingsUpdateSubscriptions(plan);
  }

  private async completeSettingsUpdatePlan(plan: OpenCodeSettingsUpdatePlan): Promise<void> {
    if (plan.shouldStopManagedServer) {
      await this.serverManager.stop();
      this.resumeSettingsUpdateSubscriptions();
      return;
    }

    if (plan.shouldRestartManagedServer) {
      await this.serverManager.restart();
    }

    this.resumeSettingsUpdateSubscriptions();
  }

  private async rollbackSettingsUpdatePlan(plan: OpenCodeSettingsUpdatePlan): Promise<void> {
    this.settings = plan.previousSettings;
    this.baseUrl = plan.previousBaseUrl;
    this.serverManager.updateConfig(this.buildServerConfig(plan.previousSettings));
    this.catalogQueries.clearToolSchemaCacheIfScopeChanged(plan.previousToolCatalogScope);
    this.pauseSettingsUpdateSubscriptions(plan);
    await this.restorePreviousManagedServerAfterFailedUpdate(plan);
    this.resumeSettingsUpdateSubscriptions();
  }

  private pauseSettingsUpdateSubscriptions(plan: OpenCodeSettingsUpdatePlan): void {
    this.syncEventRuntime.stopSubscription(plan.shouldResumeSyncEvents);
    this.openCodeEventRuntime.stopSubscriptions(plan.shouldResumeOpenCodeEvents);
  }

  private resumeSettingsUpdateSubscriptions(): void {
    this.syncEventRuntime.ensureSubscription();
    this.openCodeEventRuntime.ensureSubscriptions();
  }

  private async restorePreviousManagedServerAfterFailedUpdate(
    plan: OpenCodeSettingsUpdatePlan,
  ): Promise<void> {
    if (plan.previousMode !== 'local' || (!plan.shouldRestartManagedServer && !plan.shouldStopManagedServer)) {
      return;
    }

    try {
      await this.serverManager.start();
    } catch (restoreError) {
      logger.error('Failed to restore previous OpenCode server after settings update failure:', restoreError);
    }
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
    return this.catalogQueries.refreshToolIds();
  }

  async listTools(
    providerID: string,
    modelID: string,
    options: { refresh?: boolean } = {},
  ): Promise<ToolCatalogEntry[]> {
    return this.catalogQueries.listTools(providerID, modelID, options);
  }

  async refreshMcpServerStatus(): Promise<Record<string, McpServerStatus>> {
    return this.queryGateway.refreshMcpServerStatus();
  }

  getToolCatalogSnapshot(): ToolCatalogSnapshot {
    return this.catalogQueries.getToolCatalogSnapshot();
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
      this.catalogQueries.buildOpenCodeToolIdentityContext(),
    );
  }

  async getMcpStatus(): Promise<Record<string, McpServerStatus>> {
    return this.queryGateway.refreshMcpServerStatus();
  }

  async addMcpServer(name: string, config: Record<string, unknown>): Promise<Record<string, McpServerStatus>> {
    return this.queryGateway.addMcpServer(name, config);
  }

  async connectMcpServer(name: string): Promise<boolean> {
    return this.queryGateway.connectMcpServer(name);
  }

  async disconnectMcpServer(name: string): Promise<boolean> {
    return this.queryGateway.disconnectMcpServer(name);
  }

  async startMcpAuth(name: string): Promise<unknown> {
    return this.queryGateway.startMcpAuth(name);
  }

  async completeMcpAuth(name: string, code: string): Promise<McpServerStatus> {
    return this.queryGateway.completeMcpAuth(name, code);
  }

  async authenticateMcp(name: string): Promise<McpServerStatus> {
    return this.queryGateway.authenticateMcp(name);
  }

  async removeMcpAuth(name: string): Promise<{ success: true }> {
    return this.queryGateway.removeMcpAuth(name);
  }

  async initializeSession(sessionId: string, providerID: string, modelID: string, messageID: string): Promise<boolean> {
    return this.sessionControl.initializeSession(sessionId, providerID, modelID, messageID);
  }

  async getSessionChildren(sessionId: string): Promise<Session[]> {
    return this.sessionControl.getSessionChildren(sessionId);
  }

  async shareSession(sessionId: string): Promise<Session> {
    return this.sessionControl.shareSession(sessionId);
  }

  async unshareSession(sessionId: string): Promise<Session> {
    return this.sessionControl.unshareSession(sessionId);
  }

  async summarizeSession(sessionId: string, providerID: string, modelID: string, auto = false): Promise<boolean> {
    return this.sessionControl.summarizeSession(sessionId, providerID, modelID, auto);
  }

  async getSessionMessage(sessionId: string, messageId: string): Promise<{ info: Message; parts: Part[] }> {
    return this.sessionControl.getSessionMessage(sessionId, messageId);
  }

  async deleteSessionMessage(sessionId: string, messageId: string): Promise<boolean> {
    return this.sessionControl.deleteSessionMessage(sessionId, messageId);
  }

  async runSessionCommand(
    sessionId: string,
    input: { command: string; arguments: string; agent?: string; model?: string; messageID?: string; variant?: string; parts?: unknown[] },
  ): Promise<{ info: Message; parts: Part[] }> {
    return this.sessionControl.runSessionCommand(sessionId, input);
  }

  async runSessionShell(
    sessionId: string,
    input: { agent: string; command: string; model?: { providerID: string; modelID: string }; messageID?: string },
  ): Promise<{ info: Message; parts: Part[] }> {
    return this.sessionControl.runSessionShell(sessionId, input);
  }

  async updateMessagePart(sessionId: string, messageId: string, partId: string, part: Part): Promise<Part> {
    return this.sessionControl.updateMessagePart(sessionId, messageId, partId, part);
  }

  async deleteMessagePart(sessionId: string, messageId: string, partId: string): Promise<boolean> {
    return this.sessionControl.deleteMessagePart(sessionId, messageId, partId);
  }

  async getProviderAuthMethods(): Promise<unknown> {
    return this.queryGateway.getProviderAuthMethods();
  }

  async authorizeProviderOAuth(providerID: string): Promise<unknown> {
    return this.queryGateway.authorizeProviderOAuth(providerID);
  }

  async completeProviderOAuth(providerID: string, code: string, method?: number): Promise<unknown> {
    return this.queryGateway.completeProviderOAuth(providerID, code, method);
  }

  async listProjects(): Promise<unknown> {
    return this.queryGateway.listProjects();
  }

  async getCurrentProject(): Promise<unknown> {
    return this.queryGateway.getCurrentProject();
  }

  async initializeProjectGit(): Promise<unknown> {
    return this.queryGateway.initializeProjectGit();
  }

  async updateProject(projectID: string, input: Record<string, unknown>): Promise<unknown> {
    return this.queryGateway.updateProject(projectID, input);
  }

  async listFiles(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.queryGateway.listFiles(input);
  }

  async readFile(input: Record<string, unknown>): Promise<unknown> {
    return this.queryGateway.readFile(input);
  }

  async getFileStatus(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.queryGateway.getFileStatus(input);
  }

  async findText(input: Record<string, unknown>): Promise<unknown> {
    return this.queryGateway.findText(input);
  }

  async findFiles(input: Record<string, unknown>): Promise<unknown> {
    return this.queryGateway.findFiles(input);
  }

  async findSymbols(input: Record<string, unknown>): Promise<unknown> {
    return this.queryGateway.findSymbols(input);
  }

  async getPaths(): Promise<unknown> {
    return this.queryGateway.getPaths();
  }

  async getVcsInfo(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.queryGateway.getVcsInfo(input);
  }

  async getVcsDiff(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.queryGateway.getVcsDiff(input);
  }

  async getFormatterStatus(): Promise<unknown> {
    return this.queryGateway.getFormatterStatus();
  }

  async getLspStatus(): Promise<unknown> {
    return this.queryGateway.getLspStatus();
  }

  async respondToSessionPermission(
    sessionId: string,
    permissionId: string,
    reply: PermissionReply,
  ): Promise<void> {
    return this.questionPermissionHub.respondToSessionPermission(sessionId, permissionId, reply);
  }

  // ==================== Permission API Methods ====================

  /** Get pending permission requests */
  async getPendingPermissions(): Promise<PermissionRequest[]> {
    return this.questionPermissionHub.getPendingPermissions();
  }

  /** Respond to a permission request */
  async respondToPermission(
    requestID: string,
    reply: PermissionReply,
    message?: string
  ): Promise<void> {
    return this.questionPermissionHub.respondToPermission(requestID, reply, message);
  }

}

// Extend QueryOptions to include sessionId and images
declare module './types' {
  interface QueryOptions {
    sessionId?: string;
    images?: ImageAttachment[];
  }
}

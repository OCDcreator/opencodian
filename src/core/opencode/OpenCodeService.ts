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
import { getServerBaseUrl } from '../types/settings';
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
  type BuiltPromptSendPayload,
  OpenCodePromptRequestBuilder,
  type PromptRequestEntityKind,
  type PromptRequestPart,
  type PromptSyntheticTextPartInput,
} from './OpenCodePromptRequestBuilder';
import {
  OpenCodeQuestionPermissionHub,
} from './OpenCodeQuestionPermissionHub';
import {
  OpenCodeSdkFacade,
  OpenCodeServiceDiagnostics,
} from './OpenCodeSdkFacade';
import {
  OpenCodeServiceLifecycleCoordinator,
} from './OpenCodeServiceLifecycleCoordinator';
import {
  OpenCodeSessionControlOrchestrator,
  type OpenCodeSessionControlSdk,
  type SessionCommandInput,
  type SessionContextUsageSnapshot,
  type SessionShellInput,
} from './OpenCodeSessionControlOrchestrator';
import {
  type Message,
  OpenCodeSessionLifecycleCoordinator,
  type Part,
  type Session,
} from './OpenCodeSessionLifecycleCoordinator';
import { OpenCodeSessionStateStore } from './OpenCodeSessionStateStore';
import {
  OpenCodeStreamEventTransformer,
  type OpenCodeStreamMutation,
} from './OpenCodeStreamEventTransformer';
import {
  OpenCodeStreamingRuntimeCoordinator,
} from './OpenCodeStreamingRuntimeCoordinator';
import {
  OpenCodeSyncEventRuntimeCoordinator,
  type SessionActivityStatus,
  type SessionSyncEventUpdate,
} from './OpenCodeSyncEventRuntimeCoordinator';
import type { SdkFeatureFlags } from './sdkFeatureFlags';
import { resolveSdkFeatureFlags } from './sdkFeatureFlags';
import type { SdkEvent } from './sdkTypes';
import type {
  ManagedServerState,
  McpServerSnapshot,
  McpServerStatus,
  OpenCodeCanonicalSessionState,
  OpenCodeCapabilitySnapshot,
  OpenCodeSessionMessageWithParts,
  QueryOptions,
  ResponseHandler,
  ServerDiagnostics,
  ServerStatus,
  ToolCatalogEntry,
  ToolCatalogSnapshot,
} from './types';

const logger = createLogger('OpenCodeService');

export type { SessionActivityStatus, SessionSyncEventUpdate } from './OpenCodeSyncEventRuntimeCoordinator';

function cloneSettings(settings: OpenCodianSettings): OpenCodianSettings {
  return JSON.parse(JSON.stringify(settings)) as OpenCodianSettings;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

type PromptTransportOptions = QueryOptions & {
  messageID?: string;
  requestParts?: PromptRequestPart[];
  syntheticTextParts?: PromptSyntheticTextPartInput[];
};

type SessionTodoUpdate = {
  sessionId: string;
  todos: SessionTodo[];
};

type SessionStatusUpdate = {
  sessionId: string;
  status: SessionActivityStatus;
};

export class OpenCodeService {
  private static readonly messageNormalizationMapper = new OpenCodeMessageNormalizationMapper();
  readonly sdk: OpenCodeSdkFacade;
  private diagnostics: OpenCodeServiceDiagnostics;
  private settings: OpenCodianSettings;
  private events: OpenCodeServiceEvents;
  private sessionLifecycle: OpenCodeSessionLifecycleCoordinator;
  private sessionControl: OpenCodeSessionControlOrchestrator;
  private questionPermissionHub: OpenCodeQuestionPermissionHub;
  private responseHandlers: ResponseHandler[] = [];
  private baseUrl: string;
  private sdkFeatureFlags: SdkFeatureFlags;
  private syncEventRuntime: OpenCodeSyncEventRuntimeCoordinator;
  private catalogState: OpenCodeCatalogStateStore;
  private catalogQueries: OpenCodeCatalogQueryCoordinator;
  private contextPartSerializer: OpenCodeContextPartSerializer;
  private promptRequestBuilder: OpenCodePromptRequestBuilder;
  private readonly sessionStateStore = new OpenCodeSessionStateStore();
  private streamEventTransformer: OpenCodeStreamEventTransformer;
  private streamingRuntime: OpenCodeStreamingRuntimeCoordinator;
  private openCodeEventRuntime: OpenCodeEventSubscriptionCoordinator;
  private serviceLifecycle: OpenCodeServiceLifecycleCoordinator;
  private promptRequestEntitySequence = 0;
  private vaultPath?: string;

  constructor(
    settings: OpenCodianSettings,
    events: OpenCodeServiceEvents = {},
    runtimeOptions: OpenCodeServiceRuntimeOptions = {},
  ) {
    this.settings = cloneSettings(settings);
    this.events = events;
    this.baseUrl = getServerBaseUrl(settings.server);
    this.sdkFeatureFlags = resolveSdkFeatureFlags(runtimeOptions.sdkFeatureFlags);
    this.diagnostics = new OpenCodeServiceDiagnostics();
    const logServiceWarning = (key: string, message: string, error: unknown) =>
      this.diagnostics.logServiceWarning(key, message, error);
    const logServiceError = (key: string, message: string, error: unknown) =>
      this.diagnostics.logServiceError(key, message, error);
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
      applySessionSyncEvent: (update) => this.applyCanonicalSyncEvent(update),
      isTransientConnectivityError: (error) => this.diagnostics.isTransientConnectivityError(error),
      logSyncEventStreamFailure: (error) =>
        logServiceWarning('global.sync-event', 'SDK sync event stream failed', error),
      checkHealth: () => this.checkHealth(),
      delay: (ms, signal) => this.delay(ms, signal),
    });
    this.sessionLifecycle = new OpenCodeSessionLifecycleCoordinator({
      shouldUseSdkAbort: () => this.shouldUseSdk('sdkAbort'),
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
      logServiceWarning,
      logServiceError,
    }, this.syncEventRuntime);
    this.sessionControl = new OpenCodeSessionControlOrchestrator({
      shouldUseSdkCrud: () => this.shouldUseSdk('sdkCrud'),
      getSdkSession: () => this.createSessionControlSdk(),
      getSdkPart: () => this.sdk.part,
      postLegacy: (path, body) => this.post(path, body),
      getLegacy: (path) => this.get(path),
      getSessionInfo: (sessionId) => this.sessionLifecycle.getSessionInfo(sessionId),
      getSessionMessages: (sessionId) => this.getSessionMessages(sessionId),
      getAvailableModels: () => this.getAvailableModels(),
      logServiceWarning,
      logServiceError,
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
      logServiceWarning,
      logServiceError,
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
    let serviceLifecycle: OpenCodeServiceLifecycleCoordinator | null = null;
    this.catalogQueries = new OpenCodeCatalogQueryCoordinator(this.catalogState, {
      shouldUseSdkCrud: () => this.shouldUseSdk('sdkCrud'),
      getSdkFacade: (options = {}) => options.includeDirectory === false
        ? this.getSdkFacade(options)
        : this.sdk,
      getLegacy: <T>(path: string, options?: { includeDirectory?: boolean }) => this.get<T>(path, options),
      logServiceWarning,
      logServiceError,
      getDebugMetadata: () => ({
        baseUrl: this.baseUrl,
        vaultPath: this.vaultPath ?? null,
        ...(serviceLifecycle?.getServerRuntimeMetadata() ?? {
          serverStatus: 'stopped' as ServerStatus,
          isManagedServerRunning: false,
          managedServerState: null,
        }),
      }),
      getToolCatalogScopeKey: () => `${this.baseUrl}::${this.getScopedDirectoryPath() ?? ''}`,
    });
    this.contextPartSerializer = new OpenCodeContextPartSerializer({
      isLocalServerMode: () => this.settings.server.mode === 'local',
      getVaultPath: () => this.vaultPath,
    });
    this.promptRequestBuilder = new OpenCodePromptRequestBuilder({
      createPromptEntityId: (kind) => this.createPromptEntityId(kind),
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
      logStreamingDebug: (label, payload) => this.diagnostics.logAssistantFinalizationDebug(label, payload),
    });
    this.streamingRuntime = new OpenCodeStreamingRuntimeCoordinator({
      applyStreamMutations: (mutations) => this.applyCanonicalStreamMutations(mutations),
      abortSessionOnServer: (sessionId) => this.sessionLifecycle.abortSession(sessionId),
      getLegacyEventStreamRequest: () => {
        this.ensureBaseUrl();
        return {
          url: `${this.baseUrl}/event`,
          headers: this.getRequestHeaders({
            'Accept': 'text/event-stream',
          }),
        };
      },
      getSessionMessages: (sessionId) => this.getSessionMessages(sessionId),
      logServiceWarning,
      streamEventTransformer: this.streamEventTransformer,
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
        logServiceWarning(`${source}.subscribe`, `SDK ${source} subscription failed, retrying`, error),
      delay: (ms, signal) => this.delay(ms, signal),
    });

    const lifecycleAssembly = OpenCodeServiceLifecycleCoordinator.createAssembly({
      getSettings: () => this.settings,
      setSettings: (nextSettings) => { this.settings = nextSettings; },
      getBaseUrl: () => this.baseUrl,
      setBaseUrl: (nextBaseUrl) => { this.baseUrl = nextBaseUrl; },
      getToolCatalogScopeKey: () => this.catalogQueries.getToolCatalogScopeKey(),
      shouldUseSdkCrud: () => this.shouldUseSdk('sdkCrud'),
      checkSdkHealth: async () => this.getSdkFacade({ includeDirectory: false }).global.health(),
      logHealthProbeFallback: (error) =>
        logServiceWarning('health', 'SDK health check failed, falling back to ServerManager health probe', error),
      resetTransientConnectivityLogState: () => this.diagnostics.resetTransientConnectivityLogState(),
      onServerStatusChange: (status) => events.onServerStatusChange?.(status),
      onError: (error) => events.onError?.(error),
      setVaultPath: (path) => { this.vaultPath = path; },
      clearToolSchemaCacheIfScopeChanged: (previousScope) =>
        this.catalogQueries.clearToolSchemaCacheIfScopeChanged(previousScope),
      fetchAvailableModels: () => this.getAvailableModels(),
      refreshToolIds: () => this.refreshToolIds(),
      refreshMcpServerStatus: () => this.refreshMcpServerStatus(),
      onModelsLoaded: (providers) => this.events.onModelsLoaded?.(providers),
      syncEvents: this.syncEventRuntime,
      openCodeEvents: this.openCodeEventRuntime,
      initialManagedServerState: runtimeOptions.initialManagedServerState,
      onManagedServerStateChange: runtimeOptions.onManagedServerStateChange,
    });
    serviceLifecycle = lifecycleAssembly.serviceLifecycle;
    this.serviceLifecycle = lifecycleAssembly.serviceLifecycle;
  }

  private createSessionControlSdk(): OpenCodeSessionControlSdk {
    return {
      fork: (request) => this.sdk.session.fork(request),
      revert: (request) => this.sdk.session.revert(request),
      unrevert: (request) => this.sdk.session.unrevert(request),
      diff: (request) => this.sdk.session.diff(request),
      init: (request) => this.sdk.session.init(request),
      children: (request) => this.sdk.session.children(request),
      share: (request) => this.sdk.session.share(request),
      unshare: (request) => this.sdk.session.unshare(request),
      summarize: (request) => this.sdk.session.summarize(request),
      message: (request) => this.sdk.session.message(request),
      deleteMessage: (request) => this.sdk.session.deleteMessage(request),
      command: (request) =>
        this.sdk.session.command(request as Parameters<typeof this.sdk.session.command>[0]),
      shell: (request) => this.sdk.session.shell(request),
    };
  }

  /** Initialize the service */
  async initialize(): Promise<void> {
    await this.serviceLifecycle.initialize();
  }

  /** Set the vault path for OpenCode server to use project config */
  setVaultPath(path: string): void {
    this.serviceLifecycle.setVaultPath(path);
  }

  getSettingsSnapshot(): OpenCodianSettings {
    return cloneSettings(this.settings);
  }

  /** Start the service and server */
  async start(): Promise<void> {
    await this.serviceLifecycle.start();
  }

  /** Stop the service */
  async stop(): Promise<void> {
    await this.serviceLifecycle.stop();
  }

  dispose(): void {
    this.streamingRuntime.dispose();
    this.serviceLifecycle.dispose();
  }

  /** Check if service is ready */
  isReady(): boolean {
    return this.serviceLifecycle.isReady();
  }

  /** Get server status */
  getServerStatus(): ServerStatus {
    return this.serviceLifecycle.getServerStatus();
  }

  getServerDiagnostics(): ServerDiagnostics {
    return this.serviceLifecycle.getServerDiagnostics();
  }

  /** Check server health directly */
  async checkHealth(): Promise<boolean> {
    return this.serviceLifecycle.checkHealth();
  }

  /** Check if plugin has a server process running */
  isServerProcessRunning(): boolean {
    return this.serviceLifecycle.isServerProcessRunning();
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
    const messages = await this.sessionLifecycle.getSessionMessages(sessionId);
    this.applyCanonicalSnapshot(sessionId, messages);
    return messages;
  }

  getCanonicalSessionState(sessionId: string): OpenCodeCanonicalSessionState | null {
    return this.sessionStateStore.getSessionState(sessionId);
  }

  getCanonicalSessionMessages(sessionId: string): OpenCodeSessionMessageWithParts[] | null {
    const state = this.sessionStateStore.getSessionState(sessionId);
    if (!state) {
      return null;
    }

    return state.messages.map((info) => ({
      info,
      parts: state.partsByMessageID[info.id] ?? [],
    }));
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
    options: PromptTransportOptions & { sessionId?: string; system?: string },
  ): Promise<ChatMessage | null> {
    const sessionId = options.sessionId ?? this.sessionLifecycle.getSessionId();
    if (!sessionId) {
      throw new Error('No active session');
    }

    const payload = this.resolveStructuredPromptSendPayload(message, options);

    if (this.shouldUseSdk('sdkPrompt')) {
      const response = await this.sdk.session.prompt(
        this.promptRequestBuilder.buildSdkPromptParameters(sessionId, payload.requestParts, options),
      );
      if (response && typeof response === 'object' && 'info' in response && 'parts' in response) {
        const typedResponse = response as AssistantMessageResponse;
        const assistantError = this.diagnostics.extractAssistantErrorMessage(typedResponse.info.error);
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

    const requestBody = this.promptRequestBuilder.buildLegacyMessageRequestBody(
      payload.requestParts,
      options,
    );

    const response = await this.post<unknown>(`/session/${sessionId}/message`, requestBody);
    if (
      typeof response === 'object'
      && response !== null
      && 'info' in response
      && 'parts' in response
    ) {
      const typedResponse = response as AssistantMessageResponse;
      const assistantError = this.diagnostics.extractAssistantErrorMessage(typedResponse.info.error);
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
        error: this.diagnostics.describeError(error),
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
  async *sendMessage(message: string, options: PromptTransportOptions = {}): AsyncGenerator<StreamChunk> {
    const sessionId = options.sessionId ?? this.sessionLifecycle.getSessionId();
    if (!sessionId) {
      yield { type: 'error', content: 'No active session' };
      return;
    }

    const payload = this.resolveStructuredPromptSendPayload(message, options);

    yield* this.streamingRuntime.streamResponse({
      sessionId,
      useSdkStream: this.shouldUseSdk('sdkStream'),
      sdk: {
        startPrompt: async () => {
          await this.sdk.session.promptAsync(
            this.promptRequestBuilder.buildSdkPromptParameters(sessionId, payload.requestParts, options),
          );
        },
        subscribe: async (signal) => {
          const subscription = await this.sdk.event.subscribe(undefined, { signal } as never);
          return subscription.stream as AsyncIterable<SdkEvent>;
        },
      },
      legacy: {
        startPrompt: async () => {
          const requestBody = this.promptRequestBuilder.buildLegacyStreamRequestBody(
            payload.requestParts,
            options,
          );
          await this.post<void>(`/session/${sessionId}/prompt_async`, requestBody);
        },
      },
    });
  }

  buildStructuredPromptSendPayload(
    message: string,
    options: QueryOptions & {
      syntheticTextParts?: PromptSyntheticTextPartInput[];
    } = {},
  ): BuiltPromptSendPayload {
    const parts = this.contextPartSerializer.buildPromptRequestParts(message, options);
    return this.promptRequestBuilder.buildStructuredPromptSendPayload({
      parts,
      syntheticTextParts: options.syntheticTextParts,
    });
  }

  seedCanonicalUserMessage(input: {
    sessionID: string;
    messageID: string;
    parts: PromptRequestPart[];
    timestamp?: number;
  }): OpenCodeCanonicalSessionState {
    const timestamp = typeof input.timestamp === 'number' ? input.timestamp : Date.now();

    this.sessionStateStore.upsertMessage({
      id: input.messageID,
      sessionID: input.sessionID,
      role: 'user',
      time: {
        created: timestamp,
      },
    });

    for (const part of input.parts) {
      this.sessionStateStore.upsertPart(
        this.createCanonicalUserPart(input.sessionID, input.messageID, part),
      );
    }

    return this.getCanonicalSessionState(input.sessionID) ?? {
      sessionID: input.sessionID,
      messages: [],
      partsByMessageID: {},
    };
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
      const session = await this.sessionLifecycle.getSessionInfo(sessionId);
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
      this.diagnostics.logServiceWarning(
        'session.get',
        `Failed to load session info for ${sessionId} while applying revert state`,
        error,
      );
      return messages;
    }
  }

  private applyCanonicalSnapshot(
    sessionId: string,
    messages: OpenCodeSessionMessageWithParts[],
  ): void {
    this.sessionStateStore.replaceSessionSnapshot(sessionId, messages);
  }

  private applyCanonicalSyncEvent(update: SessionSyncEventUpdate): void {
    switch (update.type) {
      case 'message.updated':
        this.sessionStateStore.upsertMessage(update.info);
        return;
      case 'message.removed':
        this.sessionStateStore.removeMessage(update.sessionId, update.messageId);
        return;
      case 'message.part.updated':
        this.sessionStateStore.upsertPart(update.part);
        return;
      case 'message.part.removed':
        this.sessionStateStore.removePart(update.messageId, update.partId);
        return;
      case 'message.part.delta':
        this.sessionStateStore.appendPartDelta({
          messageID: update.messageId,
          partID: update.partId,
          field: update.field,
          delta: update.delta,
        });
        return;
      case 'session.diff':
        return;
    }
  }

  private applyCanonicalStreamMutations(mutations: OpenCodeStreamMutation[]): void {
    for (const mutation of mutations) {
      this.applyCanonicalStreamMutation(mutation);
    }
  }

  private applyCanonicalStreamMutation(mutation: OpenCodeStreamMutation): void {
    switch (mutation.type) {
      case 'message.upserted':
        this.ensureCanonicalStreamMessage(mutation);
        return;
      case 'part.upserted':
        this.ensureCanonicalStreamMessage(mutation);
        if (mutation.part) {
          this.upsertCanonicalStreamPart(mutation.part);
        }
        return;
      case 'part.delta':
        this.ensureCanonicalStreamMessage(mutation);
        this.applyCanonicalStreamPartDelta(mutation);
        return;
      case 'part.completed':
        this.ensureCanonicalStreamMessage(mutation);
        return;
    }
  }

  private ensureCanonicalStreamMessage(mutation: Pick<
    OpenCodeStreamMutation,
    'sessionID' | 'messageID' | 'role' | 'createdAt'
  >): void {
    const existing = this.getCanonicalSessionState(mutation.sessionID)?.messages.find(
      (message) => message.id === mutation.messageID,
    );
    if (existing) {
      return;
    }

    this.sessionStateStore.upsertMessage({
      id: mutation.messageID,
      sessionID: mutation.sessionID,
      role: mutation.role ?? 'assistant',
      time: {
        created: mutation.createdAt ?? Date.now(),
      },
    });
  }

  private upsertCanonicalStreamPart(part: Part): void {
    const existing = this.getCanonicalSessionState(part.sessionID)?.partsByMessageID[part.messageID]
      ?.find((candidate) => candidate.id === part.id);
    const nextPart = existing ? this.mergeCanonicalStreamPart(existing, part) : part;
    this.sessionStateStore.upsertPart(nextPart);
  }

  private mergeCanonicalStreamPart(existing: Part, incoming: Part): Part {
    const merged = this.mergeDefinedRecords(
      existing as Record<string, unknown>,
      incoming as Record<string, unknown>,
    );
    return merged as Part;
  }

  private mergeDefinedRecords(
    existing: Record<string, unknown>,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined) {
        continue;
      }

      if (isPlainRecord(value) && isPlainRecord(merged[key])) {
        merged[key] = this.mergeDefinedRecords(
          merged[key] as Record<string, unknown>,
          value,
        );
        continue;
      }

      merged[key] = value;
    }

    return merged;
  }

  private applyCanonicalStreamPartDelta(mutation: OpenCodeStreamMutation): void {
    if (!mutation.partID || !mutation.field || typeof mutation.delta !== 'string') {
      return;
    }

    const nextState = this.sessionStateStore.appendPartDelta({
      messageID: mutation.messageID,
      partID: mutation.partID,
      field: mutation.field,
      delta: mutation.delta,
    });
    if (nextState) {
      return;
    }

    const nextPart: Record<string, unknown> = {
      id: mutation.partID,
      sessionID: mutation.sessionID,
      messageID: mutation.messageID,
      type: mutation.partType ?? 'text',
    };
    nextPart[mutation.field] = mutation.delta;
    this.sessionStateStore.upsertPart(nextPart as Part);
  }

  private resolveStructuredPromptSendPayload(
    message: string,
    options: PromptTransportOptions,
  ): BuiltPromptSendPayload {
    if (options.requestParts) {
      return this.promptRequestBuilder.buildStructuredPromptSendPayload({
        messageID: options.messageID,
        parts: options.requestParts,
        syntheticTextParts: options.syntheticTextParts,
      });
    }

    return this.buildStructuredPromptSendPayload(message, options);
  }

  private createPromptEntityId(kind: PromptRequestEntityKind): string {
    this.promptRequestEntitySequence += 1;
    const randomValue = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${this.promptRequestEntitySequence}`;
    return `${kind}-${randomValue}`;
  }

  private createCanonicalUserPart(
    sessionID: string,
    messageID: string,
    part: PromptRequestPart,
  ): Part {
    if (part.type === 'text') {
      return {
        ...part,
        id: part.id ?? this.createPromptEntityId('part'),
        sessionID,
        messageID,
        ...(part.metadata ? { metadata: { ...part.metadata } } : {}),
      };
    }

    return {
      ...part,
      id: part.id ?? this.createPromptEntityId('part'),
      sessionID,
      messageID,
      ...(part.source ? {
        source: {
          ...part.source,
          text: { ...part.source.text },
        },
      } : {}),
    } as Part;
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
    await this.serviceLifecycle.updateSettings(settings);
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
    return this.catalogQueries.refreshMcpServerStatus();
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
    return this.catalogQueries.refreshMcpServerStatus();
  }

  async addMcpServer(name: string, config: Record<string, unknown>): Promise<Record<string, McpServerStatus>> {
    return this.catalogQueries.addMcpServer(name, config);
  }

  async connectMcpServer(name: string): Promise<boolean> {
    return this.catalogQueries.connectMcpServer(name);
  }

  async disconnectMcpServer(name: string): Promise<boolean> {
    return this.catalogQueries.disconnectMcpServer(name);
  }

  async startMcpAuth(name: string): Promise<unknown> {
    return this.catalogQueries.startMcpAuth(name);
  }

  async completeMcpAuth(name: string, code: string): Promise<McpServerStatus> {
    return this.catalogQueries.completeMcpAuth(name, code);
  }

  async authenticateMcp(name: string): Promise<McpServerStatus> {
    return this.catalogQueries.authenticateMcp(name);
  }

  async removeMcpAuth(name: string): Promise<{ success: true }> {
    return this.catalogQueries.removeMcpAuth(name);
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
    input: SessionCommandInput,
  ): Promise<{ info: Message; parts: Part[] }> {
    return this.sessionControl.runSessionCommand(sessionId, input);
  }

  async runSessionShell(
    sessionId: string,
    input: SessionShellInput,
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
    return this.catalogQueries.getProviderAuthMethods();
  }

  async authorizeProviderOAuth(providerID: string): Promise<unknown> {
    return this.catalogQueries.authorizeProviderOAuth(providerID);
  }

  async completeProviderOAuth(providerID: string, code: string, method?: number): Promise<unknown> {
    return this.catalogQueries.completeProviderOAuth(providerID, code, method);
  }

  async listProjects(): Promise<unknown> {
    return this.catalogQueries.listProjects();
  }

  async getCurrentProject(): Promise<unknown> {
    return this.catalogQueries.getCurrentProject();
  }

  async initializeProjectGit(): Promise<unknown> {
    return this.catalogQueries.initializeProjectGit();
  }

  async updateProject(projectID: string, input: Record<string, unknown>): Promise<unknown> {
    return this.catalogQueries.updateProject(projectID, input);
  }

  async listFiles(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.catalogQueries.listFiles(input);
  }

  async readFile(input: Record<string, unknown>): Promise<unknown> {
    return this.catalogQueries.readFile(input);
  }

  async getFileStatus(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.catalogQueries.getFileStatus(input);
  }

  async findText(input: Record<string, unknown>): Promise<unknown> {
    return this.catalogQueries.findText(input);
  }

  async findFiles(input: Record<string, unknown>): Promise<unknown> {
    return this.catalogQueries.findFiles(input);
  }

  async findSymbols(input: Record<string, unknown>): Promise<unknown> {
    return this.catalogQueries.findSymbols(input);
  }

  async getPaths(): Promise<unknown> {
    return this.catalogQueries.getPaths();
  }

  async getVcsInfo(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.catalogQueries.getVcsInfo(input);
  }

  async getVcsDiff(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.catalogQueries.getVcsDiff(input);
  }

  async getFormatterStatus(): Promise<unknown> {
    return this.catalogQueries.getFormatterStatus();
  }

  async getLspStatus(): Promise<unknown> {
    return this.catalogQueries.getLspStatus();
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

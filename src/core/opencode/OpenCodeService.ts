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
  formatContextLabel,
  getToolIdentity,
  isInternalStructuredOutputTool,
  parseLineRangeFromFileUrl,
  parseObsidianContextTag,
  resolveContextMimeFromPath,
  resolveToolExecutionStatus,
  resolveToolResultText,
  type ToolIdentityKind,
} from '../../shared';
import {
  contextPathFromFileUrl,
  normalizeContextAttachmentPath,
  normalizeContextPath,
} from '../../shared/contextPath';
import type {
  ChatMessage,
  ContentBlock,
  ImageAttachment,
  MessageContextAttachment,
  OpencodeModelConfigSubset,
  PermissionReply,
  PermissionRequest,
  PromptContextLineRange,
  QuestionOption,
  QuestionPrompt,
  QuestionRequest as ChatQuestionRequest,
  SessionDiffEntry,
  SessionTodo,
  StreamChunk,
} from '../types';
import type { OpenCodianSettings } from '../types/settings';
import { getServerBaseUrl, isLocalServerMode } from '../types/settings';
import { createSdkClient } from './createSdkClient';
import { detectOmoMessageMeta } from './omoCompat';
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
import {
  OpenCodePromptRequestBuilder,
} from './OpenCodePromptRequestBuilder';
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
const INLINE_READ_TOOL_PREFIX = 'Called the Read tool with the following input:';
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

/** SSE Event types from OpenCode server */
interface SSEEvent {
  event: string;
  data: string;
}

/** OpenCode event data structure (nested in data field) */
interface OpenCodeEvent {
  type: string;
  properties: {
    sessionID?: string;
    messageID?: string;
    id?: string;
    permission?: string;
    patterns?: string[];
    metadata?: Record<string, unknown>;
    message?: {
      id: string;
      role: string;
      parts?: Array<{
        type: string;
        text?: string;
        callID?: string;
        tool?: string;
        state?: {
          status: string;
          input?: Record<string, unknown>;
          output?: string;
          error?: string;
          metadata?: Record<string, unknown>;
        };
      }>;
    };
    part?: {
      id: string;
      sessionID?: string;
      type: string;
      text?: string;
      callID?: string;
      tool?: string;
      state?: {
        status: string;
        input?: Record<string, unknown>;
        output?: string;
        error?: string;
        metadata?: Record<string, unknown>;
      };
    };
    delta?: string;
    field?: string;
    partID?: string;
    toolID?: string;
    result?: string;
    error?: string;
    usage?: {
      input?: number;
      output?: number;
    };
    file?: string;
    questions?: Array<{
      question?: string;
      header?: string;
      options?: Array<{ label?: string; description?: string }>;
      multiple?: boolean;
      custom?: boolean;
    }>;
  };
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

/** Session data structure */
interface Session {
  id: string;
  title: string;
  revert?: {
    messageID: string;
    partID?: string;
  } | null;
  time: {
    created: number;
    updated: number;
  };
}

/** Message data structure */
interface Message {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  providerID?: string;
  modelID?: string;
  structured?: unknown;
  error?: unknown;
  cost?: number;
  tokens?: {
    total?: number;
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
  time: {
    created: number;
    updated?: number;
  };
}

/** Part data structure */
interface Part {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  duration?: number;
  time?: {
    start?: number;
    end?: number;
  };
  [key: string]: unknown;
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

function resolveReasoningDurationSeconds(part: Pick<Part, 'duration' | 'time'>): number | undefined {
  const start = part.time?.start;
  const end = part.time?.end;
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    return Math.max(0, end - start) / 1000;
  }

  if (typeof part.duration === 'number' && part.duration > 0) {
    return part.duration;
  }

  return undefined;
}

function formatModelIdentifier(providerID?: string, modelID?: string): string | undefined {
  if (providerID && modelID) {
    return `${providerID}/${modelID}`;
  }

  if (typeof modelID === 'string' && modelID.trim()) {
    return modelID.trim();
  }

  return undefined;
}

interface StreamingTextDeltaDebugState {
  sequence: number;
  source: 'event' | 'finalize';
  partId: string | null;
  partType: string;
  length: number;
  totalLength: number;
  preview: string;
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

interface StreamingState {
  lastContent: string;
  lastErrorMessage: string | null;
  processedToolIds: Set<string>;
  toolInputSnapshots: Map<string, string>;
  debugChunkSequence: number;
  lastTextDelta: StreamingTextDeltaDebugState | null;
}

type StreamPartTypeState = OpenCodeStreamingRuntimeContext | {
  partTypeMap?: Map<string, string>;
};

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
  readonly sdk: OpenCodeSdkFacade;
  private settings: OpenCodianSettings;
  private events: OpenCodeServiceEvents;
  private serverManager: ServerManager;
  private currentSessionId: string | null = null;
  private responseHandlers: ResponseHandler[] = [];
  private baseUrl: string;
  private sdkFeatureFlags: SdkFeatureFlags;
  private syncEventRuntime: OpenCodeSyncEventRuntimeCoordinator;
  private catalogState: OpenCodeCatalogStateStore;
  private contextPartSerializer: OpenCodeContextPartSerializer;
  private promptRequestBuilder: OpenCodePromptRequestBuilder;
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
    if (this.shouldUseSdk('sdkCrud')) {
      const response = await this.getSdkClient().session.create({
        title: title ?? 'New Conversation',
      });
      const sessionId = this.normalizeSessionId(response);

      if (options.setCurrent ?? true) {
        this.currentSessionId = sessionId;
      }
      return sessionId;
    }

    
    const response = await this.post<unknown>('/session', {
      title: title ?? 'New Conversation',
    });
    

    
    // Handle different response formats
    let sessionId: string;
    if (typeof response === 'object' && response !== null) {
      sessionId = (response as { id: string }).id;
    } else {
      throw new Error('Invalid session response: ' + JSON.stringify(response));
    }
    

    if (options.setCurrent ?? true) {
      this.currentSessionId = sessionId;
    }
    return sessionId;
  }

  /** Set current session */
  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  /** Get current session ID */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /** Cancel the current streaming response */
  cancelStream(sessionId?: string): void {
    this.streamingRuntime.cancelStream(sessionId ?? this.currentSessionId);
  }

  /** Stop watching the current stream locally without aborting the server-side session */
  detachStream(sessionId?: string): void {
    this.streamingRuntime.detachStream(sessionId ?? this.currentSessionId);
  }

  /** List all sessions */
  async listSessions(): Promise<Session[]> {
    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const response = await this.getSdkClient().session.list();
        return Array.isArray(response) ? response as Session[] : [];
      } catch (error) {
        this.logServiceWarning('session.list', 'SDK session.list failed, falling back to legacy HTTP', error);
      }
    }

    try {
      return await this.get<Session[]>('/session');
    } catch {
      return [];
    }
  }

  /** Get session messages - OpenCode API returns {info: Message, parts: Part[]}[] */
  async getSessionMessages(sessionId: string): Promise<{ info: Message; parts: Part[] }[]> {
    if (!sessionId) {
      logger.warn('getSessionMessages called with empty sessionId');
      return [];
    }

    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const response = await this.getSdkClient().session.messages({ sessionID: sessionId });
        const messages = await this.applySessionRevertState(
          sessionId,
          this.normalizeSessionMessages(response),
        );
        this.observeToolNamesInMessages(messages);
        return messages;
      } catch (error) {
        this.logServiceWarning('session.messages', `SDK session.messages failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    
    try {
      // Note: The correct endpoint is /session/:id/message (singular, not plural)
      const path = `/session/${sessionId}/message`;

      
      const response = await this.get<unknown>(path);

      const messages = await this.applySessionRevertState(
        sessionId,
        Array.isArray(response) ? response : [],
      );
      this.observeToolNamesInMessages(messages);
      return messages;
    } catch (error) {
      this.logServiceError('session.messages', `Failed to get messages for session ${sessionId}:`, error);
      // Return empty array instead of throwing to prevent UI crash
      return [];
    }
  }

  async getSessionTodos(sessionId: string): Promise<SessionTodo[]> {
    if (!sessionId) {
      logger.warn('getSessionTodos called with empty sessionId');
      return [];
    }

    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const response = await this.getSdkClient().session.todo({ sessionID: sessionId });
        return this.normalizeSessionTodos(response);
      } catch (error) {
        this.logServiceWarning('session.todo', `SDK session.todo failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    try {
      const response = await this.get<unknown>(`/session/${sessionId}/todo`);
      return this.normalizeSessionTodos(response);
    } catch (error) {
      this.logServiceError('session.todo', `Failed to get todos for session ${sessionId}:`, error);
      return [];
    }
  }

  async getSessionStatuses(): Promise<Record<string, SessionActivityStatus>> {
    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const response = await this.getSdkClient().session.status();
        return this.normalizeSessionStatuses(response);
      } catch (error) {
        this.logServiceWarning('session.status', 'SDK session.status failed, falling back to legacy HTTP', error);
      }
    }

    try {
      const response = await this.get<unknown>('/session/status');
      return this.normalizeSessionStatuses(response);
    } catch (error) {
      this.logServiceError('session.status', 'Failed to get session statuses:', error);
      return {};
    }
  }

  subscribeToSessionTodoUpdates(
    listener: (update: SessionTodoUpdate) => void,
  ): () => void {
    return this.syncEventRuntime.subscribeToSessionTodoUpdates(listener);
  }

  subscribeToSessionStatusUpdates(
    listener: (update: SessionStatusUpdate) => void,
  ): () => void {
    return this.syncEventRuntime.subscribeToSessionStatusUpdates(listener);
  }

  subscribeToSessionSyncEvents(
    listener: (update: SessionSyncEventUpdate) => void,
  ): () => void {
    return this.syncEventRuntime.subscribeToSessionSyncEvents(listener);
  }

  /** Delete a session */
  async deleteSession(sessionId: string): Promise<void> {
    if (this.shouldUseSdk('sdkCrud')) {
      await this.getSdkClient().session.delete({ sessionID: sessionId });
    } else {
      await this.delete(`/session/${sessionId}`);
    }

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }

  /** Update a session title */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    if (this.shouldUseSdk('sdkCrud')) {
      await this.getSdkClient().session.update({
        sessionID: sessionId,
        title,
      });
      return;
    }

    await this.patch<Session>(`/session/${sessionId}`, { title });
  }

  /** Send a message and wait for the full assistant response */
  async requestAssistantResponse(
    message: string,
    options: QueryOptions & { sessionId?: string; system?: string },
  ): Promise<ChatMessage | null> {
    const sessionId = options.sessionId ?? this.currentSessionId;
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
    const sessionId = options.sessionId ?? this.currentSessionId;
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

  private getToolInputSnapshot(input: Record<string, unknown> | undefined): string {
    if (!input || Object.keys(input).length === 0) {
      return '';
    }

    try {
      return JSON.stringify(input);
    } catch {
      return '[unserializable-tool-input]';
    }
  }

  private setStreamPartType(streamContext: StreamPartTypeState, partId: string, partType: string): void {
    if (streamContext instanceof OpenCodeStreamingRuntimeContext) {
      streamContext.setPartType(partId, partType);
      return;
    }

    if (!partId || !partType) {
      return;
    }

    streamContext.partTypeMap?.set(partId, partType);
  }

  private hasStreamPartType(streamContext: StreamPartTypeState, partId: string): boolean {
    if (streamContext instanceof OpenCodeStreamingRuntimeContext) {
      return streamContext.hasPartType(partId);
    }

    return streamContext.partTypeMap?.has(partId) ?? false;
  }

  private getStreamPartType(streamContext: StreamPartTypeState, partId: string): string | undefined {
    if (streamContext instanceof OpenCodeStreamingRuntimeContext) {
      return streamContext.getPartType(partId);
    }

    return streamContext.partTypeMap?.get(partId);
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

  private normalizeQuestionRequest(raw: unknown): ChatQuestionRequest | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const request = raw as {
      id?: unknown;
      sessionID?: unknown;
      questions?: unknown;
    };

    if (typeof request.id !== 'string' || typeof request.sessionID !== 'string') {
      return null;
    }

    const questions = Array.isArray(request.questions)
      ? request.questions.reduce<QuestionPrompt[]>((items, question) => {
          const normalized = this.normalizeQuestionPrompt(question);
          if (normalized) {
            items.push(normalized);
          }
          return items;
        }, [])
      : [];

    if (questions.length === 0) {
      return null;
    }

    return {
      id: request.id,
      sessionId: request.sessionID,
      questions,
    };
  }

  private normalizeQuestionPrompt(raw: unknown): QuestionPrompt | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const prompt = raw as {
      question?: unknown;
      header?: unknown;
      options?: unknown;
      multiple?: unknown;
      custom?: unknown;
    };

    const questionText = typeof prompt.question === 'string' ? prompt.question.trim() : '';
    const header = typeof prompt.header === 'string' && prompt.header.trim()
      ? prompt.header.trim()
      : questionText;
    if (!questionText || !header) {
      return null;
    }

    const options = Array.isArray(prompt.options)
      ? prompt.options.reduce<QuestionOption[]>((items, option) => {
          if (!option || typeof option !== 'object') {
            return items;
          }

          const normalizedOption = option as { label?: unknown; description?: unknown };
          const label = typeof normalizedOption.label === 'string' ? normalizedOption.label.trim() : '';
          if (!label) {
            return items;
          }

          items.push({
            label,
            description: typeof normalizedOption.description === 'string'
              ? normalizedOption.description.trim()
              : '',
          });
          return items;
        }, [])
      : [];

    return {
      question: questionText,
      header,
      options,
      multiple: prompt.multiple === true,
      custom: prompt.custom !== false,
    };
  }

  private observeRuntimeToolNames(toolNames: Iterable<string>): boolean {
    return this.catalogState.observeRuntimeToolNames(toolNames);
  }

  private buildOpenCodeToolIdentityContext(): OpenCodeCatalogToolIdentityContext {
    return this.catalogState.buildToolIdentityContext();
  }

  private getOpenCodeToolKind(toolName: string | undefined | null): ToolIdentityKind {
    return OpenCodeService.getOpenCodeToolKind(toolName, this.buildOpenCodeToolIdentityContext());
  }

  private static getOpenCodeToolKind(
    toolName: string | undefined | null,
    context: OpenCodeCatalogToolIdentityContext = {},
  ): ToolIdentityKind {
    return getToolIdentity(toolName || 'unknown', {
      source: 'opencode',
      knownMcpTools: context.knownMcpTools,
      registryTools: context.registryTools,
      observedExternalTools: context.observedExternalTools,
    }).kind;
  }

  private handleStreamingEvent(
    eventData: OpenCodeEvent,
    sessionId: string,
    state: StreamingState,
    streamContext: StreamPartTypeState,
  ): { chunks: StreamChunk[]; stop: boolean } {
    if (eventData.properties?.sessionID && eventData.properties.sessionID !== sessionId) {
      return { chunks: [], stop: false };
    }

    const partSessionId = eventData.properties?.part?.sessionID;
    if (partSessionId && partSessionId !== sessionId) {
      return { chunks: [], stop: false };
    }

    const chunks: StreamChunk[] = [];

    if (eventData.properties?.usage) {
      chunks.push({
        type: 'usage',
        inputTokens: eventData.properties.usage.input ?? 0,
        outputTokens: eventData.properties.usage.output ?? 0,
        sessionId,
      });
    }

    if (eventData.type === 'message.part.updated') {
      const part = eventData.properties?.part as Part | undefined;
      if (part?.id && part?.type) {
        this.setStreamPartType(streamContext, part.id, part.type);

        if (part.type === 'tool') {
          const toolPart = part as ToolPartData;
          const toolId = toolPart.callID || toolPart.id;
          const toolName = toolPart.tool || 'unknown';
          if (isInternalStructuredOutputTool(toolName)) {
            return { chunks, stop: false };
          }

          this.observeRuntimeToolNames([toolName]);

          if (toolId) {
            const toolKind = this.getOpenCodeToolKind(toolName);
            const toolInput = toolPart.state?.input || {};
            const nextSnapshot = this.getToolInputSnapshot(toolInput);
            const previousSnapshot = state.toolInputSnapshots.get(toolId);
            const shouldEmitToolUse =
              !state.processedToolIds.has(toolId)
              || nextSnapshot !== previousSnapshot;

            if (shouldEmitToolUse) {
              state.processedToolIds.add(toolId);
              state.toolInputSnapshots.set(toolId, nextSnapshot);
              chunks.push({
                type: 'tool_use',
                id: toolId,
                name: toolName,
                kind: toolKind,
                input: toolInput,
              });
            }

            const toolStatus = resolveToolExecutionStatus({
              toolName,
              state: toolPart.state,
            });
            const toolResult = resolveToolResultText(toolPart.state);
            if ((toolStatus === 'completed' || toolStatus === 'error') && toolResult !== undefined) {
              const resultKey = `${toolId}_result`;
              if (!state.processedToolIds.has(resultKey)) {
                state.processedToolIds.add(resultKey);
                chunks.push({
                  type: 'tool_result',
                  toolUseId: toolId,
                  content: toolResult,
                  isError: toolStatus === 'error',
                });
              }
            }
          }
        }

        if (part.type === 'reasoning' || part.type === 'thinking') {
          const durationSeconds = resolveReasoningDurationSeconds(part);
          if (durationSeconds !== undefined) {
            chunks.push({
              type: 'thinking',
              content: '',
              partId: part.id,
              durationSeconds,
            });
          }
        }
      }

      return { chunks, stop: false };
    }

    if (eventData.type === 'message.part.delta') {
      const delta = eventData.properties?.delta;
      const field = eventData.properties?.field;
      const partID = eventData.properties?.partID;

      if (!delta || !field) {
        return { chunks, stop: false };
      }

      if (partID && !this.hasStreamPartType(streamContext, partID)) {
        const partType = eventData.properties?.part?.type;
        this.setStreamPartType(streamContext, partID, partType || 'text');
      }

      const partType = partID ? (this.getStreamPartType(streamContext, partID) || 'text') : 'text';

      if (field === 'text') {
        if (partType === 'reasoning' || partType === 'thinking') {
          chunks.push({ type: 'thinking', content: delta, partId: partID });
        } else {
          chunks.push({ type: 'text', content: delta });
          state.lastContent += delta;
          state.debugChunkSequence += 1;
          state.lastTextDelta = {
            sequence: state.debugChunkSequence,
            source: 'event',
            partId: partID ?? null,
            partType,
            length: delta.length,
            totalLength: state.lastContent.length,
            preview: getDebugTextPreview(delta, 120),
          };
          logAssistantFinalizationDebug('service-text-delta', {
            sessionId,
            chunkSequence: state.debugChunkSequence,
            partId: partID ?? null,
            partType,
            deltaLength: delta.length,
            totalLength: state.lastContent.length,
            deltaPreview: getDebugTextPreview(delta, 120),
          });
        }
      }

      return { chunks, stop: false };
    }

    if (eventData.type === 'permission.asked') {
      const permission = eventData.properties;
      if (permission?.id) {
        chunks.push({
          type: 'permission_request',
          id: permission.id,
          permission: permission.permission || 'unknown',
          patterns: permission.patterns || [],
          metadata: permission.metadata || {},
        });
      }

      return { chunks, stop: false };
    }

    if (eventData.type === 'file.edited') {
      const file = eventData.properties?.file;
      if (typeof file === 'string' && file.trim()) {
        chunks.push({ type: 'file_edited', file: file.trim() });
      }

      return { chunks, stop: false };
    }

    if (eventData.type === 'session.error') {
      const errorName = extractStructuredErrorName(eventData.properties?.error);
      const errorMessage = extractStructuredErrorMessage(eventData.properties?.error) ?? 'Unknown error';
      state.lastErrorMessage = errorMessage;
      logAssistantFinalizationDebug('service-session-error', {
        sessionId,
        errorName,
        errorMessage,
      });
      if (errorName === 'MessageAbortedError') {
        return { chunks, stop: true };
      }

      chunks.push({
        type: 'error',
        content: errorMessage,
      });
      return { chunks, stop: true };
    }

    if (eventData.type === 'session.idle') {
      logAssistantFinalizationDebug('service-session-idle', {
        sessionId,
        accumulatedTextLength: state.lastContent.length,
        lastTextDelta: state.lastTextDelta,
      });
      return { chunks, stop: true };
    }

    if (eventData.type === 'question.asked') {
      const request = this.normalizeQuestionRequest(eventData.properties);
      if (request) {
        chunks.push({
          type: 'question_request',
          request,
        });
      }

      return { chunks, stop: false };
    }

    return { chunks, stop: false };
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

      let eventData: OpenCodeEvent;
      try {
        eventData = JSON.parse(event.data) as OpenCodeEvent;
      } catch {
        continue;
      }

      const outcome = this.handleStreamingEvent(eventData, sessionId, state, streamContext);
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

        const outcome = this.handleStreamingEvent(
          result.value as unknown as OpenCodeEvent,
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
          modelId: formatModelIdentifier(assistantMsg.info.providerID, assistantMsg.info.modelID) ?? null,
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
          modelId: formatModelIdentifier(assistantMsg.info.providerID, assistantMsg.info.modelID) ?? null,
          finalTextLength: lastContent.length,
        });
        yield {
          type: 'message_metadata',
          messageId: assistantMsg.info.id,
          timestamp: assistantMsg.info.time.created,
          modelId: formatModelIdentifier(assistantMsg.info.providerID, assistantMsg.info.modelID),
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
  private async *connectSSE(url: string, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
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
        const events = this.parseSSEEvents(buffer);
        buffer = events.remaining;
        
/*         if (events.events.length > 0) {

        } */
        
        for (const event of events.events) {
          yield event;
        }
      }

      // Process any remaining data
      if (buffer.trim() && !aborted && !signal?.aborted) {
        const events = this.parseSSEEvents(buffer + '\n\n');
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

  /** Parse SSE event data from buffer */
  private parseSSEEvents(buffer: string): { events: SSEEvent[]; remaining: string } {
    const events: SSEEvent[] = [];
    const lines = buffer.split('\n');
    let currentEvent: Partial<SSEEvent> = {};
    let remaining = '';
    
    // Check if buffer ends with incomplete event
    const lastDoubleNewline = buffer.lastIndexOf('\n\n');
    if (lastDoubleNewline === -1 || lastDoubleNewline !== buffer.length - 2) {
      remaining = lines.pop() || '';
    }

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentEvent.data = line.slice(5).trim();
      } else if (line === '') {
        // Empty line marks end of event
        // OpenCode SSE only has 'data:' lines, no 'event:' lines
        // Extract event type from JSON data if needed
        if (currentEvent.data !== undefined) {
          if (!currentEvent.event) {
            // Try to extract type from JSON data
            try {
              const parsed = JSON.parse(currentEvent.data) as { type?: string };
              currentEvent.event = parsed.type || 'unknown';
            } catch {
              currentEvent.event = 'unknown';
            }
          }
          events.push(currentEvent as SSEEvent);
        }
        currentEvent = {};
      }
    }

    return { events, remaining };
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
        const normalized = this.normalizeQuestionRequest(rawRequest);
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

  /** Transform SDK event to StreamChunks */
  private transformEventToChunks(event: unknown): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    if (typeof event !== 'object' || event === null) {
      return chunks;
    }

    const evt = event as { type?: string; properties?: Record<string, unknown> };
    const props = evt.properties;

    if (!props) {
      return chunks;
    }

    // Handle parts from message stream events
    if (props.parts && Array.isArray(props.parts)) {
      for (const part of props.parts) {
        const partChunks = this.transformPartToChunks(part as Part);
        chunks.push(...partChunks);
      }
    }

    // Handle direct part properties
    if (props.part) {
      const partChunks = this.transformPartToChunks(props.part as Part);
      chunks.push(...partChunks);
    }

    // Text content from properties
    if (props.text && typeof props.text === 'string') {
      chunks.push({ type: 'text', content: props.text });
    }

    // Usage information
    if (props.usage && typeof props.usage === 'object') {
      const usage = props.usage as { input?: number; output?: number };
      chunks.push({
        type: 'usage',
        inputTokens: usage.input ?? 0,
        outputTokens: usage.output ?? 0,
      });
    }

    return chunks;
  }

  /** Transform a single Part to StreamChunks */
  private transformPartToChunks(part: Part): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    switch (part.type) {
      case 'text': {
        if (part.text) {
          chunks.push({ type: 'text', content: part.text });
        }
        break;
      }
      case 'reasoning': {
        if (part.text) {
          chunks.push({
            type: 'thinking',
            content: part.text,
            partId: part.id,
            durationSeconds: resolveReasoningDurationSeconds(part),
          });
        }
        break;
      }
      case 'tool': {
        const toolPart = part as ToolPartData;
        if (isInternalStructuredOutputTool(toolPart.tool)) {
          break;
        }

        if (toolPart.state) {
          const toolStatus = resolveToolExecutionStatus({
            toolName: toolPart.tool,
            state: toolPart.state,
          });
          const toolName = toolPart.tool ?? '';
          if (toolStatus === 'pending' || toolStatus === 'running') {
            chunks.push({
              type: 'tool_use',
              id: toolPart.callID ?? '',
              name: toolName,
              kind: this.getOpenCodeToolKind(toolName),
              input: toolPart.state.input ?? {},
            });
          } else if (toolStatus === 'completed' || toolStatus === 'error') {
            const result = resolveToolResultText(toolPart.state)
              ?? (toolStatus === 'error' ? 'Error: Tool execution failed' : '');
            chunks.push({
              type: 'tool_result',
              toolUseId: toolPart.callID ?? '',
              content: result,
              isError: toolStatus === 'error',
            });
          }
        }
        break;
      }
    }

    return chunks;
  }

  /** Convert OpenCode message to ChatMessage */
  static openCodeMessageToChatMessage(
    info: Message,
    parts: Part[],
    vaultPath?: string,
    toolIdentityContext: OpenCodeCatalogToolIdentityContext = {},
  ): ChatMessage {
    const role = info.role === 'assistant' ? 'assistant' : 'user';

    const textParts = parts.filter((p): p is Part & { text: string } =>
      p.type === 'text' && typeof p.text === 'string'
    );
    const visibleTextParts: string[] = [];
    const contextAttachments: MessageContextAttachment[] = [];

    for (const part of textParts) {
      if (role === 'user') {
        const contextAttachment = parseObsidianContextTag(part.text);
        if (contextAttachment) {
          contextAttachments.push(contextAttachment);
          continue;
        }

        if ((part as Part & { synthetic?: boolean }).synthetic === true) {
          const inlineReadContext = OpenCodeService.extractInlineReadToolContext(part.text, vaultPath);
          if (inlineReadContext.attachments.length > 0) {
            contextAttachments.push(...inlineReadContext.attachments);
          }
          continue;
        }
      }

      visibleTextParts.push(part.text);
    }

    let content = visibleTextParts.join('');

    if (role === 'user') {
      for (const part of parts) {
        const contextAttachment = OpenCodeService.parseFileContextAttachment(part, vaultPath);
        if (contextAttachment) {
          contextAttachments.push(contextAttachment);
        }
      }

      const inlineReadContext = OpenCodeService.extractInlineReadToolContext(content, vaultPath);
      content = inlineReadContext.content;
      contextAttachments.push(...inlineReadContext.attachments);
    }

    const thinkingParts = parts.filter((p): p is Part & { text: string } =>
      p.type === 'reasoning' && typeof p.text === 'string'
    );

    const toolParts = parts.filter((p) =>
      p.type === 'tool' && !isInternalStructuredOutputTool((p as ToolPartData).tool),
    ) as ToolPartData[];
    const toolCalls = toolParts
      .filter((p) => {
        const toolStatus = resolveToolExecutionStatus({
          toolName: p.tool,
          state: p.state,
        });
        return toolStatus === 'pending' || toolStatus === 'running';
      })
      .map((p) => ({
        id: p.callID ?? '',
        name: p.tool ?? '',
        toolSourceKey: p.tool ?? undefined,
        kind: OpenCodeService.getOpenCodeToolKind(p.tool, toolIdentityContext),
        input: p.state?.input ?? {},
        status: 'pending' as const,
      }));

    const contentBlocks: ContentBlock[] = [];

    for (const part of thinkingParts) {
      contentBlocks.push({
        type: 'thinking',
        thinking: part.text,
        durationSeconds: resolveReasoningDurationSeconds(part),
      });
    }

    const processedToolIds = new Set<string>();
    for (const part of toolParts) {
      const toolId = part.callID || part.id;
      if (!toolId || processedToolIds.has(toolId)) {
        continue;
      }

      processedToolIds.add(toolId);

      const resultPart = toolParts.find((candidate) => {
        if ((candidate.callID || candidate.id) !== toolId) {
          return false;
        }

        const toolStatus = resolveToolExecutionStatus({
          toolName: candidate.tool,
          state: candidate.state,
        });
        return toolStatus === 'completed' || toolStatus === 'error';
      });
      const toolStatus = resolveToolExecutionStatus({
        toolName: part.tool,
        state: resultPart?.state ?? part.state,
      });

      contentBlocks.push({
        type: 'tool_use',
        toolId,
        toolName: part.tool || 'unknown',
        toolSourceKey: part.tool || undefined,
        toolKind: OpenCodeService.getOpenCodeToolKind(part.tool, toolIdentityContext),
        toolInput: part.state?.input || {},
        toolStatus,
        toolResult: resolveToolResultText(resultPart?.state),
      });
    }

    if (content) {
      contentBlocks.push({ type: 'text', text: content });
    }

    const timestamp = 'time' in info && info.time
      ? info.time.created
      : Date.now();

    const omo = detectOmoMessageMeta(role, content);
    const normalizedContent = omo?.kind === 'user-injection'
      ? omo.originalText
      : omo?.kind === 'system-reminder'
        ? omo.reminderText
        : content;
    const structured = role === 'assistant' ? info.structured : undefined;

    return {
      id: info.id,
      role,
      content: normalizedContent,
      timestamp,
      modelId: role === 'assistant'
        ? formatModelIdentifier(info.providerID, info.modelID)
        : undefined,
      sourceMessageId: info.id,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
      contextAttachments: contextAttachments.length > 0
        ? OpenCodeService.dedupeContextAttachments(contextAttachments)
        : undefined,
      displayStyle: omo?.kind === 'system-reminder' ? 'notice' : undefined,
      noticeTone: omo?.kind === 'system-reminder' ? 'info' : undefined,
      omo: omo ?? undefined,
      structured,
      parts,
    };
  }

  private static parseFileContextAttachment(
    part: Part,
    vaultPath?: string,
  ): MessageContextAttachment | null {
    if (part.type !== 'file') {
      return null;
    }

    const filePart = part as Part & {
      mime?: string;
      url?: string;
      source?: {
        type?: string;
        path?: string;
        text?: {
          value?: string;
        };
      };
    };

    const sourcePath = typeof filePart.source?.path === 'string'
      ? normalizeContextAttachmentPath(filePart.source.path, vaultPath)
      : undefined;
    const rawUrlPath = typeof filePart.url === 'string'
      ? contextPathFromFileUrl(filePart.url)
      : null;
    const urlPath = rawUrlPath
      ? normalizeContextAttachmentPath(rawUrlPath, vaultPath)
      : null;
    const contextPath = sourcePath ?? urlPath;
    if (!contextPath) {
      return null;
    }

    const lineRange = typeof filePart.url === 'string'
      ? parseLineRangeFromFileUrl(filePart.url) ?? undefined
      : undefined;
    const textSnapshot = typeof filePart.source?.text?.value === 'string'
      ? filePart.source.text.value
      : undefined;

    return {
      kind: lineRange ? 'selection' : 'file',
      path: contextPath,
      label: formatContextLabel(contextPath, lineRange),
      mime: typeof filePart.mime === 'string' && filePart.mime.trim()
        ? filePart.mime
        : resolveContextMimeFromPath(contextPath),
      lineRange,
      textSnapshot,
    };
  }

  private static extractInlineReadToolContext(
    text: string,
    vaultPath?: string,
  ): { content: string; attachments: MessageContextAttachment[] } {
    if (!text.includes(INLINE_READ_TOOL_PREFIX)) {
      return {
        content: text,
        attachments: [],
      };
    }

    const attachments: MessageContextAttachment[] = [];
    const visibleSegments: string[] = [];
    let cursor = 0;

    while (cursor < text.length) {
      const markerIndex = text.indexOf(INLINE_READ_TOOL_PREFIX, cursor);
      if (markerIndex < 0) {
        visibleSegments.push(text.slice(cursor));
        break;
      }

      const parsedInvocation = OpenCodeService.parseInlineReadToolInvocation(text, markerIndex, vaultPath);
      if (!parsedInvocation) {
        visibleSegments.push(text.slice(cursor, markerIndex + INLINE_READ_TOOL_PREFIX.length));
        cursor = markerIndex + INLINE_READ_TOOL_PREFIX.length;
        continue;
      }

      visibleSegments.push(text.slice(cursor, markerIndex));
      attachments.push(parsedInvocation.attachment);
      cursor = parsedInvocation.nextIndex;
    }

    return {
      content: visibleSegments.join('').trim(),
      attachments,
    };
  }

  private static parseInlineReadToolInvocation(
    text: string,
    markerIndex: number,
    vaultPath?: string,
  ): { attachment: MessageContextAttachment; nextIndex: number } | null {
    let cursor = markerIndex + INLINE_READ_TOOL_PREFIX.length;
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor += 1;
    }

    if (text[cursor] !== '{') {
      return null;
    }

    const jsonEnd = OpenCodeService.findBalancedJsonObjectEnd(text, cursor);
    if (jsonEnd < 0) {
      return null;
    }

    const parsedInput = OpenCodeService.safeParseJsonRecord(text.slice(cursor, jsonEnd + 1));
    const inputPath = OpenCodeService.extractPathFromToolInput(parsedInput);
    if (!inputPath) {
      return null;
    }

    const contextPath = normalizeContextAttachmentPath(inputPath, vaultPath);
    const lineRange = OpenCodeService.extractLineRangeFromToolInput(parsedInput);

    return {
      attachment: {
        kind: lineRange ? 'selection' : 'file',
        path: contextPath,
        label: formatContextLabel(contextPath, lineRange),
        mime: resolveContextMimeFromPath(contextPath),
        lineRange,
      },
      nextIndex: jsonEnd + 1,
    };
  }

  private static findBalancedJsonObjectEnd(text: string, startIndex: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index++) {
      const char = text[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  private static safeParseJsonRecord(value: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object'
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  private static extractPathFromToolInput(input: Record<string, unknown> | null): string | null {
    if (!input) {
      return null;
    }

    const candidates = [
      input.filePath,
      input.file_path,
      input.path,
      input.notebook_path,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return null;
  }

  private static extractLineRangeFromToolInput(
    input: Record<string, unknown> | null,
  ): PromptContextLineRange | undefined {
    if (!input) {
      return undefined;
    }

    const offset = OpenCodeService.parsePositiveInteger(input.offset);
    const limit = OpenCodeService.parsePositiveInteger(input.limit);
    if (offset === null || limit === null) {
      return undefined;
    }

    return {
      startLine: offset,
      endLine: offset + limit - 1,
    };
  }

  private static parsePositiveInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const parsed = Number(value.trim());
      return parsed > 0 ? parsed : null;
    }

    return null;
  }

  private static dedupeContextAttachments(
    attachments: MessageContextAttachment[],
  ): MessageContextAttachment[] {
    const seen = new Set<string>();
    const deduped: MessageContextAttachment[] = [];

    for (const attachment of attachments) {
      const key = [
        attachment.kind,
        attachment.path,
        attachment.lineRange?.startLine ?? '',
        attachment.lineRange?.endLine ?? '',
      ].join(':');

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push(attachment);
    }

    return deduped;
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

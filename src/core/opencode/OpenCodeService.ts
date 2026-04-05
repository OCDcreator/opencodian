/**
 * OpenCode Service
 *
 * Main service for interacting with OpenCode Server via HTTP API.
 * Uses Obsidian's requestUrl to bypass CORS restrictions.
 * Now supports SSE streaming for real-time message updates.
 */

import { requestUrl } from 'obsidian';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  buildObsidianContextTag,
  createLogger,
  formatContextLabel,
  isInternalStructuredOutputTool,
  isTextLikeMime,
  parseLineRangeFromFileUrl,
  parseObsidianContextTag,
  resolveContextMimeFromPath,
  resolveToolExecutionStatus,
  resolveToolResultText,
  toFileContextUrl,
} from '../../shared';
import type {
  ChatMessage,
  ContentBlock,
  ImageAttachment,
  MessageContextAttachment,
  PermissionReply,
  PermissionRequest,
  PromptContextItem,
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
import type { SdkFeatureFlags } from './sdkFeatureFlags';
import { resolveSdkFeatureFlags } from './sdkFeatureFlags';
import type { SdkEvent, SdkOpencodeClient, SdkOutputFormat } from './sdkTypes';
import { ServerManager } from './ServerManager';
import type {
  LocalOutputFormat,
  ManagedServerState,
  OpenCodeServerConfig,
  QueryOptions,
  ResponseHandler,
} from './types';

const logger = createLogger('OpenCodeService');
const INLINE_READ_TOOL_PREFIX = 'Called the Read tool with the following input:';

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
  processedToolIds: Set<string>;
  toolInputSnapshots: Map<string, string>;
  debugChunkSequence: number;
  lastTextDelta: StreamingTextDeltaDebugState | null;
}

interface ActiveStreamContext {
  sessionId: string;
  abortController: AbortController;
  partTypeMap: Map<string, string>;
}

type PromptRequestPart =
  | {
      type: 'text';
      text: string;
      synthetic?: boolean;
      ignored?: boolean;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'file';
      mime: string;
      filename?: string;
      url: string;
      source?: {
        type: 'file';
        path: string;
        text: {
          value: string;
          start: number;
          end: number;
        };
      };
    };

type SessionTodoUpdate = {
  sessionId: string;
  todos: SessionTodo[];
};

type SessionTodoListener = (update: SessionTodoUpdate) => void;

export type SessionActivityStatus =
  | {
      type: 'idle';
    }
  | {
      type: 'busy';
    }
  | {
      type: 'retry';
      attempt: number;
      message: string;
      next: number;
    };

type SessionStatusUpdate = {
  sessionId: string;
  status: SessionActivityStatus;
};

type SessionStatusListener = (update: SessionStatusUpdate) => void;

const REMOTE_CONTEXT_TEXT_LIMIT_BYTES = 64 * 1024;

export class OpenCodeService {
  private settings: OpenCodianSettings;
  private events: OpenCodeServiceEvents;
  private serverManager: ServerManager;
  private currentSessionId: string | null = null;
  private responseHandlers: ResponseHandler[] = [];
  private baseUrl: string;
  private activeStreams = new Map<string, ActiveStreamContext>();
  private sdkFeatureFlags: SdkFeatureFlags;
  private sessionTodoListeners = new Set<SessionTodoListener>();
  private sessionStatusListeners = new Set<SessionStatusListener>();
  private syncEventAbortController: AbortController | null = null;
  private syncEventPromise: Promise<void> | null = null;
  private syncEventWanted = false;
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

    this.serverManager = new ServerManager(
      this.buildServerConfig(settings),
      {
        onStatusChange: (status) => {
          events.onServerStatusChange?.(status);
          // Auto-fetch models when server starts running
          if (status === 'running') {
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

  /** Initialize the service */
  async initialize(): Promise<void> {
    if (isLocalServerMode(this.settings.server) && this.settings.server.local.autoStart) {
      await this.start();
    }
  }

  /** Set the vault path for OpenCode server to use project config */
  setVaultPath(path: string): void {
    this.vaultPath = path;
    this.serverManager.setWorkingDirectory(path);
    this.restartSyncEventSubscription();
  }

  getSettingsSnapshot(): OpenCodianSettings {
    return cloneSettings(this.settings);
  }

  /** Auto-fetch models when server starts and update defaults if needed */
  private async autoFetchModels(): Promise<void> {
    try {

      const result = await this.getAvailableModels();
      
      if (result.providers.length === 0) {
        logger.warn('No providers available from server');
        return;
      }

      // Check if current default provider is valid
      const currentProvider = result.providers.find(p => p.id === this.settings.defaultProvider);
      
      if (!currentProvider) {
        // Current provider not available, default to first provider
        const firstProvider = result.providers[0];
        this.settings.defaultProvider = firstProvider.id;
        
        // Also update model to first available for this provider
        if (firstProvider.models.length > 0) {
          this.settings.defaultModel = firstProvider.models[0].id;
        }
        

      } else {
        // Provider exists, check if model is valid
        const currentModel = currentProvider.models.find(m => m.id === this.settings.defaultModel);
        if (!currentModel && currentProvider.models.length > 0) {
          this.settings.defaultModel = currentProvider.models[0].id;

        }
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
    this.ensureSyncEventSubscription();
  }

  /** Stop the service */
  async stop(): Promise<void> {
    this.stopSyncEventSubscription();
    await this.serverManager.stop();
  }

  /** Check if service is ready */
  isReady(): boolean {
    return this.serverManager.getStatus() === 'running';
  }

  /** Get server status */
  getServerStatus(): string {
    return this.serverManager.getStatus();
  }

  /** Check server health directly */
  async checkHealth(): Promise<boolean> {
    if (!this.baseUrl) {
      return false;
    }

    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const response = await this.getSdkClient().global.health();
        return this.normalizeHealthResponse(response);
      } catch (error) {
        logger.warn('SDK health check failed, falling back to ServerManager health probe', error);
      }
    }

    return this.serverManager.checkHealth(3000);
  }

  /** Check if plugin has a server process running */
  isServerProcessRunning(): boolean {
    return this.serverManager.isRunning();
  }

  /** HTTP GET helper using Obsidian's requestUrl */
  private async get<T>(path: string): Promise<T> {
    this.ensureBaseUrl();

    const response = await requestUrl({
      url: `${this.baseUrl}${path}`,
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
  private async post<T>(path: string, body: unknown): Promise<T> {
    this.ensureBaseUrl();

    const response = await requestUrl({
      url: `${this.baseUrl}${path}`,
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
  private async patch<T>(path: string, body: unknown): Promise<T> {
    this.ensureBaseUrl();

    const response = await requestUrl({
      url: `${this.baseUrl}${path}`,
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
  private async delete(path: string): Promise<void> {
    this.ensureBaseUrl();

    await requestUrl({
      url: `${this.baseUrl}${path}`,
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
    const targetSessionId = sessionId ?? this.currentSessionId;
    if (!targetSessionId) {
      logger.debug('No session specified for stream cancellation');
      return;
    }

    const streamContext = this.activeStreams.get(targetSessionId);
    if (!streamContext) {
      logger.debug(`No active stream to cancel for session ${targetSessionId}`);
      return;
    }

    logger.debug(`Cancelling stream for session ${targetSessionId}...`);
    streamContext.abortController.abort();
    logger.debug('Abort signal sent');
    void this.abortSessionOnServer(targetSessionId);
  }

  /** Stop watching the current stream locally without aborting the server-side session */
  detachStream(sessionId?: string): void {
    const targetSessionId = sessionId ?? this.currentSessionId;
    if (!targetSessionId) {
      logger.debug('No session specified for local stream detach');
      return;
    }

    const streamContext = this.activeStreams.get(targetSessionId);
    if (!streamContext) {
      logger.debug(`No active stream to detach for session ${targetSessionId}`);
      return;
    }

    logger.debug(`Detaching local stream listener for session ${targetSessionId}...`);
    streamContext.abortController.abort();
    logger.debug('Local stream detach signal sent');
  }

  /** List all sessions */
  async listSessions(): Promise<Session[]> {
    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const response = await this.getSdkClient().session.list();
        return Array.isArray(response) ? response as Session[] : [];
      } catch (error) {
        logger.warn('SDK session.list failed, falling back to legacy HTTP', error);
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
        return await this.applySessionRevertState(
          sessionId,
          this.normalizeSessionMessages(response),
        );
      } catch (error) {
        logger.warn(`SDK session.messages failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    
    try {
      // Note: The correct endpoint is /session/:id/message (singular, not plural)
      const path = `/session/${sessionId}/message`;

      
      const response = await this.get<unknown>(path);

      return await this.applySessionRevertState(
        sessionId,
        Array.isArray(response) ? response : [],
      );
    } catch (error) {
      logger.error(`Failed to get messages for session ${sessionId}:`, error);
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
        logger.warn(`SDK session.todo failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    try {
      const response = await this.get<unknown>(`/session/${sessionId}/todo`);
      return this.normalizeSessionTodos(response);
    } catch (error) {
      logger.error(`Failed to get todos for session ${sessionId}:`, error);
      return [];
    }
  }

  async getSessionStatuses(): Promise<Record<string, SessionActivityStatus>> {
    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const response = await this.getSdkClient().session.status();
        return this.normalizeSessionStatuses(response);
      } catch (error) {
        logger.warn('SDK session.status failed, falling back to legacy HTTP', error);
      }
    }

    try {
      const response = await this.get<unknown>('/session/status');
      return this.normalizeSessionStatuses(response);
    } catch (error) {
      logger.error('Failed to get session statuses:', error);
      return {};
    }
  }

  subscribeToSessionTodoUpdates(listener: SessionTodoListener): () => void {
    this.sessionTodoListeners.add(listener);
    this.syncEventWanted = true;
    this.ensureSyncEventSubscription();

    return () => {
      this.sessionTodoListeners.delete(listener);
      if (!this.hasSyncEventListeners()) {
        this.stopSyncEventSubscription();
      }
    };
  }

  subscribeToSessionStatusUpdates(listener: SessionStatusListener): () => void {
    this.sessionStatusListeners.add(listener);
    this.syncEventWanted = true;
    this.ensureSyncEventSubscription();

    return () => {
      this.sessionStatusListeners.delete(listener);
      if (!this.hasSyncEventListeners()) {
        this.stopSyncEventSubscription();
      }
    };
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

    const parts = this.buildPromptRequestParts(message, options);
    const sharedOptions = this.buildSharedPromptOptions(options);

    if (this.shouldUseSdk('sdkPrompt')) {
      const response = await this.getSdkClient().session.prompt(
        this.buildSdkPromptParameters(sessionId, parts, options),
      );
      if (response && typeof response === 'object' && 'info' in response && 'parts' in response) {
        const typedResponse = response as AssistantMessageResponse;
        return OpenCodeService.openCodeMessageToChatMessage(typedResponse.info, typedResponse.parts, this.vaultPath);
      }

      throw new Error('Invalid assistant response payload');
    }

    const providerID = options.provider ?? this.settings.defaultProvider;
    const modelID = options.model ?? this.settings.defaultModel;
    const requestBody: Record<string, unknown> = {
      parts,
      model: {
        providerID,
        modelID,
      },
    };

    if (sharedOptions.system) {
      requestBody.system = sharedOptions.system;
    }
    if (sharedOptions.tools) {
      requestBody.tools = sharedOptions.tools;
    }
    if (sharedOptions.variant) {
      requestBody.variant = sharedOptions.variant;
    }
    if (sharedOptions.agent) {
      requestBody.agent = sharedOptions.agent;
    }
    if (typeof sharedOptions.noReply === 'boolean') {
      requestBody.noReply = sharedOptions.noReply;
    }
    if (sharedOptions.format) {
      requestBody.format = sharedOptions.format;
    }

    const response = await this.post<unknown>(`/session/${sessionId}/message`, requestBody);
    if (
      typeof response === 'object'
      && response !== null
      && 'info' in response
      && 'parts' in response
    ) {
      const typedResponse = response as AssistantMessageResponse;
      return OpenCodeService.openCodeMessageToChatMessage(typedResponse.info, typedResponse.parts, this.vaultPath);
    }

    throw new Error('Invalid assistant response payload');
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

    const parts = this.buildPromptRequestParts(message, options);
    const sharedOptions = this.buildSharedPromptOptions(options);

    // Build model config
    const providerID = options.provider ?? this.settings.defaultProvider;
    const modelID = options.model ?? this.settings.defaultModel;
    const modelOptions: Record<string, unknown> = {};

    if (options.reasoningEffort) {
      modelOptions.reasoningEffort = options.reasoningEffort;
    }

    if (options.thinkingBudget !== undefined) {
      modelOptions.thinking = options.thinkingBudget > 0
        ? {
            type: 'enabled',
            budgetTokens: options.thinkingBudget,
          }
        : {
            type: 'disabled',
          };
    }

    try {
      // Send the prompt using async endpoint
      const requestBody: Record<string, unknown> = { 
        parts,
        model: {
          providerID,
          modelID,
          ...(Object.keys(modelOptions).length > 0 ? { options: modelOptions } : {}),
        },
      };
      if (sharedOptions.system) {
        requestBody.system = sharedOptions.system;
      }
      if (sharedOptions.tools) {
        requestBody.tools = sharedOptions.tools;
      }
      if (sharedOptions.variant) {
        requestBody.variant = sharedOptions.variant;
      }
      if (sharedOptions.agent) {
        requestBody.agent = sharedOptions.agent;
      }
      if (typeof sharedOptions.noReply === 'boolean') {
        requestBody.noReply = sharedOptions.noReply;
      }
      if (sharedOptions.format) {
        requestBody.format = sharedOptions.format;
      }

      await this.post<void>(`/session/${sessionId}/prompt_async`, requestBody);

      const streamContext = this.createActiveStreamContext(sessionId);
      yield { type: 'message_start' };
      try {
        yield* this.consumeLegacyEventStream(sessionId, streamContext);
      } finally {
        this.releaseActiveStreamContext(streamContext);
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

  private getSdkClient(): SdkOpencodeClient {
    this.ensureBaseUrl();
    return createSdkClient({
      baseUrl: this.baseUrl,
      authHeaders: this.getAuthHeaders(),
      directory: this.vaultPath,
    });
  }

  private createStreamingState(): StreamingState {
    return {
      lastContent: '',
      processedToolIds: new Set<string>(),
      toolInputSnapshots: new Map(),
      debugChunkSequence: 0,
      lastTextDelta: null,
    };
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

  private createActiveStreamContext(sessionId: string): ActiveStreamContext {
    const existing = this.activeStreams.get(sessionId);
    if (existing) {
      logger.warn(`Replacing existing active stream context for session ${sessionId}`);
      existing.abortController.abort();
    }

    const context: ActiveStreamContext = {
      sessionId,
      abortController: new AbortController(),
      partTypeMap: new Map(),
    };
    this.activeStreams.set(sessionId, context);
    return context;
  }

  private releaseActiveStreamContext(streamContext: ActiveStreamContext): void {
    const current = this.activeStreams.get(streamContext.sessionId);
    if (current === streamContext) {
      this.activeStreams.delete(streamContext.sessionId);
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

  private hasSyncEventListeners(): boolean {
    return this.sessionTodoListeners.size > 0 || this.sessionStatusListeners.size > 0;
  }

  private ensureSyncEventSubscription(): void {
    if (!this.shouldUseSdk('sdkSync')) {
      return;
    }

    if (!this.syncEventWanted || !this.hasSyncEventListeners() || this.syncEventPromise) {
      return;
    }

    const abortController = new AbortController();
    this.syncEventAbortController = abortController;
    this.syncEventPromise = this.runSyncEventLoop(abortController).finally(() => {
      if (this.syncEventAbortController === abortController) {
        this.syncEventAbortController = null;
      }
      this.syncEventPromise = null;
      if (this.syncEventWanted && this.hasSyncEventListeners() && this.shouldUseSdk('sdkSync')) {
        this.ensureSyncEventSubscription();
      }
    });
  }

  private stopSyncEventSubscription(keepWanted = false): void {
    this.syncEventWanted = keepWanted;
    this.syncEventAbortController?.abort();
    this.syncEventAbortController = null;
  }

  private restartSyncEventSubscription(): void {
    if (!this.shouldUseSdk('sdkSync') || !this.hasSyncEventListeners()) {
      return;
    }

    this.stopSyncEventSubscription(true);
    if (!this.syncEventPromise) {
      this.ensureSyncEventSubscription();
    }
  }

  private async runSyncEventLoop(abortController: AbortController): Promise<void> {
    while (!abortController.signal.aborted && this.hasSyncEventListeners()) {
      try {
        const events = await this.getSdkClient().global.syncEvent.subscribe({
          signal: abortController.signal,
        });

        for await (const event of events.stream as AsyncIterable<unknown>) {
          if (abortController.signal.aborted) {
            break;
          }
          this.handleSyncEvent(event);
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          break;
        }
        logger.warn('SDK sync event stream failed', error);
      }

      if (abortController.signal.aborted) {
        break;
      }

      await this.delay(1000, abortController.signal).catch(() => {});
    }
  }

  private handleSyncEvent(event: unknown): void {
    if (!event || typeof event !== 'object') {
      return;
    }

    const value = event as {
      type?: string;
      properties?: {
        sessionID?: unknown;
        todos?: unknown;
        status?: unknown;
      };
    };

    const sessionId = typeof value.properties?.sessionID === 'string'
      ? value.properties.sessionID
      : '';
    if (!sessionId) {
      return;
    }

    if (value.type === 'todo.updated') {
      const todos = this.normalizeSessionTodos(value.properties?.todos);
      this.emitSessionTodoUpdate({ sessionId, todos });
      return;
    }

    if (value.type !== 'session.status') {
      return;
    }

    const status = this.normalizeSessionStatus(value.properties?.status);
    if (!status) {
      return;
    }

    this.emitSessionStatusUpdate({ sessionId, status });
  }

  private emitSessionTodoUpdate(update: SessionTodoUpdate): void {
    for (const listener of this.sessionTodoListeners) {
      try {
        listener(update);
      } catch (error) {
        logger.error('Session todo listener failed', error);
      }
    }
  }

  private emitSessionStatusUpdate(update: SessionStatusUpdate): void {
    for (const listener of this.sessionStatusListeners) {
      try {
        listener(update);
      } catch (error) {
        logger.error('Session status listener failed', error);
      }
    }
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
      logger.warn(`Failed to load session info for ${sessionId} while applying revert state`, error);
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
    const source = data as {
      providers?: Array<{ id: string; name?: string; models: unknown }>;
      all?: Array<{ id: string; name?: string; models: unknown }>;
      default?: Record<string, string>;
    };
    const providers = Array.isArray(source.providers)
      ? source.providers
      : Array.isArray(source.all)
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
      defaults: source.default && typeof source.default === 'object'
        ? source.default
        : {},
    };
  }

  private buildSdkPromptParameters(
    sessionId: string,
    parts: PromptRequestPart[],
    options: QueryOptions & { system?: string },
  ): {
    sessionID: string;
    model: {
      providerID: string;
      modelID: string;
    };
    parts: PromptRequestPart[];
    system?: string;
    tools?: Record<string, boolean>;
    variant?: string;
    agent?: string;
    noReply?: boolean;
    format?: SdkOutputFormat;
  } {
    if (options.thinkingBudget !== undefined) {
      logger.debug('thinkingBudget is not currently mapped to the SDK v2 prompt payload and is being omitted', {
        thinkingBudget: options.thinkingBudget,
      });
    }

    const parameters: {
      sessionID: string;
      model: {
        providerID: string;
        modelID: string;
      };
      parts: PromptRequestPart[];
      system?: string;
      tools?: Record<string, boolean>;
      variant?: string;
      agent?: string;
      noReply?: boolean;
      format?: SdkOutputFormat;
    } = {
      sessionID: sessionId,
      model: {
        providerID: options.provider ?? this.settings.defaultProvider,
        modelID: options.model ?? this.settings.defaultModel,
      },
      parts,
    };

    const sharedOptions = this.buildSharedPromptOptions(options);
    if (sharedOptions.system) {
      parameters.system = sharedOptions.system;
    }
    if (sharedOptions.tools) {
      parameters.tools = sharedOptions.tools;
    }
    if (sharedOptions.variant) {
      parameters.variant = sharedOptions.variant;
    }
    if (sharedOptions.agent) {
      parameters.agent = sharedOptions.agent;
    }
    if (typeof sharedOptions.noReply === 'boolean') {
      parameters.noReply = sharedOptions.noReply;
    }
    if (sharedOptions.format) {
      parameters.format = this.resolveSdkOutputFormat(sharedOptions.format);
    }

    return parameters;
  }

  private buildPromptRequestParts(
    message: string,
    options: QueryOptions,
  ): PromptRequestPart[] {
    const parts: PromptRequestPart[] = [{ type: 'text', text: message }];

    for (const item of options.contextItems ?? []) {
      parts.push(this.createPromptContextPart(item));
    }

    for (const image of options.images ?? []) {
      parts.push({
        type: 'file',
        mime: image.mediaType,
        filename: image.filename,
        url: `data:${image.mediaType};base64,${image.data}`,
      });
    }

    if (options.externalContextPaths?.length) {
      logger.debug('externalContextPaths are deprecated for sendMessage/requestAssistantResponse and are being omitted', {
        count: options.externalContextPaths.length,
      });
    }

    return parts;
  }

  private createPromptContextPart(item: PromptContextItem): PromptRequestPart {
    if (this.settings.server.mode === 'local') {
      const absolutePath = this.resolveContextAbsolutePath(item.path);
      const normalizedMime = isTextLikeMime(item.mime) ? 'text/plain' : item.mime;
      const part: Extract<PromptRequestPart, { type: 'file' }> = {
        type: 'file',
        mime: normalizedMime,
        filename: path.basename(item.path.replace(/\\/g, '/')),
        url: toFileContextUrl(absolutePath, item.lineRange),
      };

      logger.debug('Preparing local Obsidian context part', {
        kind: item.kind,
        path: item.path,
        requestedMime: item.mime,
        normalizedMime,
        hasLineRange: Boolean(item.lineRange),
        hasTextSnapshot: Boolean(item.textSnapshot),
      });

      if (item.kind === 'selection' && item.textSnapshot) {
        part.source = {
          type: 'file',
          path: item.path,
          text: {
            value: item.textSnapshot,
            start: 0,
            end: item.textSnapshot.length,
          },
        };
      }

      return part;
    }

    if (!isTextLikeMime(item.mime)) {
      throw new Error(`Only text context is supported in remote mode: ${item.label}`);
    }

    if (!item.textSnapshot) {
      throw new Error(`Missing text snapshot for remote context: ${item.label}`);
    }

    const byteLength = new TextEncoder().encode(item.textSnapshot).length;
    if (byteLength > REMOTE_CONTEXT_TEXT_LIMIT_BYTES) {
      throw new Error(`Context exceeds remote size limit: ${item.label}`);
    }

    return {
      type: 'text',
      text: buildObsidianContextTag(item),
      synthetic: true,
      metadata: {
        kind: item.kind,
        path: item.path,
        lines: item.lineRange ? `${item.lineRange.startLine}-${item.lineRange.endLine}` : undefined,
      },
    };
  }

  private resolveContextAbsolutePath(contextPath: string): string {
    if (path.isAbsolute(contextPath)) {
      return contextPath;
    }

    if (!this.vaultPath) {
      return contextPath;
    }

    return path.resolve(this.vaultPath, contextPath);
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

  private buildAllowedToolsRecord(allowedTools?: string[]): Record<string, boolean> | undefined {
    if (!allowedTools || allowedTools.length === 0) {
      return undefined;
    }

    return Object.fromEntries(allowedTools.map((toolName) => [toolName, true]));
  }

  private buildSharedPromptOptions(
    options: QueryOptions & { system?: string },
  ): {
    system?: string;
    tools?: Record<string, boolean>;
    variant?: string;
    agent?: string;
    noReply?: boolean;
    format?: LocalOutputFormat;
  } {
    const sharedOptions: {
      system?: string;
      tools?: Record<string, boolean>;
      variant?: string;
      agent?: string;
      noReply?: boolean;
      format?: LocalOutputFormat;
    } = {};

    const tools = this.buildAllowedToolsRecord(options.allowedTools);
    if (tools) {
      sharedOptions.tools = tools;
    }

    const variant = this.resolveSdkVariant(options);
    if (variant) {
      sharedOptions.variant = variant;
    }

    if (options.system?.trim()) {
      sharedOptions.system = options.system.trim();
    }

    if (typeof options.agent === 'string' && options.agent.trim()) {
      sharedOptions.agent = options.agent.trim();
    }

    if (typeof options.noReply === 'boolean') {
      sharedOptions.noReply = options.noReply;
    }

    const format = this.resolveLocalOutputFormat(options.format);
    if (format) {
      sharedOptions.format = format;
    }

    return sharedOptions;
  }

  private resolveLocalOutputFormat(format?: LocalOutputFormat): LocalOutputFormat | undefined {
    if (!format) {
      return undefined;
    }

    if (format.type === 'text') {
      return { type: 'text' };
    }

    return {
      type: 'json_schema',
      schema: format.schema,
      ...(typeof format.retryCount === 'number' ? { retryCount: format.retryCount } : {}),
    };
  }

  private resolveSdkOutputFormat(format: LocalOutputFormat): SdkOutputFormat {
    if (format.type === 'text') {
      return { type: 'text' };
    }

    return {
      type: 'json_schema',
      schema: format.schema,
      ...(typeof format.retryCount === 'number' ? { retryCount: format.retryCount } : {}),
    };
  }

  private resolveSdkVariant(options: QueryOptions): string | undefined {
    return options.reasoningEffort;
  }

  private handleStreamingEvent(
    eventData: OpenCodeEvent,
    sessionId: string,
    state: StreamingState,
    streamContext: ActiveStreamContext,
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
        streamContext.partTypeMap.set(part.id, part.type);

        if (part.type === 'tool') {
          const toolPart = part as ToolPartData;
          const toolId = toolPart.callID || toolPart.id;
          const toolName = toolPart.tool || 'unknown';
          if (isInternalStructuredOutputTool(toolName)) {
            return { chunks, stop: false };
          }

          if (toolId) {
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

      if (partID && !streamContext.partTypeMap.has(partID)) {
        const partType = eventData.properties?.part?.type;
        streamContext.partTypeMap.set(partID, partType || 'text');
      }

      const partType = partID ? (streamContext.partTypeMap.get(partID) || 'text') : 'text';

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
    streamContext: ActiveStreamContext,
  ): AsyncGenerator<StreamChunk> {
    const signal = streamContext.abortController.signal;
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
        streamContext.abortController.abort();
        break;
      }
    }

    logAssistantFinalizationDebug('service-legacy-event-stream-ended', {
      sessionId,
      accumulatedTextLength: state.lastContent.length,
      lastTextDelta: state.lastTextDelta,
    });
    yield* this.finishStreamingResponse(sessionId, state.lastContent);
  }

  private async *sendMessageWithSdk(
    message: string,
    options: QueryOptions,
    sessionId: string,
  ): AsyncGenerator<StreamChunk> {
    const client = this.getSdkClient();
    const parts = this.buildPromptRequestParts(message, options);

    try {
      await client.session.promptAsync(this.buildSdkPromptParameters(sessionId, parts, options));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
      return;
    }

    const streamContext = this.createActiveStreamContext(sessionId);
    const state = this.createStreamingState();
    let yieldedMessageStart = false;

    try {
      const subscription = await client.event.subscribe(undefined, {
        signal: streamContext.abortController.signal,
      });
      const iterator = subscription.stream[Symbol.asyncIterator]();

      while (true) {
        let result: IteratorResult<SdkEvent>;
        try {
          result = await iterator.next() as IteratorResult<SdkEvent>;
        } catch (error) {
          if (!yieldedMessageStart) {
            logger.warn('SDK event stream failed before first event, falling back to legacy SSE', error);
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
          streamContext.abortController.abort();
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
      yield* this.finishStreamingResponse(sessionId, state.lastContent);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
    } finally {
      this.releaseActiveStreamContext(streamContext);
      logger.debug(`SDK stream ended for session ${sessionId}`);
    }
  }

  private async *finishStreamingResponse(sessionId: string, lastContent: string): AsyncGenerator<StreamChunk> {
    logAssistantFinalizationDebug('service-finish-start', {
      sessionId,
      lastContentLength: lastContent.length,
      lastContentPreview: getDebugTextPreview(lastContent, 120),
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
          partSummary: summarizeAssistantParts(assistantMsg.parts),
        });
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
        logger.warn(`SDK session.abort failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    try {
      await this.post(`/session/${sessionId}/abort`, {});
    } catch (error) {
      logger.warn(`Failed to abort session ${sessionId} via legacy HTTP`, error);
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
  async getAvailableModels(): Promise<{ providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow?: number }> }>; defaults: Record<string, string> }> {
    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const data = await this.getSdkClient().config.providers();
        return this.normalizeAvailableModels(data);
      } catch (error) {
        logger.warn('SDK config.providers failed, falling back to legacy HTTP', error);
      }
    }

    try {
      const data = await this.get<{ providers: Array<{ id: string; name: string; models: unknown }>; default: { provider?: string; model?: string } }>('/config/providers');
      

      
      return this.normalizeAvailableModels({
        providers: data.providers,
        default: data.default?.provider && data.default?.model
          ? { [data.default.provider]: data.default.model }
          : {},
      });
    } catch (error) {
      logger.error('Failed to get models:', error);
      return { providers: [], defaults: {} };
    }
  }

  /** Update settings */
  async updateSettings(settings: OpenCodianSettings): Promise<void> {
    const previousSettings = this.settings;
    const previousMode = previousSettings.server.mode;
    const nextMode = settings.server.mode;
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
    const shouldResumeSyncEvents = this.sessionTodoListeners.size > 0;
    this.settings = nextSettings;
    this.baseUrl = getServerBaseUrl(nextSettings.server);
    this.serverManager.updateConfig(this.buildServerConfig(nextSettings));
    this.stopSyncEventSubscription(shouldResumeSyncEvents);

    try {
      if (shouldStopManagedServer) {
        await this.serverManager.stop();
        this.ensureSyncEventSubscription();
        return;
      }

      if (shouldRestartManagedServer) {
        await this.serverManager.restart();
      }

      this.ensureSyncEventSubscription();
    } catch (error) {
      this.settings = previousSettings;
      this.baseUrl = previousBaseUrl;
      this.serverManager.updateConfig(this.buildServerConfig(previousSettings));
      this.stopSyncEventSubscription(shouldResumeSyncEvents);
      if (previousMode === 'local' && (shouldRestartManagedServer || shouldStopManagedServer)) {
        try {
          await this.serverManager.start();
        } catch (restoreError) {
          logger.error('Failed to restore previous OpenCode server after settings update failure:', restoreError);
        }
      }
      this.ensureSyncEventSubscription();
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
      logger.error(`Failed to get session context usage snapshot for ${sessionId}:`, error);
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
        logger.warn('SDK question.list failed, falling back to legacy HTTP', error);
      }
    }

    try {
      const response = await this.get<unknown>('/question');
      return normalizeResponse(response);
    } catch (error) {
      logger.error('Failed to get pending questions:', error);
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
        logger.warn('SDK question.reply failed, falling back to legacy HTTP', error);
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
        logger.warn('SDK question.reject failed, falling back to legacy HTTP', error);
      }
    }

    await this.post(`/question/${requestID}/reject`, {});
  }

  async getSessionDiff(sessionId: string, messageID?: string): Promise<SessionDiffEntry[]> {
    const normalizeResponse = (response: unknown): SessionDiffEntry[] => {
      const rawEntries = Array.isArray(response)
        ? response
        : response && typeof response === 'object' && 'data' in response && Array.isArray((response as { data?: unknown }).data)
          ? (response as { data: unknown[] }).data
          : [];

      return rawEntries.reduce<SessionDiffEntry[]>((entries, rawEntry) => {
        if (!rawEntry || typeof rawEntry !== 'object') {
          return entries;
        }

        const entry = rawEntry as {
          file?: unknown;
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
        logger.warn(`SDK session.diff failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    const query = messageID ? `?messageID=${encodeURIComponent(messageID)}` : '';
    try {
      const response = await this.get<unknown>(`/session/${sessionId}/diff${query}`);
      return normalizeResponse(response);
    } catch (error) {
      logger.error(`Failed to get session diff for ${sessionId}:`, error);
      return [];
    }
  }

  private async getSessionInfo(sessionId: string): Promise<Session> {
    if (this.shouldUseSdk('sdkCrud')) {
      try {
        return await this.getSdkClient().session.get({ sessionID: sessionId }) as unknown as Session;
      } catch (error) {
        logger.warn(`SDK session.get failed for ${sessionId}, falling back to legacy HTTP`, error);
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
          if (toolStatus === 'pending' || toolStatus === 'running') {
            chunks.push({
              type: 'tool_use',
              id: toolPart.callID ?? '',
              name: toolPart.tool ?? '',
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
      ? OpenCodeService.normalizeContextAttachmentPath(filePart.source.path, vaultPath)
      : undefined;
    const urlPath = typeof filePart.url === 'string'
      ? OpenCodeService.contextPathFromFileUrl(filePart.url, vaultPath)
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

    const contextPath = OpenCodeService.normalizeContextAttachmentPath(inputPath, vaultPath);
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

  private static contextPathFromFileUrl(fileUrl: string, vaultPath?: string): string | null {
    try {
      return OpenCodeService.normalizeContextAttachmentPath(fileURLToPath(fileUrl), vaultPath);
    } catch {
      return null;
    }
  }

  private static normalizeContextAttachmentPath(filePath: string, vaultPath?: string): string {
    const normalizedPath = path.normalize(filePath);
    if (!vaultPath) {
      return normalizedPath.replace(/\\/g, '/');
    }

    const normalizedVaultPath = path.normalize(vaultPath);
    const relativePath = path.relative(normalizedVaultPath, normalizedPath);
    if (
      relativePath
      && !relativePath.startsWith('..')
      && !path.isAbsolute(relativePath)
    ) {
      return relativePath.replace(/\\/g, '/');
    }

    return normalizedPath.replace(/\\/g, '/');
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

  // ==================== Permission API Methods ====================

  /** Get pending permission requests */
  async getPendingPermissions(): Promise<PermissionRequest[]> {
    if (this.shouldUseSdk('sdkCrud')) {
      try {
        const response = await this.getSdkClient().permission.list();
        return Array.isArray(response) ? response as PermissionRequest[] : [];
      } catch (error) {
        logger.warn('SDK permission.list failed, falling back to legacy HTTP', error);
      }
    }

    try {
      return await this.get<PermissionRequest[]>('/permission');
    } catch (error) {
      logger.error('Failed to get pending permissions:', error);
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

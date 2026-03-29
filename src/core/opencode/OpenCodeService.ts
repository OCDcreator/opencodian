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
  resolveToolExecutionStatus,
  resolveToolResultText,
} from '../../shared';
import type { ChatMessage, ContentBlock, ImageAttachment, PermissionReply, PermissionRequest, StreamChunk } from '../types';
import type { OpenCodianSettings } from '../types/settings';
import { getServerBaseUrl, isLocalServerMode } from '../types/settings';
import { createSdkClient } from './createSdkClient';
import { detectOmoMessageMeta } from './omoCompat';
import type { SdkFeatureFlags } from './sdkFeatureFlags';
import { resolveSdkFeatureFlags } from './sdkFeatureFlags';
import type { SdkEvent, SdkOpencodeClient } from './sdkTypes';
import { ServerManager } from './ServerManager';
import type { ManagedServerState, OpenCodeServerConfig, QueryOptions, ResponseHandler } from './types';

const logger = createLogger('OpenCodeService');

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
}

interface ActiveStreamContext {
  sessionId: string;
  abortController: AbortController;
  partTypeMap: Map<string, string>;
}

export class OpenCodeService {
  private settings: OpenCodianSettings;
  private events: OpenCodeServiceEvents;
  private serverManager: ServerManager;
  private currentSessionId: string | null = null;
  private responseHandlers: ResponseHandler[] = [];
  private baseUrl: string;
  private activeStreams = new Map<string, ActiveStreamContext>();
  private sdkFeatureFlags: SdkFeatureFlags;
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
  }

  /** Stop the service */
  async stop(): Promise<void> {
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

    if (this.shouldUseSdk('sdkPrompt')) {
      const response = await this.getSdkClient().session.prompt(
        this.buildSdkPromptParameters(sessionId, message, options),
      );
      if (response && typeof response === 'object' && 'info' in response && 'parts' in response) {
        const typedResponse = response as AssistantMessageResponse;
        return OpenCodeService.openCodeMessageToChatMessage(typedResponse.info, typedResponse.parts);
      }

      throw new Error('Invalid assistant response payload');
    }

    const providerID = options.provider ?? this.settings.defaultProvider;
    const modelID = options.model ?? this.settings.defaultModel;
    const requestBody: Record<string, unknown> = {
      parts: [{ type: 'text', text: message }],
      model: {
        providerID,
        modelID,
      },
    };

    if (options.system?.trim()) {
      requestBody.system = options.system.trim();
    }

    const response = await this.post<unknown>(`/session/${sessionId}/message`, requestBody);
    if (
      typeof response === 'object'
      && response !== null
      && 'info' in response
      && 'parts' in response
    ) {
      const typedResponse = response as AssistantMessageResponse;
      return OpenCodeService.openCodeMessageToChatMessage(typedResponse.info, typedResponse.parts);
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

    // Build parts array
    const parts = [{ type: 'text', text: message }];

    // Add images if present
    if (options.images && options.images.length > 0) {
      for (const img of options.images) {
        parts.push({
          type: 'text',
          text: `[Image: ${img.filename ?? 'attachment'}]`,
        });
      }
    }

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
    };
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
    message: string,
    options: QueryOptions & { system?: string },
  ): {
    sessionID: string;
    model: {
      providerID: string;
      modelID: string;
    };
    parts: Array<{ type: 'text'; text: string }>;
    system?: string;
    tools?: Record<string, boolean>;
    variant?: string;
  } {
    if (options.externalContextPaths?.length) {
      logger.debug('externalContextPaths are not yet mapped to SDK file parts and are being omitted', {
        count: options.externalContextPaths.length,
      });
    }

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
      parts: Array<{ type: 'text'; text: string }>;
      system?: string;
      tools?: Record<string, boolean>;
      variant?: string;
    } = {
      sessionID: sessionId,
      model: {
        providerID: options.provider ?? this.settings.defaultProvider,
        modelID: options.model ?? this.settings.defaultModel,
      },
      parts: this.buildPromptTextParts(message, options.images),
    };

    const tools = this.buildAllowedToolsRecord(options.allowedTools);
    if (tools) {
      parameters.tools = tools;
    }

    const variant = this.resolveSdkVariant(options);
    if (variant) {
      parameters.variant = variant;
    }

    if (options.system?.trim()) {
      parameters.system = options.system.trim();
    }

    return parameters;
  }

  private buildPromptTextParts(
    message: string,
    images?: ImageAttachment[],
  ): Array<{ type: 'text'; text: string }> {
    const parts: Array<{ type: 'text'; text: string }> = [{ type: 'text', text: message }];

    if (images && images.length > 0) {
      for (const image of images) {
        parts.push({
          type: 'text',
          text: `[Image: ${image.filename ?? 'attachment'}]`,
        });
      }
    }

    return parts;
  }

  private buildAllowedToolsRecord(allowedTools?: string[]): Record<string, boolean> | undefined {
    if (!allowedTools || allowedTools.length === 0) {
      return undefined;
    }

    return Object.fromEntries(allowedTools.map((toolName) => [toolName, true]));
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
      const part = eventData.properties?.part as ToolPartData | undefined;
      if (part?.id && part?.type) {
        streamContext.partTypeMap.set(part.id, part.type);

        if (part.type === 'tool') {
          const toolId = part.callID || part.id;
          const toolName = part.tool || 'unknown';
          if (toolId) {
            if (!state.processedToolIds.has(toolId)) {
              state.processedToolIds.add(toolId);
              chunks.push({
                type: 'tool_use',
                id: toolId,
                name: toolName,
                input: part.state?.input || {},
              });
            }

            const toolStatus = resolveToolExecutionStatus({
              toolName,
              state: part.state,
            });
            const toolResult = resolveToolResultText(part.state);
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
          chunks.push({ type: 'thinking', content: delta });
        } else {
          chunks.push({ type: 'text', content: delta });
          state.lastContent += delta;
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

    if (eventData.type === 'session.idle') {
      return { chunks, stop: true };
    }

    if (eventData.type === 'question.asked') {
      logger.debug('Ignoring unsupported SDK question event until question UI is implemented', {
        sessionId,
      });
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

    yield* this.finishStreamingResponse(sessionId, state.lastContent);
  }

  private async *sendMessageWithSdk(
    message: string,
    options: QueryOptions,
    sessionId: string,
  ): AsyncGenerator<StreamChunk> {
    const client = this.getSdkClient();

    try {
      await client.session.promptAsync(this.buildSdkPromptParameters(sessionId, message, options));
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
    try {
      const messages = await this.getSessionMessages(sessionId);
      const assistantMsg = messages.reverse().find((item) => item.info.role === 'assistant');
      if (assistantMsg) {
        for (const part of assistantMsg.parts) {
          if (part.type !== 'text' || typeof part.text !== 'string') {
            continue;
          }

          const currentText = part.text;
          if (currentText.length <= lastContent.length) {
            continue;
          }

          const delta = currentText.slice(lastContent.length);
          yield { type: 'text', content: delta };
          lastContent = currentText;
        }
      }
    } catch (error) {
      logger.error('Final message check failed:', error);
    }

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
    this.settings = nextSettings;
    this.baseUrl = getServerBaseUrl(nextSettings.server);
    this.serverManager.updateConfig(this.buildServerConfig(nextSettings));

    try {
      if (shouldStopManagedServer) {
        await this.serverManager.stop();
        return;
      }

      if (shouldRestartManagedServer) {
        await this.serverManager.restart();
      }
    } catch (error) {
      this.settings = previousSettings;
      this.baseUrl = previousBaseUrl;
      this.serverManager.updateConfig(this.buildServerConfig(previousSettings));
      if (previousMode === 'local' && (shouldRestartManagedServer || shouldStopManagedServer)) {
        try {
          await this.serverManager.start();
        } catch (restoreError) {
          logger.error('Failed to restore previous OpenCode server after settings update failure:', restoreError);
        }
      }
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
          chunks.push({ type: 'thinking', content: part.text });
        }
        break;
      }
      case 'tool': {
        const toolPart = part as ToolPartData;
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
  static openCodeMessageToChatMessage(info: Message, parts: Part[]): ChatMessage {
    // Build content from text parts
    const textParts = parts.filter((p): p is Part & { text: string } =>
      p.type === 'text' && typeof p.text === 'string'
    );
    const content = textParts.map((p) => p.text).join('');

    // Extract thinking content from reasoning parts - each part becomes a separate block
    const thinkingParts = parts.filter((p): p is Part & { text: string; duration?: number } =>
      p.type === 'reasoning' && typeof p.text === 'string'
    );

    // Extract tool calls from tool parts
    const toolParts = parts.filter((p) => p.type === 'tool') as ToolPartData[];
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

    // Build content blocks for rich rendering
    const contentBlocks: ContentBlock[] = [];
    
    // Add each thinking part as a separate block to preserve individual durations
    for (const part of thinkingParts) {
      contentBlocks.push({
        type: 'thinking',
        thinking: part.text,
        durationSeconds: typeof part.duration === 'number' && part.duration > 0 
          ? part.duration 
          : undefined,
      });
    }
    
    // Process tool parts - combine tool_use and tool_result into single blocks
    const processedToolIds = new Set<string>();
    for (const part of toolParts) {
      const toolId = part.callID || part.id;
      if (!toolId || processedToolIds.has(toolId)) continue;
      
      processedToolIds.add(toolId);
      
      // Find the result for this tool (if any)
      const resultPart = toolParts.find(
        (p) => {
          if ((p.callID || p.id) !== toolId) {
            return false;
          }

          const toolStatus = resolveToolExecutionStatus({
            toolName: p.tool,
            state: p.state,
          });
          return toolStatus === 'completed' || toolStatus === 'error';
        }
      );
      const toolStatus = resolveToolExecutionStatus({
        toolName: part.tool,
        state: resultPart?.state ?? part.state,
      });
      
      // Create combined tool_use block with result
      contentBlocks.push({
        type: 'tool_use',
        toolId,
        toolName: part.tool || 'unknown',
        toolInput: part.state?.input || {},
        toolStatus,
        toolResult: resolveToolResultText(resultPart?.state),
      });
    }
    
    // Add text content
    if (content) {
      contentBlocks.push({ type: 'text', text: content });
    }

    // Determine timestamp
    let timestamp: number;
    if ('time' in info && info.time) {
      timestamp = info.time.created;
    } else {
      timestamp = Date.now();
    }

    const role = info.role === 'assistant' ? 'assistant' : 'user';
    const omo = detectOmoMessageMeta(role, content);
    const normalizedContent = omo?.kind === 'user-injection'
      ? omo.originalText
      : omo?.kind === 'system-reminder'
        ? omo.reminderText
        : content;

    return {
      id: info.id,
      role,
      content: normalizedContent,
      timestamp,
      sourceMessageId: info.id,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
      displayStyle: omo?.kind === 'system-reminder' ? 'notice' : undefined,
      noticeTone: omo?.kind === 'system-reminder' ? 'info' : undefined,
      omo: omo ?? undefined,
      parts,
    };
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

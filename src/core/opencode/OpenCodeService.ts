/**
 * OpenCode Service
 *
 * Main service for interacting with OpenCode Server via HTTP API.
 * Uses Obsidian's requestUrl to bypass CORS restrictions.
 * Now supports SSE streaming for real-time message updates.
 */

import { requestUrl } from 'obsidian';

import { createLogger } from '../../shared';
import type { ChatMessage, ContentBlock, ImageAttachment, PermissionReply, PermissionRequest, StreamChunk } from '../types';
import type { OpenCodianSettings } from '../types/settings';
import { getServerBaseUrl, isLocalServerMode } from '../types/settings';
import { ServerManager } from './ServerManager';
import type { OpenCodeServerConfig, QueryOptions, ResponseHandler } from './types';

const logger = createLogger('OpenCodeService');

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
      };
    };
    delta?: string;
    field?: string;
    partID?: string;
    toolID?: string;
    result?: string;
    error?: string;
  };
}

/** Service events */
interface OpenCodeServiceEvents {
  onServerStatusChange?: (status: string) => void;
  onError?: (error: Error) => void;
  onModelsLoaded?: (providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>) => void;
}

/** Session data structure */
interface Session {
  id: string;
  title: string;
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
  time: {
    created: number;
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



export class OpenCodeService {
  private settings: OpenCodianSettings;
  private events: OpenCodeServiceEvents;
  private serverManager: ServerManager;
  private currentSessionId: string | null = null;
  private responseHandlers: ResponseHandler[] = [];
  private baseUrl: string;
  private partTypeMap: Map<string, string> = new Map(); // Track part types by partID
  private currentAbortController: AbortController | null = null; // For cancelling streams

  constructor(settings: OpenCodianSettings, events: OpenCodeServiceEvents = {}) {
    this.settings = settings;
    this.events = events;
    this.baseUrl = getServerBaseUrl(settings.server);

    this.serverManager = new ServerManager(this.buildServerConfig(settings), {
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
    });
  }

  /** Initialize the service */
  async initialize(): Promise<void> {
    if (isLocalServerMode(this.settings.server) && this.settings.server.local.autoStart) {
      await this.start();
    }
  }

  /** Set the vault path for OpenCode server to use project config */
  setVaultPath(path: string): void {
    this.serverManager.setWorkingDirectory(path);
  }

  /** Auto-fetch models when server starts and update defaults if needed */
  private async autoFetchModels(): Promise<void> {
    try {

      const result = await this.getAvailableModels();
      
      if (result.providers.length === 0) {
        logger.warn('No providers available from server');
        return;
      }

      if (!this.settings.defaultProvider || !this.settings.defaultModel) {
        this.events.onModelsLoaded?.(result.providers);
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
  async createSession(title?: string): Promise<string> {

    
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
    

    this.currentSessionId = sessionId;
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
  cancelStream(): void {
    if (this.currentAbortController) {
      logger.debug('Cancelling stream...');
      this.currentAbortController.abort();
      logger.debug('Abort signal sent');
    } else {
      logger.debug('No active stream to cancel');
    }
  }

  /** List all sessions */
  async listSessions(): Promise<Session[]> {
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
    

    
    try {
      // Note: The correct endpoint is /session/:id/message (singular, not plural)
      const path = `/session/${sessionId}/message`;

      
      const response = await this.get<unknown>(path);

      
      return Array.isArray(response) ? response : [];
    } catch (error) {
      logger.error(`Failed to get messages for session ${sessionId}:`, error);
      // Return empty array instead of throwing to prevent UI crash
      return [];
    }
  }

  /** Delete a session */
  async deleteSession(sessionId: string): Promise<void> {
    await this.delete(`/session/${sessionId}`);

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }

  /** Send a message and get streaming response using SSE */
  async *sendMessage(message: string, options: QueryOptions = {}): AsyncGenerator<StreamChunk> {
    const sessionId = options.sessionId ?? this.currentSessionId;
    if (!sessionId) {
      yield { type: 'error', content: 'No active session' };
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


      yield { type: 'message_start' };

      // Use SSE for real-time streaming
      const sseUrl = `${this.baseUrl}/event`;


      // Create SSE stream with abort controller
      this.currentAbortController = new AbortController();
      const eventStream = this.connectSSE(sseUrl, this.currentAbortController.signal);
      
      // Track state for content changes
      let lastContent = '';
      const processedToolIds = new Set<string>();
      const toolStartTimes = new Map<string, number>();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const TOOL_TIMEOUT_MS = 60000;
      
      // Track if we're done
      const checkInterval: ReturnType<typeof setInterval> | null = null;
      
      // Start periodic message check as fallback
      
      try {

        for await (const event of eventStream) {
          // Check if cancelled
          if (this.currentAbortController?.signal.aborted) {
            // eslint-disable-next-line no-console
            logger.debug('Stream aborted, breaking loop');
            break;
          }
          // Parse the nested data structure
          let eventData: OpenCodeEvent;
          try {
            eventData = JSON.parse(event.data) as OpenCodeEvent;
          } catch {

            continue;
          }
          
          // Print FULL event data for debugging (only for message.part.delta to avoid spam)
/*           if (eventData.type === 'message.part.delta') {

          } else {

          } */
          
          // Only process events for our session
          if (eventData.properties?.sessionID && eventData.properties.sessionID !== sessionId) {

            continue;
          }

          // Debug: Log session.idle event details
/*           if (eventData.type === 'session.idle') {

          } */
          
          // Handle message.part.updated - track part types and tool calls
          if (eventData.type === 'message.part.updated') {
            const part = eventData.properties?.part;
            if (part?.id && part?.type) {
              this.partTypeMap.set(part.id, part.type);
              
              // Handle tool parts
              if (part.type === 'tool') {
                const toolId = part.callID || part.id;
                const toolName = part.tool || 'unknown';
                if (toolId) {
                  // New tool use
                  if (!processedToolIds.has(toolId)) {
                    processedToolIds.add(toolId);
                    toolStartTimes.set(toolId, Date.now());
                    yield { 
                      type: 'tool_use', 
                      id: toolId, 
                      name: toolName, 
                      input: part.state?.input || {}
                    };
                  }
                  
                  // Tool result
                  if (part.state?.output || part.state?.error) {
                    const resultKey = `${toolId}_result`;
                    if (!processedToolIds.has(resultKey)) {
                      processedToolIds.add(resultKey);
                      yield {
                        type: 'tool_result',
                        toolUseId: toolId,
                        content: part.state.error
                          ? `Error: ${part.state.error}`
                          : (part.state.output ?? ''),
                        isError: !!part.state.error,
                      };
                    }
                  }
                }
              }
            }
            continue;
          }
          
          // Handle message.part.delta - streaming text/thinking chunks
          if (eventData.type === 'message.part.delta') {
            const delta = eventData.properties?.delta;
            const field = eventData.properties?.field;
            const partID = eventData.properties?.partID;
            
            if (!delta || !field) {

              continue;
            }
            


            // Track part types by partID
            if (partID && !this.partTypeMap.has(partID)) {
              // First time seeing this part, determine type from field or part info
              const partType = eventData.properties?.part?.type;
              this.partTypeMap.set(partID, partType || 'text');
            }

            const partType = partID ? (this.partTypeMap.get(partID) || 'text') : 'text';
            
            // Handle based on field and tracked part type
            if (field === 'text') {
              if (partType === 'reasoning' || partType === 'thinking') {
                yield { type: 'thinking', content: delta };
              } else {
                yield { type: 'text', content: delta };
                lastContent += delta;
              }
            } else if (field === 'tool') {
              // Tool call updates handled separately
            }
          }
          
          // Handle session.diff - indicates changes, fetch latest messages
          if (eventData.type === 'session.diff') {
            // Session state changed, could check for completion
          }
          
          // Handle server.heartbeat - keepalive
          if (eventData.type === 'server.heartbeat') {
            // Just a keepalive, ignore
          }
          
          // Handle server.connected - initial connection
          if (eventData.type === 'server.connected') {
            // Initial connection established
          }

          // Handle permission.asked - permission request from AI
          if (eventData.type === 'permission.asked') {
            const permission = eventData.properties;
            if (permission?.id) {
              yield {
                type: 'permission_request',
                id: permission.id,
                permission: permission.permission || 'unknown',
                patterns: permission.patterns || [],
                metadata: permission.metadata || {},
              };
            }
          }
          
          // Handle session.idle - message streaming complete
          if (eventData.type === 'session.idle') {

            this.currentAbortController?.abort(); // Abort the SSE connection
            break; // Exit SSE loop
          }

          // Debug: log if we reach here with session.idle
/*           if (eventData.type?.includes?.('idle')) {

          } */
        }
      } finally {
        if (checkInterval) {
          clearInterval(checkInterval);
        }
        // Clear the abort controller
        this.currentAbortController = null;
        logger.debug('Stream ended, abort controller cleared');
      }

      // Final check for any remaining content
      try {
        const messages = await this.getSessionMessages(sessionId);
        const assistantMsg = messages.reverse().find(m => m.info.role === 'assistant');
        if (assistantMsg) {
          for (const part of assistantMsg.parts) {
            if (part.type === 'text' && typeof part.text === 'string') {
              const currentText = part.text;
              if (currentText.length > lastContent.length) {
                const delta = currentText.slice(lastContent.length);
                yield { type: 'text', content: delta };
                lastContent = currentText;
              }
            }
          }
        }
      } catch (error) {
        logger.error('Final message check failed:', error);
      }

      yield { type: 'message_stop' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
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
  async getAvailableModels(): Promise<{ providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>; defaults: Record<string, string> }> {
    try {
      const data = await this.get<{ providers: Array<{ id: string; name: string; models: unknown }>; default: { provider?: string; model?: string } }>('/config/providers');
      

      
      return {
        providers: data.providers.map((p) => {
          let models: Array<{ id: string; name: string }> = [];
          
          // Handle different models formats
          if (Array.isArray(p.models)) {
            // Format 1: models is string array ["gpt-4", "gpt-3.5-turbo"]
            models = p.models.map((modelId: string) => ({
              id: modelId,
              name: modelId,
            }));
          } else if (typeof p.models === 'object' && p.models !== null) {
            // Format 2: models is object { "model-id": { name: "..." }, ... }
            models = Object.entries(p.models as Record<string, { name?: string }>).map(([id, info]) => ({
              id,
              name: info.name ?? id,
            }));
          }
          
          return {
            id: p.id,
            name: p.name ?? p.id,
            models,
          };
        }),
        defaults: data.default?.provider && data.default?.model 
          ? { [data.default.provider]: data.default.model }
          : {},
      };
    } catch (error) {
      logger.error('Failed to get models:', error);
      return { providers: [], defaults: {} };
    }
  }

  /** Update settings */
  updateSettings(settings: OpenCodianSettings): void {
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
      );
    const shouldStopManagedServer =
      this.serverManager.isRunning() &&
      previousMode === 'local' &&
      nextMode !== 'local';

    this.settings = settings;
    this.baseUrl = getServerBaseUrl(settings.server);
    this.serverManager.updateConfig(this.buildServerConfig(settings));

    if (shouldStopManagedServer) {
      void this.serverManager.stop();
      return;
    }

    if (shouldRestartManagedServer) {
      void this.serverManager.restart();
    }
  }

  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    const response = await this.post<unknown>(`/session/${sessionId}/fork`, messageID ? { messageID } : {});
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

    const response = await this.post<unknown>(`/session/${sessionId}/revert`, payload);
    logger.debug('Revert session raw response', {
      sessionId,
      messageID,
      response,
    });

    if (response === false) {
      logger.debug('Revert session normalized result=false', { sessionId, messageID });
      return false;
    }

    if (typeof response === 'object' && response !== null && Object.keys(response).length === 0) {
      logger.debug('Revert session normalized result=true (empty object/204)', { sessionId, messageID });
      return true;
    }

    if (typeof response === 'object' && response !== null && 'id' in response) {
      const responseId = String((response as { id: unknown }).id);
      const normalized = responseId.length > 0;
      logger.debug('Revert session normalized result from session object', {
        sessionId,
        messageID,
        responseId,
        normalized,
      });
      return normalized;
    }

    const normalized = response === true;
    logger.debug('Revert session normalized boolean result', {
      sessionId,
      messageID,
      normalized,
    });
    return normalized;
  }

  private buildServerConfig(settings: OpenCodianSettings): OpenCodeServerConfig {
    return {
      mode: settings.server.mode,
      baseUrl: getServerBaseUrl(settings.server),
      local: settings.server.local,
      auth: settings.server.auth,
      modelSourceMode: settings.modelSourceMode,
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
        const toolPart = part as Part & { callID?: string; tool?: string; state?: { status: string; input?: Record<string, unknown>; output?: string; error?: string } };
        if (toolPart.state) {
          const state = toolPart.state;
          if (state.status === 'pending' || state.status === 'running') {
            chunks.push({
              type: 'tool_use',
              id: toolPart.callID ?? '',
              name: toolPart.tool ?? '',
              input: state.input ?? {},
            });
          } else if (state.status === 'completed') {
            chunks.push({
              type: 'tool_result',
              toolUseId: toolPart.callID ?? '',
              content: state.output ?? '',
              isError: false,
            });
          } else if (state.status === 'error') {
            chunks.push({
              type: 'tool_result',
              toolUseId: toolPart.callID ?? '',
              content: `Error: ${state.error}`,
              isError: true,
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
    const toolParts = parts.filter((p) => p.type === 'tool') as Array<Part & { callID?: string; tool?: string; state?: { status: string; input?: Record<string, unknown>; output?: string; error?: string } }>;
    const toolCalls = toolParts
      .filter((p) => p.state?.status === 'pending' || p.state?.status === 'running')
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
        p => (p.callID || p.id) === toolId && (p.state?.output || p.state?.error)
      );
      
      // Create combined tool_use block with result
      contentBlocks.push({
        type: 'tool_use',
        toolId,
        toolName: part.tool || 'unknown',
        toolInput: part.state?.input || {},
        toolStatus: resultPart?.state?.error
          ? 'error'
          : resultPart?.state?.output
            ? 'completed'
            : 'running',
        toolResult: resultPart?.state?.error 
          ? `Error: ${resultPart.state.error}`
          : resultPart?.state?.output || undefined,
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

    return {
      id: info.id,
      role: info.role === 'assistant' ? 'assistant' : 'user',
      content,
      timestamp,
      sourceMessageId: info.id,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
      parts,
    };
  }

  // ==================== Permission API Methods ====================

  /** Get pending permission requests */
  async getPendingPermissions(): Promise<PermissionRequest[]> {
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

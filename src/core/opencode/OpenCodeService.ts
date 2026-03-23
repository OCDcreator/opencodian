/**
 * OpenCode Service
 *
 * Main service for interacting with OpenCode Server via HTTP API.
 * Uses Obsidian's requestUrl to bypass CORS restrictions.
 * Now supports SSE streaming for real-time message updates.
 */

import { Notice, requestUrl } from 'obsidian';

import type { ChatMessage, ImageAttachment, StreamChunk } from '../types';
import type { OpenCodianSettings } from '../types/settings';
import { ServerManager } from './ServerManager';
import type { OpenCodeServerConfig, QueryOptions, ResponseHandler } from './types';

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

/** Provider model */
interface Model {
  id: string;
  name: string;
}

/** Provider */
interface Provider {
  id: string;
  name: string;
  models: Record<string, Model>;
}

export class OpenCodeService {
  private settings: OpenCodianSettings;
  private events: OpenCodeServiceEvents;
  private serverManager: ServerManager;
  private currentSessionId: string | null = null;
  private responseHandlers: ResponseHandler[] = [];
  private baseUrl: string;
  private partTypeMap: Map<string, string> = new Map(); // Track part types by partID

  constructor(settings: OpenCodianSettings, events: OpenCodeServiceEvents = {}) {
    this.settings = settings;
    this.events = events;
    this.baseUrl = `http://${settings.server.host}:${settings.server.port}`;

    const serverConfig: OpenCodeServerConfig = {
      host: settings.server.host,
      port: settings.server.port,
    };

    this.serverManager = new ServerManager(serverConfig, {
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
    if (this.settings.server.autoStart) {
      await this.start();
    }
  }

  /** Auto-fetch models when server starts and update defaults if needed */
  private async autoFetchModels(): Promise<void> {
    try {
      console.log('[OpenCodeService] Auto-fetching models after server start...');
      const result = await this.getAvailableModels();
      
      if (result.providers.length === 0) {
        console.warn('[OpenCodeService] No providers available from server');
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
        
        console.log(`[OpenCodeService] Updated default provider to: ${this.settings.defaultProvider}, model: ${this.settings.defaultModel}`);
      } else {
        // Provider exists, check if model is valid
        const currentModel = currentProvider.models.find(m => m.id === this.settings.defaultModel);
        if (!currentModel && currentProvider.models.length > 0) {
          this.settings.defaultModel = currentProvider.models[0].id;
          console.log(`[OpenCodeService] Updated default model to: ${this.settings.defaultModel}`);
        }
      }

      // Notify listeners that models are loaded
      this.events.onModelsLoaded?.(result.providers);
    } catch (error) {
      console.error('[OpenCodeService] Failed to auto-fetch models:', error);
    }
  }

  /** Start the service and server */
  async start(): Promise<void> {
    await this.serverManager.start();
  }

  /** Stop the service */
  async stop(): Promise<void> {
    await this.serverManager.stop();
  }

  /** Check if service is ready */
  isReady(): boolean {
    return this.serverManager.isRunning();
  }

  /** Get server status */
  getServerStatus(): string {
    return this.serverManager.getStatus();
  }

  /** Check server health directly */
  async checkHealth(): Promise<boolean> {
    return this.serverManager.checkHealth(3000);
  }

  /** Check if plugin has a server process running */
  isServerProcessRunning(): boolean {
    return this.serverManager.isRunning();
  }

  /** HTTP GET helper using Obsidian's requestUrl */
  private async get<T>(path: string): Promise<T> {
    const response = await requestUrl({
      url: `${this.baseUrl}${path}`,
      method: 'GET',
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
    const response = await requestUrl({
      url: `${this.baseUrl}${path}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    await requestUrl({
      url: `${this.baseUrl}${path}`,
      method: 'DELETE',
    });
  }

  /** Create a new session - returns Session object with id property */
  async createSession(title?: string): Promise<string> {
    console.log('[OpenCodeService] Creating session:', title ?? 'New Conversation');
    
    const response = await this.post<unknown>('/session', {
      title: title ?? 'New Conversation',
    });
    
    console.log('[OpenCodeService] Create session response:', response);
    
    // Handle different response formats
    let sessionId: string;
    if (typeof response === 'object' && response !== null) {
      sessionId = (response as { id: string }).id;
    } else {
      throw new Error('Invalid session response: ' + JSON.stringify(response));
    }
    
    console.log('[OpenCodeService] Created session ID:', sessionId);
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
      console.warn('[OpenCodeService] getSessionMessages called with empty sessionId');
      return [];
    }
    
    console.log(`[OpenCodeService] Getting messages for session: ${sessionId}`);
    
    try {
      // Note: The correct endpoint is /session/:id/message (singular, not plural)
      const path = `/session/${sessionId}/message`;
      console.log(`[OpenCodeService] Requesting: ${this.baseUrl}${path}`);
      
      const response = await this.get<unknown>(path);
      console.log(`[OpenCodeService] Messages response:`, response);
      
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.error(`[OpenCodeService] Failed to get messages for session ${sessionId}:`, error);
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

    try {
      // Send the prompt using async endpoint
      const requestBody: Record<string, unknown> = { 
        parts,
        model: {
          providerID,
          modelID,
        },
      };
      
      console.log('[OpenCodeService] Sending message:', { 
        sessionId, 
        providerID,
        modelID,
      });
      
      await this.post<void>(`/session/${sessionId}/prompt_async`, requestBody);
      console.log('[OpenCodeService] Message sent, starting SSE stream...');

      yield { type: 'message_start' };

      // Use SSE for real-time streaming
      const sseUrl = `${this.baseUrl}/event`;
      console.log('[OpenCodeService] Connecting to SSE:', sseUrl);

      // Create SSE stream with abort controller
      const abortController = new AbortController();
      const eventStream = this.connectSSE(sseUrl, abortController.signal);
      
      // Track state for content changes
      let lastContent = '';
      let lastThinkingContent = '';
      const processedToolIds = new Set<string>();
      const toolStartTimes = new Map<string, number>();
      const TOOL_TIMEOUT_MS = 60000;
      
      // Track if we're done
      let isDone = false;
      let checkInterval: ReturnType<typeof setInterval> | null = null;
      
      // Start periodic message check as fallback
      let lastMessageCheckTime = Date.now();
      const MESSAGE_CHECK_INTERVAL = 2000; // Check every 2 seconds
      
      try {
        console.log('[OpenCodeService] Starting SSE event loop...');
        for await (const event of eventStream) {
          // Parse the nested data structure
          let eventData: OpenCodeEvent;
          try {
            eventData = JSON.parse(event.data) as OpenCodeEvent;
          } catch {
            console.log('[OpenCodeService] Failed to parse event data:', event.data.substring(0, 100));
            continue;
          }
          
          // Print FULL event data for debugging (only for message.part.delta to avoid spam)
          if (eventData.type === 'message.part.delta') {
            console.log('[OpenCodeService] FULL message.part.delta:', JSON.stringify(eventData, null, 2));
          } else {
            console.log('[OpenCodeService] SSE event:', eventData.type);
          }
          
          // Only process events for our session
          if (eventData.properties?.sessionID && eventData.properties.sessionID !== sessionId) {
            continue;
          }
          
          // Handle message.part.updated - track part types
          if (eventData.type === 'message.part.updated') {
            const part = eventData.properties?.part;
            if (part?.id && part?.type) {
              this.partTypeMap.set(part.id, part.type);
              console.log('[OpenCodeService] Tracked part type:', part.id, part.type);
            }
            continue;
          }
          
          // Handle message.part.delta - streaming text/thinking chunks
          if (eventData.type === 'message.part.delta') {
            const delta = eventData.properties?.delta;
            const field = eventData.properties?.field;
            const partID = eventData.properties?.partID;
            
            if (!delta || !field) {
              console.log('[OpenCodeService] Delta event missing delta or field:', { delta, field });
              continue;
            }
            
            console.log('[OpenCodeService] Processing delta:', { field, delta: delta.substring(0, 50), partID });
            
            // Track part types by partID
            if (!this.partTypeMap.has(partID)) {
              // First time seeing this part, determine type from field or part info
              const partType = eventData.properties?.part?.type;
              this.partTypeMap.set(partID, partType || 'text');
            }
            
            const partType = this.partTypeMap.get(partID) || 'text';
            
            // Handle based on field and tracked part type
            if (field === 'text') {
              if (partType === 'reasoning' || partType === 'thinking') {
                yield { type: 'thinking', content: delta };
                lastThinkingContent += delta;
              } else {
                yield { type: 'text', content: delta };
                lastContent += delta;
              }
            } else if (field === 'tool') {
              // Tool call updates handled separately
            }
          }
          
          // Handle message.part.updated - part completion or tool updates
          if (eventData.type === 'message.part.updated') {
            const part = eventData.properties?.part;
            if (!part) continue;
            
            // Handle tool parts
            if (part.type === 'tool') {
              const toolId = part.callID || part.id;
              if (!toolId) continue;
              
              // New tool use
              if (!processedToolIds.has(toolId)) {
                processedToolIds.add(toolId);
                toolStartTimes.set(toolId, Date.now());
                yield { 
                  type: 'tool_use', 
                  id: toolId, 
                  name: part.tool || 'unknown', 
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
                      : part.state.output,
                  };
                }
              }
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
          
          // Handle session.idle - message streaming complete
          if (eventData.type === 'session.idle') {
            console.log('[OpenCodeService] Session idle, message complete');
            abortController.abort(); // Abort the SSE connection
            break; // Exit SSE loop
          }
        }
      } finally {
        if (checkInterval) {
          clearInterval(checkInterval);
        }
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
        console.error('[OpenCodeService] Final message check failed:', error);
      }

      yield { type: 'message_stop' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
    }
  }

  /** Connect to SSE endpoint and yield events */
  private async *connectSSE(url: string, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
    console.log('[OpenCodeService] connectSSE starting...');
    
    // Use native fetch for streaming support
    console.log('[OpenCodeService] Fetching SSE stream...');
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
      },
    });

    console.log('[OpenCodeService] SSE response received:', response.status, response.ok);
    
    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('SSE response has no body');
    }

    console.log('[OpenCodeService] SSE stream connected, starting read loop...');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aborted = false;

    // Handle abort signal
    const abortHandler = () => {
      console.log('[OpenCodeService] Abort signal received, cancelling reader...');
      aborted = true;
      void reader.cancel();
    };
    
    signal?.addEventListener('abort', abortHandler);

    try {
      while (true) {
        // Check if aborted before reading
        if (aborted) {
          console.log('[OpenCodeService] Loop aborted');
          break;
        }

        const { done, value } = await reader.read();
        
        if (done) {
          console.log('[OpenCodeService] SSE stream done');
          break;
        }

        // Check abort again after read
        if (aborted) {
          console.log('[OpenCodeService] Aborted after read');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        // Print full chunk if it contains message.part.delta
        if (chunk.includes('message.part.delta')) {
          console.log('[OpenCodeService] SSE FULL chunk:', chunk);
        } else {
          console.log('[OpenCodeService] SSE raw chunk:', chunk.substring(0, 100));
        }
        buffer += chunk;
        
        // Process complete events in buffer
        const events = this.parseSSEEvents(buffer);
        buffer = events.remaining;
        
        if (events.events.length > 0) {
          console.log('[OpenCodeService] Parsed events:', events.events.length);
        }
        
        for (const event of events.events) {
          yield event;
        }
      }

      // Process any remaining data
      if (buffer.trim() && !aborted) {
        const events = this.parseSSEEvents(buffer + '\n\n');
        for (const event of events.events) {
          yield event;
        }
      }
    } finally {
      signal?.removeEventListener('abort', abortHandler);
      reader.releaseLock();
      console.log('[OpenCodeService] SSE reader released');
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
      
      console.log('[OpenCodeService] Raw providers data:', data);
      
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
      console.error('[OpenCodeService] Failed to get models:', error);
      return { providers: [], defaults: {} };
    }
  }

  /** Update settings */
  updateSettings(settings: OpenCodianSettings): void {
    this.settings = settings;
    this.baseUrl = `http://${settings.server.host}:${settings.server.port}`;

    // Check if server config changed
    const serverConfigChanged =
      settings.server.host !== this.settings.server.host ||
      settings.server.port !== this.settings.server.port;

    if (serverConfigChanged && this.serverManager.isRunning()) {
      // Restart server with new config
      void this.serverManager.restart();
    }
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
            });
          } else if (state.status === 'error') {
            chunks.push({
              type: 'tool_result',
              toolUseId: toolPart.callID ?? '',
              content: `Error: ${state.error}`,
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

    // Extract tool calls from tool parts
    const toolParts = parts.filter((p) => p.type === 'tool') as Array<Part & { callID?: string; tool?: string; state?: { status: string; input?: Record<string, unknown> } }>;
    const toolCalls = toolParts
      .filter((p) => p.state?.status === 'pending' || p.state?.status === 'running')
      .map((p) => ({
        id: p.callID ?? '',
        name: p.tool ?? '',
        input: p.state?.input ?? {},
        status: 'pending' as const,
      }));

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
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      parts,
    };
  }

}

// Extend QueryOptions to include sessionId and images
declare module './types' {
  interface QueryOptions {
    sessionId?: string;
    images?: ImageAttachment[];
  }
}

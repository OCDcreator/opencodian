/**
 * OpenCode Service
 *
 * Main service for interacting with OpenCode Server via HTTP API.
 * Uses Obsidian's requestUrl to bypass CORS restrictions.
 */

import { Notice, requestUrl } from 'obsidian';

import type { ChatMessage, ImageAttachment, StreamChunk } from '../types';
import type { OpenCodianSettings } from '../types/settings';
import { ServerManager } from './ServerManager';
import type { OpenCodeServerConfig, QueryOptions, ResponseHandler } from './types';

/** Service events */
interface OpenCodeServiceEvents {
  onServerStatusChange?: (status: string) => void;
  onError?: (error: Error) => void;
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

  /** Send a message and get streaming response */
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

    // Build model config - always use settings defaults if not specified in options
    const providerID = options.provider ?? this.settings.defaultProvider;
    const modelID = options.model ?? this.settings.defaultModel;

    try {
      // Send the prompt using async endpoint (returns 204 No Content)
      // Note: API expects model format: { providerID, modelID } according to docs
      const requestBody: Record<string, unknown> = { 
        parts,
        model: {
          providerID,
          modelID,
        },
      };
      
      console.log('[OpenCodeService] Sending message:', { 
        sessionId, 
        requestBody,
        defaultProvider: this.settings.defaultProvider,
        defaultModel: this.settings.defaultModel
      });
      await this.post<void>(`/session/${sessionId}/prompt_async`, requestBody);
      console.log('[OpenCodeService] Message sent successfully');

      yield { type: 'message_start' };

      // Poll for response updates
      let attempts = 0;
      const maxAttempts = 120; // 120 seconds timeout
      let lastContent = '';
      let assistantMessageFound = false;
      
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        try {
          const messages = await this.getSessionMessages(sessionId);
          const lastMessage = messages[messages.length - 1];
          
          if (lastMessage && lastMessage.info.role === 'assistant') {
            assistantMessageFound = true;
            
            // Assistant has responded - check for content
            const textParts = lastMessage.parts.filter((p): p is Part & { text: string } =>
              p.type === 'text' && typeof p.text === 'string'
            );
            const currentContent = textParts.map((p) => p.text).join('');
            
            // If we have new content, yield the delta
            if (currentContent.length > lastContent.length) {
              const delta = currentContent.slice(lastContent.length);
              yield { type: 'text', content: delta };
              lastContent = currentContent;
            }
            
            // Check if message is complete (you may need to adjust this logic)
            // For now, we continue polling for a bit to ensure we get all content
            if (currentContent && attempts > 5) {
              // Give it a few more seconds to ensure complete
              await new Promise((resolve) => setTimeout(resolve, 2000));
              
              // Check one more time for any final updates
              const finalMessages = await this.getSessionMessages(sessionId);
              const finalMessage = finalMessages[finalMessages.length - 1];
              if (finalMessage && finalMessage.info.role === 'assistant') {
                const finalParts = finalMessage.parts.filter((p): p is Part & { text: string } =>
                  p.type === 'text' && typeof p.text === 'string'
                );
                const finalContent = finalParts.map((p) => p.text).join('');
                if (finalContent.length > lastContent.length) {
                  yield { type: 'text', content: finalContent.slice(lastContent.length) };
                }
              }
              break;
            }
          } else if (assistantMessageFound) {
            // Assistant message was removed or changed - stop polling
            break;
          }
        } catch (error) {
          console.log('[OpenCodeService] Polling error:', error);
          // Ignore polling errors but don't stop
        }
        
        attempts++;
      }

      yield { type: 'message_stop' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
    }
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

/**
 * OpenCode Service
 * 
 * Main service for interacting with OpenCode SDK.
 * Wraps the SDK and provides a unified interface for the plugin.
 */

import type { Message, Part, Session } from '@opencode-ai/sdk';
import { createOpencode, createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import { Notice } from 'obsidian';

import type { ChatMessage, ImageAttachment, StreamChunk } from '../types';
import type { OpenCodianSettings } from '../types/settings';
import { ServerManager } from './ServerManager';
import type { OpenCodeServerConfig, QueryOptions, ResponseHandler } from './types';

/** Service events */
interface OpenCodeServiceEvents {
  onServerStatusChange?: (status: string) => void;
  onError?: (error: Error) => void;
}

export class OpenCodeService {
  private settings: OpenCodianSettings;
  private events: OpenCodeServiceEvents;
  private serverManager: ServerManager;
  private client: OpencodeClient | null = null;
  private currentSessionId: string | null = null;
  private responseHandlers: ResponseHandler[] = [];

  constructor(settings: OpenCodianSettings, events: OpenCodeServiceEvents = {}) {
    this.settings = settings;
    this.events = events;

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
    
    // Create client connection
    this.client = createOpencodeClient({
      baseUrl: `http://${this.settings.server.host}:${this.settings.server.port}`,
    });
  }

  /** Stop the service */
  async stop(): Promise<void> {
    this.client = null;
    await this.serverManager.stop();
  }

  /** Check if service is ready */
  isReady(): boolean {
    return this.serverManager.isRunning() && this.client !== null;
  }

  /** Get server status */
  getServerStatus(): string {
    return this.serverManager.getStatus();
  }

  /** Create a new session */
  async createSession(title?: string): Promise<string> {
    if (!this.client) {
      throw new Error('Service not initialized');
    }

    const response = await this.client.session.create({
      body: {
        title: title ?? 'New Conversation',
      },
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    const sessionId = response.data.id;
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
    if (!this.client) {
      throw new Error('Service not initialized');
    }

    const response = await this.client.session.list();
    
    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  /** Get session messages */
  async getSessionMessages(sessionId: string): Promise<{ info: Message; parts: Part[] }[]> {
    if (!this.client) {
      throw new Error('Service not initialized');
    }

    const response = await this.client.session.messages({
      path: { id: sessionId },
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  /** Delete a session */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Service not initialized');
    }

    const response = await this.client.session.delete({
      path: { id: sessionId },
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }

  /** Send a message and get streaming response */
  async *sendMessage(
    message: string,
    options: QueryOptions = {}
  ): AsyncGenerator<StreamChunk> {
    if (!this.client) {
      yield { type: 'error', content: 'Service not initialized' };
      return;
    }

    const sessionId = options.sessionId ?? this.currentSessionId;
    if (!sessionId) {
      yield { type: 'error', content: 'No active session' };
      return;
    }

    // Build parts array
    const parts: Part[] = [{ type: 'text', text: message }];

    // Add images if present
    if (options.images && options.images.length > 0) {
      for (const img of options.images) {
        parts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mediaType,
            data: img.data,
          },
        } as Part);
      }
    }

    // Build model config
    const modelConfig = options.model || options.provider
      ? {
          providerID: options.provider ?? this.settings.defaultProvider,
          modelID: options.model ?? this.settings.defaultModel,
        }
      : undefined;

    try {
      // Send the prompt
      const promptResponse = await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts,
          ...(modelConfig && { model: modelConfig }),
        },
      });

      if (promptResponse.error) {
        yield { type: 'error', content: promptResponse.error.message };
        return;
      }

      yield { type: 'message_start' };

      // Subscribe to events for streaming response
      const events = await this.client.event.subscribe();
      
      for await (const event of events.stream) {
        // Handle different event types
        if (event.type === 'message_stream') {
          const chunks = this.transformEventToChunks(event.properties);
          for (const chunk of chunks) {
            yield chunk;
          }
        }
      }

      yield { type: 'message_stop' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: message };
    }
  }

  /** Get available models */
  async getAvailableModels(): Promise<{ providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>; defaults: Record<string, string> }> {
    if (!this.client) {
      throw new Error('Service not initialized');
    }

    const response = await this.client.config.providers();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return {
      providers: response.data.providers.map((p) => ({
        id: p.id,
        name: p.name ?? p.id,
        models: p.models.map((m) => ({
          id: m.id,
          name: m.name ?? m.id,
        })),
      })),
      defaults: response.data.default,
    };
  }

  /** Update settings */
  updateSettings(settings: OpenCodianSettings): void {
    this.settings = settings;
    
    // Check if server config changed
    const serverConfigChanged = 
      settings.server.host !== this.settings.server.host ||
      settings.server.port !== this.settings.server.port;

    if (serverConfigChanged && this.serverManager.isRunning()) {
      // Restart server with new config
      void this.serverManager.restart().then(() => {
        this.client = createOpencodeClient({
          baseUrl: `http://${settings.server.host}:${settings.server.port}`,
        });
      });
    }
  }

  /** Transform SDK event to StreamChunks */
  private transformEventToChunks(eventProperties: unknown): StreamChunk[] {
    const chunks: StreamChunk[] = [];
    
    // Handle different event property structures
    const props = eventProperties as Record<string, unknown>;

    // Text content
    if (props.text && typeof props.text === 'string') {
      chunks.push({ type: 'text', content: props.text });
    }

    // Thinking content
    if (props.thinking && typeof props.thinking === 'string') {
      chunks.push({ type: 'thinking', content: props.thinking });
    }

    // Tool use
    if (props.tool_use && typeof props.tool_use === 'object') {
      const toolUse = props.tool_use as { id: string; name: string; input: Record<string, unknown> };
      chunks.push({
        type: 'tool_use',
        id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input,
      });
    }

    // Tool result
    if (props.tool_result && typeof props.tool_result === 'object') {
      const toolResult = props.tool_result as { tool_use_id: string; content: unknown };
      chunks.push({
        type: 'tool_result',
        toolUseId: toolResult.tool_use_id,
        content: typeof toolResult.content === 'string' 
          ? toolResult.content 
          : JSON.stringify(toolResult.content),
      });
    }

    // Usage
    if (props.usage && typeof props.usage === 'object') {
      const usage = props.usage as { input_tokens?: number; output_tokens?: number };
      chunks.push({
        type: 'usage',
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
      });
    }

    return chunks;
  }

  /** Convert OpenCode message to ChatMessage */
  static openCodeMessageToChatMessage(
    info: Message,
    parts: Part[]
  ): ChatMessage {
    // Build content from text parts
    const textParts = parts.filter((p): p is Part & { type: 'text'; text: string } => 
      p.type === 'text' && typeof p.text === 'string'
    );
    const content = textParts.map((p) => p.text).join('');

    // Extract tool calls
    const toolCalls = parts
      .filter((p): p is Part & { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        p.type === 'tool_use'
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        input: p.input,
        status: 'pending' as const,
      }));

    return {
      id: info.id,
      role: info.role === 'assistant' ? 'assistant' : 'user',
      content,
      timestamp: info.createdAt ? new Date(info.createdAt).getTime() : Date.now(),
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

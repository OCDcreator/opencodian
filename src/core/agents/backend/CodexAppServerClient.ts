/**
 * CodexAppServerClient — lightweight adjunct client for the local Codex app-server.
 *
 * This client is used ONLY for persisted session discovery and transcript readback.
 * The main chat send/stream path remains on the TypeScript SDK route.
 *
 * Protocol: JSON-RPC 2.0 over WebSocket.
 * Lifecycle: spawns `codex app-server --listen ws://127.0.0.1:0`, parses the
 *   emitted ws:// URL from stdout, connects, initializes, then makes requests.
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';

import { createLogger } from '../../../shared';

const logger = createLogger('CodexAppServerClient');

/** Raw thread shape from app-server thread/list and thread/read. */
export interface AppServerThread {
  id: string;
  sessionId: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  name: string | null;
  source: string;
  turns: AppServerTurn[];
}

/** Raw turn shape from app-server (only populated when includeTurns=true). */
export interface AppServerTurn {
  id: string;
  items: AppServerItem[];
}

/** Permission profile shape from app-server permissionProfile/list. */
export interface AppServerPermissionProfile {
  id: string;
  description?: string;
}

/** Rate limits shape from app-server account/rateLimits/read. */
export interface AppServerRateLimits {
  rateLimits: Record<string, unknown>;
  rateLimitsByLimitId?: Record<string, Record<string, unknown>>;
}

/** Account usage shape from app-server account/usage/read. */
export interface AppServerAccountUsage {
  summary: Record<string, unknown>;
  dailyUsageBuckets?: Array<Record<string, unknown>>;
}

/** Union of possible item types in a turn (verified against real Codex app-server output). */
export type AppServerItem =
  | { type: 'userMessage'; id: string; content: Array<{ type: string; text?: string }> }
  | { type: 'agentMessage'; id: string; text: string; phase?: string; memoryCitation?: unknown }
  | { type: 'reasoning'; id: string; summary?: string[]; content?: unknown[] }
  | { type: 'mcpToolCall'; id: string; server: string; tool: string; arguments: unknown; result?: unknown; status?: string; pluginId?: string | null }
  | { type: 'webSearch'; id: string; query: string; action?: unknown }
  | { type: 'contextCompaction'; id: string }
  | { type: 'fileChange'; id: string; changes: Array<{ path: string; kind: unknown; diff?: string; move_path?: string | null }>; status?: string }
  | { type: string; [key: string]: unknown };

/** JSON-RPC request envelope. */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

/** JSON-RPC response envelope. */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export class CodexAppServerClient {
  private ws: WebSocket | null = null;
  private process: ReturnType<typeof spawn> | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private wsUrl: string | null = null;

  /** Absolute path to the Codex CLI binary (optional). */
  private codexPathOverride?: string;
  /** Absolute path to the Obsidian plugin directory (for resolving `ws`). */
  private pluginDir?: string;

  constructor(options?: { codexPathOverride?: string; pluginDir?: string }) {
    this.codexPathOverride = options?.codexPathOverride;
    this.pluginDir = options?.pluginDir;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.doStart();
    return this.initPromise;
  }

  private async doStart(): Promise<void> {
    const codexPath = this.codexPathOverride ?? 'codex';
    logger.info('Starting Codex app-server', { codexPath });

    this.process = spawn(codexPath, ['app-server', '--listen', 'ws://127.0.0.1:0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Parse the WebSocket URL from stdout
    const wsUrl = await this.waitForWsUrl(this.process);
    this.wsUrl = wsUrl;
    logger.info('App-server WebSocket URL', { wsUrl });

    // Connect via WebSocket using Node `ws`.
    // Obsidian's renderer WebSocket is blocked for localhost, so we load the
    // Node ws package from the plugin directory at runtime using `require`,
    // which resolves through Node's module loader. Dynamic `import()` in the
    // renderer would incorrectly go through the browser fetch path.
    const wsPackagePath = this.pluginDir
      ? path.join(this.pluginDir, 'node_modules', 'ws')
      : 'ws';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WS = require(wsPackagePath) as new (url: string) => WebSocket;
    const ws = new WS(wsUrl);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
      ws.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
      ws.onerror = (err) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${String(err)}`));
      };
    });

    ws.onmessage = (event) => {
      this.handleMessage(event.data as string);
    };

    ws.onclose = () => {
      logger.warn('App-server WebSocket closed');
      this.initialized = false;
    };

    ws.onerror = (err) => {
      logger.error('App-server WebSocket error', { error: String(err) });
    };

    // Initialize the JSON-RPC session
    await this.request('initialize', {
      clientInfo: { name: 'opencodian', version: '1.0.0' },
    });

    // Send initialized notification
    ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }));
    this.initialized = true;
    logger.info('App-server initialized');
  }

  private waitForWsUrl(proc: ReturnType<typeof spawn>): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('App-server start timeout')), 15000);
      let buffer = '';

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const match = buffer.match(/ws:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timeout);
          proc.stdout?.off('data', onData);
          proc.stderr?.off('data', onData);
          resolve(match[0]);
        }
      };

      // The Codex app-server emits the listening URL on stderr (not stdout),
      // so we must scan both streams to find the WebSocket address.
      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);
      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        // Only log actual errors, not routine warnings
        if (text.includes('Error:')) {
          logger.warn('App-server stderr', { text: text.trim() });
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      proc.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          clearTimeout(timeout);
          reject(new Error(`App-server exited with code ${code}`));
        }
      });
    });
  }

  stop(): void {
    logger.info('Stopping Codex app-server client');
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Best-effort
      }
      this.ws = null;
    }
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.initialized = false;
    this.initPromise = null;
    // Reject any pending requests
    for (const pending of this.pending.values()) {
      pending.reject(new Error('App-server client stopped'));
    }
    this.pending.clear();
  }

  // ---------------------------------------------------------------------------
  // JSON-RPC
  // ---------------------------------------------------------------------------

  private handleMessage(data: string): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(data) as JsonRpcResponse;
    } catch {
      logger.warn('Failed to parse JSON-RPC message', { data: data.slice(0, 200) });
      return;
    }

    if (msg.id !== undefined) {
      const pending = this.pending.get(msg.id);
      if (!pending) {
        logger.warn('Unexpected JSON-RPC response id', { id: msg.id });
        return;
      }
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`));
      } else {
        pending.resolve(msg.result);
      }
    } else {
      // Notification — log but don't act
      logger.debug('JSON-RPC notification', { method: (msg as unknown as Record<string, unknown>).method });
    }
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }
      const id = this.nextId++;
      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(req));
    });
  }

  // ---------------------------------------------------------------------------
  // App-server API wrappers
  // ---------------------------------------------------------------------------

  async listThreads(limit = 50): Promise<AppServerThread[]> {
    await this.start();
    const result = (await this.request('thread/list', { limit })) as { data: AppServerThread[] } | undefined;
    return result?.data ?? [];
  }

  async readThread(threadId: string, includeTurns = true): Promise<AppServerThread | null> {
    await this.start();
    try {
      const result = (await this.request('thread/read', { threadId, includeTurns })) as { thread: AppServerThread } | undefined;
      return result?.thread ?? null;
    } catch (err) {
      logger.warn('Failed to read thread', { threadId, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  async listPermissionProfiles(options?: { cwd?: string; limit?: number; cursor?: string }): Promise<AppServerPermissionProfile[]> {
    await this.start();
    try {
      const result = (await this.request('permissionProfile/list', { limit: options?.limit ?? 50, ...(options?.cwd ? { cwd: options.cwd } : {}), ...(options?.cursor ? { cursor: options.cursor } : {}) })) as { data: AppServerPermissionProfile[] } | undefined;
      return result?.data ?? [];
    } catch (err) {
      logger.warn('Failed to list permission profiles', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  async getAccountRateLimits(): Promise<AppServerRateLimits | null> {
    await this.start();
    try {
      const result = (await this.request('account/rateLimits/read', {})) as AppServerRateLimits | undefined;
      if (result && typeof result === 'object' && 'rateLimits' in result) {
        return result as AppServerRateLimits;
      }
      return null;
    } catch (err) {
      logger.warn('Failed to read account rate limits', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  async getAccountUsage(): Promise<AppServerAccountUsage | null> {
    await this.start();
    try {
      const result = (await this.request('account/usage/read', {})) as AppServerAccountUsage | undefined;
      if (result && typeof result === 'object' && 'summary' in result) {
        return result as AppServerAccountUsage;
      }
      return null;
    } catch (err) {
      logger.warn('Failed to read account usage', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Normalization helpers (for AgentBackendRouting consumption)
  // ---------------------------------------------------------------------------

  /** Normalize app-server threads into the shape expected by listBackendSessions. */
  static normalizeThreadList(threads: AppServerThread[]): Array<{
    id: string;
    title: string;
    updatedAt: number | null;
    shareUrl: null;
  }> {
    return threads.map((t) => ({
      id: t.id,
      title: t.name ?? t.preview.slice(0, 80) ?? '(untitled)',
      updatedAt: t.updatedAt ? t.updatedAt * 1000 : null, // seconds → ms
      shareUrl: null,
    }));
  }

  /** Normalize app-server turns into the shape expected by getBackendSessionPreview. */
  static normalizeTurnsToPreviewMessages(
    turns: AppServerTurn[],
  ): Array<{ role: string; parts: Array<{ type: string; text: string }> }> {
    const messages: Array<{ role: string; parts: Array<{ type: string; text: string }> }> = [];
    for (const turn of turns) {
      for (const item of turn.items) {
        if (item.type === 'userMessage' && Array.isArray(item.content)) {
          const textParts = item.content
            .filter((c): c is { type: string; text: string } =>
              c.type === 'text' && typeof c.text === 'string' && c.text.length > 0,
            )
            .map((c) => c.text);
          if (textParts.length > 0) {
            messages.push({
              role: 'user',
              parts: textParts.map((text) => ({ type: 'text', text })),
            });
          }
        } else if (item.type === 'agentMessage' && typeof item.text === 'string' && item.text.length > 0) {
          messages.push({
            role: 'assistant',
            parts: [{ type: 'text', text: item.text }],
          });
        }
        // Non-text items (reasoning, mcpToolCall, webSearch, fileChange,
        // contextCompaction) are intentionally skipped from the preview transcript
        // because the session browser preview/detail focuses on conversational text.
      }
    }
    return messages;
  }
}

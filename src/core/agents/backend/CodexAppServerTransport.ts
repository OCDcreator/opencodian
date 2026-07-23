/**
 * CodexAppServerTransport — process lifecycle and JSON-RPC plumbing for the
 * local Codex app-server.
 *
 * Split out of `CodexAppServerClient` so the client module stays under the
 * project line budget. `CodexAppServerClient extends CodexAppServerTransport`
 * and adds the typed app-server API wrappers; this base class only owns:
 *   - spawning/connecting the app-server WebSocket,
 *   - the JSON-RPC 2.0 request/response/notification dispatch loop,
 *   - server-initiated request (approval callback) reply routing,
 *   - notification + server-request handler registration.
 *
 * Protocol: JSON-RPC 2.0 over WebSocket.
 * Lifecycle: spawns `codex app-server --listen ws://127.0.0.1:0`, parses the
 *   emitted ws:// URL from stdout, connects, initializes, then makes requests.
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';

import { createLogger } from '../../../shared';
import type { AppServerServerRequestHandler } from './CodexAppServerClientTypes';

const logger = createLogger('CodexAppServerClient');

/** JSON-RPC request envelope (client → server). */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * Any inbound JSON-RPC message. A message carrying BOTH `method` and `id` is a
 * server-initiated request (e.g. an approval callback); `id` without `method`
 * is an ordinary response to a client request; `method` without `id` is a
 * notification. The discriminator is computed in `handleMessage`.
 */
interface JsonRpcInbound {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export class CodexAppServerTransport {
  protected ws: WebSocket | null = null;
  protected process: ReturnType<typeof spawn> | null = null;
  protected nextId = 1;
  protected pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  protected notificationHandlers = new Map<string, Set<(params: unknown) => void>>();
  /** Server-initiated request handlers (method+id messages). One per method. */
  protected serverRequestHandlers = new Map<string, AppServerServerRequestHandler>();
  protected initialized = false;
  protected initPromise: Promise<void> | null = null;
  protected wsUrl: string | null = null;

  /** Absolute path to the Codex CLI binary (optional). */
  protected codexPathOverride?: string;
  /** Absolute path to the Obsidian plugin directory (for resolving `ws`). */
  protected pluginDir?: string;
  /**
   * Working directory the owned app-server process is spawned with. When set
   * to the active vault path, project-scoped resources (e.g. `.agents/skills`)
   * are resolved relative to the vault; otherwise the server inherits the
   * plugin process cwd and project resources are invisible.
   */
  protected workingDirectory?: string;

  constructor(options?: { codexPathOverride?: string; pluginDir?: string; workingDirectory?: string }) {
    this.codexPathOverride = options?.codexPathOverride;
    this.pluginDir = options?.pluginDir;
    this.workingDirectory = options?.workingDirectory;
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
    logger.info('Starting Codex app-server', { codexPath, cwd: this.workingDirectory ?? '(inherited)' });

    this.process = spawn(codexPath, ['app-server', '--listen', 'ws://127.0.0.1:0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // Spawn the owned app-server inside the active vault so project-scoped
      // resources (.agents/skills, .codex/agents) resolve correctly. Omit cwd
      // only when no working directory is known (inherit plugin process cwd).
      ...(this.workingDirectory ? { cwd: this.workingDirectory } : {}),
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
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
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
    let msg: JsonRpcInbound;
    try {
      msg = JSON.parse(data) as JsonRpcInbound;
    } catch {
      logger.warn('Failed to parse JSON-RPC message', { data: data.slice(0, 200) });
      return;
    }

    const id = msg.id;
    const hasId = id !== undefined && id !== null;
    const method = msg.method;
    const hasMethod = typeof method === 'string';

    // Server-initiated request: carries BOTH `method` and `id`. Must be checked
    // before the plain-response branch, otherwise these get misrouted into the
    // pending-response lookup and silently dropped as "unexpected response id".
    if (hasId && hasMethod) {
      this.handleServerRequest(id, method, msg.params);
      return;
    }

    // Ordinary response to a client request: `id`, no `method`.
    if (hasId) {
      const pending = this.pending.get(id as number);
      if (!pending) {
        logger.warn('Unexpected JSON-RPC response id', { id });
        return;
      }
      this.pending.delete(id as number);
      if (msg.error) {
        pending.reject(new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // Notification: `method`, no `id`.
    if (hasMethod) {
      const handlers = this.notificationHandlers.get(method);
      if (handlers) {
        for (const handler of handlers) {
          try { handler(msg.params); } catch (err) {
            logger.warn('Notification handler error', { method, error: err instanceof Error ? err.message : String(err) });
          }
        }
      }
      logger.debug('JSON-RPC notification', { method });
      return;
    }

    logger.warn('Unrecognized JSON-RPC message', { data: data.slice(0, 200) });
  }

  /**
   * Dispatch a server-initiated JSON-RPC request (message with both `method`
   * and `id`). Invokes the registered handler, then sends back the appropriate
   * JSON-RPC reply. A missing handler yields a spec-compliant `-32601
   * Method not found` error reply; a throwing/rejecting handler yields a
   * `-32603 Internal error` reply carrying the handler's message.
   */
  private handleServerRequest(id: number | string, method: string, params: unknown): void {
    const handler = this.serverRequestHandlers.get(method);
    if (!handler) {
      logger.warn('No server-request handler registered; replying method-not-found', { method, id });
      this.sendServerRequestReply(id, undefined, { code: -32601, message: `Method not found: ${method}` });
      return;
    }
    Promise.resolve()
      .then(() => handler(params))
      .then(
        (result) => this.sendServerRequestReply(id, result, undefined),
        (err) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn('Server-request handler threw', { method, id, error: message });
          this.sendServerRequestReply(id, undefined, { code: -32603, message });
        },
      );
  }

  /** Send a JSON-RPC reply to a server-initiated request (result or error). */
  private sendServerRequestReply(id: number | string, result: unknown, error: { code: number; message: string } | undefined): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot reply to server request; WebSocket not open', { id });
      return;
    }
    const reply = error === undefined
      ? { jsonrpc: '2.0', id, result }
      : { jsonrpc: '2.0', id, error };
    this.ws.send(JSON.stringify(reply));
  }

  protected request(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }
      const id = this.nextId++;
      const req: JsonRpcRequest = params === undefined
        ? { jsonrpc: '2.0', id, method }
        : { jsonrpc: '2.0', id, method, params };

      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanupTimer = (): void => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      this.pending.set(id, {
        resolve: (value: unknown) => {
          cleanupTimer();
          resolve(value);
        },
        reject: (reason: Error) => {
          cleanupTimer();
          reject(reason);
        },
      });

      if (timeoutMs !== undefined && timeoutMs > 0) {
        timer = setTimeout(() => {
      this.pending.delete(id as number);
          reject(new Error(`JSON-RPC request timeout for ${method}`));
        }, timeoutMs);
      }

      this.ws.send(JSON.stringify(req));
    });
  }

  addNotificationHandler(method: string, handler: (params: unknown) => void): void {
    let handlers = this.notificationHandlers.get(method);
    if (!handlers) {
      handlers = new Set();
      this.notificationHandlers.set(method, handlers);
    }
    handlers.add(handler);
  }

  removeNotificationHandler(method: string, handler: (params: unknown) => void): void {
    this.notificationHandlers.get(method)?.delete(handler);
  }

  /**
   * Register a handler for a server-initiated JSON-RPC request (a message
   * carrying both `method` and `id`, e.g. `execCommandApproval` /
   * `applyPatchApproval`). At most one handler per method; a later registration
   * replaces an earlier one. Returns the previously registered handler (or
   * `undefined`) so callers can restore it. Approval handlers should resolve to
   * `{ decision: ReviewDecision }`.
   */
  registerServerRequestHandler(method: string, handler: AppServerServerRequestHandler): AppServerServerRequestHandler | undefined {
    const prev = this.serverRequestHandlers.get(method);
    this.serverRequestHandlers.set(method, handler);
    return prev;
  }

  /**
   * Remove the server-request handler for `method`. Returns the removed handler
   * (or `undefined`). After removal, matching server requests receive a
   * `-32601 Method not found` reply instead of being silently dropped.
   */
  unregisterServerRequestHandler(method: string): AppServerServerRequestHandler | undefined {
    const prev = this.serverRequestHandlers.get(method);
    this.serverRequestHandlers.delete(method);
    return prev;
  }
}

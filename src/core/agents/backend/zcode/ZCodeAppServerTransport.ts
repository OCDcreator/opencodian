/**
 * ZCodeAppServerTransport — process ownership and ZCode Protocol plumbing for
 * one OpenCodian-owned `app-server --stdio` child process.
 *
 * Protocol: NDJSON over stdio (no `jsonrpc` field — the official runtime
 * rejects messages carrying one). This transport owns:
 *   - spawning and reaping exactly one child process (never the ZCode
 *     desktop app's processes),
 *   - the request/response/notification dispatch loop with boundary
 *     validation of every inbound frame,
 *   - fail-closed replies to server-initiated requests (an unhandled ask is
 *     rejected, never silently approved),
 *   - timeout, malformed-frame, premature-exit, and EOF degradation without
 *     tearing down unrelated backend sessions.
 */

import { type ChildProcessWithoutNullStreams,spawn } from 'node:child_process';

import { createLogger } from '../../../../shared';
import {
  parseZCodeInboundMessage,
  serializeZCodeRequest,
  serializeZCodeServerRequestReply,
  zCodeMethodNotFoundReply,
  type ZCodeProtocolError,
  ZCodeProtocolErrorCode,
} from './ZCodeProtocolTypes';
import type { ZCodeRuntimeLaunch } from './ZCodeRuntimeResolver';

const logger = createLogger('ZCodeAppServerTransport');

/** Hard cap for one inbound frame; a longer line corrupts framing and closes the transport. */
const MAX_LINE_BYTES = 8 * 1024 * 1024;
/** Malformed frames tolerated before the stream is treated as corrupted. */
const MAX_PROTOCOL_VIOLATIONS = 32;
/** Grace period between SIGTERM and SIGKILL on dispose. */
const KILL_GRACE_MS = 2000;

/** Scoped transport failure; callers must not match on message text. */
export class ZCodeTransportError extends Error {
  constructor(
    readonly reason: 'timeout' | 'transport-closed' | 'process-exit' | 'protocol-corrupted' | 'spawn-failed',
    message: string,
    readonly detail?: { exitCode?: number | null; signal?: string | null; method?: string },
  ) {
    super(message);
    this.name = 'ZCodeTransportError';
  }
}

/**
 * Structured remote failure (an error response from the runtime). Control
 * flow branches on `code`, never on the message text.
 */
export class ZCodeRemoteRequestError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
    readonly method?: string,
  ) {
    super(message);
    this.name = 'ZCodeRemoteRequestError';
  }
}

/** Normalize handshake failures at the transport boundary. */
export function normalizeZCodeHandshakeFailure(error: unknown): string {
  if (error instanceof ZCodeTransportError) {
    if (error.reason === 'spawn-failed') return `Failed to start the ZCode app-server process: ${error.message}`;
    if (error.reason === 'timeout') return 'ZCode capability handshake timed out. The runtime did not answer runtime/capabilities; check the installed ZCode version.';
    if (error.reason === 'process-exit') return 'ZCode app-server exited before the capability handshake completed.';
    return `ZCode capability handshake failed: ${error.message}`;
  }
  if (error instanceof ZCodeRemoteRequestError) {
    return `ZCode capability handshake rejected (code ${error.code}): ${error.message}`;
  }
  return `ZCode capability handshake failed: ${String(error)}`;
}

export type ZCodeNotificationHandler = (params: Record<string, unknown>) => void;
export type ZCodeServerRequestHandler = (
  params: Record<string, unknown>,
) => Promise<unknown> | unknown;

export interface ZCodeAppServerTransportOptions {
  launch: ZCodeRuntimeLaunch;
  /** Spawn environment base; defaults to `process.env`. */
  baseEnv?: Record<string, string | undefined>;
  /** Extra environment merged over base + provider env + launch env. */
  extraEnv?: Record<string, string>;
  workingDirectory?: string;
  requestTimeoutMs?: number;
  spawnImpl?: typeof spawn;
  onNotification?: (method: string, params: Record<string, unknown>) => void;
  onProtocolViolation?: (reason: string) => void;
  onExit?: (detail: { exitCode: number | null; signal: string | null }) => void;
}

interface PendingRequest {
  readonly method: string;
  readonly sentAt: number;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
}

export class ZCodeAppServerTransport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly notificationHandlers = new Map<string, Set<ZCodeNotificationHandler>>();
  private readonly serverRequestHandlers = new Map<string, ZCodeServerRequestHandler>();
  private nextId = 1;
  private stdoutBuffer = '';
  private protocolViolations = 0;
  private disposed = false;
  private exitReported = false;
  private killTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: ZCodeAppServerTransportOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
  }

  /** True while the owned child process is running. */
  get isAlive(): boolean {
    return this.child !== null && !this.child.killed && this.child.exitCode === null;
  }

  /** Spawn the owned app-server process. Resolves once the process is running (not after handshake). */
  async start(): Promise<void> {
    if (this.child) {
      return;
    }
    if (this.disposed) {
      throw new ZCodeTransportError('transport-closed', 'ZCode transport already disposed');
    }
    const { launch } = this.options;
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.options.baseEnv ?? process.env)) {
      if (typeof value === 'string') {
        env[key] = value;
      }
    }
    Object.assign(env, launch.extraEnv, this.options.extraEnv ?? {});

    const spawnImpl = this.options.spawnImpl ?? spawn;
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnImpl(launch.command, [...launch.args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        ...(this.options.workingDirectory ? { cwd: this.options.workingDirectory } : {}),
        windowsHide: true,
      }) as ChildProcessWithoutNullStreams;
    } catch (error) {
      throw new ZCodeTransportError('spawn-failed', `Failed to start ZCode app-server: ${String(error)}`);
    }
    this.child = child;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.handleStdoutChunk(chunk));
    // Stderr is drained to avoid backpressure but never logged raw: it may
    // carry credentials, tokens, or prompt text (redaction contract).
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', () => { /* drained */ });
    child.on('error', (error) => {
      this.failAllPending(new ZCodeTransportError('spawn-failed', `ZCode app-server process error: ${String(error)}`));
    });
    child.on('exit', (exitCode, signal) => {
      this.handleExit(exitCode, signal);
    });
  }

  /**
   * Send a request and await its response. Rejections are scoped transport
   * errors or `ZCodeProtocolError`-shaped remote failures; timeouts remove
   * the correlation slot so a late response cannot resurrect the request.
   */
  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const child = this.child;
    if (!child || this.disposed) {
      throw new ZCodeTransportError('transport-closed', 'ZCode transport is not running');
    }
    const id = `opencodian-${this.nextId++}`;
    const frame = serializeZCodeRequest({
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ZCodeTransportError('timeout', `ZCode request "${method}" timed out after ${this.requestTimeoutMs}ms`, { method }));
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        method,
        sentAt: Date.now(),
        timer,
        resolve: (value) => resolve(value as T),
        reject,
      });
      child.stdin.write(`${frame}\n`, (error) => {
        if (error) {
          const entry = this.pending.get(id);
          if (entry) {
            clearTimeout(entry.timer);
            this.pending.delete(id);
            entry.reject(new ZCodeTransportError('transport-closed', `Failed to send ZCode request "${method}": ${String(error)}`, { method }));
          }
        }
      });
    });
  }

  /** Subscribe to an agent notification method. Unknown methods never crash the stream. */
  onNotification(method: string, handler: ZCodeNotificationHandler): { dispose(): void } {
    const handlers = this.notificationHandlers.get(method) ?? new Set();
    handlers.add(handler);
    this.notificationHandlers.set(method, handlers);
    return { dispose: () => { handlers.delete(handler); } };
  }

  /**
   * Handle a server-initiated request method. Requests without a registered
   * handler are answered fail-closed with "method not found" — an unknown ask
   * is never silently approved.
   */
  onServerRequest(method: string, handler: ZCodeServerRequestHandler): { dispose(): void } {
    this.serverRequestHandlers.set(method, handler);
    return { dispose: () => { this.serverRequestHandlers.delete(method); } };
  }

  /** Kill only the owned child process and reject all in-flight work. Idempotent. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.failAllPending(new ZCodeTransportError('transport-closed', 'ZCode transport disposed'));
    const child = this.child;
    this.child = null;
    if (this.killTimer) {
      clearTimeout(this.killTimer);
      this.killTimer = null;
    }
    if (child && child.exitCode === null && child.signalCode === null) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Process may already be gone; the exit handler still reaps it.
      }
      this.killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Already reaped.
        }
      }, KILL_GRACE_MS);
    }
  }

  // ---------------------------------------------------------------------------
  // Inbound framing
  // ---------------------------------------------------------------------------

  private handleStdoutChunk(chunk: string): void {
    this.stdoutBuffer += chunk;
    if (this.stdoutBuffer.length > MAX_LINE_BYTES && !this.stdoutBuffer.includes('\n')) {
      this.corruptStream('line-too-long');
      return;
    }
    let newlineIndex = this.stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        this.handleLine(line);
      }
      if (!this.child) {
        return;
      }
      newlineIndex = this.stdoutBuffer.indexOf('\n');
    }
    if (this.stdoutBuffer.length > MAX_LINE_BYTES) {
      this.corruptStream('line-too-long');
    }
  }

  private handleLine(line: string): void {
    const message = parseZCodeInboundMessage(line);
    switch (message.kind) {
      case 'response': {
        const entry = this.pending.get(message.id);
        if (!entry) {
          // Late or unknown response: counted, never resurrected.
          this.noteViolation(`late-response:${message.id}`);
          return;
        }
        clearTimeout(entry.timer);
        this.pending.delete(message.id);
        entry.resolve(message.result);
        return;
      }
      case 'error': {
        const entry = this.pending.get(message.id);
        if (!entry) {
          this.noteViolation(`late-error:${message.id}`);
          return;
        }
        clearTimeout(entry.timer);
        this.pending.delete(message.id);
        entry.reject(new ZCodeRemoteRequestError(
          message.error.code,
          `ZCode request "${entry.method}" failed: ${message.error.message}`,
          message.error.data,
          entry.method,
        ));
        return;
      }
      case 'notification': {
        const handlers = this.notificationHandlers.get(message.method);
        if (!handlers) {
          // Unknown events degrade honestly: tolerated, visible, non-fatal.
          this.options.onNotification?.(message.method, message.params);
          return;
        }
        for (const handler of handlers) {
          try {
            handler(message.params);
          } catch {
            logger.warn('zcode notification handler threw');
          }
        }
        this.options.onNotification?.(message.method, message.params);
        return;
      }
      case 'server-request': {
        void this.handleServerRequestMessage(message.id, message.method, message.params);
        return;
      }
      case 'invalid': {
        this.noteViolation(message.reason);
        return;
      }
    }
  }

  private async handleServerRequestMessage(id: string, method: string, params: Record<string, unknown>): Promise<void> {
    const handler = this.serverRequestHandlers.get(method);
    if (!handler) {
      this.writeReply(zCodeMethodNotFoundReply(id, method));
      return;
    }
    try {
      const result = await handler(params);
      this.writeReply({ id, result: result ?? null });
    } catch (error) {
      const protocolError: ZCodeProtocolError = {
        code: ZCodeProtocolErrorCode.Internal,
        message: `ZCode request "${method}" handler failed: ${String(error)}`,
      };
      this.writeReply({ id, error: protocolError });
    }
  }

  private writeReply(reply: Parameters<typeof serializeZCodeServerRequestReply>[0]): void {
    const child = this.child;
    if (!child || this.disposed) {
      return;
    }
    try {
      child.stdin.write(`${serializeZCodeServerRequestReply(reply)}\n`);
    } catch {
      // Connection is going away; the exit path reports it.
    }
  }

  private noteViolation(reason: string): void {
    this.protocolViolations += 1;
    this.options.onProtocolViolation?.(reason);
    if (this.protocolViolations > MAX_PROTOCOL_VIOLATIONS) {
      this.corruptStream('too-many-violations');
    }
  }

  private corruptStream(reason: string): void {
    this.failAllPending(new ZCodeTransportError('protocol-corrupted', `ZCode protocol stream corrupted (${reason})`));
    this.dispose();
  }

  private handleExit(exitCode: number | null, signal: NodeJS.Signals | null): void {
    if (this.killTimer) {
      clearTimeout(this.killTimer);
      this.killTimer = null;
    }
    this.child = null;
    this.failAllPending(new ZCodeTransportError('process-exit', 'ZCode app-server process exited', {
      exitCode,
      signal: signal ?? null,
    }));
    if (!this.exitReported) {
      this.exitReported = true;
      this.options.onExit?.({ exitCode, signal: signal ?? null });
    }
  }

  private failAllPending(error: ZCodeTransportError): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }
}

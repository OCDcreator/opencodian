/* eslint-disable max-lines -- One cohesive security surface: listener lifecycle, the fixed fail-closed request pipeline and the single-flight session drive belong together; splitting the pipeline would scatter the audit ordering invariants. */

import { randomUUID } from 'crypto';
import * as http from 'http';

import type { StreamChunk } from '../../core/types/chat';
import type { OpenCodianSettings } from '../../core/types/settings';
import {
  deriveAuditFingerprint,
  deriveInstructionSummary,
  RemoteControlAudit,
  type RemoteControlRequestSource,
} from './RemoteControlAudit';
import { extractBearerToken, isLoopbackBindAddress, tokensMatch } from './RemoteControlAuth';

/**
 * R-C6 remote control service (core.remotecontrol owner).
 *
 * A token-gated loopback HTTP interface that lets external programs drive one
 * dedicated OpenCode session. Security posture (flowtext-c6-design.md):
 * - OFF means ZERO construction: while disabled, no `http.Server` exists and
 *   no `listen` call is ever made (contract-proven by tests);
 * - fixed fail-closed pipeline: Host allowlist → method/path whitelist →
 *   timing-safe token compare → body cap/parse → single-flight → execute;
 * - closed error-code set; unknown paths are rejected structurally, which is
 *   what makes "out-of-vault read rejected" true by construction (no file
 *   endpoint exists, the request shape is a single `instruction` string);
 * - every rejection and every terminal outcome is audited.
 */

/** Fixed endpoint (design §9-Q1: not user-configurable in v1). */
export const REMOTE_CONTROL_PORT = 4105;
/** Hard request-body cap (design §4.2). */
export const REMOTE_CONTROL_MAX_BODY_BYTES = 64 * 1024;
/** Hard instruction length cap (design §4.4, >32k chars → malformed_request). */
export const REMOTE_CONTROL_MAX_INSTRUCTION_CHARS = 32_000;
/** Hard turn deadline (design §9-Q2); aborts through the existing cancel path. */
export const REMOTE_CONTROL_TURN_TIMEOUT_MS = 15 * 60 * 1000;
/** Small connection cap (design §4.2). */
export const REMOTE_CONTROL_MAX_CONNECTIONS = 4;

export const REMOTE_CONTROL_SESSION_TITLE = 'OpenCodian Remote Control';

/** Closed error-code set (design §4.4). Anything else is a bug. */
export const REMOTE_CONTROL_ERROR_CODES = [
  'unauthorized',
  'forbidden_host',
  'unknown_operation',
  'method_not_allowed',
  'malformed_request',
  'busy',
  'payload_too_large',
  'internal_error',
] as const;

export type RemoteControlErrorCode = (typeof REMOTE_CONTROL_ERROR_CODES)[number];

const ERROR_MESSAGES: Readonly<Record<RemoteControlErrorCode, string>> = {
  unauthorized: 'missing or invalid access token',
  forbidden_host: 'host header not allowed',
  unknown_operation: 'unknown operation',
  method_not_allowed: 'method not allowed',
  malformed_request: 'malformed request body',
  busy: 'an instruction is already in flight',
  payload_too_large: 'request body too large',
  internal_error: 'internal error',
};

export type RemoteControlOperation = 'health' | 'instruction.submit' | 'session.status';

/** The closed operation whitelist (design §4.6). Code-enumerated, not config-driven. */
export const REMOTE_CONTROL_OPERATIONS: Readonly<Record<RemoteControlOperation, { method: string; path: string }>> = {
  health: { method: 'GET', path: '/v1/health' },
  'instruction.submit': { method: 'POST', path: '/v1/instruction' },
  'session.status': { method: 'GET', path: '/v1/session' },
};

export type RemoteControlRouteResult =
  | { kind: 'allowed'; op: RemoteControlOperation }
  | { kind: 'method_not_allowed' }
  | { kind: 'unknown_operation' };

/** Host-header allowlist (DNS-rebinding guard, checked before auth). */
export function isAllowedRemoteControlHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  const normalized = hostHeader.trim().toLowerCase();
  return normalized === `127.0.0.1:${port}`
    || normalized === `localhost:${port}`
    || normalized === `[::1]:${port}`;
}

/** Exact method+path whitelist. No normalization, no trailing-slash tolerance. */
export function resolveRemoteControlOperation(method: string, path: string): RemoteControlRouteResult {
  for (const op of Object.keys(REMOTE_CONTROL_OPERATIONS) as RemoteControlOperation[]) {
    const route = REMOTE_CONTROL_OPERATIONS[op];
    if (route.path !== path) continue;
    return route.method === method ? { kind: 'allowed', op } : { kind: 'method_not_allowed' };
  }
  return { kind: 'unknown_operation' };
}

/**
 * The narrow port the service drives the OpenCode session through. main.ts
 * binds it to `OpenCodeService`'s existing public API; the service itself
 * never imports `OpenCodeService` (zero changes to the OpenCode service).
 */
export interface RemoteControlSessionDriver {
  createSession(title: string | undefined, options: { setCurrent: boolean }): Promise<string>;
  sendMessage(message: string, options: { sessionId: string }): AsyncGenerator<StreamChunk, void, unknown>;
  /** Server-side abort through the existing cancel path (timeout handling). */
  cancelStream(sessionId: string): void;
}

export type RemoteControlLifecycleState = 'off' | 'listening' | 'error';

/** Internal typed rejection so pipeline steps can fail the request precisely. */
class RemoteControlRequestError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: RemoteControlErrorCode,
  ) {
    super(code);
  }
}
export type RemoteControlFlightState = 'idle' | 'running';
/** v1 maps thrown generators to error; 'cancelled' is reserved for a future cancel endpoint. */
export type RemoteControlTerminalState = 'completed' | 'cancelled' | 'error' | 'timeout';

export type RemoteControlBlockedReason =
  | 'missing-token'
  | 'non-loopback-unacknowledged';

export interface RemoteControlRuntimeState {
  state: RemoteControlLifecycleState;
  blockedReason?: RemoteControlBlockedReason;
  bindError?: string;
  bindAddress: string;
  port: number;
  flight: RemoteControlFlightState;
  sessionId: string | null;
  lastTerminalState: RemoteControlTerminalState | null;
  lastDurationMs: number | null;
  auditDirectory: string;
  droppedAuditEvents: number;
}

export interface RemoteControlServiceOptions {
  getSettings: () => OpenCodianSettings;
  driver: RemoteControlSessionDriver;
  /** Injectable audit (tests use a temp directory); default builds its own. */
  audit?: RemoteControlAudit;
  /**
   * Dynamically collected known secrets for the hardened audit redactor
   * (live token plus existing settings credentials). Getter so rotations
   * apply immediately.
   */
  knownSecrets?: () => readonly string[];
  /** Vault path for path normalization inside audit redaction. */
  vaultPath?: string;
  /** Hard turn deadline; production default 15 minutes, tests inject ms values. */
  turnTimeoutMs?: number;
  /** Test seam only: production always uses the fixed REMOTE_CONTROL_PORT. */
  port?: number;
  /** Fail-closed startup failures surface through this sink (main.ts → Notice). */
  notify?: (message: string) => void;
}

interface RejectionContext {
  source: RemoteControlRequestSource;
  op?: RemoteControlOperation;
  requestId?: string;
  /** Present only when authentication already succeeded. */
  authFingerprint?: string;
}

export class RemoteControlService {
  private readonly options: RemoteControlServiceOptions;
  private readonly turnTimeoutMs: number;
  private readonly port: number;
  /** Lazily built so an always-constructed, disabled service touches no disk. */
  private auditInstance: RemoteControlAudit | null;

  private server: http.Server | null = null;
  private state: RemoteControlLifecycleState = 'off';
  private blockedReason: RemoteControlBlockedReason | undefined;
  private bindError: string | undefined;
  private listeningSignature: string | null = null;
  private flight: RemoteControlFlightState = 'idle';
  private sessionId: string | null = null;
  private lastTerminalState: RemoteControlTerminalState | null = null;
  private lastDurationMs: number | null = null;
  private disposed = false;

  constructor(options: RemoteControlServiceOptions) {
    this.options = options;
    this.auditInstance = options.audit ?? null;
    this.turnTimeoutMs = options.turnTimeoutMs ?? REMOTE_CONTROL_TURN_TIMEOUT_MS;
    this.port = options.port ?? REMOTE_CONTROL_PORT;
  }

  /** Audit trail; built on first need so "off" stays a zero-cost state. */
  get audit(): RemoteControlAudit {
    this.auditInstance ??= new RemoteControlAudit({
      knownSecrets: this.options.knownSecrets,
      vaultPath: this.options.vaultPath,
    });
    return this.auditInstance;
  }

  /** Current state for the settings surface; never includes the token. */
  getRuntimeState(): RemoteControlRuntimeState {
    return {
      state: this.state,
      blockedReason: this.blockedReason,
      bindError: this.bindError,
      bindAddress: this.resolveBindAddress(),
      port: this.port,
      flight: this.flight,
      sessionId: this.sessionId,
      lastTerminalState: this.lastTerminalState,
      lastDurationMs: this.lastDurationMs,
      auditDirectory: this.auditInstance?.store.rootDirectory ?? '',
      droppedAuditEvents: this.auditInstance?.getStatus().droppedEvents ?? 0,
    };
  }

  /**
   * Atomic settings reload: stop old listener → validate → start new listener.
   * Bind failure falls back to the closed state with an explicit error
   * (fail-closed), never keeps a stale listener with old configuration.
   */
  async applySettings(): Promise<void> {
    if (this.disposed) return;
    const settings = this.options.getSettings();
    const enabled = settings.remoteControlEnabled === true;
    const bindAddress = this.resolveBindAddress();
    const token = settings.remoteControlToken;

    if (!enabled) {
      await this.stopListening('disabled');
      this.state = 'off';
      this.blockedReason = undefined;
      this.bindError = undefined;
      this.listeningSignature = null;
      return;
    }

    if (!token) {
      await this.stopListening('missing-token');
      this.state = 'error';
      this.blockedReason = 'missing-token';
      this.bindError = undefined;
      this.listeningSignature = null;
      return;
    }

    const acknowledgedAt = settings.remoteControlNonLoopbackAcknowledgedAt;
    if (!isLoopbackBindAddress(bindAddress) && !acknowledgedAt) {
      await this.stopListening('non-loopback-unacknowledged');
      this.state = 'error';
      this.blockedReason = 'non-loopback-unacknowledged';
      this.bindError = undefined;
      this.listeningSignature = null;
      return;
    }

    const signature = `${bindAddress}|${deriveAuditFingerprint(token)}`;
    if (this.server && this.listeningSignature === signature) return;

    await this.stopListening('restart');
    this.blockedReason = undefined;
    this.bindError = undefined;
    try {
      await this.listen(bindAddress);
      this.listeningSignature = signature;
      this.state = 'listening';
      this.audit.emit('lifecycle.started', 'info', { bindAddress, port: this.port });
    } catch (error) {
      // Fail-closed: fall back to the closed state and report loudly.
      this.server = null;
      this.listeningSignature = null;
      this.state = 'error';
      this.bindError = error instanceof Error ? error.message : String(error);
      this.audit.emit('lifecycle.bind_failed', 'error', {
        bindAddress,
        port: this.port,
        error: this.bindError,
      });
      this.options.notify?.(this.bindError);
    }
  }

  /** Stop the listener, abort an in-flight instruction and flush the audit. */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.sessionId && this.flight === 'running') {
      try {
        this.options.driver.cancelStream(this.sessionId);
      } catch {
        // Contained: dispose must complete even if the abort signal fails.
      }
    }
    await this.stopListening('dispose');
    this.state = 'off';
    await this.auditInstance?.dispose();
  }

  private resolveBindAddress(): string {
    const settings = this.options.getSettings();
    const raw = settings.remoteControlBindAddress.trim();
    return raw.toLowerCase() === 'localhost' ? '127.0.0.1' : raw;
  }

  private listen(bindAddress: string): Promise<void> {
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });
    server.maxConnections = REMOTE_CONTROL_MAX_CONNECTIONS;
    this.server = server;
    return new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onListening = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        server.off('error', onError);
        server.off('listening', onListening);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this.port, bindAddress);
    }).catch((error) => {
      this.server = null;
      throw error;
    }).then(() => {
      // Later runtime failures (socket crash) must also fail closed.
      this.server?.once('error', (error: Error) => {
        this.state = 'error';
        this.bindError = error.message;
        this.listeningSignature = null;
        this.audit.emit('lifecycle.bind_failed', 'error', {
          bindAddress,
          port: this.port,
          error: error.message,
        });
      });
    });
  }

  private async stopListening(reason: string): Promise<void> {
    const server = this.server;
    this.server = null;
    this.listeningSignature = null;
    if (!server) return;
    this.audit.emit('lifecycle.stopped', 'info', {
      bindAddress: this.resolveBindAddress(),
      port: this.port,
      reason,
    });
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }

  // ─── Request pipeline (fixed order, design §5.1) ──────────────────────

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const source: RemoteControlRequestSource = {
      remoteAddress: req.socket.remoteAddress ?? '',
      remotePort: req.socket.remotePort ?? 0,
      host: req.headers.host,
    };
    void this.processRequest(req, res, source).catch((error) => {
      // Last-resort guard: fixed copy, details go to the audit only.
      this.audit.emit('request.rejected', 'error', {
        requestId: undefined,
        source,
        error: error instanceof Error ? error.message : String(error),
        outcome: { httpStatus: 500, code: 'internal_error' },
      });
      if (!res.headersSent) {
        this.sendError(res, 500, 'internal_error');
      } else {
        res.destroy();
      }
    });
  }

  private async processRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    source: RemoteControlRequestSource,
  ): Promise<void> {
    res.setHeader('Connection', 'close');
    // ① Host allowlist (403 forbidden_host) — before everything else.
    if (!isAllowedRemoteControlHost(source.host, this.port)) {
      this.reject({ source }, res, 403, 'forbidden_host');
      return;
    }

    // ② Method + path whitelist (405 / 403 unknown_operation).
    const route = resolveRemoteControlOperation(req.method ?? '', this.requestPath(req));
    if (route.kind !== 'allowed') {
      this.reject(
        { source },
        res,
        route.kind === 'method_not_allowed' ? 405 : 403,
        route.kind === 'method_not_allowed' ? 'method_not_allowed' : 'unknown_operation',
      );
      return;
    }
    const op = route.op;

    // ③ Timing-safe token compare (401; missing and wrong are indistinguishable).
    const settings = this.options.getSettings();
    const token = extractAndMatchToken(req, settings);
    if (!token) {
      this.reject({ source, op }, res, 401, 'unauthorized');
      return;
    }
    const authFingerprint = deriveAuditFingerprint(settings.remoteControlToken);

    if (op === 'health') {
      this.audit.emit('request.completed', 'debug', {
        source,
        op,
        authFingerprint,
        outcome: { httpStatus: 200, code: 'ok' },
      });
      this.sendJson(res, 200, {
        ok: true,
        busy: this.flight === 'running',
        sessionId: this.sessionId,
      });
      return;
    }

    if (op === 'session.status') {
      this.audit.emit('request.completed', 'debug', {
        source,
        op,
        authFingerprint,
        outcome: { httpStatus: 200, code: 'ok' },
      });
      this.sendJson(res, 200, {
        sessionId: this.sessionId,
        activity: this.flight,
        lastTerminalState: this.lastTerminalState,
        lastDurationMs: this.lastDurationMs,
      });
      return;
    }

    // ④ Body cap + JSON parse + closed shape (413 / 400 malformed_request).
    let instruction: string;
    try {
      const body = await this.readBody(req);
      instruction = parseInstructionBody(body);
    } catch (error) {
      if (error instanceof RemoteControlRequestError) {
        this.reject({ source, op, authFingerprint }, res, error.httpStatus, error.code);
        return;
      }
      throw error;
    }

    // ⑤ Single-flight (409 busy). Check + set happen synchronously.
    if (this.flight === 'running') {
      this.reject({ source, op, authFingerprint }, res, 409, 'busy');
      return;
    }
    this.flight = 'running';

    // ⑥ Execute to terminal state.
    const requestId = `rc_${randomUUID()}`;
    await this.executeInstruction({ requestId, instruction, source, authFingerprint, res });
  }

  private requestPath(req: http.IncomingMessage): string {
    const raw = req.url ?? '';
    const queryIndex = raw.indexOf('?');
    return queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    const contentType = req.headers['content-type'];
    if (typeof contentType !== 'string' || !/^application\/json\b/i.test(contentType.trim())) {
      return Promise.reject(new RemoteControlRequestError(400, 'malformed_request'));
    }
    const contentLength = Number(req.headers['content-length'] ?? '0');
    if (Number.isFinite(contentLength) && contentLength > REMOTE_CONTROL_MAX_BODY_BYTES) {
      return Promise.reject(new RemoteControlRequestError(413, 'payload_too_large'));
    }
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > REMOTE_CONTROL_MAX_BODY_BYTES) {
          settle(() => reject(new RemoteControlRequestError(413, 'payload_too_large')));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => settle(() => resolve(Buffer.concat(chunks).toString('utf8'))));
      req.on('error', (error) => settle(() => reject(error)));
    });
  }

  private async executeInstruction(input: {
    requestId: string;
    instruction: string;
    source: RemoteControlRequestSource;
    authFingerprint: string;
    res: http.ServerResponse;
  }): Promise<void> {
    const { requestId, instruction, source, authFingerprint, res } = input;
    const startedAt = Date.now();
    const textParts: string[] = [];
    let errorSeen = false;
    let timedOut = false;

    try {
      if (!this.sessionId) {
        // Dedicated remote session: never steals the user's active tab session.
        this.sessionId = await this.options.driver.createSession(REMOTE_CONTROL_SESSION_TITLE, {
          setCurrent: false,
        });
      }
      const sessionId = this.sessionId;

      const consumption = (async () => {
        for await (const chunk of this.options.driver.sendMessage(instruction, { sessionId })) {
          if (chunk.type === 'text') textParts.push(chunk.content);
          else if (chunk.type === 'error') errorSeen = true;
        }
      })();
      consumption.catch(() => undefined);

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const timeoutSignal = new Promise<'timeout'>((resolve) => {
        timeoutHandle = setTimeout(() => resolve('timeout'), this.turnTimeoutMs);
      });
      const outcome = await Promise.race([
        consumption.then(() => 'settled' as const, () => 'settled' as const),
        timeoutSignal,
      ]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      if (outcome === 'timeout') {
        // Hard deadline: abort through the existing cancel path (server-side
        // abort + local stream teardown) and answer with an explicitly
        // partial result — never misreported as completed.
        timedOut = true;
        try {
          this.options.driver.cancelStream(sessionId);
        } catch {
          // Contained: the timeout response is sent regardless.
        }
      }
    } catch {
      errorSeen = true;
    }

    const terminalState: RemoteControlTerminalState = timedOut
      ? 'timeout'
      : errorSeen ? 'error' : 'completed';
    const durationMs = Date.now() - startedAt;
    this.flight = 'idle';
    this.lastTerminalState = terminalState;
    this.lastDurationMs = durationMs;

    this.audit.emit('request.terminal', terminalState === 'completed' ? 'info' : 'warning', {
      requestId,
      op: 'instruction.submit',
      source,
      authFingerprint,
      instruction: deriveInstructionSummary(instruction),
      outcome: { httpStatus: 200, terminalState, durationMs },
    }, this.sessionId ?? undefined);

    this.sendJson(res, 200, {
      requestId,
      sessionId: this.sessionId,
      terminalState,
      result: { text: textParts.join('') },
      durationMs,
    });
  }

  private reject(
    context: RejectionContext,
    res: http.ServerResponse,
    httpStatus: number,
    code: RemoteControlErrorCode,
  ): void {
    // Every pre-execute rejection is high-value forensic signal (design §5.1).
    this.audit.emit('request.rejected', 'warning', {
      requestId: context.requestId,
      op: context.op,
      source: context.source,
      authFingerprint: context.authFingerprint,
      outcome: { httpStatus, code },
    });
    this.sendError(res, httpStatus, code);
  }

  private sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  }

  private sendError(res: http.ServerResponse, status: number, code: RemoteControlErrorCode): void {
    this.sendJson(res, status, {
      error: { code, message: ERROR_MESSAGES[code] },
    });
  }
}

function extractAndMatchToken(req: http.IncomingMessage, settings: OpenCodianSettings): boolean {
  const provided = extractBearerToken(req.headers.authorization);
  return tokensMatch(provided, settings.remoteControlToken);
}

/**
 * Closed request shape: exactly one `instruction` string field. Any extra
 * field (e.g. a hypothetical `path`/`op`) is structurally rejected — this is
 * what makes out-of-vault reads impossible by construction (design §4.6).
 */
export function parseInstructionBody(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new RemoteControlRequestError(400, 'malformed_request');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RemoteControlRequestError(400, 'malformed_request');
  }
  const keys = Object.keys(parsed as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== 'instruction') {
    throw new RemoteControlRequestError(400, 'malformed_request');
  }
  const instruction = (parsed as Record<string, unknown>).instruction;
  if (typeof instruction !== 'string' || instruction.trim().length === 0) {
    throw new RemoteControlRequestError(400, 'malformed_request');
  }
  if (instruction.length > REMOTE_CONTROL_MAX_INSTRUCTION_CHARS) {
    throw new RemoteControlRequestError(400, 'malformed_request');
  }
  return instruction;
}

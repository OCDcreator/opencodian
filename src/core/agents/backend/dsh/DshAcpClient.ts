import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { DshBackendSettings, DshMcpServer } from '../../../types/settings';
import { DSH_ACP_PROTOCOL_VERSION as ACP_PROTOCOL_VERSION, type DshJsonObject, type DshJsonValue, parseDshRpcId, validateDshHandshake,validateDshMcpServers } from './DshProtocolCodec';

export type { DshJsonObject, DshJsonValue } from './DshProtocolCodec';
export { validateDshMcpServers } from './DshProtocolCodec';

export interface DshLaunchSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface DshAcpUpdate {
  sessionId: string;
  update: DshJsonObject;
}

export interface DshAcpPermissionRequest {
  sessionId: string;
  toolCall: DshJsonObject;
  options: Array<{ optionId: string; name?: string; kind?: string }>;
}

export interface DshAcpPermissionResponse {
  outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' };
}

export interface DshAcpClientOptions {
  readonly launch: DshLaunchSpec;
  readonly cwd: string;
  readonly onUpdate?: (update: DshAcpUpdate) => void;
  readonly onPermissionRequest?: (request: DshAcpPermissionRequest) => Promise<DshAcpPermissionResponse>;
  readonly onQuestionRequest?: (request: DshJsonObject) => Promise<DshJsonObject>;
  readonly onProtocolError?: (error: Error) => void;
  readonly requestTimeoutMs?: number;
  readonly promptTimeoutMs?: number;
  readonly maxStdoutBufferBytes?: number;
}

interface PendingRequest {
  readonly method: string;
  /** Present for session-scoped requests whose streamed updates prove the turn is alive. */
  readonly sessionId?: string;
  readonly timeoutMs: number;
  readonly resolve: (value: DshJsonValue) => void;
  readonly reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_PROMPT_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_MAX_STDOUT_BUFFER_BYTES = 32 * 1024 * 1024;
const MAX_PENDING_REQUESTS = 256;
const STDERR_TAIL_BYTES = 8 * 1024;
const STDERR_TAIL_EXCERPT_BYTES = 1_500;


interface DshLaunchProbe {
  readonly platform?: NodeJS.Platform;
  readonly homedir?: string;
  readonly isExecutable?: (candidate: string) => boolean;
}

/** Resolve an explicit DSH CLI/Desktop carrier, or the PATH CLI by default. */
export function resolveDshLaunch(
  settings: DshBackendSettings,
  extraEnv: Readonly<Record<string, string>> = {},
  probe: DshLaunchProbe = {},
): DshLaunchSpec {
  if (settings.profile.trim() !== 'acp') {
    throw new Error('DeepSeek Harness must use the ACP profile');
  }
  if (settings.args.some((arg) => arg === '--profile' || arg.startsWith('--profile=') || arg === '--mode' || arg.startsWith('--mode='))) {
    throw new Error('DeepSeek Harness extra arguments cannot override the ACP profile');
  }
  const configured = settings.executablePath.trim();
  const env = { ...extraEnv, ...settings.env };
  if (/\.(?:cmd|bat)$/i.test(configured)) {
    throw new Error('DeepSeek Harness Windows command shims are unsupported; configure the native dsh.exe executable');
  }
  if (configured && !configured.endsWith('.app')) {
    return { command: configured, args: ['--profile', 'acp', ...settings.args], env };
  }
  if (configured) return desktopLaunch(configured, settings.args, env, probe);

  const platform = probe.platform ?? process.platform;
  const executableProbe = probe.isExecutable ?? isExecutable;
  const pathValue = env.PATH ?? process.env.PATH ?? '';
  const binaryNames = platform === 'win32' ? ['dsh.exe'] : ['dsh'];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const binaryName of binaryNames) {
      const candidate = path.join(directory, binaryName);
      if (executableProbe(candidate)) return { command: candidate, args: ['--profile', 'acp', ...settings.args], env };
    }
  }
  if (platform === 'darwin') {
    const appCandidates = [
      '/Applications/DeepSeek Harness.app',
      path.join(probe.homedir ?? os.homedir(), 'Applications', 'DeepSeek Harness.app'),
    ];
    for (const appPath of appCandidates) {
      if (executableProbe(path.join(appPath, 'Contents', 'MacOS', 'DeepSeek Harness'))) {
        return desktopLaunch(appPath, settings.args, env, probe);
      }
    }
  }
  if (platform === 'win32') {
    throw new Error('DeepSeek Harness native dsh.exe was not found on PATH');
  }
  return { command: 'dsh', args: ['--profile', 'acp', ...settings.args], env };
}

function desktopLaunch(
  appPath: string,
  extraArgs: readonly string[],
  env: Record<string, string>,
  probe: DshLaunchProbe,
): DshLaunchSpec {
  const executable = path.join(appPath, 'Contents', 'MacOS', 'DeepSeek Harness');
  if (!(probe.isExecutable ?? isExecutable)(executable)) {
    throw new Error(`DeepSeek Harness Desktop executable was not found in ${appPath}`);
  }
  const launcher = path.join(
    appPath, 'Contents', 'Resources', 'app.asar', 'dsh', 'node_modules',
    '@deepseek-ai', 'dsh', 'lib', 'bin.js',
  );
  return {
    command: executable,
    args: [launcher, '--profile', 'acp', ...extraArgs],
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
  };
}

function isExecutable(candidate: string): boolean {
  if (!existsSync(candidate)) return false;
  try {
    accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Narrow ACP JSON-RPC 2.0 stdio owner used by the first-class DSH adapter. */
export class DshAcpClient {
  private handshakeValue: DshJsonObject | null = null;
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private stderrTail = '';
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly activeSessions = new Set<string>();
  private readonly stoppingChildren = new Map<ChildProcessWithoutNullStreams, Promise<void>>();
  private started = false;
  private starting: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;
  private transportCleanup: Promise<void> | null = null;

  constructor(private readonly options: DshAcpClientOptions) {}

  get isStarted(): boolean { return this.started; }
  get handshake(): DshJsonObject | null { return this.handshakeValue; }

  async start(): Promise<void> {
    if (this.started && this.child) return;
    if (this.starting) return this.starting;
    if (this.stopping) await this.stopping;
    const starting = this.startInternal();
    this.starting = starting;
    try { await starting; } finally { if (this.starting === starting) this.starting = null; }
  }

  private async startInternal(): Promise<void> {
    this.handshakeValue = null;
    const child = spawn(this.options.launch.command, this.options.launch.args, {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.launch.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    this.stdoutBuffer = '';
    this.stderrTail = '';
    child.stdout.setEncoding('utf8');
    // Keep a bounded stderr tail: DSH startup/tool failures otherwise surface
    // as a bare exit code with no diagnostic text anywhere in the plugin.
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-STDERR_TAIL_BYTES);
    });
    child.stdout.on('data', (chunk: string) => this.handleStdout(child, chunk));
    child.stdin.on('error', (error) => this.protocolFailure(child, error));
    child.once('error', (error) => this.handleTransportEnd(child, error));
    child.once('exit', (code, signal) => this.handleTransportEnd(
      child,
      new Error(`DSH ACP process exited (${String(code)}, ${String(signal)})`),
    ));
    try {
      const handshake = await this.requestObject('initialize', {
        protocolVersion: ACP_PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: 'opencodian', version: '1.0.0' },
      });
      validateDshHandshake(handshake);
      if (this.child !== child || child.exitCode !== null) throw new Error('DSH ACP start was cancelled');
      this.handshakeValue = handshake;
      this.started = true;
    } catch (error) {
      await this.stopChild(child);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const stopping = this.stopInternal();
    this.stopping = stopping;
    try { await stopping; } finally { if (this.stopping === stopping) this.stopping = null; }
  }

  private async stopInternal(): Promise<void> {
    this.started = false;
    this.handshakeValue = null;
    const child = this.child;
    this.failMatching((pending) => pending.method === 'session/prompt', new Error('DSH ACP client stopped'));
    let failure: unknown;
    if (child) {
      const closeResults = await Promise.allSettled([...this.activeSessions].map((sessionId) => this.closeSession(sessionId)));
      failure = closeResults.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
    }
    this.activeSessions.clear();
    this.failAll(new Error('DSH ACP client stopped'));
    try {
      if (child) await this.stopChild(child);
      else if (this.transportCleanup) await this.transportCleanup;
    } catch (error) {
      failure = error;
    }
    if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
  }

  dispose(): void { void this.stop(); }

  async newSession(cwd: string, mcpServers: readonly DshMcpServer[] = []): Promise<DshJsonObject> {
    const result = await this.requestObject('session/new', { cwd, mcpServers: validateDshMcpServers([...mcpServers]) });
    const sessionId = typeof result.sessionId === 'string' ? result.sessionId.trim() : '';
    if (!sessionId) throw new Error('DSH ACP session/new returned no session id');
    this.activeSessions.add(sessionId);
    return result;
  }

  listSessions(cwd?: string, cursor?: string): Promise<DshJsonObject> {
    return this.requestObject('session/list', {
      ...(cwd ? { cwd } : {}),
      ...(cursor ? { cursor } : {}),
    });
  }

  async resumeSession(sessionId: string, cwd: string, mcpServers: readonly DshMcpServer[] = []): Promise<DshJsonObject> {
    const result = await this.requestObject('session/resume', { sessionId, cwd, mcpServers: validateDshMcpServers([...mcpServers]) });
    this.activeSessions.add(sessionId);
    return result;
  }

  async closeSession(sessionId: string): Promise<void> {
    if (!this.activeSessions.has(sessionId)) return;
    await this.request('session/close', { sessionId });
    this.activeSessions.delete(sessionId);
  }

  setConfigOption(sessionId: string, configId: string, value: string): Promise<DshJsonObject> {
    return this.requestObject('session/set_config_option', { sessionId, configId, value });
  }

  prompt(sessionId: string, content: string | DshJsonObject[]): Promise<DshJsonObject> {
    return this.requestObject('session/prompt', {
      sessionId,
      prompt: typeof content === 'string' ? [{ type: 'text', text: content }] : content,
    }, this.options.promptTimeoutMs ?? DEFAULT_PROMPT_TIMEOUT_MS);
  }

  cancel(sessionId: string): void { this.notify('session/cancel', { sessionId }); }

  protected requestObject(method: string, params: DshJsonObject, timeoutMs?: number): Promise<DshJsonObject> {
    return this.request(method, params, timeoutMs).then((value) => {
      if (!isRecord(value)) throw new Error(`DSH ACP ${method} returned a non-object result`);
      return value as DshJsonObject;
    });
  }

  private request(
    method: string,
    params: DshJsonObject,
    timeoutMs = this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<DshJsonValue> {
    const child = this.child;
    if (!child || child.stdin.destroyed) return Promise.reject(new Error('DSH ACP process is not connected'));
    if (this.pending.size >= MAX_PENDING_REQUESTS) return Promise.reject(new Error('DSH ACP has too many pending requests'));
    const id = this.nextRequestId++;
    const promise = new Promise<DshJsonValue>((resolve, reject) => {
      // A prompt only resolves when the whole turn ends, so its timeout is an
      // idle gap: streamed session updates re-arm it while the turn is alive.
      const sessionId = method === 'session/prompt' && typeof params.sessionId === 'string' ? params.sessionId : undefined;
      const timeout = this.makeRequestTimeout(id, method, timeoutMs, reject);
      this.pending.set(id, { method, sessionId, timeoutMs, resolve, reject, timeout });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return promise;
  }

  private makeRequestTimeout(
    id: number,
    method: string,
    timeoutMs: number,
    reject: (error: Error) => void,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      if (!this.pending.delete(id)) return;
      reject(new Error(`DSH ACP ${method} timed out`));
    }, timeoutMs);
  }

  /** Session activity re-arms idle-gap timeouts for that session's pending prompts. */
  private refreshSessionActivity(sessionId: string): void {
    for (const [id, pending] of this.pending) {
      if (pending.sessionId !== sessionId) continue;
      clearTimeout(pending.timeout);
      pending.timeout = this.makeRequestTimeout(id, pending.method, pending.timeoutMs, pending.reject);
    }
  }

  private notify(method: string, params: DshJsonObject): void {
    const child = this.child;
    if (!child || child.stdin.destroyed) return;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  private handleStdout(child: ChildProcessWithoutNullStreams, chunk: string): void {
    if (this.child !== child) return;
    this.stdoutBuffer += chunk;
    const maximum = this.options.maxStdoutBufferBytes ?? DEFAULT_MAX_STDOUT_BUFFER_BYTES;
    if (Buffer.byteLength(this.stdoutBuffer, 'utf8') > maximum) {
      this.protocolFailure(child, new Error('DSH ACP stdout frame exceeded the buffer limit'));
      return;
    }
    for (;;) {
      const newline = this.stdoutBuffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch (error) {
        this.protocolFailure(child, new Error(`DSH ACP emitted malformed JSON: ${String(error)}`));
        return;
      }
      if (!isRecord(parsed)) {
        this.protocolFailure(child, new Error('DSH ACP emitted a non-object JSON-RPC frame'));
        return;
      }
      this.handleMessage(child, parsed);
      if (this.child !== child) return;
    }
  }

  private handleMessage(child: ChildProcessWithoutNullStreams, message: JsonRpcMessage): void {
    if (message.jsonrpc !== '2.0') {
      this.protocolFailure(child, new Error('DSH ACP emitted an invalid JSON-RPC version'));
      return;
    }
    const hasId = Object.prototype.hasOwnProperty.call(message, 'id');
    const id = parseDshRpcId(message.id);
    const method = typeof message.method === 'string' && message.method.length > 0 ? message.method : null;
    if (hasId && id === null) {
      this.protocolFailure(child, new Error('DSH ACP emitted an invalid JSON-RPC id'));
      return;
    }
    if (id !== null && method) {
      void this.handleServerRequest(child, id, method, message.params);
      return;
    }
    if (id !== null) {
      if (typeof id === 'number') this.handleResponse(child, id, message);
      return;
    }
    if (!method) {
      this.protocolFailure(child, new Error('DSH ACP emitted an unrecognized JSON-RPC frame'));
      return;
    }
    if (method !== 'session/update') return;
    const params = isRecord(message.params) ? message.params : null;
    const update = isRecord(params?.update) ? params.update : null;
    if (typeof params?.sessionId !== 'string' || !update) {
      this.protocolFailure(child, new Error('DSH ACP emitted an invalid session/update notification'));
      return;
    }
    this.refreshSessionActivity(params.sessionId);
    this.options.onUpdate?.({ sessionId: params.sessionId, update: update as DshJsonObject });
  }

  private handleResponse(child: ChildProcessWithoutNullStreams, id: number, message: JsonRpcMessage): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    const hasResult = Object.prototype.hasOwnProperty.call(message, 'result');
    const hasError = Object.prototype.hasOwnProperty.call(message, 'error');
    if (hasResult === hasError) {
      this.protocolFailure(child, new Error(`DSH ACP ${pending.method} returned an invalid response envelope`));
      return;
    }
    this.pending.delete(id);
    clearTimeout(pending.timeout);
    if (hasError) {
      const error = isRecord(message.error) ? message.error : null;
      if (!error) {
        pending.reject(new Error(`DSH ACP ${pending.method} returned an invalid error`));
        return;
      }
      pending.reject(new Error(`DSH ACP request failed (${String(error.code ?? 'unknown')}): ${String(error.message ?? 'unknown error')}`));
      return;
    }
    pending.resolve((message.result ?? null) as DshJsonValue);
  }

  private async handleServerRequest(child: ChildProcessWithoutNullStreams, id: number | string, method: string, params: unknown): Promise<void> {
    if (method === 'session/request_question' && this.options.onQuestionRequest && isRecord(params)) {
      try { this.writeResponse(child, id, await this.options.onQuestionRequest(params as DshJsonObject)); }
      catch (error) { this.writeResponse(child, id, undefined, { code: -32602, message: error instanceof Error ? error.message : 'Invalid Harness question' }); }
      return;
    }
    if (method !== 'session/request_permission') {
      this.writeResponse(child, id, undefined, { code: -32601, message: `Unsupported DSH ACP request: ${method}` });
      return;
    }
    const value = isRecord(params) ? params : null;
    const toolCall = isRecord(value?.toolCall) ? value.toolCall : null;
    if (typeof value?.sessionId !== 'string' || !toolCall || !Array.isArray(value.options)) {
      this.writeResponse(child, id, undefined, { code: -32602, message: 'Invalid DSH ACP permission request' });
      return;
    }
    const options = normalizePermissionOptions(value.options);
    if (!options) {
      this.writeResponse(child, id, undefined, { code: -32602, message: 'Invalid DSH ACP permission options' });
      return;
    }
    try {
      const response = await this.options.onPermissionRequest?.({
        sessionId: value.sessionId,
        toolCall: toolCall as DshJsonObject,
        options,
      }) ?? { outcome: { outcome: 'cancelled' } as const };
      if (!isPermissionResponse(response, new Set(options.map((option) => option.optionId)))) {
        throw new Error('DSH permission handler returned an invalid response');
      }
      this.writeResponse(child, id, response);
    } catch (error) {
      this.writeResponse(child, id, undefined, {
        code: -32603,
        message: error instanceof Error ? error.message : 'DSH permission handler failed',
      });
    }
  }

  private writeResponse(
    child: ChildProcessWithoutNullStreams,
    id: number | string,
    result?: unknown,
    error?: { code: number; message: string },
  ): void {
    if (this.child !== child || child.stdin.destroyed) return;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) })}\n`);
  }

  private protocolFailure(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    this.options.onProtocolError?.(this.withStderrTail(error));
    this.failAll(error);
    this.started = false;
    const cleanup = this.stopChild(child);
    this.transportCleanup = cleanup;
    void cleanup.catch((cleanupError: unknown) => {
      this.options.onProtocolError?.(cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)));
    }).finally(() => {
      if (this.transportCleanup === cleanup) this.transportCleanup = null;
    });
  }

  private handleTransportEnd(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    this.child = null;
    this.started = false;
    this.activeSessions.clear();
    this.failAll(error);
    this.options.onProtocolError?.(this.withStderrTail(error));
  }

  /** Last captured stderr lines, secret-shaped runs redacted. */
  get recentStderr(): string {
    return redactSecrets(this.stderrTail);
  }

  private withStderrTail(error: Error): Error {
    const tail = redactSecrets(this.stderrTail.trim());
    if (!tail) return error;
    const excerpt = tail.slice(-STDERR_TAIL_EXCERPT_BYTES);
    const suffixed = new Error(`${error.message}\nDSH stderr tail:\n${excerpt}`);
    suffixed.stack = error.stack;
    return suffixed;
  }

  private async stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    const existing = this.stoppingChildren.get(child);
    if (existing) return existing;
    const stopping = this.stopChildOnce(child);
    this.stoppingChildren.set(child, stopping);
    try { await stopping; } finally { this.stoppingChildren.delete(child); }
  }

  private async stopChildOnce(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (this.child === child) this.child = null;
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve, reject) => {
      const forceTimeout = setTimeout(() => {
        if (child.exitCode === null && !child.kill('SIGKILL')) {
          clearTimeout(exitTimeout);
          reject(new Error('DSH ACP process could not be force-stopped'));
        }
      }, 3000);
      const exitTimeout = setTimeout(() => {
        child.removeListener('exit', onExit);
        reject(new Error('DSH ACP process did not exit after SIGKILL'));
      }, 5000);
      const onExit = () => {
        clearTimeout(forceTimeout);
        clearTimeout(exitTimeout);
        resolve();
      };
      child.once('exit', onExit);
      child.kill();
    });
  }

  private failAll(error: Error): void {
    this.failMatching(() => true, error);
  }

  private failMatching(predicate: (pending: PendingRequest) => boolean, error: Error): void {
    for (const [id, pending] of this.pending) {
      if (!predicate(pending)) continue;
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }
}

function normalizePermissionOptions(value: unknown[]): DshAcpPermissionRequest['options'] | null {
  const seen = new Set<string>();
  const options: DshAcpPermissionRequest['options'] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.optionId !== 'string' || !entry.optionId.trim() || seen.has(entry.optionId)) return null;
    if (entry.name !== undefined && typeof entry.name !== 'string') return null;
    if (entry.kind !== undefined && typeof entry.kind !== 'string') return null;
    seen.add(entry.optionId);
    options.push({
      optionId: entry.optionId,
      ...(typeof entry.name === 'string' ? { name: entry.name } : {}),
      ...(typeof entry.kind === 'string' ? { kind: entry.kind } : {}),
    });
  }
  return options.length > 0 ? options : null;
}

function isPermissionResponse(value: unknown, optionIds: ReadonlySet<string>): value is DshAcpPermissionResponse {
  if (!isRecord(value) || !isRecord(value.outcome)) return false;
  if (value.outcome.outcome === 'cancelled') return true;
  return value.outcome.outcome === 'selected'
    && typeof value.outcome.optionId === 'string'
    && optionIds.has(value.outcome.optionId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Collapse credential-shaped runs before stderr text is surfaced in errors. */
function redactSecrets(text: string): string {
  return text
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g, '[redacted]');
}

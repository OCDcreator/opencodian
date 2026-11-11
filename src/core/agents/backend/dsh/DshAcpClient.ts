/* eslint-disable max-lines -- bounded transport owner: launch resolution, frame parsing, idle-gap timers, stderr diagnostics, and reverse-request handling stay in one adapter boundary (mirrors DshAdapter). */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { accessSync, constants, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { DshNativeConfiguration } from '../../../types/dshConfiguration';
import type { DshBackendSettings, DshMcpServer } from '../../../types/settings';
import { prepareDshManagedLaunch, releaseDshLaunchScope } from '../configuration/DshManagedProfile';
import {
  DSH_STOP_REASON_VALUES,
  DSH_TOOL_KIND_VALUES,
  DSH_TOOL_STATUS_VALUES,
  type DshClientTraceHook,
  type DshTransportId,
  type DshWireRecord,
} from '../diagnostics/types';
import { DSH_ACP_PROTOCOL_VERSION as ACP_PROTOCOL_VERSION, type DshJsonObject, type DshJsonValue, parseDshRpcId, validateDshHandshake,validateDshMcpServers } from './DshProtocolCodec';

export type { DshJsonObject, DshJsonValue } from './DshProtocolCodec';
export { validateDshMcpServers } from './DshProtocolCodec';

const TRACE_TOOL_KINDS = new Set<string>(DSH_TOOL_KIND_VALUES);
const TRACE_TOOL_STATUSES = new Set<string>(DSH_TOOL_STATUS_VALUES);
const TRACE_STOP_REASONS = new Set<string>(DSH_STOP_REASON_VALUES);
/** Hard cap for bounded identifier-shaped trace strings (ids, discriminators). */
const TRACE_ID_MAX_CHARS = 128;

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

// Keep the transport's public type surface compatible without coupling the
// diagnostics settings types back to this runtime client.
export type { DshAcpWireObserver, DshClientTraceHook, DshTransportId, DshWireRecord } from '../diagnostics/types';

/**
 * Extracts ONLY whitelisted session-update metadata for trace records.
 * `rawInput`, `content`, `arguments`, `title`, `reason`, and every other
 * free-form payload field are deliberately omitted — redaction cannot be
 * trusted to guess credentials out of arbitrary text. `kind`/`status` are
 * accepted only as strict protocol enums, and remaining identifiers are
 * bounded and scrubbed so no free text can reach a trace buffer from here.
 */
export function extractDshSessionUpdateDetail(update: DshJsonObject): Record<string, unknown> {
  const detail: Record<string, unknown> = {
    sessionUpdate: typeof update.sessionUpdate === 'string' ? update.sessionUpdate : '',
  };
  if (typeof update.toolCallId === 'string' && update.toolCallId.length > 0) {
    detail.toolCallId = scrubCredentialShapes(update.toolCallId.slice(0, TRACE_ID_MAX_CHARS));
  }
  if (typeof update.messageId === 'string' && update.messageId.length > 0) {
    detail.messageId = scrubCredentialShapes(update.messageId.slice(0, TRACE_ID_MAX_CHARS));
  }
  if (typeof update.kind === 'string' && TRACE_TOOL_KINDS.has(update.kind)) detail.kind = update.kind;
  if (typeof update.status === 'string' && TRACE_TOOL_STATUSES.has(update.status)) detail.status = update.status;
  if (typeof update.used === 'number' && Number.isFinite(update.used)) detail.usedTokens = update.used;
  if (typeof update.size === 'number' && Number.isFinite(update.size)) detail.contextWindow = update.size;
  if (typeof update.inputTokens === 'number' && Number.isFinite(update.inputTokens)) detail.inputTokens = update.inputTokens;
  if (typeof update.outputTokens === 'number' && Number.isFinite(update.outputTokens)) detail.outputTokens = update.outputTokens;
  if (typeof update.time === 'number' && Number.isFinite(update.time)) detail.backendTimeMs = update.time;
  return detail;
}

/** Collapse credential-shaped runs (keys, bearer tokens, JWTs) before metadata enters a trace. */
function scrubCredentialShapes(text: string): string {
  return text
    .replace(/\b(bearer\s+)[^\s'",;]{8,}/gi, '$1[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{7,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g, '[redacted]');
}

export interface DshAcpClientOptions {
  readonly launch: DshLaunchSpec;
  readonly cwd: string;
  readonly nativeConfig?: DshNativeConfiguration;
  /** Original vault identity, independent of the configurable process working directory. */
  readonly vaultPath?: string;
  /** Explicit allowlisted parent for managed profiles; primarily useful for isolated hosts/tests. */
  readonly managedProfileRoot?: string;
  /** Optional wire-trace injection; when absent every hook is a no-op with zero behavior change. */
  readonly trace?: DshClientTraceHook;
  readonly onControlUpdate?: (event: DshJsonObject) => void;
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
  /** Client write timestamp used to observe the response round trip. */
  readonly startedAt: number;
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
  private configurationScope: string | null = null;
  private configurationPreparing: Promise<void> | null = null;
  private configurationBaseLaunch: DshLaunchSpec | null = null;
  private launchGeneration = 0;
  /**
   * Unique per-instance wire source identity. Threaded through every trace
   * record together with the launch generation so two concurrent clients
   * (main + aux, or an old and a new client) can never collide on shared
   * request ids, and a restarted instance is a fresh trace generation.
   */
  private readonly wireSourceId = randomUUID();

  constructor(private readonly options: DshAcpClientOptions) {}

  get isStarted(): boolean { return this.started; }
  get handshake(): DshJsonObject | null { return this.handshakeValue; }

  /** Instance identity fields attached to every observed wire record. */
  private wireSourceFields(): { sourceId: string; generation: number } {
    return { sourceId: this.wireSourceId, generation: this.launchGeneration };
  }

  async start(): Promise<void> {
    if (this.started && this.child) return;
    if (this.starting) return this.starting;
    if (this.stopping) await this.stopping;
    const starting = this.startInternal();
    this.starting = starting;
    try { await starting; } finally { if (this.starting === starting) this.starting = null; }
  }

  protected async prepareConfigurationLaunch(): Promise<void> {
    if (this.options.nativeConfig === undefined || this.configurationScope) return;
    this.configurationBaseLaunch ??= { ...this.options.launch, args: [...this.options.launch.args] };
    this.configurationPreparing = prepareDshManagedLaunch(this.options, this.configurationBaseLaunch,
      'acp', (scope) => { this.configurationScope = scope; });
    try { await this.configurationPreparing; }
    catch (error) { await this.releaseConfigurationLaunch(); throw error; }
    finally { this.configurationPreparing = null; }
  }

  private async releaseConfigurationLaunch(): Promise<void> {
    if (!this.configurationScope) return;
    const scope = this.configurationScope;
    this.configurationScope = null;
    await releaseDshLaunchScope(scope);
  }

  private async startInternal(): Promise<void> {
    // Every start — including a same-instance restart — is a fresh trace
    // generation: pending/lifecycle/tool pairing state is keyed by this pair.
    const generation = ++this.launchGeneration;
    await this.prepareConfigurationLaunch();
    if (generation !== this.launchGeneration) throw new Error('DSH ACP start was cancelled');
    this.handshakeValue = null;
    this.observe({ direction: 'out', kind: 'connection', method: 'starting', bytes: 0, transport: this.transportId(), ...this.wireSourceFields() });
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
      // A restarted client must not adopt a previous child's late output.
      if (this.child !== child) return;
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
      this.observe({
        direction: 'in',
        kind: 'connection',
        method: 'connected',
        bytes: byteSize(handshake),
        transport: this.transportId(),
        ...this.wireSourceFields(),
        detail: typeof handshake.nativeProtocol === 'string' ? { nativeProtocol: handshake.nativeProtocol } : undefined,
      });
    } catch (error) {
      await this.stopChild(child);
      await this.releaseConfigurationLaunch();
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
    ++this.launchGeneration;
    if (this.configurationPreparing) await this.configurationPreparing.catch(() => undefined);
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
    await this.releaseConfigurationLaunch();
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
      this.pending.set(id, { method, sessionId, timeoutMs, startedAt: Date.now(), resolve, reject, timeout });
    });
    const frame = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
    // Trace-only session extraction is wider than the pending map's prompt-only
    // gap so control reads stay attributable without changing re-arm behavior.
    this.observe({
      direction: 'out',
      kind: 'request',
      method,
      requestId: id,
      sessionId: typeof params.sessionId === 'string' ? params.sessionId : undefined,
      bytes: Buffer.byteLength(frame, 'utf8'),
      transport: this.transportId(),
      ...this.wireSourceFields(),
    });
    child.stdin.write(frame);
    return promise;
  }

  private makeRequestTimeout(
    id: number,
    method: string,
    timeoutMs: number,
    reject: (error: Error) => void,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      const pending = this.pending.get(id);
      if (!pending || !this.pending.delete(id)) return;
      this.observe({
        direction: 'in',
        kind: 'response',
        method,
        requestId: id,
        sessionId: pending.sessionId,
        ok: false,
        durationMs: Date.now() - pending.startedAt,
        bytes: 0,
        transport: this.transportId(),
        ...this.wireSourceFields(),
        // Metadata-only contract: a fixed classification token instead of the
        // descriptive message, which can embed method/config fragments.
        error: 'timeout',
      });
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
    this.observe({
      direction: 'out',
      kind: 'client-notification',
      method,
      sessionId: typeof params.sessionId === 'string' ? params.sessionId : undefined,
      bytes: byteSize(params),
      transport: this.transportId(),
      ...this.wireSourceFields(),
    });
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
    this.handleNotification(child, method, message);
  }

  private handleNotification(child: ChildProcessWithoutNullStreams, method: string, message: JsonRpcMessage): void {
    if (method === 'config/extensions/update') {
      if (this.child !== child) return;
      if (!isRecord(message.params)) {
        this.protocolFailure(child, new Error('DSH emitted an invalid configuration update notification'));
        return;
      }
      this.observe({
        direction: 'in',
        kind: 'notification',
        method,
        bytes: byteSize(message.params),
        transport: this.transportId(),
        ...this.wireSourceFields(),
        detail: { keys: Object.keys(message.params).slice(0, 12) },
      });
      this.options.onControlUpdate?.(message.params as DshJsonObject);
      return;
    }
    if (method !== 'session/update') return;
    const params = isRecord(message.params) ? message.params : null;
    const update = isRecord(params?.update) ? params.update : null;
    if (typeof params?.sessionId !== 'string' || !update) {
      this.protocolFailure(child, new Error('DSH ACP emitted an invalid session/update notification'));
      return;
    }
    this.observe({
      direction: 'in',
      kind: 'notification',
      method,
      sessionId: params.sessionId,
      sessionUpdate: typeof update.sessionUpdate === 'string' ? update.sessionUpdate : undefined,
      bytes: byteSize(message.params),
      transport: this.transportId(),
      ...this.wireSourceFields(),
      backendTimeMs: typeof update.time === 'number' && Number.isFinite(update.time) ? update.time : undefined,
      detail: extractDshSessionUpdateDetail(update as DshJsonObject),
    });
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
      const failure = `DSH ACP request failed (${String(error.code ?? 'unknown')}): ${String(error.message ?? 'unknown error')}`;
      this.observe({
        direction: 'in',
        kind: 'response',
        method: pending.method,
        requestId: id,
        sessionId: pending.sessionId,
        ok: false,
        durationMs: Date.now() - pending.startedAt,
        bytes: byteSize(error),
        transport: this.transportId(),
        ...this.wireSourceFields(),
        // Metadata-only contract: the raw message text (which can embed
        // prompt/config fragments) stays on the user-facing rejection only;
        // the trace gets a fixed classification token plus the numeric code.
        error: 'rpc-error',
        ...(typeof error.code === 'number' && Number.isFinite(error.code) ? { errorCode: error.code } : {}),
      });
      pending.reject(new Error(failure));
      return;
    }
    this.observe({
      direction: 'in',
      kind: 'response',
      method: pending.method,
      requestId: id,
      // Trace-only attribution: session/new|resume results carry the session id
      // the pending map never sees (its gap-rearm extraction is prompt-only).
      sessionId: pending.sessionId ?? sessionIdOfResult(message.result),
      ok: true,
      durationMs: Date.now() - pending.startedAt,
      bytes: byteSize(message.result),
      transport: this.transportId(),
      ...this.wireSourceFields(),
      // Strict stopReason enum: an RPC-ok envelope is a receipt, and only the
      // harness-reported reason can say how the turn actually ended.
      ...(stopReasonOfResult(message.result) !== undefined ? { stopReason: stopReasonOfResult(message.result) } : {}),
    });
    pending.resolve((message.result ?? null) as DshJsonValue);
  }

  private observeServerRequest(id: number | string, method: string, params: unknown): void {
    if (isRecord(params)) {
      this.observe({
        direction: 'in',
        kind: 'server-request',
        method,
        requestId: id,
        sessionId: typeof params.sessionId === 'string' ? params.sessionId : undefined,
        bytes: byteSize(params),
        transport: this.transportId(),
        ...this.wireSourceFields(),
        // Metadata only: option counts and question counts, never tool input.
        detail: method === 'session/request_permission' && Array.isArray(params.options)
          ? { optionCount: params.options.length }
          : method === 'session/request_question' && Array.isArray(params.questions)
            ? { questionCount: params.questions.length }
            : undefined,
      });
    }
  }

  private async handleServerRequest(child: ChildProcessWithoutNullStreams, id: number | string, method: string, params: unknown): Promise<void> {
    this.observeServerRequest(id, method, params);
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
    this.observe({
      direction: 'out',
      kind: 'server-reply',
      requestId: id,
      ok: !error,
      bytes: 0,
      transport: this.transportId(),
      ...this.wireSourceFields(),
      // Metadata-only contract: handler error text stays on the wire reply to
      // the harness; the trace gets a fixed token plus the numeric code.
      ...(error ? { error: 'server-reply-error', errorCode: error.code } : {}),
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) })}\n`);
  }

  private protocolFailure(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    const surfaced = this.withStderrTail(error);
    this.observe({
      direction: 'in',
      kind: 'connection',
      method: 'error',
      bytes: 0,
      transport: this.transportId(),
      ...this.wireSourceFields(),
      // The surfaced message (which embeds the stderr tail) stays on the
      // user-facing onProtocolError path; the trace records a fixed token.
      error: 'protocol-failure',
    });
    this.options.onProtocolError?.(surfaced);
    // Pending rejections carry the tail too: startup failures surface through
    // the initialize rejection, and the suffix cannot break the prefix-anchored
    // transport-uncertain classification in the adapter.
    this.failAll(surfaced);
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
    const surfaced = this.withStderrTail(error);
    this.observe({
      direction: 'in',
      kind: 'connection',
      method: 'closed',
      bytes: 0,
      transport: this.transportId(),
      ...this.wireSourceFields(),
      // Same split as protocolFailure: full diagnostic text only for the
      // user-facing path; the trace keeps a fixed classification token.
      error: 'transport-closed',
    });
    this.failAll(surfaced);
    this.options.onProtocolError?.(surfaced);
  }

  /** Last captured stderr lines, secret-shaped runs redacted. */
  get recentStderr(): string {
    return redactSecrets(this.stderrTail);
  }

  /**
   * Forwards a whitelisted wire record to the injected trace observer. Every
   * observer failure is absorbed here: tracing must never affect the chat
   * transport, and an absent hook keeps this a no-op.
   */
  private observe(record: DshWireRecord): void {
    try {
      this.options.trace?.observer.recordWireEvent(record);
    } catch {
      // Trace sink failures are diagnostics-only.
    }
  }

  private transportId(): DshTransportId {
    return this.options.trace?.transport ?? 'acp';
  }

  private withStderrTail(error: Error): Error {
    const tail = redactSecrets(this.stderrTail.trim());
    if (!tail) return error;
    // Mutate in place so code/cause and the concrete error class survive;
    // tests assert EPIPE codes through this same wrapping path.
    error.message = `${error.message}\nDSH stderr tail:\n${tail.slice(-STDERR_TAIL_EXCERPT_BYTES)}`;
    return error;
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

/** Trace-only session attribution for RPC results that confirm a session id. */
function sessionIdOfResult(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;
  return typeof result.sessionId === 'string' && result.sessionId ? result.sessionId : undefined;
}

/**
 * Trace-only strict stopReason extraction for session/prompt results. Values
 * outside the ACP enum are omitted so arbitrary result text cannot enter a
 * trace, and the service never has to guess execution completion from `ok`.
 */
function stopReasonOfResult(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;
  const stopReason = result.stopReason;
  return typeof stopReason === 'string' && TRACE_STOP_REASONS.has(stopReason) ? stopReason : undefined;
}

/** Wire-frame byte size for trace records; malformed values count as zero. */
function byteSize(value: unknown): number {
  if (value === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
  } catch {
    return 0;
  }
}

/** Collapse credential-shaped runs before stderr text is surfaced in errors. */
function redactSecrets(text: string): string {
  return text
    // The Bearer scheme is case-insensitive (RFC 7235); redact its credential.
    .replace(/\b(bearer\s+)[^\s'",;]{8,}/gi, '$1[redacted]')
    // Provider-style keys, plus a leading orphan run created when the ring
    // buffer truncated a key and dropped its "sk-" prefix mid-stream. The
    // class excludes "/" so a leading path stays a readable diagnostic.
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/^[A-Za-z0-9_+=-]{24,}(?=[^A-Za-z0-9_+=-]|$)/, '[redacted]')
    // JWTs: a JOSE header is base64url of a JSON object, so real JWTs start
    // with the base64 of `{"` ("eyJ"); anchoring there keeps dotted
    // identifiers (versions, paths, BUILD_IDs) readable in diagnostics.
    .replace(/\beyJ[A-Za-z0-9_-]{7,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g, '[redacted]');
}

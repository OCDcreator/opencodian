import { createLogger } from '../../shared';
import { createSdkClient, type CreateSdkClientOptions } from './createSdkClient';
import { attachOpenCodeAppAgents } from './OpenCodeAppCatalogSidecar';
import { extractSdkErrorCause } from './sdkErrorClassification';
import type { SdkEvent, SdkOpencodeClient } from './sdkTypes';

export type { SdkErrorClass } from './sdkErrorClassification';

const logger = createLogger('OpenCodeService');
export const SDK_FACADE_NAMESPACE_NAMES = [
  'app',
  'auth',
  'command',
  'config',
  'event',
  'experimental',
  'file',
  'find',
  'formatter',
  'global',
  'instance',
  'lsp',
  'mcp',
  'part',
  'path',
  'permission',
  'project',
  'provider',
  'pty',
  'question',
  'session',
  'tool',
  'tui',
  'v2',
  'vcs',
  'worktree',
] as const;

export type OpenCodeSdkNamespaceName = typeof SDK_FACADE_NAMESPACE_NAMES[number];

type SdkDataShape<T> = T extends { data: infer TData } ? TData : T;

type SdkNamespaceFacade<TNamespace> = {
  [TKey in keyof TNamespace]: TNamespace[TKey] extends (...args: infer TArgs) => infer TReturn
    ? (...args: TArgs) => Promise<SdkDataShape<Awaited<TReturn>>>
    : TNamespace[TKey];
};

type SdkFacadeClient = Pick<SdkOpencodeClient, OpenCodeSdkNamespaceName>;

export type OpenCodeSdkFacadeNamespace<TKey extends OpenCodeSdkNamespaceName> =
  SdkNamespaceFacade<SdkFacadeClient[TKey]>;

export type OpenCodeSdkFacadeClient = {
  [TKey in OpenCodeSdkNamespaceName]: OpenCodeSdkFacadeNamespace<TKey>;
};

export type OpenCodeSdkFacadeClientFactory = (options: CreateSdkClientOptions) => SdkOpencodeClient;

export interface OpenCodeSdkErrorMessageOptions {
  fallbackMessage?: string | null;
  includeName?: boolean;
  includeTopLevelError?: boolean;
  includeTopLevelStatus?: boolean;
  trimMessage?: boolean;
}

type OpenCodeSdkErrorRecord = {
  message?: unknown;
  error?: unknown;
  data?: { message?: unknown; statusCode?: unknown };
  name?: unknown;
  status?: unknown;
};

const TRANSIENT_CONNECTIVITY_ERROR_PATTERNS = [
  /net::ERR_CONNECTION_REFUSED/i,
  /net::ERR_CONNECTION_RESET/i,
  /\bECONNREFUSED\b/i,
  /\bECONNRESET\b/i,
];

interface TransientConnectivityLogState {
  suppressedCount: number;
}

type ServiceLogLevel = 'warn' | 'error';

function getSdkErrorText(value: unknown, trimMessage = false): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = trimMessage ? value.trim() : value;
  return normalized ? normalized : null;
}

function appendSdkErrorStatus(message: string, statusCode: number | null): string {
  if (statusCode === null || message.toLowerCase().includes(`http ${statusCode}`)) {
    return message;
  }

  return `${message} (HTTP ${statusCode})`;
}

function getSdkErrorRecordBaseMessage(
  record: OpenCodeSdkErrorRecord,
  options: OpenCodeSdkErrorMessageOptions,
): string | null {
  return getSdkErrorText(record.data?.message, options.trimMessage)
    ?? getSdkErrorText(record.message, options.trimMessage)
    ?? (options.includeTopLevelError === false ? null : getSdkErrorText(record.error, options.trimMessage))
    ?? (options.includeName ? getSdkErrorText(record.name, options.trimMessage) : null)
    ?? options.fallbackMessage
    ?? null;
}

function getSdkErrorRecordStatusCode(
  record: OpenCodeSdkErrorRecord,
  includeTopLevelStatus: boolean,
): number | null {
  if (typeof record.data?.statusCode === 'number') {
    return record.data.statusCode;
  }

  if (!includeTopLevelStatus || typeof record.status !== 'number') {
    return null;
  }

  return record.status;
}

function unwrapSdkResponse<TValue>(value: TValue): SdkDataShape<TValue> {
  if (value && typeof value === 'object' && 'data' in (value as Record<string, unknown>)) {
    return ((value as unknown) as { data: SdkDataShape<TValue> }).data;
  }

  return value as SdkDataShape<TValue>;
}

export function extractSdkErrorMessage(
  error: unknown,
  options: OpenCodeSdkErrorMessageOptions = {},
): string | null {
  if (error instanceof Error) {
    const cause = extractSdkErrorCause(error);
    const causeBodyMessage = cause?.body?.data?.message
      ? getSdkErrorText(cause.body.data.message, options.trimMessage)
      : null;
    const causeBodyName = cause?.body?.name
      ? getSdkErrorText(cause.body.name, options.trimMessage)
      : null;

    return causeBodyMessage
      ?? getSdkErrorText(error.message, options.trimMessage)
      ?? (options.includeName ? causeBodyName ?? getSdkErrorText(error.name, options.trimMessage) : null)
      ?? options.fallbackMessage
      ?? null;
  }

  if (typeof error === 'string') {
    return getSdkErrorText(error, options.trimMessage);
  }

  if (!error || typeof error !== 'object') {
    return options.fallbackMessage ?? null;
  }

  const record = error as OpenCodeSdkErrorRecord;
  const baseMessage = getSdkErrorRecordBaseMessage(record, options);

  if (!baseMessage) {
    return null;
  }

  const statusCode = getSdkErrorRecordStatusCode(
    record,
    options.includeTopLevelStatus !== false,
  );

  return appendSdkErrorStatus(baseMessage, statusCode);
}

export function describeSdkError(
  error: unknown,
  fallbackMessage = 'OpenCode SDK request failed',
): string {
  if (typeof error === 'string') {
    return error;
  }

  return extractSdkErrorMessage(error, { fallbackMessage }) ?? fallbackMessage;
}

export function normalizeSdkError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(describeSdkError(error));
}

export class OpenCodeServiceDiagnostics {
  private transientConnectivityLogState: TransientConnectivityLogState | null = null;

  extractAssistantErrorMessage(errorLike: unknown): string | null {
    return extractSdkErrorMessage(errorLike, {
      fallbackMessage: null,
      includeName: true,
      includeTopLevelError: false,
      includeTopLevelStatus: false,
      trimMessage: true,
    });
  }

  describeError(error: unknown): string {
    return describeSdkError(
      error,
      error instanceof Error ? error.message : String(error),
    );
  }

  isTransientConnectivityError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return TRANSIENT_CONNECTIVITY_ERROR_PATTERNS.some((pattern) => pattern.test(message));
  }

  logAssistantFinalizationDebug(label: string, payload: unknown): void {
    logger.debug(`Assistant stream finalization [${label}]: ${this.stringifyDebugPayload(payload)}`);
  }

  logServiceWarning(_key: string, message: string, error: unknown): void {
    this.logServiceIssue('warn', message, error);
  }

  logServiceError(_key: string, message: string, error: unknown): void {
    this.logServiceIssue('error', message, error);
  }

  resetTransientConnectivityLogState(): void {
    this.transientConnectivityLogState = null;
  }

  private logServiceIssue(level: ServiceLogLevel, message: string, error: unknown): void {
    if (this.isTransientConnectivityError(error)) {
      this.logTransientConnectivityIssue(level, message, error);
      return;
    }

    this.emit(level, message, error);
  }

  private logTransientConnectivityIssue(level: ServiceLogLevel, message: string, error: unknown): void {
    if (this.transientConnectivityLogState) {
      this.transientConnectivityLogState.suppressedCount += 1;
      return;
    }

    this.transientConnectivityLogState = {
      suppressedCount: 0,
    };

    this.emit(level, `${message} (subsequent offline logs suppressed until the server recovers)`, error);
  }

  private emit(level: ServiceLogLevel, message: string, error: unknown): void {
    if (level === 'warn') {
      logger.warn(message, error);
      return;
    }

    logger.error(message, error);
  }

  private stringifyDebugPayload(payload: unknown): string {
    try {
      return JSON.stringify(payload);
    } catch {
      return '[unserializable]';
    }
  }
}

export interface OpenCodeSdkFacadeOptionsProvider {
  (): CreateSdkClientOptions;
}

interface OpenCodeSdkConnectionIdentity {
  readonly baseUrl: string;
  readonly directory: string | undefined;
  readonly authHeadersFingerprint: string;
}

function fingerprintAuthHeaders(headers: Record<string, string> | undefined, salt: number): string {
  const canonicalHeaders = Object.entries(headers ?? {})
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) => {
      const nameOrder = leftName.localeCompare(rightName);
      return nameOrder !== 0 ? nameOrder : leftValue.localeCompare(rightValue);
    });
  let hash = salt;
  for (const [name, value] of canonicalHeaders) {
    const component = `${name}\u0000${value}\u0000`;
    for (let index = 0; index < component.length; index += 1) {
      hash = Math.imul(hash ^ component.charCodeAt(index), 16777619);
    }
  }
  return (hash >>> 0).toString(36);
}

function createConnectionIdentity(
  options: CreateSdkClientOptions,
  salt: number,
): OpenCodeSdkConnectionIdentity {
  return {
    baseUrl: options.baseUrl,
    directory: options.directory,
    authHeadersFingerprint: fingerprintAuthHeaders(options.authHeaders, salt),
  };
}

function hasSameConnectionIdentity(
  previous: OpenCodeSdkConnectionIdentity | null,
  next: OpenCodeSdkConnectionIdentity,
): boolean {
  return previous !== null
    && previous.baseUrl === next.baseUrl
    && previous.directory === next.directory
    && previous.authHeadersFingerprint === next.authHeadersFingerprint;
}

/**
 * Thin runtime façade over the OpenCode SDK client.
 *
 * It mirrors the SDK namespace layout while centralizing client creation,
 * auth/directory/workspace injection, response unwrapping, and error normalization.
 */
export class OpenCodeSdkFacade implements OpenCodeSdkFacadeClient {
  readonly app: OpenCodeSdkFacadeNamespace<'app'>;
  readonly auth: OpenCodeSdkFacadeNamespace<'auth'>;
  readonly command: OpenCodeSdkFacadeNamespace<'command'>;
  readonly config: OpenCodeSdkFacadeNamespace<'config'>;
  readonly event: OpenCodeSdkFacadeNamespace<'event'>;
  readonly experimental: OpenCodeSdkFacadeNamespace<'experimental'>;
  readonly file: OpenCodeSdkFacadeNamespace<'file'>;
  readonly find: OpenCodeSdkFacadeNamespace<'find'>;
  readonly formatter: OpenCodeSdkFacadeNamespace<'formatter'>;
  readonly global: OpenCodeSdkFacadeNamespace<'global'>;
  readonly instance: OpenCodeSdkFacadeNamespace<'instance'>;
  readonly lsp: OpenCodeSdkFacadeNamespace<'lsp'>;
  readonly mcp: OpenCodeSdkFacadeNamespace<'mcp'>;
  readonly part: OpenCodeSdkFacadeNamespace<'part'>;
  readonly path: OpenCodeSdkFacadeNamespace<'path'>;
  readonly permission: OpenCodeSdkFacadeNamespace<'permission'>;
  readonly project: OpenCodeSdkFacadeNamespace<'project'>;
  readonly provider: OpenCodeSdkFacadeNamespace<'provider'>;
  readonly pty: OpenCodeSdkFacadeNamespace<'pty'>;
  readonly question: OpenCodeSdkFacadeNamespace<'question'>;
  readonly session: OpenCodeSdkFacadeNamespace<'session'>;
  readonly tool: OpenCodeSdkFacadeNamespace<'tool'>;
  readonly tui: OpenCodeSdkFacadeNamespace<'tui'>;
  readonly v2: OpenCodeSdkFacadeNamespace<'v2'>;
  readonly vcs: OpenCodeSdkFacadeNamespace<'vcs'>;
  readonly worktree: OpenCodeSdkFacadeNamespace<'worktree'>;

  private readonly namespaceCache = new Map<string, unknown>();
  private readonly connectionSalt = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
  private connectionIdentity: OpenCodeSdkConnectionIdentity | null = null;
  private connectionGeneration = 0;

  constructor(
    private readonly optionsProvider: OpenCodeSdkFacadeOptionsProvider,
    private readonly clientFactory: OpenCodeSdkFacadeClientFactory = createSdkClient,
  ) {
    this.app = this.createNamespaceFacade('app');
    this.auth = this.createNamespaceFacade('auth');
    this.command = this.createNamespaceFacade('command');
    this.config = this.createNamespaceFacade('config');
    this.event = this.createNamespaceFacade('event');
    this.experimental = this.createNamespaceFacade('experimental');
    this.file = this.createNamespaceFacade('file');
    this.find = this.createNamespaceFacade('find');
    this.formatter = this.createNamespaceFacade('formatter');
    this.global = this.createNamespaceFacade('global');
    this.instance = this.createNamespaceFacade('instance');
    this.lsp = this.createNamespaceFacade('lsp');
    this.mcp = this.createNamespaceFacade('mcp');
    this.part = this.createNamespaceFacade('part');
    this.path = this.createNamespaceFacade('path');
    this.permission = this.createNamespaceFacade('permission');
    this.project = this.createNamespaceFacade('project');
    this.provider = this.createNamespaceFacade('provider');
    this.pty = this.createNamespaceFacade('pty');
    this.question = this.createNamespaceFacade('question');
    this.session = this.createNamespaceFacade('session');
    this.tool = this.createNamespaceFacade('tool');
    this.tui = this.createNamespaceFacade('tui');
    this.v2 = this.createNamespaceFacade('v2');
    this.vcs = this.createNamespaceFacade('vcs');
    this.worktree = this.createNamespaceFacade('worktree');
  }

  getConnectionSignature(): string {
    this.observeConnectionIdentity();
    return `connection-${this.connectionGeneration}`;
  }

  async subscribeSessionEvents(signal: AbortSignal): Promise<AsyncIterable<SdkEvent>> {
    const result = await this.event.subscribe(undefined, { signal } as never);
    return result.stream as AsyncIterable<SdkEvent>;
  }

  private observeConnectionIdentity(): void {
    const identity = createConnectionIdentity(this.optionsProvider(), this.connectionSalt);
    if (!hasSameConnectionIdentity(this.connectionIdentity, identity)) {
      this.connectionIdentity = identity;
      this.connectionGeneration += 1;
    }
  }

  private getClient(): SdkOpencodeClient {
    return this.clientFactory(this.optionsProvider());
  }

  private resolveValue(path: string[]): unknown {
    let current: unknown = this.getClient();
    for (const segment of path) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private async invokeSdkFunction(
    parentPath: string[],
    functionPath: string[],
    args: unknown[],
  ): Promise<unknown> {
    const startedAt = performance.now();
    this.observeConnectionIdentity();
    const parentObject = this.resolveValue(parentPath);
    const rawValue = this.resolveValue(functionPath);
    if (typeof rawValue !== 'function' || !parentObject || typeof parentObject !== 'object') {
      const error = new Error(`OpenCode SDK path ${functionPath.join('.')} is unavailable`);
      this.optionsProvider().tracePort?.recordSdkCall?.({
        context: this.optionsProvider().traceContext,
        path: functionPath.join('.'),
        args,
        durationMs: performance.now() - startedAt,
        error,
      });
      throw error;
    }

    try {
      const result = await rawValue.apply(parentObject, args);
      this.optionsProvider().tracePort?.recordSdkCall?.({
        context: this.optionsProvider().traceContext,
        path: functionPath.join('.'),
        args,
        durationMs: performance.now() - startedAt,
        result,
      });
      return result;
    } catch (error) {
      this.optionsProvider().tracePort?.recordSdkCall?.({
        context: this.optionsProvider().traceContext,
        path: functionPath.join('.'),
        args,
        durationMs: performance.now() - startedAt,
        error,
      });
      throw error;
    }
  }

  private attachAppSkillsSidecars(value: unknown): unknown {
    const agentsPromise = this.invokeSdkFunction(['app'], ['app', 'agents'], [])
      .then((result) => unwrapSdkResponse(result))
      .catch((error) => {
        logger.debug('Failed to load OpenCode app agents alongside app skills:', error);
        return [];
      });

    return attachOpenCodeAppAgents(value, agentsPromise);
  }

  private createObjectFacade<TValue>(path: string[]): TValue {
    const cacheKey = path.join('.');
    const cached = this.namespaceCache.get(cacheKey);
    if (cached) {
      return cached as TValue;
    }

    const memberCache = new Map<PropertyKey, unknown>();
    const facade = new Proxy({}, {
      get: (_target, propertyKey) => {
        if (typeof propertyKey === 'symbol') {
          return undefined;
        }

        if (memberCache.has(propertyKey)) {
          return memberCache.get(propertyKey);
        }

        const nextPath = [...path, propertyKey];
        const rawValue = this.resolveValue(nextPath);
        if (typeof rawValue === 'function') {
          const wrapped = async (...args: unknown[]) => {
            try {
              const result = await this.invokeSdkFunction(path, nextPath, args);
              const unwrapped = unwrapSdkResponse(result);
              return path.length === 1 && path[0] === 'app' && propertyKey === 'skills'
                ? this.attachAppSkillsSidecars(unwrapped)
                : unwrapped;
            } catch (error) {
              throw normalizeSdkError(error);
            }
          };

          memberCache.set(propertyKey, wrapped);
          return wrapped;
        }

        if (rawValue && typeof rawValue === 'object') {
          const nested = this.createObjectFacade(nextPath);
          memberCache.set(propertyKey, nested);
          return nested;
        }

        if (rawValue === undefined) {
          // The SDK namespace/method does not exist on the connected client
          // (older server or unsupported capability). Return a thunk that throws
          // a normalized error when invoked, instead of leaking a raw TypeError
          // ("... is not a function") to callers.
          const unavailablePath = nextPath.join('.');
          const errorThunk = async (..._args: unknown[]): Promise<never> => {
            throw normalizeSdkError(
              new Error(`OpenCode SDK path ${unavailablePath} is unavailable`),
            );
          };
          memberCache.set(propertyKey, errorThunk);
          return errorThunk;
        }

        return rawValue;
      },
      ownKeys: () => {
        const currentValue = this.resolveValue(path);
        return Reflect.ownKeys((currentValue as Record<string, unknown> | undefined) ?? {});
      },
      getOwnPropertyDescriptor: () => ({
        configurable: true,
        enumerable: true,
      }),
      has: (_target, propertyKey) => {
        const currentValue = this.resolveValue(path);
        return propertyKey in ((currentValue as Record<string, unknown> | undefined) ?? {});
      },
    });

    this.namespaceCache.set(cacheKey, facade);
    return facade as TValue;
  }

  private createNamespaceFacade<TKey extends OpenCodeSdkNamespaceName>(
    namespaceName: TKey,
  ): OpenCodeSdkFacadeNamespace<TKey> {
    return this.createObjectFacade<OpenCodeSdkFacadeNamespace<TKey>>([namespaceName]);
  }
}

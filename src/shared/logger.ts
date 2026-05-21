import {
  CLAUDE_CODE_DEBUG_CHANNEL_IDS,
  type ClaudeCodeDebugChannelId,
  type ClaudeCodeDebugChannelSettings,
  type DebugModuleKey,
  type DebugModuleSettings,
  DEFAULT_DEBUG_REFRESH_INTERVAL_MS,
  getDefaultClaudeCodeDebugChannelSettings,
  getDefaultDebugModuleSettings,
  isDebugModuleKey,
  normalizeClaudeCodeDebugChannelSettings,
  normalizeDebugModuleSettings,
  normalizeDebugRefreshIntervalMs,
  resolveDebugModuleKey,
} from './debugModules';

type LogLevel = 'always' | 'info' | 'debug' | 'warn' | 'error';
type LogMethod = 'log' | 'warn' | 'error';
export type LogChannel = string;

const DEBUG_STORAGE_KEY = 'opencodian:debug';
const DEBUG_FLAG_KEY = '__OPENCODIAN_DEBUG__';
const INLINE_SERIALIZED_DEBUG_ARGS_FLAG_KEY = '__OPENCODIAN_INLINE_SERIALIZED_DEBUG_ARGS__';
const DEBUG_MODULE_SETTINGS_FLAG_KEY = '__OPENCODIAN_DEBUG_MODULE_SETTINGS__';
const DEBUG_REFRESH_INTERVAL_FLAG_KEY = '__OPENCODIAN_DEBUG_REFRESH_INTERVAL_MS__';
const CLAUDE_CODE_DEBUG_CHANNEL_SETTINGS_FLAG_KEY = '__OPENCODIAN_CLAUDE_CODE_DEBUG_CHANNEL_SETTINGS__';
const MAX_LOG_ENTRIES = 500;

type LoggerGlobalState = {
  [DEBUG_FLAG_KEY]?: boolean;
  [INLINE_SERIALIZED_DEBUG_ARGS_FLAG_KEY]?: boolean;
  [DEBUG_MODULE_SETTINGS_FLAG_KEY]?: DebugModuleSettings;
  [DEBUG_REFRESH_INTERVAL_FLAG_KEY]?: number;
  [CLAUDE_CODE_DEBUG_CHANNEL_SETTINGS_FLAG_KEY]?: ClaudeCodeDebugChannelSettings;
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  method: LogMethod;
  scope: string;
  moduleKey: DebugModuleKey;
  channel?: LogChannel;
  message: string;
}

interface LoggerOptions {
  moduleKey?: DebugModuleKey;
  channel?: LogChannel;
}

interface LogFingerprintState {
  fingerprint: string;
  lastEmittedAt: number;
}

interface EmitContext {
  level: LogLevel;
  method: LogMethod;
  scope: string;
  moduleKey: DebugModuleKey;
  channel?: LogChannel;
}

const recentLogEntries: LogEntry[] = [];
const logFingerprintState = new Map<string, LogFingerprintState>();

export interface Logger {
  always: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function getLoggerGlobalState(): LoggerGlobalState {
  return globalThis as LoggerGlobalState;
}

function isDebugEnabled(): boolean {
  const debugFlag = getLoggerGlobalState()[DEBUG_FLAG_KEY];
  if (typeof debugFlag === 'boolean') {
    return debugFlag;
  }

  try {
    return globalThis.localStorage?.getItem(DEBUG_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setDebugLoggingEnabled(enabled: boolean): void {
  getLoggerGlobalState()[DEBUG_FLAG_KEY] = enabled;

  try {
    globalThis.localStorage?.setItem(DEBUG_STORAGE_KEY, String(enabled));
  } catch {
    return;
  }
}

function isInlineSerializedDebugArgsEnabled(): boolean {
  return getLoggerGlobalState()[INLINE_SERIALIZED_DEBUG_ARGS_FLAG_KEY] === true;
}

export function setInlineSerializedDebugLogArgsEnabled(enabled: boolean): void {
  getLoggerGlobalState()[INLINE_SERIALIZED_DEBUG_ARGS_FLAG_KEY] = enabled;
}

export function setDebugModuleSettings(settings: unknown): void {
  getLoggerGlobalState()[DEBUG_MODULE_SETTINGS_FLAG_KEY] = normalizeDebugModuleSettings(settings);
}

export function setDebugModuleEnabled(moduleKey: DebugModuleKey, enabled: boolean): void {
  const currentSettings = getDebugModuleSettings();
  getLoggerGlobalState()[DEBUG_MODULE_SETTINGS_FLAG_KEY] = {
    ...currentSettings,
    [moduleKey]: enabled,
  };
}

export function getDebugModuleSettings(): DebugModuleSettings {
  return normalizeDebugModuleSettings(
    getLoggerGlobalState()[DEBUG_MODULE_SETTINGS_FLAG_KEY] ?? getDefaultDebugModuleSettings(),
  );
}

export function isDebugModuleEnabled(moduleKey: DebugModuleKey): boolean {
  return getDebugModuleSettings()[moduleKey] !== false;
}

export function setDebugRefreshIntervalMs(intervalMs: unknown): void {
  getLoggerGlobalState()[DEBUG_REFRESH_INTERVAL_FLAG_KEY] = normalizeDebugRefreshIntervalMs(intervalMs);
}

export function getDebugRefreshIntervalMs(): number {
  return getLoggerGlobalState()[DEBUG_REFRESH_INTERVAL_FLAG_KEY] ?? DEFAULT_DEBUG_REFRESH_INTERVAL_MS;
}

function getTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function getPerformanceTimestampMs(): number {
  const performanceRef = globalThis.performance;
  if (performanceRef && typeof performanceRef.now === 'function') {
    try {
      return performanceRef.now();
    } catch {
      return Date.now();
    }
  }

  return Date.now();
}

export function formatDurationMs(durationMs: number): string {
  if (!Number.isFinite(durationMs)) {
    return '0ms';
  }

  if (durationMs >= 1000) {
    const seconds = durationMs / 1000;
    return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
  }

  if (durationMs >= 100) {
    return `${Math.round(durationMs)}ms`;
  }

  return `${durationMs.toFixed(durationMs >= 10 ? 1 : 2)}ms`;
}

function formatArgs(
  scope: string,
  args: unknown[],
  options: { inlineSerializeNonStringArgs?: boolean } = {},
): unknown[] {
  const timestamp = getTimestamp();
  const prefix = `[${timestamp}] [${scope}]`;

  if (options.inlineSerializeNonStringArgs) {
    const message = args.map((arg) => (typeof arg === 'string' ? arg : stringifyArg(arg))).filter(Boolean).join(' ');
    return message ? [`${prefix} ${message}`] : [prefix];
  }

  if (typeof args[0] === 'string') {
    return [`${prefix} ${args[0]}`, ...args.slice(1)];
  }

  return [prefix, ...args];
}

function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg;
  }

  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }

  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function isOptionalLogEnabled(moduleKey: DebugModuleKey): boolean {
  return isDebugEnabled() && isDebugModuleEnabled(moduleKey);
}

export function setClaudeCodeDebugChannelSettings(settings: unknown): void {
  getLoggerGlobalState()[CLAUDE_CODE_DEBUG_CHANNEL_SETTINGS_FLAG_KEY] =
    normalizeClaudeCodeDebugChannelSettings(settings);
}

export function getClaudeCodeDebugChannelSettings(): ClaudeCodeDebugChannelSettings {
  return normalizeClaudeCodeDebugChannelSettings(
    getLoggerGlobalState()[CLAUDE_CODE_DEBUG_CHANNEL_SETTINGS_FLAG_KEY]
    ?? getDefaultClaudeCodeDebugChannelSettings(),
  );
}

function isClaudeCodeLogChannel(value: unknown): value is ClaudeCodeDebugChannelId {
  return typeof value === 'string'
    && (CLAUDE_CODE_DEBUG_CHANNEL_IDS as readonly string[]).includes(value);
}

function isLogChannelEnabled(moduleKey: DebugModuleKey, channel: LogChannel | undefined): boolean {
  if (moduleKey !== 'claudeCode' || !channel || !isClaudeCodeLogChannel(channel)) {
    return true;
  }
  return getClaudeCodeDebugChannelSettings()[channel] !== false;
}

function normalizeLogChannel(channel: unknown): LogChannel | undefined {
  if (typeof channel !== 'string') {
    return undefined;
  }
  const normalized = channel.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function pushRecentLog(context: EmitContext, args: unknown[]): void {
  const parts = args.map((arg) => stringifyArg(arg)).filter(Boolean);
  recentLogEntries.push({
    timestamp: new Date().toISOString(),
    level: context.level,
    method: context.method,
    scope: context.scope,
    moduleKey: context.moduleKey,
    ...(context.channel ? { channel: context.channel } : {}),
    message: parts.join(' '),
  });

  if (recentLogEntries.length > MAX_LOG_ENTRIES) {
    recentLogEntries.splice(0, recentLogEntries.length - MAX_LOG_ENTRIES);
  }
}

function emit(
  context: EmitContext,
  args: unknown[],
  options: { inlineSerializeNonStringArgs?: boolean } = {},
): void {
  const consoleRef = globalThis.console;
  pushRecentLog(context, args);
  if (!consoleRef) {
    return;
  }

  const formattedArgs = formatArgs(context.scope, args, options);

  switch (context.method) {
    case 'warn':
      consoleRef.warn(...formattedArgs);
      break;
    case 'error':
      consoleRef.error(...formattedArgs);
      break;
    case 'log':
    default:
      consoleRef.log(...formattedArgs);
      break;
  }
}

function createLoggerCall(scope: string, options: LoggerOptions | undefined, level: LogLevel): (...args: unknown[]) => void {
  const moduleKey = resolveDebugModuleKey(scope, options?.moduleKey);
  const channel = normalizeLogChannel(options?.channel);

  switch (level) {
    case 'always':
      return (...args: unknown[]) => {
        emit({ level: 'always', method: 'log', scope, moduleKey, channel }, args);
      };
    case 'info':
      return (...args: unknown[]) => {
        if (!isOptionalLogEnabled(moduleKey) || !isLogChannelEnabled(moduleKey, channel)) {
          return;
        }
        emit({ level: 'info', method: 'log', scope, moduleKey, channel }, args);
      };
    case 'debug':
      return (...args: unknown[]) => {
        if (!isOptionalLogEnabled(moduleKey) || !isLogChannelEnabled(moduleKey, channel)) {
          return;
        }

        emit({ level: 'debug', method: 'log', scope, moduleKey, channel }, args, {
          inlineSerializeNonStringArgs: isInlineSerializedDebugArgsEnabled(),
        });
      };
    case 'warn':
      return (...args: unknown[]) => {
        emit({ level: 'warn', method: 'warn', scope, moduleKey, channel }, args);
      };
    case 'error':
    default:
      return (...args: unknown[]) => {
        emit({ level: 'error', method: 'error', scope, moduleKey, channel }, args);
      };
  }
}

export function createLogger(scope: string, options?: LoggerOptions): Logger {
  return {
    always: createLoggerCall(scope, options, 'always'),
    info: createLoggerCall(scope, options, 'info'),
    debug: createLoggerCall(scope, options, 'debug'),
    warn: createLoggerCall(scope, options, 'warn'),
    error: createLoggerCall(scope, options, 'error'),
  };
}

export function getRecentLogEntries(): LogEntry[] {
  return [...recentLogEntries];
}

export function getRecentLogText(): string {
  return recentLogEntries
    .map((entry) => {
      const channelSegment = entry.channel ? ` [${entry.channel}]` : '';
      return `${entry.timestamp} [${entry.level.toUpperCase()}] [${entry.moduleKey}]${channelSegment} [${entry.scope}] ${entry.message}`;
    })
    .join('\n');
}

export function getRecentLogTextForEntries(entries: readonly LogEntry[]): string {
  return entries
    .map((entry) => {
      const channelSegment = entry.channel ? ` [${entry.channel}]` : '';
      return `${entry.timestamp} [${entry.level.toUpperCase()}] [${entry.moduleKey}]${channelSegment} [${entry.scope}] ${entry.message}`;
    })
    .join('\n');
}

export function clearRecentLogs(): void {
  recentLogEntries.length = 0;
}

export function resetLogEmissionThrottleState(): void {
  logFingerprintState.clear();
}

export function shouldEmitLogFingerprint(
  key: string,
  fingerprint: unknown,
  options: { minIntervalMs?: number } = {},
): boolean {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    return true;
  }

  const serializedFingerprint = stringifyArg(fingerprint);
  const now = Date.now();
  const minIntervalMs = normalizeDebugRefreshIntervalMs(
    options.minIntervalMs ?? getDebugRefreshIntervalMs(),
  );
  const currentState = logFingerprintState.get(normalizedKey);

  if (
    !currentState
    || currentState.fingerprint !== serializedFingerprint
    || now - currentState.lastEmittedAt >= minIntervalMs
  ) {
    logFingerprintState.set(normalizedKey, {
      fingerprint: serializedFingerprint,
      lastEmittedAt: now,
    });
    return true;
  }

  return false;
}

export function resolveLoggerDebugModuleKey(scope: string, moduleKey?: string): DebugModuleKey {
  return resolveDebugModuleKey(scope, isDebugModuleKey(moduleKey) ? moduleKey : undefined);
}

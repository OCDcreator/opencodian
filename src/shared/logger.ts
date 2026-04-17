type LogMethod = 'log' | 'warn' | 'error';

const DEBUG_STORAGE_KEY = 'opencodian:debug';
const DEBUG_FLAG_KEY = '__OPENCODIAN_DEBUG__';
const INLINE_SERIALIZED_DEBUG_ARGS_FLAG_KEY = '__OPENCODIAN_INLINE_SERIALIZED_DEBUG_ARGS__';
const MAX_LOG_ENTRIES = 500;

type LoggerGlobalState = {
  [DEBUG_FLAG_KEY]?: boolean;
  [INLINE_SERIALIZED_DEBUG_ARGS_FLAG_KEY]?: boolean;
};

interface LogEntry {
  timestamp: string;
  method: LogMethod;
  scope: string;
  message: string;
}

const recentLogEntries: LogEntry[] = [];

export interface Logger {
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

function pushRecentLog(method: LogMethod, scope: string, args: unknown[]): void {
  const parts = args.map((arg) => stringifyArg(arg)).filter(Boolean);
  recentLogEntries.push({
    timestamp: new Date().toISOString(),
    method,
    scope,
    message: parts.join(' '),
  });

  if (recentLogEntries.length > MAX_LOG_ENTRIES) {
    recentLogEntries.splice(0, recentLogEntries.length - MAX_LOG_ENTRIES);
  }
}

function emit(
  method: LogMethod,
  scope: string,
  args: unknown[],
  options: { inlineSerializeNonStringArgs?: boolean } = {},
): void {
  const consoleRef = globalThis.console;
  pushRecentLog(method, scope, args);
  if (!consoleRef) {
    return;
  }

  const formattedArgs = formatArgs(scope, args, options);

  switch (method) {
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

export function createLogger(scope: string): Logger {
  return {
    info: (...args: unknown[]) => {
      emit('log', scope, args);
    },
    debug: (...args: unknown[]) => {
      if (!isDebugEnabled()) {
        return;
      }

      emit('log', scope, args, {
        inlineSerializeNonStringArgs: isInlineSerializedDebugArgsEnabled(),
      });
    },
    warn: (...args: unknown[]) => {
      emit('warn', scope, args);
    },
    error: (...args: unknown[]) => {
      emit('error', scope, args);
    },
  };
}

export function getRecentLogEntries(): LogEntry[] {
  return [...recentLogEntries];
}

export function getRecentLogText(): string {
  return recentLogEntries
    .map((entry) => `${entry.timestamp} [${entry.method.toUpperCase()}] [${entry.scope}] ${entry.message}`)
    .join('\n');
}

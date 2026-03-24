type LogMethod = 'log' | 'warn' | 'error';

const DEBUG_STORAGE_KEY = 'opencodian:debug';
const DEBUG_FLAG_KEY = '__OPENCODIAN_DEBUG__';

export interface Logger {
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function isDebugEnabled(): boolean {
  const debugFlag = (globalThis as { [DEBUG_FLAG_KEY]?: boolean })[DEBUG_FLAG_KEY];
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
  (globalThis as { [DEBUG_FLAG_KEY]?: boolean })[DEBUG_FLAG_KEY] = enabled;

  try {
    globalThis.localStorage?.setItem(DEBUG_STORAGE_KEY, String(enabled));
  } catch {
    return;
  }
}

function formatArgs(scope: string, args: unknown[]): unknown[] {
  if (typeof args[0] === 'string') {
    return [`[${scope}] ${args[0]}`, ...args.slice(1)];
  }

  return [`[${scope}]`, ...args];
}

function emit(method: LogMethod, scope: string, args: unknown[]): void {
  const consoleRef = globalThis.console;
  if (!consoleRef) {
    return;
  }

  const formattedArgs = formatArgs(scope, args);

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
    debug: (...args: unknown[]) => {
      if (!isDebugEnabled()) {
        return;
      }

      emit('log', scope, args);
    },
    warn: (...args: unknown[]) => {
      emit('warn', scope, args);
    },
    error: (...args: unknown[]) => {
      emit('error', scope, args);
    },
  };
}

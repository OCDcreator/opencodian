/**
 * Shared module
 */

export type { Logger } from './logger';
export { createLogger } from './logger';
export { getRecentLogEntries, getRecentLogText } from './logger';
export { setDebugLoggingEnabled } from './logger';
export {
  isToolExecutionError,
  resolveToolExecutionStatus,
  resolveToolResultText,
} from './toolExecution';
export type {
  ToolExecutionStateLike,
  ToolExecutionStatus,
} from './toolExecution';
export { getVaultBasePath } from './vault';

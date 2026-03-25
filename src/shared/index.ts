/**
 * Shared module
 */

export type { Logger } from './logger';
export { createLogger } from './logger';
export { getRecentLogEntries, getRecentLogText } from './logger';
export { setDebugLoggingEnabled } from './logger';
export { getVaultBasePath } from './vault';

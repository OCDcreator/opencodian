/**
 * Shared module
 */

export type { Logger } from './logger';
export { createLogger } from './logger';
export { clearRecentLogs, getRecentLogEntries, getRecentLogText } from './logger';
export { formatDurationMs, getPerformanceTimestampMs } from './logger';
export {
  getDebugModuleSettings,
  getDebugRefreshIntervalMs,
  isDebugModuleEnabled,
  resetLogEmissionThrottleState,
  resolveLoggerDebugModuleKey,
  setDebugLoggingEnabled,
  setDebugModuleEnabled,
  setDebugModuleSettings,
  setDebugRefreshIntervalMs,
  setInlineSerializedDebugLogArgsEnabled,
  shouldEmitLogFingerprint,
} from './logger';
export {
  buildContextAttachment,
  buildObsidianContextTag,
  formatContextLabel,
  formatLineRange,
  getContextPathExtension,
  isEligibleContextFilePath,
  isHiddenContextPath,
  isTextLikeMime,
  parseLineRangeFromFileUrl,
  parseObsidianContextTag,
  resolveContextMimeFromPath,
  resolveTextMimeFromPath,
  toFileContextUrl,
} from './obsidianContext';
export type {
  ToolExecutionStateLike,
  ToolExecutionStatus,
} from './toolExecution';
export {
  isInternalStructuredOutputTool,
  isToolExecutionError,
  resolveToolExecutionStatus,
  resolveToolResultText,
} from './toolExecution';
export type {
  ToolIdentity,
  ToolIdentityKind,
  ToolIdentityOptions,
} from './toolIdentity';
export {
  getNormalizedToolName,
  getToolIdentity,
  isBuiltinToolName,
  MCP_TOOL_ICON_ID,
} from './toolIdentity';
export { getVaultBasePath } from './vault';

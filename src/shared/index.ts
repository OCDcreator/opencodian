/**
 * Shared module
 */

export type { Logger } from './logger';
export { createLogger } from './logger';
export { getRecentLogEntries, getRecentLogText } from './logger';
export { setDebugLoggingEnabled, setInlineSerializedDebugLogArgsEnabled } from './logger';
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
export { getVaultBasePath } from './vault';

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
export type {
  ToolIdentity,
  ToolIdentityKind,
  ToolIdentityOptions,
} from './toolIdentity';
export {
  MCP_TOOL_ICON_ID,
  getNormalizedToolName,
  getToolIdentity,
  isBuiltinToolName,
} from './toolIdentity';
export { getVaultBasePath } from './vault';

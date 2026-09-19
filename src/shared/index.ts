/**
 * Shared module
 */

export type {
  BatchConflict,
  BatchConflictReason,
  BatchEditPropertiesParams,
  BatchMoveParams,
  BatchNoteSnapshot,
  BatchOperation,
  BatchOrganizeTemplateId,
  BatchParamErrorCode,
  BatchPlan,
  BatchPlanResult,
  BatchPropertyCondition,
  BatchPropertyOperation,
  BatchPropertyValue,
  BatchRenameParams,
  BatchScope,
  BatchTemplateParams,
} from './batchOrganizePlan';
export {
  applyBatchPropertyOperation,
  applyRenameRule,
  basenameOf,
  BATCH_ORGANIZE_TEMPLATE_IDS,
  buildBatchPlan,
  coercePropertyToString,
  collectTargetFolders,
  directoryOf,
  matchesBatchScope,
  normalizeTag,
  normalizeTagList,
  parseBatchPropertyValue,
  plansAreIdentical,
  planSignature,
  propertyOperationWouldChange,
  validatePropertyName,
  validateRenameRule,
  validateTargetFolder,
} from './batchOrganizePlan';
export type {
  ContextGroupAttachCandidate,
  ContextGroupAttachPlan,
  ContextGroupAttachPlanOptions,
  ContextGroupResolvedEntry,
  ContextGroupSummary,
} from './contextGroupPlan';
export { planContextGroupAttach, summarizeContextGroup } from './contextGroupPlan';
export { sanitizeDiagnosticReport } from './diagnosticSecretSanitizer';
export type {
  EditRevertActionResult,
  EditRevertEntrySource,
  EditRevertEntryState,
  EditRevertExcludedReason,
  EditRevertFileEntry,
  EditRevertFileStatus,
  EditRevertPreImageStatus,
  EditRevertRoundMeta,
  EditRevertRoundSummary,
  EditRevertSidebarEntry,
  EditRevertSidebarModel,
  EditRevertWriteToolKind,
} from './editRevertPlan';
export {
  buildSidebarModel,
  classifyWriteTool,
  computeBlobRefCounts,
  computeRoundBytes,
  EDIT_REVERT_IDLE_CACHE_MAX_BYTES,
  EDIT_REVERT_IDLE_CACHE_MAX_FILES,
  EDIT_REVERT_MAX_ROUNDS_PER_CONVERSATION,
  EDIT_REVERT_MAX_ROUNDS_TOTAL,
  EDIT_REVERT_MAX_SNAPSHOT_BYTES,
  EDIT_REVERT_POST_TURN_GRACE_MS,
  EDIT_REVERT_SNAPSHOT_BUDGET_MS,
  extractCandidatePathsFromPrompt,
  extractWriteToolTargets,
  isEntryRestorable,
  isEntryRevertible,
  isMarkdownPath,
  parseApplyPatchPaths,
  parseShellRedirectionTargets,
  planRoundEvictions,
} from './editRevertPlan';
export type { LogChannel, LogEntry, Logger } from './logger';
export { createLogger } from './logger';
export { clearRecentLogs, getRecentLogEntries, getRecentLogText, getRecentLogTextForEntries } from './logger';
export { formatDurationMs, getPerformanceTimestampMs } from './logger';
export {
  getClaudeCodeDebugChannelSettings,
  getDebugModuleSettings,
  getDebugRefreshIntervalMs,
  isDebugModuleEnabled,
  resetLogEmissionThrottleState,
  resolveLoggerDebugModuleKey,
  setClaudeCodeDebugChannelSettings,
  setDebugLoggingEnabled,
  setDebugModuleEnabled,
  setDebugModuleSettings,
  setDebugRefreshIntervalMs,
  setInlineSerializedDebugLogArgsEnabled,
  shouldEmitLogFingerprint,
} from './logger';
export {
  appendObsidianContextBlocks,
  buildContextAttachment,
  buildContextItemPromptBlock,
  buildObsidianContextTag,
  buildPdfContextBody,
  buildPdfContextTag,
  buildPdfSelectionRange,
  dedupeContextAttachments,
  extractPromptContextItems,
  formatContextLabel,
  formatLineRange,
  getContextPathExtension,
  isEligibleContextFilePath,
  isHiddenContextPath,
  isTextLikeMime,
  parseLineRangeFromFileUrl,
  parseObsidianContextTag,
  PDF_SELECTION_EXCERPT_MAX_CHARS,
  pdfPagesFromFragment,
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
export { getFilePathBasename, getVaultBasePath, toVaultRelativePath } from './vault';

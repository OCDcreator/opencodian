/**
 * Chat-related type definitions
 */

import type { ContextCostDetails } from './pricing';
import {
  type CodexReasoningEffort,
  type CodexSandboxMode,
  type CodexWebSearchMode,
  normalizeChatFontSizePx,
} from './settings';

const VALID_CODEX_SANDBOX_MODES: readonly CodexSandboxMode[] = ['read-only', 'workspace-write', 'danger-full-access'];
const VALID_CODEX_REASONING_EFFORTS: readonly CodexReasoningEffort[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];
const VALID_CODEX_WEB_SEARCH_MODES: readonly CodexWebSearchMode[] = ['disabled', 'cached', 'live'];

/** View type constant */
export const VIEW_TYPE_OPENCODIAN = 'opencodian-view';

/** Settings view type constant */
export const VIEW_TYPE_OPENCODIAN_SETTINGS = 'opencodian-settings-view';

/** Image media types */
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/** Image attachment */
export interface ImageAttachment {
  data: string;  // base64 encoded
  mediaType: ImageMediaType;
  filename?: string;
}

/** Session todo item */
export interface SessionTodo {
  id?: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high';
}

export type PromptContextKind = 'current_note' | 'selection' | 'file';

export interface PromptContextLineRange {
  startLine: number;
  endLine: number;
}

export interface PromptContextItem {
  id: string;
  kind: PromptContextKind;
  path: string;
  label: string;
  mime: string;
  lineRange?: PromptContextLineRange;
  textSnapshot?: string;
}

export interface MessageContextAttachment {
  kind: PromptContextKind;
  path: string;
  label: string;
  mime: string;
  lineRange?: PromptContextLineRange;
  textSnapshot?: string;
}

export interface QuestionOption {
  label: string;
  description: string;
  /** Optional preview text supplied by the Claude Code SDK when AskUserQuestion preview formatting is enabled. */
  preview?: string;
}

export interface QuestionPrompt {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionRequest {
  id: string;
  sessionId: string;
  questions: QuestionPrompt[];
}

export interface QuestionResolution {
  request: QuestionRequest;
  status: 'answered' | 'rejected';
  answers?: string[][];
}

export interface SessionDiffEntry {
  file: string;
  patch?: string;
  before?: string;
  after?: string;
  additions: number;
  deletions: number;
  status?: 'added' | 'deleted' | 'modified';
}

export interface ConversationSessionSettings {
  chatFontSizePx?: number | null;
  codexSandboxMode?: CodexSandboxMode | null;
  codexModelReasoningEffort?: CodexReasoningEffort | null;
  codexModelOverride?: string | null;
  codexAdditionalDirectories?: string[] | null;
  codexNetworkAccessEnabled?: boolean | null;
  codexWebSearchMode?: CodexWebSearchMode | null;
}

function normalizeNullableEnum<T extends string>(
  raw: T | null | undefined,
  valid: readonly T[],
): T | null | undefined {
  if (raw === null) return null;
  if (typeof raw === 'string' && valid.includes(raw)) return raw;
  return undefined;
}

function normalizeNullableString(raw: string | null | undefined): string | null | undefined {
  if (raw === null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

function normalizeNullableStringArray(raw: string[] | null | undefined): string[] | null | undefined {
  if (raw === null) return null;
  if (Array.isArray(raw)) {
    const filtered = raw
      .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
      .map((d) => d.trim());
    if (filtered.length > 0) return filtered;
  }
  return undefined;
}

function normalizeNullableBoolean(raw: boolean | null | undefined): boolean | null | undefined {
  if (raw === null) return null;
  if (typeof raw === 'boolean') return raw;
  return undefined;
}

function assignIfDefined<T>(target: Record<string, T>, key: string, value: T | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export function normalizeConversationSessionSettings(
  value?: Partial<ConversationSessionSettings> | null,
): ConversationSessionSettings | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const normalized: Record<string, unknown> = {};

  if (value.chatFontSizePx === null) {
    normalized.chatFontSizePx = null;
  } else {
    const chatFontSizePx = normalizeChatFontSizePx(value.chatFontSizePx, 0);
    if (chatFontSizePx > 0) {
      normalized.chatFontSizePx = chatFontSizePx;
    }
  }

  assignIfDefined(normalized, 'codexSandboxMode', normalizeNullableEnum(value.codexSandboxMode, VALID_CODEX_SANDBOX_MODES));
  assignIfDefined(normalized, 'codexModelReasoningEffort', normalizeNullableEnum(value.codexModelReasoningEffort, VALID_CODEX_REASONING_EFFORTS));
  assignIfDefined(normalized, 'codexModelOverride', normalizeNullableString(value.codexModelOverride));
  assignIfDefined(normalized, 'codexAdditionalDirectories', normalizeNullableStringArray(value.codexAdditionalDirectories));
  assignIfDefined(normalized, 'codexNetworkAccessEnabled', normalizeNullableBoolean(value.codexNetworkAccessEnabled));
  assignIfDefined(normalized, 'codexWebSearchMode', normalizeNullableEnum(value.codexWebSearchMode, VALID_CODEX_WEB_SEARCH_MODES));

  return Object.keys(normalized).length > 0 ? normalized as ConversationSessionSettings : undefined;
}

/** Content block in a message */
export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'subagent';
  text?: string;
  thinking?: string;
  durationSeconds?: number;
  toolId?: string;
  toolName?: string;
  toolSourceKey?: string;
  toolKind?: 'builtin' | 'mcp' | 'custom' | 'task' | 'question' | 'skill' | 'plan' | 'unknown';
  toolInput?: Record<string, unknown>;
  toolMetadata?: Record<string, unknown>;
  toolStatus?: 'pending' | 'running' | 'completed' | 'error' | 'blocked';
  toolResult?: string;
  toolResultVisibility?: 'visible' | 'hidden';
  subagentId?: string;
  subagentMode?: 'sync' | 'async';
}

/** Chat message */
export type ChatNoticeActionType = 'open_model_settings' | 'restore_rewind';

export interface ChatNoticeAction {
  type: ChatNoticeActionType;
}

export interface ChatNoticeMeta {
  kind: 'background-task-completion' | 'codex-provisional-warning';
  conversationId?: string;
  anchorKey?: string;
  sourceReminderIds?: string[];
  allComplete?: boolean;
  taskIds?: string[];
}

export type OmoReminderType =
  | 'background-task-completed'
  | 'all-background-tasks-complete'
  | 'generic';

export interface OmoUserInjectionMeta {
  kind: 'user-injection';
  modeTag: string;
  injectedPrompt: string;
  originalText: string;
  rawText: string;
  headline: string;
}

export interface OmoBackgroundTaskInfo {
  id: string;
  description: string;
}

export interface OmoSystemReminderMeta {
  kind: 'system-reminder';
  reminderType: OmoReminderType;
  reminderText: string;
  rawText: string;
  headline: string;
  isInternalInitiator: boolean;
  tasks?: OmoBackgroundTaskInfo[];
}

export type OmoMessageMeta = OmoUserInjectionMeta | OmoSystemReminderMeta;

export interface CompactionDividerMeta {
  auto: boolean;
  overflow: boolean;
  tailStartId: string;
  live?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  modelId?: string;
  summary?: boolean;
  summaryKind?: 'compaction';
  sourceMessageId?: string;
  streamState?: 'interrupted';
  displayStyle?: 'default' | 'notice';
  noticeTitle?: string;
  noticeTone?: 'info' | 'warning' | 'error';
  noticeActions?: ChatNoticeAction[];
  noticeMeta?: ChatNoticeMeta;
  images?: ImageAttachment[];
  toolCalls?: ToolCallInfo[];
  contentBlocks?: ContentBlock[];
  contextAttachments?: MessageContextAttachment[];
  questionResolution?: QuestionResolution;
  omo?: OmoMessageMeta;
  compactionDivider?: CompactionDividerMeta;
  structured?: unknown;
  // OpenCode-specific: store original parts for advanced features
  parts?: unknown[];
}

/** Tool call information */
export interface ToolCallInfo {
  id: string;
  name: string;
  toolSourceKey?: string;
  kind?: 'builtin' | 'mcp' | 'custom' | 'task' | 'question' | 'skill' | 'plan' | 'unknown';
  input: Record<string, unknown>;
  toolMetadata?: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'error' | 'blocked';
  result?: string;
  resultVisibility?: 'visible' | 'hidden';
  isExpanded?: boolean;
}

/** Usage information */
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  model: string;
  contextWindow: number;
  percentage: number;
  sessionId?: string;
}

/** Backend session context usage snapshot */
export interface ContextUsageSnapshot {
  sessionId: string;
  sessionTitle: string;
  createdAt: number;
  updatedAt: number;
  compactingAt?: number | null;
  providerId: string | null;
  providerName: string | null;
  modelId: string | null;
  modelName: string | null;
  contextWindow: number;
  /**
   * Authoritative cumulative token count when the backend exposes one.
   * It can intentionally differ from the visible category sum (for example,
   * Codex reports a server-side total that includes protocol-only overhead).
   */
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  /** `null` means this backend does not report cache writes. */
  cacheWriteTokens: number | null;
  /** `null` means the backend does not report a cost; never manufacture $0. */
  totalCost: number | null;
  /** Cost provenance for a reported value or local estimate. */
  costDetails?: ContextCostDetails | null;
  /** Optional request-ledger used for cost only; it is distinct from context-window token totals. */
  billingUsage?: ContextBillingUsage | null;
}

/** Cumulative billable request tokens, currently populated by Claude Code stream results. */
export interface ContextBillingUsage {
  requestIds: string[];
  providerId: string | null;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  /** `null` means at least one billable response did not disclose this category. */
  cacheReadTokens: number | null;
  /** `null` means at least one billable response did not disclose this category. */
  cacheWriteTokens: number | null;
}

export interface ContextBillingUsageUpdate {
  requestId: string;
  providerId?: string | null;
  modelId?: string | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
}

export type ContextBreakdownKey = 'system' | 'user' | 'assistant' | 'tool' | 'other';

export interface ContextBreakdownSegment {
  key: ContextBreakdownKey;
  tokens: number;
  width: number;
  percent: number;
}

/** Per-tab context usage state */
export interface TabContextState {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  streamInputTokens: number;
  streamOutputTokens: number;
  preciseTokens: {
    total: number;
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number | null;
  } | null;
  totalCost: number | null;
  costDetails: ContextCostDetails | null;
  billingUsage: ContextBillingUsage | null;
  contextWindow: number;
  percentage: number;
  provider: string | null;
  providerName: string | null;
  model: string | null;
  modelName: string | null;
  compactingAt?: number | null;
  sessionId: string | null;
  sessionTitle: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

export function createEmptyTabContextState(): TabContextState {
  return {
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    streamInputTokens: 0,
    streamOutputTokens: 0,
    preciseTokens: null,
    totalCost: null,
    costDetails: null,
    billingUsage: null,
    contextWindow: 0,
    percentage: 0,
    provider: null,
    providerName: null,
    model: null,
    modelName: null,
    compactingAt: null,
    sessionId: null,
    sessionTitle: null,
    createdAt: null,
    updatedAt: null,
  };
}

/** Stream chunk types */
export type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string; partId?: string; durationSeconds?: number }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      kind?: 'builtin' | 'mcp' | 'custom' | 'task' | 'question' | 'skill' | 'plan' | 'unknown';
      input: Record<string, unknown>;
      toolMetadata?: Record<string, unknown>;
      toolResultVisibility?: 'visible' | 'hidden';
    }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
  | { type: 'file_edited'; file: string }
  | {
      type: 'message_metadata';
      messageId: string;
      timestamp: number;
      modelId?: string;
      sessionId?: string;
    }
  | {
      type: 'usage';
      inputTokens: number;
      outputTokens: number;
      sessionId?: string;
      billingUsage?: ContextBillingUsageUpdate;
    }
  | {
      /** A backend-authoritative session context snapshot (not account usage). */
      type: 'context_usage';
      snapshot: ContextUsageSnapshot;
    }
  | {
      type: 'backend_event';
      source: AgentBackendKind;
      event: 'hook' | 'subagent' | 'tool_progress' | 'structured_output';
      status?: string;
      id?: string;
      name?: string;
      content?: string;
      metadata?: Record<string, unknown>;
      sessionId?: string;
    }
  | { type: 'error'; content: string; errorClass?: import('../opencode/sdkErrorClassification').SdkErrorClass }
  | { type: 'message_start' }
  | { type: 'message_stop' }
  | { type: 'content_block_start'; index: number }
  | { type: 'content_block_stop'; index: number }
  | {
      type: 'permission_request';
      id: string;
      sessionID: string;
      permission: string;
      patterns: string[];
      metadata: Record<string, unknown>;
      always: string[];
      tool?: {
        messageID: string;
        callID: string;
      };
    }
  | { type: 'question_request'; request: QuestionRequest }
  | { type: 'prompt_suggestion'; suggestion: string; uuid: string; sessionId?: string }
  | { type: 'user_message_identity'; uuid: string; sessionId?: string };

/** Logical agent backend identity. Determines which adapter owns a session. */
export type AgentBackendKind = 'opencode' | 'claude-code' | 'codex' | 'copilot' | 'pi';

/** Conversation metadata */
export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastResponseAt?: number;
  titleGenerationStatus?: 'pending' | 'success' | 'failed';
  messageCount: number;
  openCodeSessionId?: string;
  backendSessionId?: string;
  backendAgentId?: string;
  backend?: AgentBackendKind;
}

export interface BackgroundTaskActiveAnchorMetadata {
  startedAt: number;
  anchorKey: string;
  modeTag: string | null;
  waitingForFollowUp: boolean;
  updatedAt: number;
}

export interface ConversationBackgroundTaskMetadata {
  activeAnchor?: BackgroundTaskActiveAnchorMetadata;
}

/** Conversation */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastResponseAt?: number;
  titleGenerationStatus?: 'pending' | 'success' | 'failed';
  openCodeSessionId?: string;
  backendSessionId?: string;
  backendAgentId?: string;
  messages: ChatMessage[];
  currentNote?: string;
  externalContextPaths?: string[];
  sessionSettings?: ConversationSessionSettings;
  /** Last verified backend context snapshot, retained for a useful reload state. */
  lastContextUsage?: ContextUsageSnapshot;
  backgroundTaskMetadata?: ConversationBackgroundTaskMetadata;
  transport?: 'opencode' | 'acp';
  /** Legacy ACP session id retained for persisted compatibility. Use backendSessionId for new code. */
  acpSessionId?: string;
  /** Legacy ACP agent id retained for persisted compatibility. Use backendAgentId for new code. */
  acpAgentId?: string;
  /** Which agent backend owns this conversation. Old data defaults to 'opencode'. */
  backend?: AgentBackendKind;
}

export function getConversationBackendSessionId(
  conversation: {
    backendSessionId?: string | null;
    openCodeSessionId?: string | null;
    acpSessionId?: string | null;
  },
): string | undefined {
  return conversation.backendSessionId ?? conversation.openCodeSessionId ?? conversation.acpSessionId ?? undefined;
}

/**
 * Chat-related type definitions
 */

/** View type constant */
export const VIEW_TYPE_OPENCODIAN = 'opencodian-view';

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
  before?: string;
  after?: string;
  additions: number;
  deletions: number;
  status?: 'added' | 'deleted' | 'modified';
}

/** Content block in a message */
export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'subagent';
  text?: string;
  thinking?: string;
  durationSeconds?: number;
  toolId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolStatus?: 'pending' | 'running' | 'completed' | 'error' | 'blocked';
  toolResult?: string;
  subagentId?: string;
  subagentMode?: 'sync' | 'async';
}

/** Chat message */
export type ChatNoticeActionType = 'open_model_settings' | 'restore_rewind';

export interface ChatNoticeAction {
  type: ChatNoticeActionType;
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  modelId?: string;
  sourceMessageId?: string;
  streamState?: 'interrupted';
  displayStyle?: 'default' | 'notice';
  noticeTitle?: string;
  noticeTone?: 'info' | 'warning' | 'error';
  noticeActions?: ChatNoticeAction[];
  images?: ImageAttachment[];
  toolCalls?: ToolCallInfo[];
  contentBlocks?: ContentBlock[];
  contextAttachments?: MessageContextAttachment[];
  questionResolution?: QuestionResolution;
  omo?: OmoMessageMeta;
  // OpenCode-specific: store original parts for advanced features
  parts?: unknown[];
}

/** Tool call information */
export interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'error' | 'blocked';
  result?: string;
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
    cacheWrite: number;
  } | null;
  totalCost: number | null;
  contextWindow: number;
  percentage: number;
  provider: string | null;
  providerName: string | null;
  model: string | null;
  modelName: string | null;
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
    contextWindow: 0,
    percentage: 0,
    provider: null,
    providerName: null,
    model: null,
    modelName: null,
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
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
  | { type: 'file_edited'; file: string }
  | { type: 'message_metadata'; messageId: string; timestamp: number; modelId?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; sessionId?: string }
  | { type: 'error'; content: string }
  | { type: 'message_start' }
  | { type: 'message_stop' }
  | { type: 'content_block_start'; index: number }
  | { type: 'content_block_stop'; index: number }
  | { type: 'permission_request'; id: string; permission: string; patterns: string[]; metadata: Record<string, unknown> }
  | { type: 'question_request'; request: QuestionRequest };

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
}

/** Conversation */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastResponseAt?: number;
  titleGenerationStatus?: 'pending' | 'success' | 'failed';
  openCodeSessionId: string;
  messages: ChatMessage[];
  currentNote?: string;
  externalContextPaths?: string[];
}

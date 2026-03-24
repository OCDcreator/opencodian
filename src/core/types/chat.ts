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

/** Content block in a message */
export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'subagent';
  text?: string;
  thinking?: string;
  durationSeconds?: number;
  toolId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolStatus?: 'pending' | 'running' | 'completed' | 'error';
  toolResult?: string;
  subagentId?: string;
  subagentMode?: 'sync' | 'async';
}

/** Chat message */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  images?: ImageAttachment[];
  toolCalls?: ToolCallInfo[];
  contentBlocks?: ContentBlock[];
  // OpenCode-specific: store original parts for advanced features
  parts?: unknown[];
}

/** Tool call information */
export interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'error';
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

/** Stream chunk types */
export type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; sessionId?: string }
  | { type: 'error'; content: string }
  | { type: 'message_start' }
  | { type: 'message_stop' }
  | { type: 'content_block_start'; index: number }
  | { type: 'content_block_stop'; index: number }
  | { type: 'permission_request'; id: string; permission: string; patterns: string[]; metadata: Record<string, unknown> };

/** Conversation metadata */
export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastResponseAt?: number;
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
  openCodeSessionId: string;
  messages: ChatMessage[];
  currentNote?: string;
  externalContextPaths?: string[];
}

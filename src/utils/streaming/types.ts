import type { MarkdownRenderService } from '../markdown';

// ============================================
// Stream Chunk Types
// ============================================

export interface ThinkingChunk {
  type: 'thinking';
  content: string;
  partId?: string;
  durationSeconds?: number;
}

export interface TextChunk {
  type: 'text';
  content: string;
}

export interface ToolUseChunk {
  type: 'tool_use';
  id: string;
  name: string;
  kind?: 'builtin' | 'mcp' | 'custom' | 'task' | 'question' | 'skill' | 'plan' | 'unknown';
  input: Record<string, unknown>;
  toolMetadata?: Record<string, unknown>;
  resultVisibility?: 'visible' | 'hidden';
}

export interface ToolResultChunk {
  type: 'tool_result';
  id: string;
  content: string;
  isError?: boolean;
}

export interface ErrorChunk {
  type: 'error';
  content: string;
  errorClass?: import('../../core/opencode/sdkErrorClassification').SdkErrorClass;
}

export interface DoneChunk {
  type: 'done';
}

export type StreamChunk =
  | ThinkingChunk
  | TextChunk
  | ToolUseChunk
  | ToolResultChunk
  | ErrorChunk
  | DoneChunk;

// ============================================
// Tool Call Types
// ============================================

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error' | 'blocked';

export interface ToolCallInfo {
  id: string;
  name: string;
  toolSourceKey?: string;
  kind?: 'builtin' | 'mcp' | 'custom' | 'task' | 'question' | 'skill' | 'plan' | 'unknown';
  input: Record<string, unknown>;
  toolMetadata?: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
  resultVisibility?: 'visible' | 'hidden';
}

// ============================================
// Content Block Types (for persistence)
// ============================================

export interface TextContentBlock {
  type: 'text';
  content: string;
}

export interface ThinkingContentBlock {
  type: 'thinking';
  content: string;
  partId?: string;
  durationSeconds?: number;
}

export interface ToolCallContentBlock {
  type: 'tool_call';
  toolCall: ToolCallInfo;
}

export type ContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolCallContentBlock;

// ============================================
// Thinking Block State
// ============================================

export interface ThinkingBlockState {
  wrapperEl: HTMLElement;
  contentEl: HTMLElement;
  labelEl: HTMLElement;
  content: string;
  partId: string | null;
  resolvedDurationSeconds: number | null;
  startTime: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  isExpanded: boolean;
}

// ============================================
// Stream State
// ============================================

export interface StreamState {
  isStreaming: boolean;
  currentContentEl: HTMLElement | null;
  currentTextEl: HTMLElement | null;
  currentTextContent: string;
  currentThinkingState: ThinkingBlockState | null;
  thinkingBlocksByPartId: Map<string, ThinkingContentBlock>;
  thinkingBlockElements: Map<string, HTMLElement>;
  toolCalls: Map<string, ToolCallInfo>;
  toolCallElements: Map<string, HTMLElement>;
  persistedToolCallIds: Set<string>;
  contentBlocks: ContentBlock[];
}

export function createStreamState(): StreamState {
  return {
    isStreaming: false,
    currentContentEl: null,
    currentTextEl: null,
    currentTextContent: '',
    currentThinkingState: null,
    thinkingBlocksByPartId: new Map(),
    thinkingBlockElements: new Map(),
    toolCalls: new Map(),
    toolCallElements: new Map(),
    persistedToolCallIds: new Set(),
    contentBlocks: [],
  };
}

// ============================================
// Stream Controller Options
// ============================================

export interface StreamControllerOptions {
  containerEl: HTMLElement;
  markdownService: MarkdownRenderService;
  onStreamComplete?: (contentBlocks: ContentBlock[]) => void;
  onToolCallClick?: (toolCall: ToolCallInfo) => void;
  scrollToBottom?: () => void;
  onCollapsibleToggle?: () => void;
}

// ============================================
// Tool Renderer Options
// ============================================

export interface ToolRendererOptions {
  iconMap?: Record<string, string>;
  getToolName?: (name: string, input: Record<string, unknown>) => string;
  getToolSummary?: (
    name: string,
    input: Record<string, unknown>,
    toolKind?: ToolCallInfo['kind']
  ) => string;
  renderExpandedContent?: (container: HTMLElement, toolName: string, result: string | undefined) => void;
  onCollapsibleToggle?: () => void;
  onOpenToolSession?: (sessionId: string, toolCall: ToolCallInfo) => void;
  onOpenMcpServerDetail?: (serverName: string) => void;
  onAuthenticateMcpServer?: (serverName: string) => void;
  onRetryMcpToolCall?: (toolCall: ToolCallInfo) => void;
  /**
   * When true (persisted/history restore path), the expanded result/task/mcp
   * content is not rendered until the card is first expanded; subsequent
   * collapse/expand reuses it. The streaming path leaves this unset.
   */
  lazy?: boolean;
  /**
   * Read back the last-known expansion state for this card (keyed by a stable
   * per-block identifier, typically the toolId) so manual expansions survive
   * re-renders. Only used by the persisted path.
   */
  getInitialExpanded?: (blockKey: string) => boolean;
  /** Persist a toggle so a later re-render can restore it. */
  onExpandedChange?: (blockKey: string, isExpanded: boolean) => void;
}

// ============================================
// Thinking Renderer Options
// ============================================

export interface ThinkingRendererOptions {
  collapsedByDefault?: boolean;
  showTimer?: boolean;
  collapsedLabel?: string;
  expandedLabel?: string;
  onCollapsibleToggle?: () => void;
  /**
   * When true (persisted/history restore path), `renderStored` does not render
   * the full markdown into the content container until the block is first
   * expanded; subsequent collapse/expand reuses the already-rendered content.
   * The streaming path leaves this unset so content renders as it arrives.
   */
  lazy?: boolean;
  /**
   * Read back the last-known expansion state for this block so manual
   * expansions survive re-renders. The optional key is renderer-provided;
   * callers may instead own state by the content-block object they close over.
   * Only used by the persisted path; the streaming path ignores it.
   */
  getInitialExpanded?: (blockKey: string) => boolean;
  /** Persist a toggle so a later re-render can restore it; key may be empty. */
  onExpandedChange?: (blockKey: string, isExpanded: boolean) => void;
}

// ============================================
// Event Callbacks
// ============================================

export interface StreamEventCallbacks {
  onThinkingStart?: () => void;
  onThinkingEnd?: (durationSeconds: number) => void;
  onTextAppend?: (text: string) => void;
  onToolCallStart?: (toolCall: ToolCallInfo) => void;
  onToolCallEnd?: (toolCall: ToolCallInfo) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

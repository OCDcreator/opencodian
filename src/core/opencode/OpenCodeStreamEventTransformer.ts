import {
  getToolIdentity,
  isInternalStructuredOutputTool,
  resolveToolExecutionStatus,
  resolveToolResultText,
  type ToolIdentityKind,
} from '../../shared';
import type {
  QuestionRequest as ChatQuestionRequest,
  StreamChunk,
} from '../types';
import { normalizePermissionRequest } from './OpenCodeQuestionPermissionHub';
import type {
  Message,
  Part,
} from './OpenCodeSessionLifecycleCoordinator';
import { OpenCodeStreamingRuntimeContext } from './OpenCodeStreamingRuntimeCoordinator';
import { classifySdkError } from './sdkErrorClassification';

export interface OpenCodeStreamEventTransformerHost {
  observeRuntimeToolNames(toolNames: Iterable<string>): boolean;
  getOpenCodeToolKind(toolName: string | undefined | null): ToolIdentityKind;
  normalizeQuestionRequest(raw: unknown): ChatQuestionRequest | null;
  logStreamingDebug(label: string, payload: unknown): void;
}

export interface OpenCodeSSEEvent {
  event: string;
  data: string;
}

interface OpenCodeToolStateData {
  status: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface OpenCodeStreamPart extends Part {
  text?: string;
  duration?: number;
  time?: {
    start?: number;
    end?: number;
  };
  callID?: string;
  tool?: string;
  state?: OpenCodeToolStateData;
  [key: string]: unknown;
}

export interface OpenCodeStreamEvent {
  type: string;
  properties?: {
    sessionID?: string;
    messageID?: string;
    id?: string;
    permission?: string;
    patterns?: string[];
    always?: string[];
    metadata?: Record<string, unknown>;
    part?: OpenCodeStreamPart;
    parts?: OpenCodeStreamPart[];
    delta?: string;
    field?: string;
    partID?: string;
    toolID?: string;
    result?: string;
    error?: unknown;
    usage?: {
      input?: number;
      output?: number;
    };
    file?: string;
    text?: string;
    timestamp?: string;
    callID?: string;
    agent?: string;
    model?: { id: string; providerID: string; variant: string };
    finish?: string;
    cost?: number;
    tokens?: {
      total?: number;
      input: number;
      output: number;
      reasoning: number;
      cache: { write: number; read: number };
    };
    reasoningID?: string;
    prompt?: { text?: string; files?: unknown[]; agents?: unknown[]; references?: unknown[] };
    reason?: string;
    attempt?: number;
    output?: unknown;
    input?: unknown;
    tool?: string | { messageID?: string; callID?: string };
    provider?: { id: string; name: string };
    questions?: Array<{
      question?: string;
      header?: string;
      options?: Array<{ label?: string; description?: string }>;
      multiple?: boolean;
      custom?: boolean;
    }>;
  };
}

export interface OpenCodeStreamingTextDeltaDebugState {
  sequence: number;
  source: 'event' | 'finalize';
  partId: string | null;
  partType: string;
  length: number;
  totalLength: number;
  preview: string;
}

export interface OpenCodeStreamEventState {
  lastContent: string;
  lastErrorMessage: string | null;
  processedToolIds: Set<string>;
  toolInputSnapshots: Map<string, string>;
  reasoningTextSnapshots: Map<string, string>;
  debugChunkSequence: number;
  lastTextDelta: OpenCodeStreamingTextDeltaDebugState | null;
}

export type OpenCodeStreamPartTypeState = OpenCodeStreamingRuntimeContext | {
  partTypeMap?: Map<string, string>;
  partMessageIdMap?: Map<string, string>;
};

export interface OpenCodeStreamMutation {
  type: 'message.upserted' | 'part.upserted' | 'part.delta' | 'part.completed';
  sessionID: string;
  messageID: string;
  partID?: string;
  role?: Message['role'];
  createdAt?: number;
  part?: Part;
  field?: string;
  delta?: string;
  partType?: string;
}

interface OpenCodeStreamingEventHandlerContext {
  eventData: OpenCodeStreamEvent;
  sessionId: string;
  state: OpenCodeStreamEventState;
  streamContext: OpenCodeStreamPartTypeState;
  chunks: StreamChunk[];
  mutations: OpenCodeStreamMutation[];
}

export interface OpenCodeStreamEventOutcome {
  chunks: StreamChunk[];
  mutations: OpenCodeStreamMutation[];
  stop: boolean;
}

type OpenCodeStreamingEventHandler = (
  context: OpenCodeStreamingEventHandlerContext,
) => OpenCodeStreamEventOutcome;

interface OpenCodeStreamingPartUpdatedHandlerContext {
  part: OpenCodeStreamPart;
  state: OpenCodeStreamEventState;
  chunks: StreamChunk[];
}

type OpenCodeStreamingPartUpdatedHandler = (
  context: OpenCodeStreamingPartUpdatedHandlerContext,
) => void;

type OpenCodeStreamPartChunkTransformer = (
  part: OpenCodeStreamPart,
  chunks: StreamChunk[],
) => void;

interface OpenCodeTextDeltaChunkContext {
  chunks: StreamChunk[];
  delta: string;
  partId: string | undefined;
  partType: string;
  sessionId: string;
  state: OpenCodeStreamEventState;
}

interface OpenCodeClassifiedToolPart {
  toolId: string | null;
  toolName: string;
  toolKind: ToolIdentityKind;
  toolInput: Record<string, unknown>;
  toolMetadata?: Record<string, unknown>;
  toolResultVisibility?: 'hidden';
  toolStatus: ReturnType<typeof resolveToolExecutionStatus>;
  toolResult: string | undefined;
}

function extractRenderableToolMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const sessionId = typeof metadata.sessionId === 'string' && metadata.sessionId.trim()
    ? metadata.sessionId.trim()
    : null;
  if (!sessionId) {
    return undefined;
  }

  return { sessionId };
}

function resolveToolResultVisibility(
  toolName: string,
  toolKind: ToolIdentityKind,
): 'hidden' | undefined {
  return toolKind === 'task' || getToolIdentity(toolName).kind === 'task'
    ? 'hidden'
    : undefined;
}

function parseJsonRecord(payload: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inferSseEventName(data: string): string {
  const parsed = parseJsonRecord(data);
  const eventType = parsed?.type;
  return typeof eventType === 'string' && eventType.trim() ? eventType : 'unknown';
}

function resolveReasoningDurationSeconds(
  part: Pick<OpenCodeStreamPart, 'duration' | 'time'>,
): number | undefined {
  const start = part.time?.start;
  const end = part.time?.end;
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    return Math.max(0, end - start) / 1000;
  }

  if (typeof part.duration === 'number' && part.duration > 0) {
    return part.duration;
  }

  return undefined;
}

function getDebugTextPreview(text: string, maxLength = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function extractStructuredErrorName(errorLike: unknown): string | null {
  if (!errorLike || typeof errorLike !== 'object') {
    return null;
  }

  const errorRecord = errorLike as { name?: unknown };
  return typeof errorRecord.name === 'string' && errorRecord.name.trim()
    ? errorRecord.name.trim()
    : null;
}

function extractStructuredErrorMessage(errorLike: unknown): string | null {
  if (!errorLike || typeof errorLike !== 'object') {
    return null;
  }

  const errorRecord = errorLike as {
    message?: unknown;
    data?: {
      message?: unknown;
      statusCode?: unknown;
      responseBody?: unknown;
    };
    name?: unknown;
  };

  const baseMessage = typeof errorRecord.data?.message === 'string' && errorRecord.data.message.trim()
    ? errorRecord.data.message.trim()
    : typeof errorRecord.message === 'string' && errorRecord.message.trim()
      ? errorRecord.message.trim()
      : typeof errorRecord.name === 'string' && errorRecord.name.trim()
        ? errorRecord.name.trim()
        : null;

  if (!baseMessage) {
    return null;
  }

  const statusCode = typeof errorRecord.data?.statusCode === 'number'
    ? errorRecord.data.statusCode
    : null;

  if (statusCode === null || baseMessage.toLowerCase().includes(`http ${statusCode}`)) {
    return baseMessage;
  }

  return `${baseMessage} (HTTP ${statusCode})`;
}

export class OpenCodeStreamEventTransformer {
  private readonly streamingEventHandlers: Record<string, OpenCodeStreamingEventHandler>;

  private readonly streamingPartUpdatedHandlers: Record<string, OpenCodeStreamingPartUpdatedHandler>;

  private readonly streamPartChunkTransformers: Record<string, OpenCodeStreamPartChunkTransformer>;

  constructor(private readonly host: OpenCodeStreamEventTransformerHost) {
    this.streamingEventHandlers = {
      'message.part.updated': this.handleMessagePartUpdated.bind(this),
      'message.part.delta': this.handleMessagePartDelta.bind(this),
      'permission.asked': this.handlePermissionAsked.bind(this),
      'file.edited': this.handleFileEdited.bind(this),
      'session.error': this.handleSessionError.bind(this),
      'session.idle': this.handleSessionIdle.bind(this),
      'question.asked': this.handleQuestionAsked.bind(this),
      'session.next.agent.switched': this.handleSessionNextObserved.bind(this),
      'session.next.prompted': this.handleSessionNextObserved.bind(this),
      'session.next.step.started': this.handleSessionNextObserved.bind(this),
      'session.next.step.ended': this.handleSessionNextStepEnded.bind(this),
      'session.next.text.started': this.handleSessionNextObserved.bind(this),
      'session.next.text.ended': this.handleSessionNextObserved.bind(this),
      'session.next.reasoning.started': this.handleSessionNextObserved.bind(this),
      'session.next.reasoning.ended': this.handleSessionNextObserved.bind(this),
      'session.next.tool.called': this.handleSessionNextObserved.bind(this),
      'session.next.tool.success': this.handleSessionNextObserved.bind(this),
    };
    this.streamingPartUpdatedHandlers = {
      tool: this.handleToolPartUpdated.bind(this),
      reasoning: this.handleReasoningPartUpdated.bind(this),
      thinking: this.handleReasoningPartUpdated.bind(this),
    };
    this.streamPartChunkTransformers = {
      text: this.appendTextPartChunks.bind(this),
      reasoning: this.appendReasoningPartChunks.bind(this),
      tool: this.appendToolPartChunks.bind(this),
    };
  }

  handleStreamingEvent(
    eventData: OpenCodeStreamEvent,
    sessionId: string,
    state: OpenCodeStreamEventState,
    streamContext: OpenCodeStreamPartTypeState,
  ): OpenCodeStreamEventOutcome {
    if (eventData.properties?.sessionID && eventData.properties.sessionID !== sessionId) {
      return { chunks: [], mutations: [], stop: false };
    }

    const partSessionId = eventData.properties?.part?.sessionID;
    if (partSessionId && partSessionId !== sessionId) {
      return { chunks: [], mutations: [], stop: false };
    }

    const chunks = this.createUsageChunks(eventData, sessionId);
    const mutations: OpenCodeStreamMutation[] = [];
    const eventHandler = this.streamingEventHandlers[eventData.type];
    if (eventHandler) {
      return eventHandler({
        eventData,
        sessionId,
        state,
        streamContext,
        chunks,
        mutations,
      });
    }

    if (eventData.type?.startsWith('session.next.')) {
      this.host.logStreamingDebug('service-session-next-event', {
        eventType: eventData.type,
        sessionId,
      });
      return { chunks: [], mutations, stop: false };
    }

    return { chunks, mutations, stop: false };
  }

  parseSSEEventPayload(event: OpenCodeSSEEvent): OpenCodeStreamEvent | null {
    const parsed = parseJsonRecord(event.data);
    return parsed ? (parsed as unknown as OpenCodeStreamEvent) : null;
  }

  parseSSEEvents(buffer: string): { events: OpenCodeSSEEvent[]; remaining: string } {
    const events: OpenCodeSSEEvent[] = [];
    const lines = buffer.split('\n');
    let currentEvent: Partial<OpenCodeSSEEvent> = {};
    let remaining = '';

    const lastDoubleNewline = buffer.lastIndexOf('\n\n');
    if (lastDoubleNewline === -1 || lastDoubleNewline !== buffer.length - 2) {
      remaining = lines.pop() || '';
    }

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentEvent.data = line.slice(5).trim();
      } else if (line === '') {
        if (currentEvent.data !== undefined) {
          if (!currentEvent.event) {
            currentEvent.event = inferSseEventName(currentEvent.data);
          }
          events.push(currentEvent as OpenCodeSSEEvent);
        }
        currentEvent = {};
      }
    }

    return { events, remaining };
  }

  transformEventToChunks(event: unknown): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    if (typeof event !== 'object' || event === null) {
      return chunks;
    }

    const evt = event as { type?: string; properties?: Record<string, unknown> };
    const props = evt.properties;

    if (!props) {
      return chunks;
    }

    if (props.parts && Array.isArray(props.parts)) {
      for (const part of props.parts) {
        const partChunks = this.transformPartToChunks(part as OpenCodeStreamPart);
        chunks.push(...partChunks);
      }
    }

    if (props.part) {
      const partChunks = this.transformPartToChunks(props.part as OpenCodeStreamPart);
      chunks.push(...partChunks);
    }

    if (props.text && typeof props.text === 'string') {
      chunks.push({ type: 'text', content: props.text });
    }

    if (props.usage && typeof props.usage === 'object') {
      const usage = props.usage as { input?: number; output?: number };
      chunks.push({
        type: 'usage',
        inputTokens: usage.input ?? 0,
        outputTokens: usage.output ?? 0,
      });
    }

    return chunks;
  }

  transformPartToChunks(part: OpenCodeStreamPart): StreamChunk[] {
    const chunks: StreamChunk[] = [];
    const chunkTransformer = this.streamPartChunkTransformers[part.type];
    chunkTransformer?.(part, chunks);

    return chunks;
  }

  private getToolInputSnapshot(input: Record<string, unknown> | undefined): string {
    if (!input || Object.keys(input).length === 0) {
      return '';
    }

    try {
      return JSON.stringify(input);
    } catch {
      return '[unserializable-tool-input]';
    }
  }

  private createUsageChunks(
    eventData: OpenCodeStreamEvent,
    sessionId: string,
  ): StreamChunk[] {
    const usage = eventData.properties?.usage;
    if (!usage) {
      return [];
    }

    return [{
      type: 'usage',
      inputTokens: usage.input ?? 0,
      outputTokens: usage.output ?? 0,
      sessionId,
    }];
  }

  private handleMessagePartUpdated({
    eventData,
    sessionId,
    state,
    streamContext,
    chunks,
    mutations,
  }: OpenCodeStreamingEventHandlerContext): OpenCodeStreamEventOutcome {
    const part = eventData.properties?.part;
    if (!part?.id || !part.type) {
      return { chunks, mutations, stop: false };
    }

    this.rememberStreamPartMetadata(streamContext, eventData, part);
    mutations.push(...this.buildPartUpdatedMutations(part, eventData, sessionId));
    const partHandler = this.streamingPartUpdatedHandlers[part.type];
    partHandler?.({ part, state, chunks });
    return { chunks, mutations, stop: false };
  }

  private handleToolPartUpdated(
    {
      part: toolPart,
      state,
      chunks,
    }: OpenCodeStreamingPartUpdatedHandlerContext,
  ): void {
    const preClassifiedToolName = toolPart.tool || 'unknown';
    if (!isInternalStructuredOutputTool(preClassifiedToolName)) {
      this.host.observeRuntimeToolNames([preClassifiedToolName]);
    }

    const classifiedToolPart = this.resolveToolPartClassification(toolPart);
    if (!classifiedToolPart) {
      return;
    }

    this.appendWaitingQuestionRequestChunk(toolPart, chunks);

    const {
      toolId,
      toolName,
      toolKind,
      toolInput,
      toolMetadata,
      toolResultVisibility,
      toolStatus,
      toolResult,
    } = classifiedToolPart;
    if (!toolId) {
      return;
    }

    const nextSnapshot = this.getToolInputSnapshot(toolInput);
    const previousSnapshot = state.toolInputSnapshots.get(toolId);
    const shouldEmitToolUse =
      !state.processedToolIds.has(toolId)
      || nextSnapshot !== previousSnapshot;

    if (shouldEmitToolUse) {
      state.processedToolIds.add(toolId);
      state.toolInputSnapshots.set(toolId, nextSnapshot);
      chunks.push({
        type: 'tool_use',
        id: toolId,
        name: toolName,
        kind: toolKind,
        input: toolInput,
        ...(toolMetadata ? { toolMetadata } : {}),
        ...(toolResultVisibility ? { toolResultVisibility } : {}),
      });
    }

    if ((toolStatus === 'completed' || toolStatus === 'error') && toolResult !== undefined) {
      const resultKey = `${toolId}_result`;
      if (!state.processedToolIds.has(resultKey)) {
        state.processedToolIds.add(resultKey);
        chunks.push({
          type: 'tool_result',
          toolUseId: toolId,
          content: toolResult,
          isError: toolStatus === 'error',
        });
      }
    }
  }

  private handleReasoningPartUpdated({
    part,
    state,
    chunks,
  }: OpenCodeStreamingPartUpdatedHandlerContext): void {
    if (!this.isReasoningPartType(part.type)) {
      return;
    }

    const durationSeconds = resolveReasoningDurationSeconds(part);
    const delta = this.resolveReasoningUpdatedDelta(part.id, part.text, state);
    if (this.hasVisibleReasoningText(delta)) {
      chunks.push({
        type: 'thinking',
        content: delta,
        partId: part.id,
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      });
      return;
    }

    if (durationSeconds !== undefined && this.hasVisibleReasoningText(
      state.reasoningTextSnapshots.get(part.id) ?? '',
    )) {
      chunks.push({
        type: 'thinking',
        content: '',
        partId: part.id,
        durationSeconds,
      });
    }
  }

  private appendTextPartChunks(
    part: OpenCodeStreamPart,
    chunks: StreamChunk[],
  ): void {
    if (part.text) {
      chunks.push({ type: 'text', content: part.text });
    }
  }

  private appendReasoningPartChunks(
    part: OpenCodeStreamPart,
    chunks: StreamChunk[],
  ): void {
    if (this.hasVisibleReasoningText(part.text)) {
      chunks.push({
        type: 'thinking',
        content: part.text,
        partId: part.id,
        durationSeconds: resolveReasoningDurationSeconds(part),
      });
    }
  }

  private appendToolPartChunks(
    part: OpenCodeStreamPart,
    chunks: StreamChunk[],
  ): void {
    const preClassifiedToolName = part.tool || 'unknown';
    if (!isInternalStructuredOutputTool(preClassifiedToolName)) {
      this.host.observeRuntimeToolNames([preClassifiedToolName]);
    }

    const classifiedToolPart = this.resolveToolPartClassification(part, {
      requireState: true,
    });
    if (!classifiedToolPart) {
      return;
    }

    this.appendWaitingQuestionRequestChunk(part, chunks);

    const {
      toolId,
      toolName,
      toolKind,
      toolInput,
      toolMetadata,
      toolResultVisibility,
      toolStatus,
      toolResult,
    } = classifiedToolPart;

    if (toolStatus === 'pending' || toolStatus === 'running') {
      chunks.push({
        type: 'tool_use',
        id: toolId ?? '',
        name: toolName,
        kind: toolKind,
        input: toolInput,
        ...(toolMetadata ? { toolMetadata } : {}),
        ...(toolResultVisibility ? { toolResultVisibility } : {}),
      });
      return;
    }

    if (toolStatus === 'completed' || toolStatus === 'error') {
      if (toolMetadata || toolResultVisibility) {
        chunks.push({
          type: 'tool_use',
          id: toolId ?? '',
          name: toolName,
          kind: toolKind,
          input: toolInput,
          ...(toolMetadata ? { toolMetadata } : {}),
          ...(toolResultVisibility ? { toolResultVisibility } : {}),
        });
      }

      chunks.push({
        type: 'tool_result',
        toolUseId: toolId ?? '',
        content: toolResult ?? (toolStatus === 'error' ? 'Error: Tool execution failed' : ''),
        isError: toolStatus === 'error',
      });
    }
  }

  private appendWaitingQuestionRequestChunk(
    part: OpenCodeStreamPart,
    chunks: StreamChunk[],
  ): void {
    const request = this.resolveWaitingQuestionRequest(part);
    if (!request) {
      return;
    }

    chunks.push({
      type: 'question_request',
      request,
    });
  }

  private resolveWaitingQuestionRequest(part: OpenCodeStreamPart): ChatQuestionRequest | null {
    if (
      part.type !== 'tool'
      || part.tool !== 'question'
      || part.state?.status !== 'waiting'
    ) {
      return null;
    }

    const metadata = part.state.metadata;
    const candidates: unknown[] = [
      metadata,
      metadata?.request,
      metadata?.question,
      part,
    ];

    for (const candidate of candidates) {
      const request = this.host.normalizeQuestionRequest(candidate);
      if (request) {
        return request;
      }
    }

    return null;
  }

  private handleMessagePartDelta({
    eventData,
    sessionId,
    state,
    streamContext,
    chunks,
    mutations,
  }: OpenCodeStreamingEventHandlerContext): OpenCodeStreamEventOutcome {
    const delta = eventData.properties?.delta;
    const field = eventData.properties?.field;
    const partID = eventData.properties?.partID ?? eventData.properties?.part?.id;

    if (!delta || !field) {
      return { chunks, mutations, stop: false };
    }

    this.rememberStreamPartMetadata(streamContext, eventData, eventData.properties?.part);
    const partType = this.resolveDeltaPartType(eventData, streamContext, partID);
    const sessionID = this.resolveStreamPartSessionId(eventData, sessionId);
    const messageID = this.resolveStreamPartMessageId(eventData, streamContext, partID);
    if (messageID && partID) {
      mutations.push(this.buildStreamMessageMutation(sessionID, messageID, undefined));
      mutations.push({
        type: 'part.delta',
        sessionID,
        messageID,
        partID,
        field,
        delta,
        partType,
      });
    }

    if (field !== 'text') {
      return { chunks, mutations, stop: false };
    }

    if (this.isReasoningPartType(partType)) {
      if (partID) {
        const previousText = state.reasoningTextSnapshots.get(partID) ?? '';
        state.reasoningTextSnapshots.set(partID, `${previousText}${delta}`);
      }
      if (this.hasVisibleReasoningText(delta)) {
        chunks.push({ type: 'thinking', content: delta, partId: partID });
      }
      return { chunks, mutations, stop: false };
    }

    this.appendTextDeltaChunk({
      chunks,
      delta,
      partId: partID,
      partType,
      sessionId,
      state,
    });
    return { chunks, mutations, stop: false };
  }

  private resolveDeltaPartType(
    eventData: OpenCodeStreamEvent,
    streamContext: OpenCodeStreamPartTypeState,
    partID: string | undefined,
  ): string {
    if (!partID) {
      return 'text';
    }

    if (!this.hasStreamPartType(streamContext, partID)) {
      const partType = eventData.properties?.part?.type;
      this.setStreamPartType(streamContext, partID, partType || 'text');
    }

    return this.getStreamPartType(streamContext, partID) || 'text';
  }

  private appendTextDeltaChunk({
    chunks,
    delta,
    partId,
    partType,
    sessionId,
    state,
  }: OpenCodeTextDeltaChunkContext): void {
    chunks.push({ type: 'text', content: delta });
    state.lastContent += delta;
    state.debugChunkSequence += 1;
    state.lastTextDelta = {
      sequence: state.debugChunkSequence,
      source: 'event',
      partId: partId ?? null,
      partType,
      length: delta.length,
      totalLength: state.lastContent.length,
      preview: getDebugTextPreview(delta, 120),
    };
    this.host.logStreamingDebug('service-text-delta', {
      sessionId,
      chunkSequence: state.debugChunkSequence,
      partId: partId ?? null,
      partType,
      deltaLength: delta.length,
      totalLength: state.lastContent.length,
      deltaPreview: getDebugTextPreview(delta, 120),
    });
  }

  private resolveReasoningUpdatedDelta(
    partId: string,
    nextText: unknown,
    state: OpenCodeStreamEventState,
  ): string {
    if (typeof nextText !== 'string') {
      return '';
    }

    const previousText = state.reasoningTextSnapshots.get(partId) ?? '';
    if (nextText === previousText) {
      return '';
    }

    const delta = nextText.startsWith(previousText)
      ? nextText.slice(previousText.length)
      : nextText;

    state.reasoningTextSnapshots.set(partId, nextText);
    return delta;
  }

  private hasVisibleReasoningText(text: unknown): text is string {
    return typeof text === 'string' && text.trim().length > 0;
  }

  private handlePermissionAsked({
    eventData,
    chunks,
    mutations,
  }: OpenCodeStreamingEventHandlerContext): OpenCodeStreamEventOutcome {
    const permission = normalizePermissionRequest(eventData.properties);
    if (permission) {
      chunks.push({
        type: 'permission_request',
        id: permission.id,
        sessionID: permission.sessionID,
        permission: permission.permission,
        patterns: permission.patterns,
        metadata: permission.metadata,
        always: permission.always,
        ...(permission.tool ? { tool: permission.tool } : {}),
      });
    }

    return { chunks, mutations, stop: false };
  }

  private handleFileEdited({
    eventData,
    chunks,
    mutations,
  }: OpenCodeStreamingEventHandlerContext): OpenCodeStreamEventOutcome {
    const file = eventData.properties?.file;
    if (typeof file === 'string' && file.trim()) {
      chunks.push({ type: 'file_edited', file: file.trim() });
    }

    return { chunks, mutations, stop: false };
  }

  private handleSessionError({
    eventData,
    sessionId,
    state,
    chunks,
    mutations,
  }: OpenCodeStreamingEventHandlerContext): OpenCodeStreamEventOutcome {
    const errorPayload = eventData.properties?.error;
    const errorName = extractStructuredErrorName(errorPayload);
    const errorMessage = extractStructuredErrorMessage(errorPayload) ?? 'Unknown error';
    const errorClass = classifySdkError(errorPayload);
    state.lastErrorMessage = errorMessage;
    this.host.logStreamingDebug('service-session-error', {
      sessionId,
      errorName,
      errorMessage,
      errorClass,
    });
    if (errorName === 'MessageAbortedError') {
      return { chunks, mutations, stop: true };
    }

    chunks.push({
      type: 'error',
      content: errorMessage,
      errorClass,
    });
    return { chunks, mutations, stop: true };
  }

  private handleSessionIdle({
    sessionId,
    state,
    chunks,
    mutations,
  }: OpenCodeStreamingEventHandlerContext): OpenCodeStreamEventOutcome {
    this.host.logStreamingDebug('service-session-idle', {
      sessionId,
      accumulatedTextLength: state.lastContent.length,
      lastTextDelta: state.lastTextDelta,
    });
    return { chunks, mutations, stop: true };
  }

  private handleSessionNextObserved({
    eventData,
    sessionId,
    mutations,
  }: OpenCodeStreamingEventHandlerContext): OpenCodeStreamEventOutcome {
    this.logSessionNextEvent(eventData, sessionId);

    return { chunks: [], mutations, stop: false };
  }

  private logSessionNextEvent(eventData: OpenCodeStreamEvent, sessionId: string): void {
    const properties = eventData.properties;
    const rawTokens = properties?.tokens;
    const safeTokens = rawTokens ? {
      total: typeof rawTokens.total === 'number' ? rawTokens.total : undefined,
      input: typeof rawTokens.input === 'number' ? rawTokens.input : undefined,
      output: typeof rawTokens.output === 'number' ? rawTokens.output : undefined,
      reasoning: typeof rawTokens.reasoning === 'number' ? rawTokens.reasoning : undefined,
      cache: rawTokens.cache ? {
        write: typeof rawTokens.cache.write === 'number' ? rawTokens.cache.write : undefined,
        read: typeof rawTokens.cache.read === 'number' ? rawTokens.cache.read : undefined,
      } : undefined,
    } : undefined;
    this.host.logStreamingDebug('service-session-next-event', {
      eventType: eventData.type,
      sessionId,
      callID: properties?.callID,
      reasoningID: properties?.reasoningID,
      hasText: typeof properties?.text === 'string' && properties.text.length > 0,
      hasInput: properties?.input !== undefined,
      tokens: safeTokens,
      finish: properties?.finish,
      agent: properties?.agent,
      cost: properties?.cost,
    });
  }

  private handleSessionNextStepEnded({
    eventData,
    sessionId,
    chunks,
    mutations,
  }: OpenCodeStreamingEventHandlerContext): OpenCodeStreamEventOutcome {
    this.logSessionNextEvent(eventData, sessionId);

    const tokens = eventData.properties?.tokens;
    if (typeof tokens?.input === 'number') {
      chunks.unshift({
        type: 'usage',
        inputTokens: tokens.input,
        outputTokens: (typeof tokens.output === 'number' ? tokens.output : 0)
          + (typeof tokens.reasoning === 'number' ? tokens.reasoning : 0),
        sessionId,
      });
    }

    return { chunks, mutations, stop: false };
  }

  private handleQuestionAsked({
    eventData,
    chunks,
    mutations,
  }: OpenCodeStreamingEventHandlerContext): OpenCodeStreamEventOutcome {
    const request = this.host.normalizeQuestionRequest(eventData.properties);
    if (request) {
      chunks.push({
        type: 'question_request',
        request,
      });
    }

    return { chunks, mutations, stop: false };
  }

  private isReasoningPartType(partType: string): boolean {
    return partType === 'reasoning' || partType === 'thinking';
  }

  private resolveToolPartClassification(
    toolPart: OpenCodeStreamPart,
    options: { requireState?: boolean } = {},
  ): OpenCodeClassifiedToolPart | null {
    if (options.requireState && !toolPart.state) {
      return null;
    }

    const toolName = toolPart.tool || 'unknown';
    if (isInternalStructuredOutputTool(toolName)) {
      return null;
    }

    const toolKind = this.host.getOpenCodeToolKind(toolName);

    return {
      toolId: toolPart.callID || toolPart.id || null,
      toolName,
      toolKind,
      toolInput: toolPart.state?.input || {},
      toolMetadata: extractRenderableToolMetadata(toolPart.state?.metadata),
      toolResultVisibility: resolveToolResultVisibility(toolName, toolKind),
      toolStatus: resolveToolExecutionStatus({
        toolName,
        state: toolPart.state,
      }),
      toolResult: resolveToolResultText(toolPart.state),
    };
  }

  private setStreamPartType(
    streamContext: OpenCodeStreamPartTypeState,
    partId: string,
    partType: string,
  ): void {
    if (streamContext instanceof OpenCodeStreamingRuntimeContext) {
      streamContext.setPartType(partId, partType);
      return;
    }

    if (!partId || !partType) {
      return;
    }

    streamContext.partTypeMap?.set(partId, partType);
  }

  private setStreamPartMessageId(
    streamContext: OpenCodeStreamPartTypeState,
    partId: string,
    messageId: string,
  ): void {
    if (streamContext instanceof OpenCodeStreamingRuntimeContext) {
      streamContext.setPartMessageId(partId, messageId);
      return;
    }

    if (!partId || !messageId) {
      return;
    }

    streamContext.partMessageIdMap?.set(partId, messageId);
  }

  private hasStreamPartType(
    streamContext: OpenCodeStreamPartTypeState,
    partId: string,
  ): boolean {
    if (streamContext instanceof OpenCodeStreamingRuntimeContext) {
      return streamContext.hasPartType(partId);
    }

    return streamContext.partTypeMap?.has(partId) ?? false;
  }

  private getStreamPartType(
    streamContext: OpenCodeStreamPartTypeState,
    partId: string,
  ): string | undefined {
    if (streamContext instanceof OpenCodeStreamingRuntimeContext) {
      return streamContext.getPartType(partId);
    }

    return streamContext.partTypeMap?.get(partId);
  }

  private getStreamPartMessageId(
    streamContext: OpenCodeStreamPartTypeState,
    partId: string,
  ): string | undefined {
    if (streamContext instanceof OpenCodeStreamingRuntimeContext) {
      return streamContext.getPartMessageId(partId);
    }

    return streamContext.partMessageIdMap?.get(partId);
  }

  private rememberStreamPartMetadata(
    streamContext: OpenCodeStreamPartTypeState,
    eventData: OpenCodeStreamEvent,
    part: OpenCodeStreamPart | undefined,
  ): void {
    if (!part?.id) {
      return;
    }

    const partType = part.type || 'text';
    this.setStreamPartType(streamContext, part.id, partType);

    const messageId = this.resolveExplicitMessageId(eventData, part);
    if (messageId) {
      this.setStreamPartMessageId(streamContext, part.id, messageId);
    }
  }

  private buildPartUpdatedMutations(
    part: OpenCodeStreamPart,
    eventData: OpenCodeStreamEvent,
    fallbackSessionId: string,
  ): OpenCodeStreamMutation[] {
    const sessionID = this.resolveStreamPartSessionId(eventData, fallbackSessionId);
    const messageID = this.resolveExplicitMessageId(eventData, part);
    if (!sessionID || !messageID) {
      return [];
    }

    const normalizedPart = {
      ...part,
      sessionID,
      messageID,
    } as Part;
    const mutations: OpenCodeStreamMutation[] = [
      this.buildStreamMessageMutation(sessionID, messageID, part.time?.start),
      {
        type: 'part.upserted',
        sessionID,
        messageID,
        partID: normalizedPart.id,
        part: normalizedPart,
      },
    ];

    if (this.shouldMarkPartCompleted(part)) {
      mutations.push({
        type: 'part.completed',
        sessionID,
        messageID,
        partID: normalizedPart.id,
      });
    }

    return mutations;
  }

  private buildStreamMessageMutation(
    sessionID: string,
    messageID: string,
    createdAt: number | undefined,
  ): OpenCodeStreamMutation {
    return {
      type: 'message.upserted',
      sessionID,
      messageID,
      role: 'assistant',
      createdAt,
    };
  }

  private shouldMarkPartCompleted(part: OpenCodeStreamPart): boolean {
    if (this.isReasoningPartType(part.type)) {
      return typeof part.time?.end === 'number';
    }

    if (part.type !== 'tool') {
      return false;
    }

    const toolStatus = resolveToolExecutionStatus({
      toolName: part.tool || 'unknown',
      state: part.state,
    });
    return toolStatus === 'completed' || toolStatus === 'error';
  }

  private resolveStreamPartSessionId(
    eventData: OpenCodeStreamEvent,
    fallbackSessionId: string,
  ): string {
    return eventData.properties?.part?.sessionID
      || eventData.properties?.sessionID
      || fallbackSessionId;
  }

  private resolveStreamPartMessageId(
    eventData: OpenCodeStreamEvent,
    streamContext: OpenCodeStreamPartTypeState,
    partId: string | undefined,
  ): string | undefined {
    return this.resolveExplicitMessageId(eventData, eventData.properties?.part)
      || eventData.properties?.messageID
      || (partId ? this.getStreamPartMessageId(streamContext, partId) : undefined);
  }

  private resolveExplicitMessageId(
    eventData: OpenCodeStreamEvent,
    part: OpenCodeStreamPart | undefined,
  ): string | undefined {
    return part?.messageID || eventData.properties?.messageID;
  }
}

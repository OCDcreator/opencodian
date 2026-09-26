/**
 * ZCodeStreamMapper — maps official ZCode `session/event` payloads onto the
 * existing backend-neutral `StreamChunk` contract.
 *
 * Only this module knows the ZCode event envelope. Ordering rules keep
 * partial output honest: `seq` de-duplicates late or replayed events, and a
 * turn streams through exactly one delta channel (`model.streaming` or
 * `part.delta`) so overlapping channels can never duplicate text. Unknown
 * event types degrade to no output instead of breaking the stream.
 */

import { getToolIdentity } from '../../../../shared/toolIdentity';
import type { ContextUsageSnapshot, StreamChunk } from '../../../types/chat';

/** Build a context snapshot only when the native readback has every required count. */
export function zCodeContextUsageFromReadback(
  sessionId: string,
  snapshot: unknown,
  usageValue: unknown,
): ContextUsageSnapshot | null {
  const projection = asRecord(asRecord(snapshot)['projection']);
  const usage = asRecord(usageValue);
  const values: Record<string, unknown> = { ...usage, contextWindow: projection['contextWindow'] };
  const required = ['contextWindow', 'totalTokens', 'inputTokens', 'outputTokens', 'reasoningTokens', 'cacheReadTokens'];
  if (required.some((key) => typeof values[key] !== 'number' || !Number.isFinite(values[key]))) return null;
  const messages = asRecord(snapshot)['messages'];
  const latestAssistant = Array.isArray(messages)
    ? [...messages].reverse().map((message) => asRecord(asRecord(message)['info']))
      .find((info) => info['role'] === 'assistant' && typeof asRecord(info['model'])['modelId'] === 'string')
    : undefined;
  const currentModel = asRecord(asRecord(asRecord(snapshot)['settings'])['model'])['current'];
  const model = asRecord(latestAssistant?.['model'] ?? currentModel);
  const providerId = typeof model['providerId'] === 'string' ? model['providerId'] : null;
  const modelId = typeof model['modelId'] === 'string' ? model['modelId'] : null;
  const now = Date.now();
  return {
    sessionId, sessionTitle: '', createdAt: now, updatedAt: now,
    providerId, providerName: providerId, modelId, modelName: modelId,
    contextWindow: values['contextWindow'] as number,
    totalTokens: values['totalTokens'] as number,
    inputTokens: values['inputTokens'] as number,
    outputTokens: values['outputTokens'] as number,
    reasoningTokens: values['reasoningTokens'] as number,
    cacheReadTokens: values['cacheReadTokens'] as number,
    cacheWriteTokens: typeof usage['cacheCreationTokens'] === 'number' ? usage['cacheCreationTokens'] as number : null,
    totalCost: null,
  };
}

/** Read usage and its matching session projection from the official protocol. */
export async function readZCodeContextUsage(
  sessionId: string,
  transport: { request(method: string, params: Record<string, unknown>): Promise<unknown> },
): Promise<ContextUsageSnapshot | null> {
  const snapshot = await transport.request('session/read', { sessionId });
  const usage = await transport.request('session/usage', { sessionId });
  return zCodeContextUsageFromReadback(sessionId, snapshot, usage);
}

/** Envelope of one `session/event` notification (params), validated loosely. */
export interface ZCodeSessionEvent {
  readonly type: string;
  readonly seq?: number;
  readonly turnId?: string;
  readonly sessionId?: string;
  readonly timestamp?: number;
  readonly payload: Record<string, unknown>;
}

/** True once a turn reached a terminal state through this mapper. */
export type ZCodeTurnOutcome = 'streaming' | 'completed' | 'failed';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Latest native final-message snapshot seen for the turn (context evidence). */
interface ZCodeFinalMessageSnapshot {
  readonly contextWindow: number;
  readonly usage: Record<string, unknown>;
  readonly stopReason: string;
  readonly timestamp: number | null;
}

export class ZCodeStreamMapper {
  private lastSeq = -1;
  /** Which delta channel owns this turn's partial output; null until the first delta. */
  private deltaChannel: 'model' | 'part' | null = null;
  private streamedText = false;
  private sawAssistantMessageId: string | null = null;
  private userMessageId: string | null = null;
  /** Final tool input by native toolCallId (from model.streaming tool_call). */
  private readonly toolInputs = new Map<string, Record<string, unknown>>();
  /** Native provider/model identity from model-request lifecycle payloads. */
  private lastModelRef: { providerId: string | null; modelId: string | null } | null = null;
  private lastFinalSnapshot: ZCodeFinalMessageSnapshot | null = null;

  outcome: ZCodeTurnOutcome = 'streaming';
  /** Set when a frame was dropped or ignored (late seq, duplicate channel, drift). */
  ignoredEventCount = 0;

  constructor(readonly sessionId: string) {}

  /** Native assistant message id seen in the stream, when the runtime reported one. */
  get assistantMessageId(): string | null {
    return this.sawAssistantMessageId;
  }

  /** Native user message id seen on turn start, when the runtime reported one. */
  get userMessageIdValue(): string | null {
    return this.userMessageId;
  }

  map(event: ZCodeSessionEvent): StreamChunk[] {
    if (this.outcome !== 'streaming') {
      // A late frame after the terminal boundary must not re-open the stream.
      this.ignoredEventCount += 1;
      return [];
    }
    if (typeof event.seq === 'number' && Number.isFinite(event.seq)) {
      if (event.seq <= this.lastSeq) {
        // Late or out-of-order delivery: drop honestly instead of duplicating.
        this.ignoredEventCount += 1;
        return [];
      }
      this.lastSeq = event.seq;
    }

    switch (event.type) {
      case 'turn.started':
        return this.mapTurnStarted(event.payload);
      case 'model.streaming':
        return this.mapModelStreaming(event.payload);
      case 'part.delta':
        return this.mapPartDelta(event.payload);
      case 'tool.updated':
        return this.mapToolUpdated(event.payload);
      case 'session.updated':
        return this.mapSessionUpdated(event.payload, event.timestamp);
      case 'turn.completed':
        return this.mapTurnCompleted(event.payload);
      case 'turn.failed':
        return this.mapTurnFailed(event.payload);
      default:
        // Known-but-later surfaces (permissions, titles, telemetry) and
        // unknown additive events stay invisible here instead of breaking.
        return [];
    }
  }

  private mapTurnStarted(payload: Record<string, unknown>): StreamChunk[] {
    const messageId = asString(payload['messageId']);
    if (messageId) {
      this.userMessageId = messageId;
    }
    return [{ type: 'message_start' }];
  }

  private mapModelStreaming(payload: Record<string, unknown>): StreamChunk[] {
    const kind = asString(payload['kind']);
    // Tool-call streaming kinds carry their own channel; text channel exclusivity
    // applies only to text/thinking deltas.
    if (kind === 'tool_input_delta') {
      const toolCallId = asString(payload['toolCallId']);
      const delta = asString(payload['delta']);
      if (!toolCallId || !delta) {
        this.ignoredEventCount += 1;
        return [];
      }
      return [{
        type: 'backend_event',
        source: 'zcode',
        event: 'tool_progress',
        id: toolCallId,
        content: delta,
        sessionId: this.sessionId,
      }];
    }
    if (kind === 'tool_call') {
      const toolCallId = asString(payload['toolCallId']);
      const input = payload['input'];
      if (toolCallId && input && typeof input === 'object' && !Array.isArray(input)) {
        this.toolInputs.set(toolCallId, asRecord(input));
      }
      return [];
    }
    const delta = asString(payload['delta']);
    if (!delta) {
      return [];
    }
    const assistantMessageId = asString(payload['assistantMessageId']);
    if (assistantMessageId) {
      this.sawAssistantMessageId = assistantMessageId;
    }
    if (this.deltaChannel === null) {
      this.deltaChannel = 'model';
    }
    if (this.deltaChannel !== 'model') {
      this.ignoredEventCount += 1;
      return [];
    }
    if (kind === 'text_delta') {
      this.streamedText = true;
      return [{ type: 'text', content: delta }];
    }
    if (kind === 'reasoning_delta') {
      return [{ type: 'thinking', content: delta }];
    }
    this.ignoredEventCount += 1;
    return [];
  }

  private mapPartDelta(payload: Record<string, unknown>): StreamChunk[] {
    const delta = asString(payload['delta']);
    if (!delta) {
      return [];
    }
    const field = asString(payload['field']);
    // Tool IO deltas (input/output) ride a dedicated progress channel keyed by
    // the stable native partId; they never touch the text delta exclusivity.
    if (field === 'input' || field === 'output') {
      const partId = asString(payload['partId']);
      return [{
        type: 'backend_event',
        source: 'zcode',
        event: 'tool_progress',
        ...(partId ? { id: partId } : {}),
        content: delta,
        metadata: { field },
        sessionId: this.sessionId,
      }];
    }
    if (this.deltaChannel === null) {
      this.deltaChannel = 'part';
    }
    if (this.deltaChannel !== 'part') {
      this.ignoredEventCount += 1;
      return [];
    }
    if (field === 'text') {
      this.streamedText = true;
      return [{ type: 'text', content: delta }];
    }
    if (field === 'reasoning') {
      return [{ type: 'thinking', content: delta }];
    }
    this.ignoredEventCount += 1;
    return [];
  }

  private mapToolUpdated(payload: Record<string, unknown>): StreamChunk[] {
    const kind = asString(payload['kind']);
    const toolCallId = asString(payload['toolCallId']);
    switch (kind) {
      case 'scheduled':
        return this.mapToolScheduled(payload, toolCallId);
      case 'started':
        return [{
          type: 'backend_event',
          source: 'zcode',
          event: 'tool_progress',
          id: toolCallId,
          name: asString(payload['toolName']),
          status: 'started',
          metadata: {
            startedAt: payload['startedAt'] ?? null,
            readOnly: payload['readOnly'] ?? null,
            sideEffectScope: asString(payload['sideEffectScope']),
          },
          sessionId: this.sessionId,
        }];
      case 'result':
        return this.mapToolResult(payload, toolCallId);
      case 'error':
        // The native runtime emits a separate error kind for failed tools.
        // Its error object may contain paths or other sensitive input, so the
        // chat card only exposes the terminal state here.
        return [
          { type: 'tool_result', toolUseId: toolCallId, content: 'ZCode tool failed.', isError: true },
          {
            type: 'backend_event',
            source: 'zcode',
            event: 'tool_progress',
            id: toolCallId,
            status: 'failed',
            sessionId: this.sessionId,
          },
        ];
      case 'batch':
        return [{
          type: 'backend_event',
          source: 'zcode',
          event: 'informational',
          name: 'tool.batch',
          metadata: {
            toolCallIds: payload['toolCallIds'] ?? [],
            successCount: payload['successCount'] ?? null,
            errorCount: payload['errorCount'] ?? null,
          },
          sessionId: this.sessionId,
        }];
      default:
        this.ignoredEventCount += 1;
        return [];
    }
  }

  private mapToolScheduled(payload: Record<string, unknown>, toolCallId: string): StreamChunk[] {
    const toolName = asString(payload['toolName']);
    const identity = getToolIdentity(toolName, { source: 'generic' });
    return [{
      type: 'tool_use',
      id: toolCallId,
      name: toolName,
      kind: identity.kind,
      input: this.toolInputs.get(toolCallId) ?? {},
      toolMetadata: {
        assistantMessageId: asString(payload['assistantMessageId']),
        dependencies: payload['dependencies'] ?? [],
        parallelGroupIndex: payload['parallelGroupIndex'] ?? null,
        canRunParallel: payload['canRunParallel'] ?? null,
        schedule: payload['schedule'] ?? null,
        inputByteLength: payload['inputByteLength'] ?? null,
        inputOmitted: payload['inputOmitted'] ?? null,
        inputRef: payload['inputRef'] ?? null,
      },
    }];
  }

  private mapToolResult(payload: Record<string, unknown>, toolCallId: string): StreamChunk[] {
    const result = asRecord(payload['result']);
    const success = result['success'] !== false;
    const perf = asRecord(result['perf']);
    return [
      {
        type: 'tool_result',
        toolUseId: toolCallId,
        content: asString(result['content']),
        ...(success ? {} : { isError: true }),
      },
      {
        type: 'backend_event',
        source: 'zcode',
        event: 'tool_progress',
        id: toolCallId,
        status: success ? 'completed' : 'failed',
        metadata: {
          duration: payload['duration'] ?? null,
          perfTotalMs: perf['totalMs'] ?? null,
          truncated: result['truncated'] ?? null,
          budgetStrategy: result['budgetStrategy'] ?? null,
        },
        sessionId: this.sessionId,
      },
    ];
  }

  private mapSessionUpdated(payload: Record<string, unknown>, timestamp?: number): StreamChunk[] {
    // Background-task tracking entries: stable native taskId attached to the
    // originating tool call; they inform, never overwrite, foreground status.
    if (typeof payload['taskId'] === 'string' && typeof payload['taskKind'] === 'string') {
      return [{
        type: 'backend_event',
        source: 'zcode',
        event: 'background_tasks_changed',
        sessionId: this.sessionId,
        metadata: {
          taskId: payload['taskId'],
          toolCallId: payload['toolCallId'] ?? null,
          toolName: payload['toolName'] ?? null,
          taskKind: payload['taskKind'],
          cancellable: payload['cancellable'] ?? null,
          command: payload['command'] ?? null,
          description: payload['description'] ?? null,
          status: payload['status'] ?? null,
          pid: payload['pid'] ?? null,
        },
      }];
    }
    // Model identity rides model-request lifecycle payloads (native evidence).
    if (typeof payload['providerId'] === 'string' && typeof payload['modelId'] === 'string') {
      this.lastModelRef = { providerId: payload['providerId'] as string, modelId: payload['modelId'] as string };
    }
    // Final-message snapshot = the context-usage evidence for this turn.
    if (typeof payload['contextWindow'] === 'number' && typeof payload['usage'] === 'object' && payload['usage'] !== null) {
      this.lastFinalSnapshot = {
        contextWindow: payload['contextWindow'] as number,
        usage: asRecord(payload['usage']),
        stopReason: asString(payload['stopReason']),
        timestamp: timestamp ?? null,
      };
    }
    return [];
  }

  private mapTurnCompleted(payload: Record<string, unknown>): StreamChunk[] {
    this.outcome = 'completed';
    const chunks: StreamChunk[] = [];
    const response = asString(payload['response']);
    if (response && !this.streamedText) {
      chunks.push({ type: 'text', content: response });
    }
    const usage = asRecord(payload['usage']);
    if (Object.keys(usage).length > 0) {
      const inputTokens = asFiniteNumber(usage['inputTokens']);
      const outputTokens = asFiniteNumber(usage['outputTokens']);
      const contextUsage = this.buildContextUsageChunk(usage);
      if (contextUsage) {
        chunks.push(contextUsage);
      }
      chunks.push({
        type: 'usage',
        sessionId: this.sessionId,
        inputTokens,
        outputTokens,
        billingUsage: {
          requestId: `${this.sessionId}:turn:${this.lastSeq}`,
          // Provider/model identity is not part of the turn usage payload;
          // unavailable fields stay absent instead of being fabricated.
          inputTokens,
          outputTokens,
          reasoningTokens: asFiniteNumber(usage['reasoningTokens']),
          cacheReadTokens: asFiniteNumber(usage['cacheReadTokens']),
          cacheWriteTokens: asFiniteNumber(usage['cacheWriteTokens']),
        },
      });
    }
    return chunks;
  }

  /**
   * Build the context_usage chunk strictly from native evidence (the final
   * message snapshot + model-request identity). No snapshot means unavailable:
   * no chunk, never a fabricated estimate.
   */
  private buildContextUsageChunk(turnUsage: Record<string, unknown>): StreamChunk | null {
    const snapshot = this.lastFinalSnapshot;
    if (!snapshot) {
      return null;
    }
    const snapUsage = snapshot.usage;
    const inputTokens = asFiniteNumber(snapUsage['inputTokens']);
    const outputTokens = asFiniteNumber(snapUsage['outputTokens']);
    const modelRef = this.lastModelRef;
    const usageSnapshot: ContextUsageSnapshot = {
      sessionId: this.sessionId,
      sessionTitle: '',
      createdAt: snapshot.timestamp ?? Date.now(),
      updatedAt: snapshot.timestamp ?? Date.now(),
      providerId: modelRef?.providerId ?? null,
      providerName: modelRef?.providerId ?? null,
      modelId: modelRef?.modelId ?? null,
      modelName: modelRef?.modelId ?? null,
      contextWindow: snapshot.contextWindow,
      totalTokens: asFiniteNumber(snapUsage['totalTokens']),
      inputTokens,
      outputTokens,
      reasoningTokens: asFiniteNumber(snapUsage['reasoningTokens']),
      cacheReadTokens: asFiniteNumber(snapUsage['cacheReadTokens']),
      cacheWriteTokens: asFiniteNumber(snapUsage['cacheWriteTokens']),
      // The backend never reports cost; null is the honest value, never $0.
      totalCost: null,
      billingUsage: {
        requestIds: [`${this.sessionId}:turn:${this.lastSeq}`],
        providerId: modelRef?.providerId ?? '',
        modelId: modelRef?.modelId ?? '',
        inputTokens: asFiniteNumber(turnUsage['inputTokens']),
        outputTokens: asFiniteNumber(turnUsage['outputTokens']),
        reasoningTokens: asFiniteNumber(turnUsage['reasoningTokens']),
        cacheReadTokens: asFiniteNumber(turnUsage['cacheReadTokens']),
        cacheWriteTokens: asFiniteNumber(turnUsage['cacheWriteTokens']),
      },
    };
    return { type: 'context_usage', snapshot: usageSnapshot };
  }

  private mapTurnFailed(payload: Record<string, unknown>): StreamChunk[] {
    this.outcome = 'failed';
    const error = asRecord(payload['error']);
    const message = asString(error['message']) || asString(error['code']) || 'ZCode turn failed.';
    return [{ type: 'error', content: message }];
  }
}

/** Normalize one `session/event` notification into the mapper's envelope. */
export function toZCodeSessionEvent(params: unknown): ZCodeSessionEvent | null {
  const record = asRecord(params);
  const type = record['type'];
  if (typeof type !== 'string' || type.length === 0) {
    return null;
  }
  const seq = record['seq'];
  const timestamp = record['timestamp'];
  return {
    type,
    ...(typeof seq === 'number' && Number.isFinite(seq) ? { seq } : {}),
    ...(typeof record['turnId'] === 'string' ? { turnId: record['turnId'] } : {}),
    ...(typeof record['sessionId'] === 'string' ? { sessionId: record['sessionId'] } : {}),
    ...(typeof timestamp === 'number' && Number.isFinite(timestamp) ? { timestamp } : {}),
    payload: asRecord(record['payload']),
  };
}

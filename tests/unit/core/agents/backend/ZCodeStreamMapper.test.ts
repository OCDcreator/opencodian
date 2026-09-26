/**
 * ZCodeStreamMapper.test.ts — stream mapping, ordering and de-duplication.
 *
 * Failure-path focused: late/out-of-order events must never duplicate partial
 * output, overlapping delta channels are exclusive per turn, and terminal
 * boundaries (usage, error) map without fabrication.
 */
import { describe, expect, it } from '@jest/globals';

import {
  toZCodeSessionEvent,
  zCodeContextUsageFromReadback,
  ZCodeStreamMapper,
} from '../../../../../src/core/agents/backend/zcode/ZCodeStreamMapper';

function event(type: string, seq: number, payload: Record<string, unknown>, sessionId = 'sess_a') {
  return { type, seq, sessionId, payload };
}

describe('ZCodeStreamMapper — deltas and ordering', () => {
  it('maps turn start and model streaming deltas', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    expect(mapper.map(event('turn.started', 1, { messageId: 'u1' }))).toEqual([{ type: 'message_start' }]);
    expect(mapper.map(event('model.streaming', 2, { delta: 'Hel', kind: 'text_delta', assistantMessageId: 'a1' })))
      .toEqual([{ type: 'text', content: 'Hel' }]);
    expect(mapper.map(event('model.streaming', 3, { delta: 'lo', kind: 'text_delta', assistantMessageId: 'a1' })))
      .toEqual([{ type: 'text', content: 'lo' }]);
    expect(mapper.map(event('model.streaming', 4, { delta: 'think', kind: 'reasoning_delta' })))
      .toEqual([{ type: 'thinking', content: 'think' }]);
    expect(mapper.assistantMessageId).toBe('a1');
    expect(mapper.userMessageIdValue).toBe('u1');
  });

  it('drops late or out-of-order seq without duplicating output', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    mapper.map(event('model.streaming', 5, { delta: 'first', kind: 'text_delta' }));
    const late = mapper.map(event('model.streaming', 3, { delta: 'dup', kind: 'text_delta' }));
    expect(late).toEqual([]);
    expect(mapper.ignoredEventCount).toBe(1);
  });

  it('keeps overlapping delta channels exclusive per turn (no duplicated text)', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    mapper.map(event('model.streaming', 1, { delta: 'model', kind: 'text_delta' }));
    const overlap = mapper.map(event('part.delta', 2, { delta: 'part', field: 'text', messageId: 'm', partId: 'p' }));
    expect(overlap).toEqual([]);
    expect(mapper.ignoredEventCount).toBe(1);
  });

  it('streams through the part channel when it is the only delta source', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    expect(mapper.map(event('part.delta', 1, { delta: 'abc', field: 'text', messageId: 'm', partId: 'p' })))
      .toEqual([{ type: 'text', content: 'abc' }]);
    expect(mapper.map(event('part.delta', 2, { delta: 'why', field: 'reasoning', messageId: 'm', partId: 'r' })))
      .toEqual([{ type: 'thinking', content: 'why' }]);
    // Tool IO deltas ride the dedicated tool-progress channel (ticket 05).
    expect(mapper.map(event('part.delta', 3, { delta: '{}', field: 'input', messageId: 'm', partId: 't' })))
      .toEqual([{
        type: 'backend_event',
        source: 'zcode',
        event: 'tool_progress',
        id: 't',
        content: '{}',
        metadata: { field: 'input' },
        sessionId: 'sess_a',
      }]);
  });
});

describe('ZCodeStreamMapper — terminal boundaries', () => {
  it('maps turn completion to usage without echoing already streamed text', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    mapper.map(event('model.streaming', 1, { delta: 'OK', kind: 'text_delta' }));
    const chunks = mapper.map(event('turn.completed', 2, {
      response: 'OK',
      tokenCount: 17168,
      usage: {
        source: 'provider', inputTokens: 17151, outputTokens: 17, totalTokens: 17168,
        cacheReadTokens: 10240, cacheWriteTokens: 0, reasoningTokens: 14,
      },
      toolCallCount: 0, duration: 3746, resultType: 'success',
    }));
    expect(mapper.outcome).toBe('completed');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      type: 'usage',
      sessionId: 'sess_a',
      inputTokens: 17151,
      outputTokens: 17,
      billingUsage: { inputTokens: 17151, outputTokens: 17, reasoningTokens: 14, cacheReadTokens: 10240, cacheWriteTokens: 0 },
    });
  });

  it('falls back to the final response when no delta ever streamed', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    const chunks = mapper.map(event('turn.completed', 1, {
      response: 'final text', usage: { inputTokens: 1, outputTokens: 2 }, tokenCount: 3,
    }));
    expect(chunks[0]).toEqual({ type: 'text', content: 'final text' });
    expect(chunks[1]).toMatchObject({ type: 'usage', inputTokens: 1, outputTokens: 2 });
  });

  it('maps structured turn failures to a scoped error chunk', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    const chunks = mapper.map(event('turn.failed', 1, {
      error: { type: 'unknown_error', message: 'Upstream request failed: Model is unavailable.' },
      turnPhase: 'stream',
    }));
    expect(chunks).toEqual([{ type: 'error', content: 'Upstream request failed: Model is unavailable.' }]);
    expect(mapper.outcome).toBe('failed');
  });

  it('ignores everything after a terminal boundary (late events cannot re-open the stream)', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    mapper.map(event('turn.completed', 1, { response: 'done', usage: {} }));
    expect(mapper.map(event('model.streaming', 2, { delta: 'late', kind: 'text_delta' }))).toEqual([]);
    expect(mapper.map(event('turn.failed', 3, { error: { message: 'late failure' } }))).toEqual([]);
    expect(mapper.ignoredEventCount).toBe(2);
    expect(mapper.outcome).toBe('completed');
  });

  it('tolerates unknown and metadata-only event types without output', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    expect(mapper.map(event('session.titleUpdated', 1, { title: 'x' }))).toEqual([]);
    expect(mapper.map(event('future.unknown', 2, {}))).toEqual([]);
    expect(mapper.map(event('model.streaming', 3, { delta: 'x', kind: 'future_kind' }))).toEqual([]);
  });
});

describe('ZCode native context readback', () => {
  it('attributes usage to the last assistant model instead of an unsent model selection', () => {
    const snapshot = {
      projection: { contextWindow: 200000 },
      settings: { model: { current: { providerId: 'krill', modelId: 'gpt-6-sol' } } },
      messages: [{ info: { role: 'assistant', model: { providerId: 'opencode-go', modelId: 'gpt-5.6-luna' } } }],
    };
    const usage = { totalTokens: 100, inputTokens: 80, outputTokens: 20, reasoningTokens: 5, cacheReadTokens: 0 };

    expect(zCodeContextUsageFromReadback('zcode-session', snapshot, usage)).toMatchObject({
      providerId: 'opencode-go',
      modelId: 'gpt-5.6-luna',
      totalTokens: 100,
    });
  });
});

describe('toZCodeSessionEvent', () => {
  it('normalizes envelopes and rejects frames without a type', () => {
    expect(toZCodeSessionEvent({ type: 'turn.started', seq: 4, sessionId: 's', turnId: 't', payload: { a: 1 } }))
      .toEqual({ type: 'turn.started', seq: 4, sessionId: 's', turnId: 't', payload: { a: 1 } });
    expect(toZCodeSessionEvent({ seq: 1 })).toBeNull();
    expect(toZCodeSessionEvent('junk')).toBeNull();
  });
});

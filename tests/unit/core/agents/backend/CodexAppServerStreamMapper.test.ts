import {
  type AppServerStreamState,
  mapAppServerNotification,
} from '../../../../../src/core/agents/backend/codex/CodexAppServerStreamMapper';

function streamState(): AppServerStreamState {
  return {
    streamedAgentMessageItemIds: new Set(),
    streamedReasoningItemIds: new Set(),
    streamedReasoningSummaryItemIds: new Set(),
    startedTodoItemIds: new Set(),
    outputSchema: undefined,
  };
}

function map(
  method: string,
  params: Record<string, unknown>,
  overrides: { threadId?: string; sessionId?: string } = {},
) {
  return mapAppServerNotification({
    event: { method, params },
    modelId: 'gpt-5.3-codex',
    sessionId: overrides.sessionId ?? 'session-1',
    threadId: overrides.threadId ?? 'thread-1',
    streamState: streamState(),
  });
}

describe('Codex native user item identity', () => {
  it('retains cumulative usage separately from the latest model context occupancy', () => {
    const result = map('thread/tokenUsage/updated', { threadId: 'thread-1', tokenUsage: {
      total: { totalTokens: 90000, inputTokens: 80000, outputTokens: 10000 },
      last: { totalTokens: 12000 }, modelContextWindow: 200000,
    } });
    expect(result.contextUsageSnapshot?.totalTokens).toBe(90000);
    expect(result.contextUsageSnapshot?.currentContext).toEqual({ tokens: 12000, window: 200000 });
    expect(map('thread/tokenUsage/updated', { tokenUsage: { total: { totalTokens: 90000 }, modelContextWindow: 200000 } })
      .contextUsageSnapshot?.currentContext).toBeUndefined();
  });
  it('keeps a willRetry notification nonterminal and preserves a definitive error', () => {
    const params = { error: { message: 'Reconnecting... 1/5' }, willRetry: true, threadId: 'thread-1', turnId: 'turn-1' };
    expect(map('error', params).chunks).toEqual([{ type: 'backend_event', source: 'codex', event: 'informational', status: 'retrying', content: 'Reconnecting... 1/5', metadata: { willRetry: true } }]);
    expect(map('error', { ...params, willRetry: false }).chunks).toEqual([{ type: 'error', content: 'Reconnecting... 1/5' }]);
  });
  it('emits the completed native item ID with its owning turn, never a text-derived identity', () => {
    const params = { threadId: 'thread-1', turnId: 'turn-2', item: { type: 'userMessage', id: 'native-user-2', content: [{ type: 'text', text: 'same text' }] } };
    expect(map('item/started', params).chunks).toEqual([]);
    expect(map('item/completed', params).chunks).toEqual([{ type: 'user_message_identity', uuid: 'native-user-2', sessionId: 'thread-1', sourceTurnId: 'turn-2' }]);
    expect(map('item/completed', { ...params, turnId: undefined }).chunks).toEqual([]);
    expect(map('item/completed', { ...params, item: { ...params.item, id: '' } }).chunks).toEqual([]);
  });
});

describe('CodexAppServerStreamMapper imageGeneration items', () => {
  it('emits an image-kind tool_use while the item is running', () => {
    const { chunks } = map('item/started', {
      item: { id: 'img-1', type: 'imageGeneration', status: 'in_progress', result: '' },
    });
    expect(chunks).toEqual([{
      type: 'tool_use',
      id: 'img-1',
      name: 'image_generation',
      kind: 'image',
      input: { status: 'in_progress' },
    }]);
  });

  it('maps a completed b64 result to a PNG data URL tool_result with the revised prompt', () => {
    const b64 = 'iVBORw0KGgo' + 'A'.repeat(300);
    const { chunks } = map('item/completed', {
      item: {
        id: 'img-1',
        type: 'imageGeneration',
        status: 'completed',
        result: b64,
        revisedPrompt: 'a lighthouse at dusk',
      },
    });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      type: 'tool_use',
      id: 'img-1',
      name: 'image_generation',
      kind: 'image',
      input: { status: 'completed', revisedPrompt: 'a lighthouse at dusk' },
    });
    expect(chunks[1]).toEqual({
      type: 'tool_result',
      toolUseId: 'img-1',
      content: `data:image/png;base64,${b64}`,
    });
  });

  it('detects jpeg payloads from magic bytes', () => {
    const b64 = '/9j/' + 'B'.repeat(300);
    const { chunks } = map('item/completed', {
      item: { id: 'img-2', type: 'imageGeneration', status: 'completed', result: b64 },
    });
    expect(chunks[1]).toEqual({
      type: 'tool_result',
      toolUseId: 'img-2',
      content: `data:image/jpeg;base64,${b64}`,
    });
  });

  it('prefers the savedPath when result is empty', () => {
    const { chunks } = map('item/completed', {
      item: {
        id: 'img-3',
        type: 'imageGeneration',
        status: 'completed',
        result: '',
        savedPath: '/tmp/out/image.png',
      },
    });
    expect(chunks[1]).toEqual({
      type: 'tool_result',
      toolUseId: 'img-3',
      content: '/tmp/out/image.png',
    });
  });

  it('passes through an explicit data URL result untouched', () => {
    const { chunks } = map('item/completed', {
      item: {
        id: 'img-4',
        type: 'imageGeneration',
        status: 'completed',
        result: 'data:image/webp;base64,UklGR',
      },
    });
    expect(chunks[1]).toEqual({
      type: 'tool_result',
      toolUseId: 'img-4',
      content: 'data:image/webp;base64,UklGR',
    });
  });

  it('emits an error tool_result plus an error chunk for usageLimitExceeded failures', () => {
    const { chunks } = map('item/completed', {
      item: {
        id: 'img-5',
        type: 'imageGeneration',
        status: 'failed',
        result: '',
        failure: { type: 'usageLimitExceeded', limitId: 'weekly', resetsAt: 1893456000000 },
      },
    });
    expect(chunks[0]).toEqual({
      type: 'tool_use',
      id: 'img-5',
      name: 'image_generation',
      kind: 'image',
      input: { status: 'failed' },
    });
    expect(chunks[1]).toEqual({
      type: 'tool_result',
      toolUseId: 'img-5',
      content: expect.stringContaining('usage limit exceeded (weekly)'),
      isError: true,
    });
    expect(chunks[2]).toEqual({
      type: 'error',
      content: expect.stringContaining('usage limit exceeded (weekly)'),
    });
  });

  it('handles the ResponseItem snake_case spelling with revised_prompt', () => {
    const { chunks } = map('item/started', {
      item: { id: 'img-6', type: 'image_generation_call', status: 'in_progress', result: '', revised_prompt: 'prompt v2' },
    });
    expect(chunks).toEqual([{
      type: 'tool_use',
      id: 'img-6',
      name: 'image_generation',
      kind: 'image',
      input: { status: 'in_progress', revisedPrompt: 'prompt v2' },
    }]);
  });

  it('ignores image items without an id', () => {
    expect(map('item/started', {
      item: { type: 'imageGeneration', status: 'in_progress', result: '' },
    }).chunks).toEqual([]);
  });
});

describe('CodexAppServerStreamMapper subAgentActivity items', () => {
  it('keys the task card by agentThreadId and merges activity kinds', () => {
    const { chunks } = map('item/started', {
      item: { id: 'act-1', type: 'subAgentActivity', kind: 'started', agentThreadId: 'sub-9', agentPath: 'explorer' },
    });
    expect(chunks).toEqual([{
      type: 'tool_use',
      id: 'sub-9',
      name: 'task',
      kind: 'task',
      input: { subagent_type: 'explorer', description: 'started' },
      toolMetadata: { agentThreadId: 'sub-9', agentPath: 'explorer' },
    }]);
  });

  it('emits a completion tool_result keyed to the same agentThreadId', () => {
    const { chunks } = map('item/completed', {
      item: { id: 'act-2', type: 'subAgentActivity', kind: 'completed', agentThreadId: 'sub-9', agentPath: 'explorer' },
    });
    expect(chunks[0].type).toBe('tool_use');
    expect(chunks[1]).toEqual({
      type: 'tool_result',
      toolUseId: 'sub-9',
      content: 'Subagent explorer completed',
      isError: false,
    });
  });

  it('marks interrupted subagents as errored tool results', () => {
    const { chunks } = map('item/completed', {
      item: { id: 'act-3', type: 'subAgentActivity', kind: 'interrupted', agentThreadId: 'sub-9', agentPath: 'explorer' },
    });
    expect(chunks[1]).toEqual({
      type: 'tool_result',
      toolUseId: 'sub-9',
      content: 'Subagent explorer interrupted',
      isError: true,
    });
  });

  it('emits only the card update for interacted activity', () => {
    const { chunks } = map('item/started', {
      item: { id: 'act-4', type: 'subAgentActivity', kind: 'interacted', agentThreadId: 'sub-9', agentPath: 'explorer' },
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('tool_use');
  });

  it('ignores unknown activity kinds', () => {
    expect(map('item/started', {
      item: { id: 'act-5', type: 'subAgentActivity', kind: 'warped', agentThreadId: 'sub-9', agentPath: 'explorer' },
    }).chunks).toEqual([]);
  });
});

describe('CodexAppServerStreamMapper thread lifecycle notifications', () => {
  it('surfaces thread/name/updated as a thread_renamed backend event', () => {
    const { chunks } = map('thread/name/updated', { threadId: 'thread-1', threadName: 'New title' });
    expect(chunks).toEqual([{
      type: 'backend_event',
      source: 'codex',
      event: 'thread_renamed',
      content: 'New title',
      metadata: { threadName: 'New title' },
      sessionId: 'session-1',
    }]);
  });

  it('tolerates a cleared thread name', () => {
    const { chunks } = map('thread/name/updated', { threadId: 'thread-1' });
    expect(chunks).toEqual([{
      type: 'backend_event',
      source: 'codex',
      event: 'thread_renamed',
      content: '',
      metadata: { threadName: null },
      sessionId: 'session-1',
    }]);
  });

  it('ignores notifications for a different thread', () => {
    expect(map('thread/name/updated', { threadId: 'other', threadName: 'X' }).chunks).toEqual([]);
    expect(map('thread/goal/cleared', { threadId: 'other' }).chunks).toEqual([]);
    expect(map('thread/deleted', { threadId: 'other' }).chunks).toEqual([]);
  });

  it('surfaces thread/goal/updated with the goal payload', () => {
    const goal = { threadId: 'thread-1', objective: 'finish refactor', status: 'active', tokensUsed: 12 };
    const { chunks } = map('thread/goal/updated', { threadId: 'thread-1', goal });
    expect(chunks).toEqual([{
      type: 'backend_event',
      source: 'codex',
      event: 'goal_updated',
      metadata: { goal },
      sessionId: 'session-1',
    }]);
  });

  it('surfaces thread/goal/cleared', () => {
    const { chunks } = map('thread/goal/cleared', { threadId: 'thread-1' });
    expect(chunks).toEqual([{
      type: 'backend_event',
      source: 'codex',
      event: 'goal_cleared',
      sessionId: 'session-1',
    }]);
  });

  it('surfaces thread/deleted as an error notice plus a backend event seam', () => {
    const { chunks } = map('thread/deleted', { threadId: 'thread-1' });
    expect(chunks).toEqual([
      {
        type: 'backend_event',
        source: 'codex',
        event: 'thread_deleted',
        sessionId: 'session-1',
      },
      { type: 'error', content: 'Codex thread was deleted on the server.' },
    ]);
  });

  it('surfaces deprecationNotice with summary and details', () => {
    const { chunks } = map('deprecationNotice', { summary: 'turn/steer is deprecated', details: 'use item/steer' });
    expect(chunks).toEqual([{
      type: 'backend_event',
      source: 'codex',
      event: 'deprecation_notice',
      content: 'turn/steer is deprecated',
      metadata: { details: 'use item/steer' },
      sessionId: 'session-1',
    }]);
  });

  it('ignores deprecationNotice without a summary', () => {
    expect(map('deprecationNotice', { details: 'orphan' }).chunks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Codex 0.169.0 reasoning summary streaming + native turn diff seam
//
// Upstream payloads (app-server-protocol v2, item.rs / turn.rs):
//   item/reasoning/summaryTextDelta { threadId, turnId, itemId, delta, summaryIndex }
//   item/reasoning/summaryPartAdded { threadId, turnId, itemId, summaryIndex }
//   item/reasoning/textDelta        { threadId, turnId, itemId, delta, contentIndex }
//   turn/diff/updated               { threadId, turnId, diff }
// ---------------------------------------------------------------------------

describe('CodexAppServerStreamMapper reasoning summary streaming', () => {
  it('maps summaryTextDelta deltas to thinking chunks segmented per summary part', () => {
    const state = streamState();
    const first = mapAppServerNotification({
      event: { method: 'item/reasoning/summaryTextDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', delta: 'step one', summaryIndex: 0 } },
      modelId: 'gpt-5.3-codex', sessionId: 'session-1', threadId: 'thread-1', streamState: state,
    });
    const second = mapAppServerNotification({
      event: { method: 'item/reasoning/summaryTextDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', delta: 'step two', summaryIndex: 1 } },
      modelId: 'gpt-5.3-codex', sessionId: 'session-1', threadId: 'thread-1', streamState: state,
    });
    expect(first.chunks).toEqual([{ type: 'thinking', content: 'step one', partId: 'rs-1:s0' }]);
    expect(second.chunks).toEqual([{ type: 'thinking', content: 'step two', partId: 'rs-1:s1' }]);
    expect(state.streamedReasoningSummaryItemIds.has('rs-1')).toBe(true);
  });

  it('maps summaryPartAdded to no chunk (no content; per-part partIds segment the render)', () => {
    expect(map('item/reasoning/summaryPartAdded', { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', summaryIndex: 1 }).chunks).toEqual([]);
  });

  it('never replays the completed reasoning item full raw content after summary deltas streamed', () => {
    const state = streamState();
    mapAppServerNotification({
      event: { method: 'item/reasoning/summaryTextDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', delta: 'summary only', summaryIndex: 0 } },
      modelId: 'gpt-5.3-codex', sessionId: 'session-1', threadId: 'thread-1', streamState: state,
    });
    const completed = mapAppServerNotification({
      event: { method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'rs-1', type: 'reasoning', content: ['raw', 'thinking'], summary: ['summary only'] } } },
      modelId: 'gpt-5.3-codex', sessionId: 'session-1', threadId: 'thread-1', streamState: state,
    });
    expect(completed.chunks).toEqual([]);
  });

  it('drops raw textDelta once summary deltas streamed for the same item (first flavor wins)', () => {
    const state = streamState();
    mapAppServerNotification({
      event: { method: 'item/reasoning/summaryTextDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', delta: 'summary', summaryIndex: 0 } },
      modelId: 'gpt-5.3-codex', sessionId: 'session-1', threadId: 'thread-1', streamState: state,
    });
    const raw = mapAppServerNotification({
      event: { method: 'item/reasoning/textDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', delta: 'raw duplicate', contentIndex: 0 } },
      modelId: 'gpt-5.3-codex', sessionId: 'session-1', threadId: 'thread-1', streamState: state,
    });
    expect(raw.chunks).toEqual([]);
  });

  it('drops summary deltas once raw textDelta streamed for the same item', () => {
    const state = streamState();
    mapAppServerNotification({
      event: { method: 'item/reasoning/textDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', delta: 'raw first', contentIndex: 0 } },
      modelId: 'gpt-5.3-codex', sessionId: 'session-1', threadId: 'thread-1', streamState: state,
    });
    const summary = mapAppServerNotification({
      event: { method: 'item/reasoning/summaryTextDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', delta: 'summary duplicate', summaryIndex: 0 } },
      modelId: 'gpt-5.3-codex', sessionId: 'session-1', threadId: 'thread-1', streamState: state,
    });
    expect(summary.chunks).toEqual([]);
    expect(state.streamedReasoningSummaryItemIds.has('rs-1')).toBe(false);
  });

  it('keeps the legacy full-content emission when neither delta flavor streamed', () => {
    const completed = map('item/completed', { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'rs-legacy', type: 'reasoning', content: ['a', 'b'] } });
    expect(completed.chunks).toEqual([{ type: 'thinking', content: 'ab', partId: 'rs-legacy' }]);
  });

  it('ignores malformed summary deltas (non-string delta)', () => {
    expect(map('item/reasoning/summaryTextDelta', { threadId: 'thread-1', itemId: 'rs-1', delta: 42 }).chunks).toEqual([]);
  });
});

describe('CodexAppServerStreamMapper native turn diff seam', () => {
  it('maps turn/diff/updated to no chunk: Turn Change Records stay chat-owned from file_edited', () => {
    const result = map('turn/diff/updated', { threadId: 'thread-1', turnId: 'turn-1', diff: '--- a\n+++ b\n' });
    expect(result.chunks).toEqual([]);
    expect(result.contextUsageSnapshot).toBeUndefined();
  });
});

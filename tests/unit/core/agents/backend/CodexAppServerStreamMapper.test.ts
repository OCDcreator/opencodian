import {
  type AppServerStreamState,
  mapAppServerNotification,
} from '../../../../../src/core/agents/backend/CodexAppServerStreamMapper';

function streamState(): AppServerStreamState {
  return {
    streamedAgentMessageItemIds: new Set(),
    streamedReasoningItemIds: new Set(),
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

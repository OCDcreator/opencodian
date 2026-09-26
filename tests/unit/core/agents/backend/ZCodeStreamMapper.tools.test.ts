/**
 * ZCodeStreamMapper.tools.test.ts — tool, background, subagent and usage
 * mapping (ticket 05).
 *
 * Tool calls keep streaming input, result, error and duration data;
 * background tasks attach to the originating turn without touching foreground
 * status; context usage emits only from native evidence; failures render as
 * terminal states. Tool-IO part deltas ride their own progress channel and
 * never break text deduplication.
 */
import { describe, expect, it } from '@jest/globals';

import { ZCodeStreamMapper } from '../../../../../src/core/agents/backend/zcode/ZCodeStreamMapper';

function event(type: string, seq: number, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { type, seq, sessionId: 'sess_a', payload, ...extra };
}

describe('ZCodeStreamMapper — tool calls', () => {
  it('preserves streaming tool input and maps scheduled calls with identity and metadata', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    expect(mapper.map(event('model.streaming', 1, {
      kind: 'tool_input_delta',
      toolCallId: 'call_1',
      delta: '{"command": "ls"}',
    }))).toEqual([{
      type: 'backend_event',
      source: 'zcode',
      event: 'tool_progress',
      id: 'call_1',
      content: '{"command": "ls"}',
      sessionId: 'sess_a',
    }]);
    expect(mapper.map(event('model.streaming', 2, {
      kind: 'tool_call',
      toolCallId: 'call_1',
      delta: '',
      input: { command: 'ls', description: 'List files' },
    }))).toEqual([]);

    const scheduled = mapper.map(event('tool.updated', 3, {
      kind: 'scheduled',
      toolCallId: 'call_1',
      assistantMessageId: 'msg_1',
      toolName: 'Bash',
      dependencies: [],
      parallelGroupIndex: 0,
      canRunParallel: false,
      schedule: { parallelGroups: [['call_1']] },
      inputByteLength: 16,
      inputOmitted: false,
      inputRef: null,
    }));
    expect(scheduled).toEqual([{
      type: 'tool_use',
      id: 'call_1',
      name: 'Bash',
      kind: 'builtin',
      input: { command: 'ls', description: 'List files' },
      toolMetadata: {
        assistantMessageId: 'msg_1',
        dependencies: [],
        parallelGroupIndex: 0,
        canRunParallel: false,
        schedule: { parallelGroups: [['call_1']] },
        inputByteLength: 16,
        inputOmitted: false,
        inputRef: null,
      },
    }]);
  });

  it('maps started progress and successful results with duration and perf evidence', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    expect(mapper.map(event('tool.updated', 1, {
      kind: 'started',
      toolCallId: 'call_1',
      toolName: 'Read',
      startedAt: 1000,
      readOnly: true,
      sideEffectScope: 'none',
    }))).toEqual([{
      type: 'backend_event',
      source: 'zcode',
      event: 'tool_progress',
      id: 'call_1',
      name: 'Read',
      status: 'started',
      metadata: { startedAt: 1000, readOnly: true, sideEffectScope: 'none' },
      sessionId: 'sess_a',
    }]);

    const result = mapper.map(event('tool.updated', 2, {
      kind: 'result',
      toolCallId: 'call_1',
      result: {
        success: true,
        content: 'hello zcode',
        perf: { totalMs: 26 },
        truncated: false,
        budgetStrategy: 'truncate',
      },
      duration: 23,
    }));
    expect(result).toEqual([
      { type: 'tool_result', toolUseId: 'call_1', content: 'hello zcode' },
      {
        type: 'backend_event',
        source: 'zcode',
        event: 'tool_progress',
        id: 'call_1',
        status: 'completed',
        metadata: { duration: 23, perfTotalMs: 26, truncated: false, budgetStrategy: 'truncate' },
        sessionId: 'sess_a',
      },
    ]);
  });

  it('renders tool failures as terminal error states, not spinners', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    const result = mapper.map(event('tool.updated', 1, {
      kind: 'result',
      toolCallId: 'call_1',
      result: { success: false, content: 'ENOENT: no such file' },
      duration: 5,
    }));
    expect(result[0]).toEqual({ type: 'tool_result', toolUseId: 'call_1', content: 'ENOENT: no such file', isError: true });
    expect(result[1]).toMatchObject({ type: 'backend_event', event: 'tool_progress', status: 'failed' });
  });

  it('maps the native tool.updated error kind to a terminal card without exposing error details', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    const result = mapper.map(event('tool.updated', 1, {
      kind: 'error',
      toolCallId: 'call_1',
      error: { type: 'tool_error', message: 'File does not exist in /private/vault', stack: 'secret stack' },
    }));
    expect(result).toEqual([
      { type: 'tool_result', toolUseId: 'call_1', content: 'ZCode tool failed.', isError: true },
      { type: 'backend_event', source: 'zcode', event: 'tool_progress', id: 'call_1', status: 'failed', sessionId: 'sess_a' },
    ]);
  });

  it('maps batch bookkeeping as informational and tolerates unknown tool kinds', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    expect(mapper.map(event('tool.updated', 1, {
      kind: 'batch',
      toolCallIds: ['call_1', 'call_2'],
      successCount: 1,
      errorCount: 1,
    }))).toEqual([{
      type: 'backend_event',
      source: 'zcode',
      event: 'informational',
      name: 'tool.batch',
      metadata: { toolCallIds: ['call_1', 'call_2'], successCount: 1, errorCount: 1 },
      sessionId: 'sess_a',
    }]);
    expect(mapper.map(event('tool.updated', 2, { kind: 'future.kind', toolCallId: 'call_3' }))).toEqual([]);
    expect(mapper.ignoredEventCount).toBe(1);
  });

  it('routes tool IO part deltas to their own progress channel without breaking text dedup', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    expect(mapper.map(event('part.delta', 1, { messageId: 'm', partId: 'part_tool_1', field: 'input', delta: '{"a":1}' })))
      .toEqual([{
        type: 'backend_event',
        source: 'zcode',
        event: 'tool_progress',
        id: 'part_tool_1',
        content: '{"a":1}',
        metadata: { field: 'input' },
        sessionId: 'sess_a',
      }]);
    // Text deltas on the same turn still flow through the text channel normally.
    expect(mapper.map(event('part.delta', 2, { messageId: 'm', partId: 'part_text_1', field: 'text', delta: 'hello' })))
      .toEqual([{ type: 'text', content: 'hello' }]);
  });
});

describe('ZCodeStreamMapper — background tasks and subagent linkage', () => {
  it('attaches background tasks with stable task ids and never emits a foreground-status overwrite', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    const running = mapper.map(event('session.updated', 1, {
      taskId: 'exec_abc123',
      toolCallId: 'call_bg1',
      toolName: 'Bash',
      taskKind: 'bash',
      cancellable: true,
      command: 'sleep 2 && echo done',
      description: 'Run sleep in background',
      status: 'running',
    }));
    expect(running).toEqual([{
      type: 'backend_event',
      source: 'zcode',
      event: 'background_tasks_changed',
      sessionId: 'sess_a',
      metadata: expect.objectContaining({
        taskId: 'exec_abc123',
        toolCallId: 'call_bg1',
        taskKind: 'bash',
        status: 'running',
      }),
    }]);
    const completed = mapper.map(event('session.updated', 2, {
      taskId: 'exec_abc123',
      toolCallId: 'call_bg1',
      taskKind: 'bash',
      status: 'completed',
      pid: 1234,
    }));
    expect(completed[0]).toMatchObject({ metadata: expect.objectContaining({ taskId: 'exec_abc123', status: 'completed' }) });
    // No chunk here carries any foreground/session status field by construction.
    expect(JSON.stringify([...running, ...completed])).not.toContain('session.status');
  });
});

describe('ZCodeStreamMapper — usage and context evidence', () => {
  it('emits context_usage only from native snapshot evidence, with honest null cost', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    mapper.map(event('session.updated', 1, { providerId: 'opencode-go', modelId: 'mimo-v2.6-pro', baseURL: 'http://x' }));
    mapper.map(event('session.updated', 2, {
      content: 'done',
      contextWindow: 1048576,
      stopReason: 'stop',
      usage: { inputTokens: 17689, outputTokens: 37, totalTokens: 17726, cacheReadTokens: 10240, reasoningTokens: 14 },
      cacheHit: { latestHitRate: 0.59 },
    }, { timestamp: 424242 }));
    const chunks = mapper.map(event('turn.completed', 3, {
      response: 'done',
      tokenCount: 17726,
      usage: { source: 'provider', inputTokens: 17689, outputTokens: 37, totalTokens: 17726, cacheReadTokens: 10240, cacheWriteTokens: 0, reasoningTokens: 14 },
    }));
    const contextUsage = chunks.find((chunk) => chunk.type === 'context_usage');
    expect(contextUsage).toMatchObject({
      type: 'context_usage',
      snapshot: {
        sessionId: 'sess_a',
        providerId: 'opencode-go',
        modelId: 'mimo-v2.6-pro',
        contextWindow: 1048576,
        totalTokens: 17726,
        inputTokens: 17689,
        outputTokens: 37,
        reasoningTokens: 14,
        cacheReadTokens: 10240,
        totalCost: null,
      },
    });
  });

  it('emits no context_usage when the runtime reported no snapshot (unavailable stays unavailable)', () => {
    const mapper = new ZCodeStreamMapper('sess_a');
    const chunks = mapper.map(event('turn.completed', 1, {
      response: 'done',
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    expect(chunks.some((chunk) => chunk.type === 'context_usage')).toBe(false);
    expect(chunks.some((chunk) => chunk.type === 'usage')).toBe(true);
  });
});

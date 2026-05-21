import { createClaudeCodeStreamNormalizer } from '../../../../../src/core/agents/backend';

/* eslint-disable max-lines-per-function -- The normalizer fixture suite keeps SDK event shape regressions in one place. */

function assistantMessage(id: string, content: unknown[]) {
  return {
    type: 'assistant',
    message: {
      id,
      content,
    },
  };
}

describe('ClaudeCodeStreamNormalizer', () => {
  it('emits session metadata for session_init system messages', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1710000000000);
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'system',
      subtype: 'session_init',
      session_id: 'claude-session-1',
      model: 'claude-sonnet-4-5',
    })).toEqual([{
      type: 'message_metadata',
      messageId: 'claude-session-1',
      timestamp: 1710000000000,
      modelId: 'claude-sonnet-4-5',
      sessionId: 'claude-session-1',
    }]);

    jest.restoreAllMocks();
  });

  it('normalizes assistant partial text and final assistant messages without duplicating emitted text', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage(
      assistantMessage('msg-1', [{ type: 'text', text: 'Hel' }]),
    )).toEqual([{ type: 'text', content: 'Hel' }]);

    expect(normalizer.transformSDKMessage(
      assistantMessage('msg-1', [{ type: 'text', text: 'Hello' }]),
    )).toEqual([{ type: 'text', content: 'lo' }]);

    expect(normalizer.transformSDKMessage(
      assistantMessage('msg-1', [{ type: 'text', text: 'Hello' }]),
    )).toEqual([]);
  });

  it('normalizes text and thinking deltas', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'hello' },
    })).toEqual([{ type: 'text', content: 'hello' }]);

    expect(normalizer.transformSDKMessage({
      type: 'content_block_delta',
      content_block_id: 'think-1',
      delta: { type: 'thinking_delta', thinking: 'working' },
    })).toEqual([{ type: 'thinking', content: 'working', partId: 'think-1' }]);
  });

  it('normalizes assistant thinking blocks with suffix deduplication', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage(
      assistantMessage('msg-thinking', [{ id: 'block-1', type: 'thinking', thinking: 'step' }]),
    )).toEqual([{ type: 'thinking', content: 'step', partId: 'block-1' }]);

    expect(normalizer.transformSDKMessage(
      assistantMessage('msg-thinking', [{ id: 'block-1', type: 'thinking', thinking: 'step two' }]),
    )).toEqual([{ type: 'thinking', content: ' two', partId: 'block-1' }]);
  });

  it('normalizes tool_use blocks and classifies Claude built-ins', () => {
    const normalizer = createClaudeCodeStreamNormalizer({ sessionId: 'claude-session-1' });

    const bashTool = {
      type: 'tool_use',
      id: 'tool-1',
      name: 'Bash',
      input: { command: 'pwd' },
    };

    expect(normalizer.transformSDKMessage(
      assistantMessage('msg-tool', [bashTool]),
    )).toEqual([{
      type: 'tool_use',
      id: 'tool-1',
      name: 'Bash',
      kind: 'builtin',
      input: { command: 'pwd' },
      toolMetadata: {
        source: 'claude-code',
        toolUseId: 'tool-1',
        sessionId: 'claude-session-1',
      },
    }]);

    expect(normalizer.transformSDKMessage(
      assistantMessage('msg-tool', [bashTool]),
    )).toEqual([]);
  });

  it('normalizes MCP-style tool names and AskUserQuestion as question tools', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'assistant',
      session_id: 'claude-session-2',
      message: {
        id: 'msg-question',
        content: [{
          type: 'tool_use',
          id: 'question-1',
          name: 'AskUserQuestion',
          input: { question: 'Continue?' },
        }, {
          type: 'tool_use',
          id: 'mcp-1',
          name: 'mcp__filesystem__read_file',
          input: { path: 'README.md' },
        }],
      },
    })).toEqual([{
      type: 'tool_use',
      id: 'question-1',
      name: 'AskUserQuestion',
      kind: 'question',
      input: { question: 'Continue?' },
      toolMetadata: {
        source: 'claude-code',
        toolUseId: 'question-1',
        sessionId: 'claude-session-2',
      },
    }, {
      type: 'tool_use',
      id: 'mcp-1',
      name: 'mcp__filesystem__read_file',
      kind: 'mcp',
      input: { path: 'README.md' },
      toolMetadata: {
        source: 'claude-code',
        toolUseId: 'mcp-1',
        sessionId: 'claude-session-2',
      },
    }]);
  });

  it('normalizes tool_result blocks from user messages', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'user',
      message: {
        id: 'user-1',
        content: [{
          type: 'tool_result',
          tool_use_id: 'tool-1',
          content: [{ type: 'text', text: 'done' }],
          is_error: false,
        }],
      },
    })).toEqual([{
      type: 'tool_result',
      toolUseId: 'tool-1',
      content: 'done',
      isError: false,
    }]);
  });

  it('normalizes usage from messages and result errors', () => {
    const normalizer = createClaudeCodeStreamNormalizer({ sessionId: 'claude-session-3' });

    expect(normalizer.transformSDKMessage({
      type: 'assistant',
      message: {
        id: 'msg-usage',
        usage: { input_tokens: 12, output_tokens: 5, reasoning_tokens: 3 },
        content: [],
      },
    })).toEqual([{
      type: 'usage',
      inputTokens: 12,
      outputTokens: 8,
      sessionId: 'claude-session-3',
    }]);

    expect(normalizer.transformSDKMessage({
      type: 'result',
      subtype: 'error',
      error: { message: 'permission denied' },
      total_usage: { input_tokens: 7, output_tokens: 2 },
    })).toEqual([{
      type: 'error',
      content: 'permission denied',
    }, {
      type: 'usage',
      inputTokens: 7,
      outputTokens: 2,
      sessionId: 'claude-session-3',
    }]);
  });

  it('surfaces Claude Code hook lifecycle events as backend diagnostic events', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'system',
      subtype: 'hook_response',
      hook_id: 'hook-1',
      hook_name: 'lint-on-stop',
      hook_event: 'Stop',
      output: 'ok',
      stdout: 'done',
      stderr: '',
      exit_code: 0,
      outcome: 'success',
      session_id: 'claude-session-hook',
    })).toEqual([{
      type: 'backend_event',
      source: 'claude-code',
      event: 'hook',
      status: 'response',
      id: 'hook-1',
      name: 'lint-on-stop',
      content: 'ok',
      metadata: {
        hookEvent: 'Stop',
        stdout: 'done',
        stderr: null,
        exitCode: 0,
        outcome: 'success',
      },
      sessionId: 'claude-session-hook',
    }]);
  });

  it('surfaces Claude Code subagent progress and result structured output as backend events', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'system',
      subtype: 'task_progress',
      task_id: 'task-1',
      tool_use_id: 'tool-task-1',
      description: 'Reviewing tests',
      subagent_type: 'reviewer',
      summary: 'Checking focused tests',
      usage: { total_tokens: 1200, tool_uses: 2, duration_ms: 30000 },
      session_id: 'claude-session-task',
    })).toEqual([{
      type: 'backend_event',
      source: 'claude-code',
      event: 'subagent',
      status: 'progress',
      id: 'task-1',
      name: 'reviewer',
      content: 'Checking focused tests',
      metadata: {
        toolUseId: 'tool-task-1',
        taskType: null,
        workflowName: null,
        skipTranscript: false,
        outputFile: null,
        usage: { total_tokens: 1200, tool_uses: 2, duration_ms: 30000 },
        patch: null,
      },
      sessionId: 'claude-session-task',
    }]);

    const structuredOutputNormalizer = createClaudeCodeStreamNormalizer();
    expect(structuredOutputNormalizer.transformSDKMessage({
      type: 'result',
      session_id: 'claude-session-structured-output',
      structured_output: { status: 'ok' },
      total_usage: { input_tokens: 1, output_tokens: 2 },
    })).toEqual([{
      type: 'backend_event',
      source: 'claude-code',
      event: 'structured_output',
      status: 'received',
      content: '{"status":"ok"}',
      metadata: {
        structuredOutput: { status: 'ok' },
        deferredToolUse: null,
      },
    }, {
      type: 'usage',
      inputTokens: 1,
      outputTokens: 2,
      sessionId: 'claude-session-structured-output',
    }]);
  });

  it('surfaces Claude Code tool progress as backend diagnostic events', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'tool_progress',
      tool_use_id: 'tool-1',
      tool_name: 'Bash',
      parent_tool_use_id: 'parent-1',
      elapsed_time_seconds: 3.5,
      task_id: 'task-1',
    })).toEqual([{
      type: 'backend_event',
      source: 'claude-code',
      event: 'tool_progress',
      status: 'progress',
      id: 'tool-1',
      name: 'Bash',
      metadata: {
        parentToolUseId: 'parent-1',
        elapsedTimeSeconds: 3.5,
        taskId: 'task-1',
      },
    }]);
  });

  it('surfaces assistant-level Claude Code authentication failures as error chunks', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'assistant',
      error: 'authentication_failed',
      message: {
        id: 'auth-error',
        content: [{ type: 'text', text: 'Not logged in · Please run /login' }],
      },
    })).toEqual([{
      type: 'error',
      content: 'authentication_failed: Not logged in · Please run /login',
    }]);
  });

  it('resets dedup state when requested', () => {
    const normalizer = createClaudeCodeStreamNormalizer();
    const message = assistantMessage('msg-reset', [{ type: 'text', text: 'Hello' }]);

    expect(normalizer.transformSDKMessage(message)).toEqual([{ type: 'text', content: 'Hello' }]);
    expect(normalizer.transformSDKMessage(message)).toEqual([]);

    normalizer.reset();
    expect(normalizer.transformSDKMessage(message)).toEqual([{ type: 'text', content: 'Hello' }]);
  });
});

/* eslint-disable max-lines -- Stream normalizer coverage keeps lifecycle events, block types, delta types, and diagnostic logging fixtures together for one normalizer contract. */
import { createClaudeCodeStreamNormalizer } from '../../../../../src/core/agents/backend';
import {
  clearRecentLogs,
  getRecentLogEntries,
  resetLogEmissionThrottleState,
  setDebugLoggingEnabled,
  setDebugModuleEnabled,
} from '../../../../../src/shared';

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
  beforeEach(() => {
    clearRecentLogs();
    resetLogEmissionThrottleState();
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('claudeCode', true);
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('claudeCode', false);
    clearRecentLogs();
    resetLogEmissionThrottleState();
    jest.restoreAllMocks();
  });

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
      billingUsage: {
        requestId: 'claude-session-3:claude-message:7:2',
        inputTokens: 7,
        outputTokens: 2,
        reasoningTokens: 0,
        cacheReadTokens: null,
        cacheWriteTokens: null,
      },
    }]);
  });

  it('emits exact cache billing categories only from terminal result usage', () => {
    const normalizer = createClaudeCodeStreamNormalizer({ sessionId: 'claude-session-4' });

    const chunks = normalizer.transformSDKMessage({
      type: 'result',
      uuid: 'turn-4',
      model: 'claude-opus-4-1',
      total_usage: {
        input_tokens: 100,
        output_tokens: 20,
        reasoning_tokens: 5,
        cache_read_input_tokens: 40,
        cache_creation_input_tokens: 30,
      },
    });

    expect(chunks).toEqual([{
      type: 'usage',
      inputTokens: 100,
      outputTokens: 25,
      sessionId: 'claude-session-4',
      billingUsage: {
        requestId: 'turn-4',
        modelId: 'claude-opus-4-1',
        inputTokens: 100,
        outputTokens: 20,
        reasoningTokens: 5,
        cacheReadTokens: 40,
        cacheWriteTokens: 30,
      },
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
      billingUsage: {
        requestId: 'claude-session-structured-output:claude-message:1:2',
        inputTokens: 1,
        outputTokens: 2,
        reasoningTokens: 0,
        cacheReadTokens: null,
        cacheWriteTokens: null,
      },
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

  it('writes claudeCode summary logs without leaking raw text or tool input', () => {
    const normalizer = createClaudeCodeStreamNormalizer({ sessionId: 'claude-session-logs' });

    normalizer.transformSDKMessage({
      type: 'assistant',
      session_id: 'claude-session-logs',
      message: {
        id: 'msg-log',
        content: [{
          type: 'text',
          text: 'secret raw response text',
        }, {
          type: 'tool_use',
          id: 'tool-log',
          name: 'Bash',
          input: { command: 'echo secret-token' },
        }],
      },
      usage: { input_tokens: 2, output_tokens: 3 },
    });

    const entries = getRecentLogEntries().filter((entry) => entry.scope === 'ClaudeCodeStreamNormalizer');
    const logText = entries.map((entry) => entry.message).join('\n');

    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.every((entry) => entry.moduleKey === 'claudeCode')).toBe(true);
    expect(entries.every((entry) => entry.channel === 'stream')).toBe(true);
    expect(logText).toContain('sdk message');
    expect(logText).toContain('chunks');
    expect(logText).toContain('contentLength');
    expect(logText).toContain('inputKeyCount');
    expect(logText).not.toContain('secret raw response text');
    expect(logText).not.toContain('echo secret-token');
  });

  it('does not include model ids in message_metadata chunk logs', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1710000000000);
    const normalizer = createClaudeCodeStreamNormalizer();

    normalizer.transformSDKMessage({
      type: 'system',
      subtype: 'session_init',
      session_id: 'claude-session-model-log',
      model: 'claude-secret-model',
    });

    const logText = getRecentLogEntries()
      .filter((entry) => entry.scope === 'ClaudeCodeStreamNormalizer')
      .map((entry) => entry.message)
      .join('\n');

    expect(logText).toContain('message_metadata');
    expect(logText).not.toContain('modelId');
    expect(logText).not.toContain('claude-secret-model');
  });

  it('bounds content delta logs while keeping a representative chunk summary', () => {
    const normalizer = createClaudeCodeStreamNormalizer({ sessionId: 'claude-session-delta-logs' });

    for (let index = 0; index < 40; index += 1) {
      normalizer.transformSDKMessage({
        type: 'content_block_delta',
        session_id: 'claude-session-delta-logs',
        delta: { type: 'text_delta', text: `secret delta ${index}` },
      });
    }

    const entries = getRecentLogEntries().filter((entry) => entry.scope === 'ClaudeCodeStreamNormalizer');
    const logText = entries.map((entry) => entry.message).join('\n');

    expect(entries.length).toBeLessThanOrEqual(4);
    expect(logText).toContain('chunks');
    expect(logText).toContain('"type":"text"');
    expect(logText).toContain('contentLength');
    expect(logText).not.toContain('secret delta');
  });

  it('emits session metadata for init system messages', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1710000000000);
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet',
      session_id: 'sess-init',
    })).toEqual([{
      type: 'message_metadata',
      messageId: 'sess-init',
      timestamp: 1710000000000,
      modelId: 'claude-sonnet',
      sessionId: 'sess-init',
    }]);
  });

  it('surfaces Claude Code hook_started lifecycle events as started backend events', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'system',
      subtype: 'hook_started',
      hook_id: 'hook-2',
      hook_name: 'pre-send',
      hook_event: 'PreToolUse',
      session_id: 'sess-hook',
    })).toEqual([{
      type: 'backend_event',
      source: 'claude-code',
      event: 'hook',
      status: 'started',
      id: 'hook-2',
      name: 'pre-send',
      content: undefined,
      metadata: {
        hookEvent: 'PreToolUse',
        stdout: null,
        stderr: null,
        exitCode: null,
        outcome: null,
      },
      sessionId: 'sess-hook',
    }]);
  });

  it('surfaces Claude Code hook_progress lifecycle events as progress backend events', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'system',
      subtype: 'hook_progress',
      hook_id: 'hook-2',
      hook_name: 'pre-send',
      output: 'working...',
      session_id: 'sess-hook',
    })).toEqual([{
      type: 'backend_event',
      source: 'claude-code',
      event: 'hook',
      status: 'progress',
      id: 'hook-2',
      name: 'pre-send',
      content: 'working...',
      metadata: {
        hookEvent: null,
        stdout: null,
        stderr: null,
        exitCode: null,
        outcome: null,
      },
      sessionId: 'sess-hook',
    }]);
  });

  it('surfaces Claude Code task_started lifecycle events as started backend events', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'system',
      subtype: 'task_started',
      task_id: 'task-2',
      tool_use_id: 'tool-2',
      description: 'Starting review',
      subagent_type: 'reviewer',
      session_id: 'sess-task',
    })).toEqual([{
      type: 'backend_event',
      source: 'claude-code',
      event: 'subagent',
      status: 'started',
      id: 'task-2',
      name: 'reviewer',
      content: 'Starting review',
      metadata: {
        toolUseId: 'tool-2',
        taskType: null,
        workflowName: null,
        skipTranscript: false,
        outputFile: null,
        usage: null,
        patch: null,
      },
      sessionId: 'sess-task',
    }]);
  });

  it('surfaces Claude Code task_notification lifecycle events as notification backend events', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task-2',
      summary: 'Note from agent',
      session_id: 'sess-task',
    })).toEqual([{
      type: 'backend_event',
      source: 'claude-code',
      event: 'subagent',
      status: 'notification',
      id: 'task-2',
      name: undefined,
      content: 'Note from agent',
      metadata: {
        toolUseId: null,
        taskType: null,
        workflowName: null,
        skipTranscript: false,
        outputFile: null,
        usage: null,
        patch: null,
      },
      sessionId: 'sess-task',
    }]);
  });

  it('surfaces Claude Code task_updated lifecycle events as updated backend events', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'system',
      subtype: 'task_updated',
      task_id: 'task-2',
      description: 'Updated task',
      subagent_type: 'worker',
      patch: { file: 'a.ts', additions: 3 },
      session_id: 'sess-task',
    })).toEqual([{
      type: 'backend_event',
      source: 'claude-code',
      event: 'subagent',
      status: 'updated',
      id: 'task-2',
      name: 'worker',
      content: 'Updated task',
      metadata: {
        toolUseId: null,
        taskType: null,
        workflowName: null,
        skipTranscript: false,
        outputFile: null,
        usage: null,
        patch: { file: 'a.ts', additions: 3 },
      },
      sessionId: 'sess-task',
    }]);
  });

  it('normalizes assistant redacted_thinking blocks as thinking chunks', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage(
      assistantMessage('msg-redacted-thinking', [{
        id: 'redacted-1',
        type: 'redacted_thinking',
        thinking: 'secret thoughts',
      }]),
    )).toEqual([{ type: 'thinking', content: 'secret thoughts', partId: 'redacted-1' }]);
  });

  it('normalizes assistant server_tool_use blocks as tool_use chunks', () => {
    const normalizer = createClaudeCodeStreamNormalizer({ sessionId: 'sess-server-tool' });

    expect(normalizer.transformSDKMessage(
      assistantMessage('msg-server-tool', [{
        type: 'server_tool_use',
        id: 'stu-1',
        name: 'web_search',
        input: { query: 'test' },
      }]),
    )).toEqual([{
      type: 'tool_use',
      id: 'stu-1',
      name: 'web_search',
      kind: 'builtin',
      input: { query: 'test' },
      toolMetadata: {
        source: 'claude-code',
        toolUseId: 'stu-1',
        sessionId: 'sess-server-tool',
      },
    }]);
  });

  it('emits prompt_suggestion chunk for SDK prompt_suggestion messages', () => {
    const normalizer = createClaudeCodeStreamNormalizer({ sessionId: 'sess-ps' });

    expect(normalizer.transformSDKMessage({
      type: 'prompt_suggestion',
      suggestion: 'Write unit tests for this function',
      uuid: 'ps-uuid-1',
      session_id: 'sess-ps',
    })).toEqual([{
      type: 'prompt_suggestion',
      suggestion: 'Write unit tests for this function',
      uuid: 'ps-uuid-1',
      sessionId: 'sess-ps',
    }]);
  });

  it('emits prompt_suggestion chunk without sessionId when message lacks it', () => {
    const normalizer = createClaudeCodeStreamNormalizer();

    expect(normalizer.transformSDKMessage({
      type: 'prompt_suggestion',
      suggestion: 'Add error handling',
      uuid: 'ps-uuid-2',
    })).toEqual([{
      type: 'prompt_suggestion',
      suggestion: 'Add error handling',
      uuid: 'ps-uuid-2',
    }]);
  });

  it('uses normalizer state sessionId as fallback for prompt_suggestion', () => {
    const normalizer = createClaudeCodeStreamNormalizer({ sessionId: 'fallback-sess' });

    // First establish session state via assistant message
    normalizer.transformSDKMessage({
      type: 'assistant',
      session_id: 'fallback-sess',
      message: { id: 'msg-1', content: [{ type: 'text', text: 'Hello' }] },
    });

    // Then prompt_suggestion without explicit session_id should use state
    expect(normalizer.transformSDKMessage({
      type: 'prompt_suggestion',
      suggestion: 'Refactor into smaller functions',
      uuid: 'ps-uuid-3',
    })).toEqual([{
      type: 'prompt_suggestion',
      suggestion: 'Refactor into smaller functions',
      uuid: 'ps-uuid-3',
      sessionId: 'fallback-sess',
    }]);
  });
});

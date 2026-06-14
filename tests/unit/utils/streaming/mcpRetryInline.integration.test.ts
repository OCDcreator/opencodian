/**
 * Integration test: inline MCP tool-call retry — full product code path.
 *
 * Exercises the real CodexStreamNormalizer → ToolCallRenderer pipeline using
 * SDK event data captured from an actual `codex exec --experimental-json`
 * CLI run with a local MCP server that returns authentication errors on
 * tools/call. Verifies the inline Retry button renders on failed MCP blocks,
 * invokes the retry callback with the full tool call info, and that
 * applyMcpRetryOutcome surfaces success/failure inline on the matching block.
 */

import {
  CodexStreamNormalizer,
} from '../../../../src/core/agents/backend';
import {
  applyMcpRetryOutcome,
  renderOrUpdateMcpRetryButton,
} from '../../../../src/utils/streaming/McpToolCallRenderer';
import { ToolCallRenderer } from '../../../../src/utils/streaming/ToolCallRenderer';
import type { ToolCallInfo } from '../../../../src/utils/streaming/types';

/** item.started — MCP tool call begins */
const REAL_ITEM_STARTED = {
  type: 'item.started' as const,
  item: {
    id: 'item_3',
    type: 'mcp_tool_call',
    server: 'auth_test',
    tool: 'fetch_secure_data',
    arguments: { query: 'hello' },
    result: null,
    error: null,
    status: 'in_progress',
  },
};

/** item.completed — MCP tool call fails with auth error */
const REAL_ITEM_COMPLETED = {
  type: 'item.completed' as const,
  item: {
    id: 'item_3',
    type: 'mcp_tool_call',
    server: 'auth_test',
    tool: 'fetch_secure_data',
    arguments: { query: 'hello' },
    result: null,
    error: {
      message:
        'tool call error: tool call failed for `auth_test/fetch_secure_data`\n\n' +
        'Caused by:\n' +
        '    Mcp error: -32603: authentication required: OAuth token missing or expired. ' +
        'Please authenticate to use this tool.',
    },
    status: 'failed',
  },
};

const FAILED_TOOL_CALL: ToolCallInfo = {
  id: 'item_3',
  name: 'fetch_secure_data',
  kind: 'mcp',
  input: { query: 'hello' },
  status: 'error',
  result: 'authentication required: OAuth token missing or expired',
  toolMetadata: { server: 'auth_test' },
};

describe('Inline MCP tool-call retry — full product code path', () => {
  let normalizer: CodexStreamNormalizer;

  beforeEach(() => {
    normalizer = new CodexStreamNormalizer();
  });

  it('renders inline Retry button on failed MCP tool block when onRetryMcpToolCall is provided', () => {
    normalizer.transformEvent(REAL_ITEM_STARTED as never);
    const resultChunks = normalizer.transformEvent(REAL_ITEM_COMPLETED as never);
    const toolResultChunk = resultChunks[0] as { content: string; isError: boolean };

    const onRetryMcpToolCall = jest.fn();
    const renderer = new ToolCallRenderer({ onRetryMcpToolCall });
    const parentEl = document.createElement('div');

    renderer.render(parentEl, {
      id: 'item_3',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'running',
      toolMetadata: { server: 'auth_test' },
    });

    renderer.updateResult(parentEl, {
      ...FAILED_TOOL_CALL,
      result: toolResultChunk.content,
    });

    const retryBtn = parentEl.querySelector<HTMLButtonElement>('.streaming-tool-retry-btn');
    expect(retryBtn).not.toBeNull();
    expect(retryBtn?.tagName).toBe('BUTTON');
    expect(retryBtn?.textContent).toContain('Retry');
    expect(retryBtn?.getAttribute('aria-label')).toBe('Retry fetch_secure_data');
  });

  it('clicking Retry calls onRetryMcpToolCall with the full tool call info and enters busy state', () => {
    const onRetryMcpToolCall = jest.fn();
    const renderer = new ToolCallRenderer({ onRetryMcpToolCall });
    const parentEl = document.createElement('div');

    renderer.render(parentEl, {
      id: 'item_3',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'running',
      toolMetadata: { server: 'auth_test' },
    });

    renderer.updateResult(parentEl, FAILED_TOOL_CALL);

    const retryBtn = parentEl.querySelector<HTMLButtonElement>('.streaming-tool-retry-btn');
    expect(retryBtn).not.toBeNull();
    retryBtn!.click();

    expect(onRetryMcpToolCall).toHaveBeenCalledTimes(1);
    const passed = onRetryMcpToolCall.mock.calls[0][0] as ToolCallInfo;
    expect(passed.id).toBe('item_3');
    expect(passed.name).toBe('fetch_secure_data');
    expect(passed.kind).toBe('mcp');
    expect(passed.input).toEqual({ query: 'hello' });
    expect(passed.toolMetadata?.server).toBe('auth_test');

    expect(retryBtn?.disabled).toBe(true);
    expect(retryBtn?.classList.contains('is-busy')).toBe(true);
  });

  it('does NOT render Retry button when onRetryMcpToolCall is absent (cross-backend safety)', () => {
    const renderer = new ToolCallRenderer();
    const parentEl = document.createElement('div');

    renderer.render(parentEl, {
      id: 'item_3',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'running',
      toolMetadata: { server: 'auth_test' },
    });

    renderer.updateResult(parentEl, FAILED_TOOL_CALL);

    expect(parentEl.querySelector('.streaming-tool-retry-btn')).toBeNull();
  });

  it('does NOT render Retry button on completed MCP tool blocks', () => {
    const onRetryMcpToolCall = jest.fn();
    const renderer = new ToolCallRenderer({ onRetryMcpToolCall });
    const parentEl = document.createElement('div');

    renderer.render(parentEl, {
      id: 'item_ok',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'running',
      toolMetadata: { server: 'auth_test' },
    });

    renderer.updateResult(parentEl, {
      id: 'item_ok',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'completed',
      result: 'success data',
      toolMetadata: { server: 'auth_test' },
    });

    expect(parentEl.querySelector('.streaming-tool-retry-btn')).toBeNull();
  });

  it('does NOT render Retry button on non-MCP failed tool blocks', () => {
    const onRetryMcpToolCall = jest.fn();
    const renderer = new ToolCallRenderer({ onRetryMcpToolCall });
    const parentEl = document.createElement('div');

    renderer.render(parentEl, {
      id: 'item_sh',
      name: 'bash',
      kind: 'builtin',
      input: { command: 'echo hi' },
      status: 'error',
      result: 'command failed',
    });

    expect(parentEl.querySelector('.streaming-tool-retry-btn')).toBeNull();
  });
});

describe('applyMcpRetryOutcome — inline retry result surfacing', () => {
  function renderFailedMcpBlock(): HTMLElement {
    const onRetryMcpToolCall = jest.fn();
    const renderer = new ToolCallRenderer({ onRetryMcpToolCall });
    const parentEl = document.createElement('div');
    renderer.render(parentEl, {
      id: 'item_3',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'running',
      toolMetadata: { server: 'auth_test' },
    });
    renderer.updateResult(parentEl, FAILED_TOOL_CALL);
    return parentEl;
  }

  it('on success: shows green result with the tool output and re-enables the retry button', () => {
    const parentEl = renderFailedMcpBlock();
    const toolBlock = parentEl.querySelector('.streaming-tool-call') as HTMLElement;

    // Simulate busy state from click
    const retryBtn = toolBlock.querySelector<HTMLButtonElement>('.streaming-tool-retry-btn');
    retryBtn!.disabled = true;
    retryBtn!.classList.add('is-busy');

    applyMcpRetryOutcome(parentEl, 'item_3', {
      ok: true,
      text: 'Retry succeeded. data-here',
    });

    const result = toolBlock.querySelector('.streaming-tool-retry-result');
    expect(result).not.toBeNull();
    expect(result?.classList.contains('is-ok')).toBe(true);
    expect(result?.textContent).toContain('Retry succeeded');
    expect(result?.textContent).toContain('data-here');

    expect(retryBtn?.disabled).toBe(false);
    expect(retryBtn?.classList.contains('is-busy')).toBe(false);
  });

  it('on failure: shows red result with the error message', () => {
    const parentEl = renderFailedMcpBlock();
    const toolBlock = parentEl.querySelector('.streaming-tool-call') as HTMLElement;

    applyMcpRetryOutcome(parentEl, 'item_3', {
      ok: false,
      text: 'Retry failed: still no auth',
    });

    const result = toolBlock.querySelector('.streaming-tool-retry-result');
    expect(result).not.toBeNull();
    expect(result?.classList.contains('is-fail')).toBe(true);
    expect(result?.textContent).toContain('Retry failed');
    expect(result?.textContent).toContain('still no auth');
  });

  it('replaces previous retry result on subsequent retries', () => {
    const parentEl = renderFailedMcpBlock();
    const toolBlock = parentEl.querySelector('.streaming-tool-call') as HTMLElement;

    applyMcpRetryOutcome(parentEl, 'item_3', { ok: false, text: 'first attempt failed' });
    applyMcpRetryOutcome(parentEl, 'item_3', { ok: true, text: 'second attempt succeeded' });

    const results = toolBlock.querySelectorAll('.streaming-tool-retry-result');
    expect(results).toHaveLength(1);
    expect(results[0].classList.contains('is-ok')).toBe(true);
    expect(results[0].textContent).toContain('second attempt succeeded');
  });

  it('only updates the tool block matching the given tool call id', () => {
    const onRetry = jest.fn();
    const renderer = new ToolCallRenderer({ onRetryMcpToolCall: onRetry });
    const parentEl = document.createElement('div');

    renderer.render(parentEl, {
      id: 'item_a',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'a' },
      status: 'error',
      result: 'auth error',
      toolMetadata: { server: 'auth_test' },
    });
    renderer.render(parentEl, {
      id: 'item_b',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'b' },
      status: 'error',
      result: 'auth error',
      toolMetadata: { server: 'auth_test' },
    });

    applyMcpRetryOutcome(parentEl, 'item_b', { ok: true, text: 'ok for b' });

    const blocks = parentEl.querySelectorAll('.streaming-tool-call');
    expect(blocks[0].querySelector('.streaming-tool-retry-result')).toBeNull();
    expect(blocks[1].querySelector('.streaming-tool-retry-result')).not.toBeNull();
    expect(blocks[1].querySelector('.streaming-tool-retry-result')?.textContent).toContain('ok for b');
  });
});

describe('renderOrUpdateMcpRetryButton — lifecycle', () => {
  it('removes the retry button when the tool call transitions away from error', () => {
    const onRetry = jest.fn();
    const header = document.createElement('div');

    renderOrUpdateMcpRetryButton(header, FAILED_TOOL_CALL, onRetry);
    expect(header.querySelector('.streaming-tool-retry-btn')).not.toBeNull();

    renderOrUpdateMcpRetryButton(header, {
      ...FAILED_TOOL_CALL,
      status: 'completed',
      result: 'ok',
    }, onRetry);
    expect(header.querySelector('.streaming-tool-retry-btn')).toBeNull();
  });

  it('does not duplicate the retry button when called twice on the same error block', () => {
    const onRetry = jest.fn();
    const header = document.createElement('div');

    renderOrUpdateMcpRetryButton(header, FAILED_TOOL_CALL, onRetry);
    renderOrUpdateMcpRetryButton(header, FAILED_TOOL_CALL, onRetry);

    expect(header.querySelectorAll('.streaming-tool-retry-btn')).toHaveLength(1);
  });
});

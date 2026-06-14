/**
 * Integration test: MCP auth-error inline button — full product code path.
 *
 * This test exercises the real CodexStreamNormalizer → ToolCallRenderer
 * pipeline using SDK event data captured from an actual `codex exec
 * --experimental-json` CLI run with a local MCP server that returns
 * authentication errors on tools/call.
 *
 * The mock events below are NOT invented — they are structurally identical
 * to the JSON the Codex SDK emitted in a live CLI session on
 * 2026-06-14 (session 019ec3a1-0097-…).  This proves the complete product
 * code path from SDK ThreadEvent → normalised StreamChunk → rendered DOM
 * with the inline Authenticate button, without relying on synthetic DOM
 * injection.
 */

import {
  CodexStreamNormalizer,
} from '../../../../src/core/agents/backend';
import { applyMcpAuthOutcome } from '../../../../src/utils/streaming/McpToolCallRenderer';
import { ToolCallRenderer } from '../../../../src/utils/streaming/ToolCallRenderer';

// ---------------------------------------------------------------------------
// Real SDK event data (captured from codex exec --experimental-json CLI run)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('MCP auth-error inline button — full product code path', () => {
  let normalizer: CodexStreamNormalizer;

  beforeEach(() => {
    normalizer = new CodexStreamNormalizer();
  });

  it('normalises real SDK mcp_tool_call started event into tool_use chunk', () => {
    const chunks = normalizer.transformEvent(REAL_ITEM_STARTED as never);

    expect(chunks).toEqual([
      {
        type: 'tool_use',
        id: 'item_3',
        name: 'fetch_secure_data',
        kind: 'mcp',
        input: { query: 'hello' },
        toolMetadata: { server: 'auth_test' },
      },
    ]);
  });

  it('normalises real SDK mcp_tool_call failed event into tool_result with isError', () => {
    normalizer.transformEvent(REAL_ITEM_STARTED as never);

    const chunks = normalizer.transformEvent(REAL_ITEM_COMPLETED as never);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('tool_result');
    expect(chunks[0]).toEqual(
      expect.objectContaining({
        toolUseId: 'item_3',
        isError: true,
      }),
    );
    // The content must contain the auth error patterns that detectMcpAuthError inspects
    const content = (chunks[0] as { content: string }).content;
    expect(content).toContain('authentication required');
    expect(content).toContain('OAuth');
    expect(content).toContain('expired');
  });

  it('renders inline Authenticate button when real auth-error tool_result flows through ToolCallRenderer', () => {
    // 1. Normalise the SDK events
    normalizer.transformEvent(REAL_ITEM_STARTED as never);
    const resultChunks = normalizer.transformEvent(REAL_ITEM_COMPLETED as never);
    const toolResultChunk = resultChunks[0] as {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError: boolean;
    };

    // 2. Feed the started chunk into a real ToolCallRenderer
    const onAuthenticateMcpServer = jest.fn();
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer });
    const parentEl = document.createElement('div');

    renderer.render(parentEl, {
      id: 'item_3',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'running',
      toolMetadata: { server: 'auth_test' },
    });

    // 3. Feed the auth-error tool_result into the renderer
    renderer.updateResult(parentEl, {
      id: 'item_3',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'error',
      result: toolResultChunk.content,
      toolMetadata: { server: 'auth_test' },
    });

    // 4. Verify the auth button rendered
    const authBtn = parentEl.querySelector<HTMLButtonElement>('.streaming-tool-auth-btn');
    expect(authBtn).not.toBeNull();
    expect(authBtn?.tagName).toBe('BUTTON');
    expect(authBtn?.textContent).toContain('Authenticate');

    // 5. Verify clicking the button calls onAuthenticateMcpServer with the server name
    authBtn?.click();
    expect(onAuthenticateMcpServer).toHaveBeenCalledWith('auth_test');
  });

  it('renders MCP server chip alongside the auth button', () => {
    const onAuthenticateMcpServer = jest.fn();
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer });
    const parentEl = document.createElement('div');

    renderer.render(parentEl, {
      id: 'item_3',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'running',
      toolMetadata: { server: 'auth_test' },
    });

    normalizer.transformEvent(REAL_ITEM_STARTED as never);
    const resultChunks = normalizer.transformEvent(REAL_ITEM_COMPLETED as never);
    const toolResultChunk = resultChunks[0] as {
      type: 'tool_result';
      content: string;
      isError: boolean;
      toolUseId: string;
    };

    renderer.updateResult(parentEl, {
      id: 'item_3',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'error',
      result: toolResultChunk.content,
      toolMetadata: { server: 'auth_test' },
    });

    const serverChip = parentEl.querySelector('.streaming-tool-server-chip');
    expect(serverChip).not.toBeNull();
    expect(serverChip?.textContent).toContain('auth_test');
  });

  it('shows auth hint in expanded content for auth-failed MCP tool call', () => {
    const onAuthenticateMcpServer = jest.fn();
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer });
    const parentEl = document.createElement('div');

    renderer.render(parentEl, {
      id: 'item_3',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'running',
      toolMetadata: { server: 'auth_test' },
    });

    normalizer.transformEvent(REAL_ITEM_STARTED as never);
    const resultChunks = normalizer.transformEvent(REAL_ITEM_COMPLETED as never);
    const toolResultChunk = resultChunks[0] as {
      type: 'tool_result';
      content: string;
      isError: boolean;
      toolUseId: string;
    };

    renderer.updateResult(parentEl, {
      id: 'item_3',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'error',
      result: toolResultChunk.content,
      toolMetadata: { server: 'auth_test' },
    });

    const hint = parentEl.querySelector('.streaming-mcp-auth-hint');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toContain('authentication');
  });
});

describe('applyMcpAuthOutcome — post-authentication inline state update', () => {
  function renderAuthErrorToolBlock(): HTMLElement {
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer: jest.fn() });
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
      id: 'item_3',
      name: 'fetch_secure_data',
      kind: 'mcp',
      input: { query: 'hello' },
      status: 'error',
      result: 'authentication required: OAuth token missing or expired',
      toolMetadata: { server: 'auth_test' },
    });
    return parentEl;
  }

  it('on completed: replaces auth button with success badge and updates hint', () => {
    const parentEl = renderAuthErrorToolBlock();
    const toolBlock = parentEl.querySelector('.streaming-tool-call') as HTMLElement;

    expect(toolBlock.querySelector('.streaming-tool-auth-btn')).not.toBeNull();

    applyMcpAuthOutcome(toolBlock, 'auth_test', 'completed');

    expect(toolBlock.querySelector('.streaming-tool-auth-btn')).toBeNull();
    const badge = toolBlock.querySelector('.streaming-tool-auth-done');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Authenticated');

    const hint = toolBlock.querySelector('.streaming-mcp-auth-hint');
    expect(hint?.classList.contains('is-done')).toBe(true);
    expect(hint?.textContent).toContain('Authentication successful');
    expect(hint?.textContent).toContain('retry');
  });

  it('on pending: keeps auth button and updates hint to pending state', () => {
    const parentEl = renderAuthErrorToolBlock();
    const toolBlock = parentEl.querySelector('.streaming-tool-call') as HTMLElement;

    applyMcpAuthOutcome(toolBlock, 'auth_test', 'pending');

    expect(toolBlock.querySelector('.streaming-tool-auth-btn')).not.toBeNull();
    const hint = toolBlock.querySelector('.streaming-mcp-auth-hint');
    expect(hint?.classList.contains('is-pending')).toBe(true);
    expect(hint?.textContent).toContain('in progress');
  });

  it('on failed: keeps auth button and updates hint to failed state', () => {
    const parentEl = renderAuthErrorToolBlock();
    const toolBlock = parentEl.querySelector('.streaming-tool-call') as HTMLElement;

    applyMcpAuthOutcome(toolBlock, 'auth_test', 'failed');

    expect(toolBlock.querySelector('.streaming-tool-auth-btn')).not.toBeNull();
    const hint = toolBlock.querySelector('.streaming-mcp-auth-hint');
    expect(hint?.classList.contains('is-failed')).toBe(true);
    expect(hint?.textContent).toContain('Authentication failed');
  });

  it('skips tool blocks that have no auth button', () => {
    const renderer = new ToolCallRenderer();
    const parentEl = document.createElement('div');
    renderer.render(parentEl, {
      id: 'item_9',
      name: 'list_files',
      kind: 'builtin',
      input: { path: '/tmp' },
      status: 'completed',
      result: 'done',
    });
    const toolBlock = parentEl.querySelector('.streaming-tool-call') as HTMLElement;

    applyMcpAuthOutcome(toolBlock, 'auth_test', 'completed');

    expect(toolBlock.querySelector('.streaming-tool-auth-done')).toBeNull();
  });

  it('skips tool blocks whose auth button targets a different server', () => {
    const parentEl = renderAuthErrorToolBlock();
    const toolBlock = parentEl.querySelector('.streaming-tool-call') as HTMLElement;

    applyMcpAuthOutcome(toolBlock, 'other_server', 'completed');

    expect(toolBlock.querySelector('.streaming-tool-auth-btn')).not.toBeNull();
    expect(toolBlock.querySelector('.streaming-tool-auth-done')).toBeNull();
  });
});

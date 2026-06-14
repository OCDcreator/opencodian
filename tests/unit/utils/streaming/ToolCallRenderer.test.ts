import { ToolCallRenderer } from '../../../../src/utils/streaming/ToolCallRenderer';

function getHeader(
  name: string,
  input: Record<string, unknown>,
  status: 'running' | 'completed' = 'running',
  kind?: 'builtin' | 'mcp' | 'custom' | 'task' | 'question' | 'skill' | 'plan' | 'unknown'
) {
  const parentEl = document.createElement('div');
  const renderer = new ToolCallRenderer();

  renderer.render(parentEl, {
    id: 'tool-test',
    name,
    kind,
    input,
    status,
    result: status === 'completed' ? 'ok' : undefined,
  });

  return {
    name: parentEl.querySelector('.streaming-tool-name')?.textContent,
    summary: parentEl.querySelector('.streaming-tool-summary')?.textContent,
  };
}

describe('ToolCallRenderer summaries', () => {
  it('shows file names for write-style tools across path key variants', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-1',
      name: 'write',
      input: { filePath: 'docs/architecture/README.md' },
      status: 'running',
    });

    expect(parentEl.querySelector('.streaming-tool-summary')?.textContent).toBe('README.md');
  });

  it('shows todo names after progress counts', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-2',
      name: 'todowrite',
      input: {
        todos: [
          { content: '整合 GLM 和 Kimi 分析', status: 'completed' },
          { content: '写入整合后的文档到 obsidian 联动设置.md', status: 'in_progress' },
          { content: '整理图表示例', status: 'pending' },
        ],
      },
      status: 'completed',
      result: 'ok',
    });

    const summaryEl = parentEl.querySelector('.streaming-tool-summary');
    expect(summaryEl?.textContent).toContain('1/3');
    expect(summaryEl?.textContent).toContain('整合 GLM 和 Kimi 分析');
    expect(summaryEl?.textContent).toContain('+1');
  });

  it('shows skill names in the toolbar as soon as input arrives', () => {
    const header = getHeader('skill', { name: 'imagegen' });
    expect(header.name).toBe('Skill');
    expect(header.summary).toBe('imagegen');
  });

  it.each([
    ['read', { filePath: 'docs/architecture/README.md', offset: 5, limit: 10 }, 'Read', 'README.md · 5-14'],
    ['multiedit', { filePath: 'src/main.ts', edits: [{}, {}] }, 'MultiEdit', 'main.ts · 2 edits'],
    ['apply_patch', { patchText: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-x\n+y\n*** End Patch' }, 'Apply Patch', 'main.ts'],
    ['list', { path: 'src/features/chat' }, 'List', 'chat'],
    ['glob', { pattern: '**/*.ts', path: 'src' }, 'Glob', '**/*.ts · src'],
    ['grep', { pattern: 'TODO', include: '*.ts' }, 'Grep', 'TODO · *.ts'],
    ['lsp', { operation: 'goToDefinition', filePath: 'src/main.ts', line: 12, character: 3 }, 'LSP', 'goToDefinition · main.ts:12:3'],
    ['websearch', { query: 'obsidian plugin api' }, 'WebSearch', 'obsidian plugin api'],
    ['webfetch', { url: 'https://example.com/docs' }, 'WebFetch', 'https://example.com/docs'],
    ['task', { subagent_type: 'explorer', description: 'audit routes' }, 'Subagent Task', 'explorer · audit routes'],
    ['question', { questions: [{ header: 'Build Agent', question: 'Continue?' }] }, 'Questions', 'Build Agent'],
    ['question', { questions: [{ question: 'A?' }, { question: 'B?' }] }, 'Questions', '2 questions'],
    ['todoread', {}, 'Todo Read', 'Current tasks'],
  ])('renders typed summary for %s', (toolName, input, expectedName, expectedSummary) => {
    const header = getHeader(toolName, input);
    expect(header.name).toBe(expectedName);
    expect(header.summary).toBe(expectedSummary);
  });
});

describe('ToolCallRenderer MCP tools', () => {
  it('renders MCP brand icon for Claudian MCP tool names', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-mcp-1',
      name: 'mcp__exa__search',
      input: { query: 'latest docs' },
      status: 'running',
    });

    expect(parentEl.querySelector('.streaming-tool-icon svg')?.getAttribute('data-icon')).toBe('opencodian-tool-mcp');
  });

  it.each([
    [{ query: 'latest docs' }, 'latest docs'],
    [{ url: 'https://example.com/docs' }, 'https://example.com/docs'],
    [{ path: '/tmp/demo.md' }, 'demo.md'],
    [{ command: 'git status' }, 'git status'],
    [{ limit: 20, verbose: true }, '20'],
    [{ filters: { tag: 'a' }, items: [] }, ''],
  ])('renders MCP summary for input %j', (input, expectedSummary) => {
    const header = getHeader('mcp__exa__search', input, 'running', 'mcp');
    expect(header.summary ?? '').toBe(expectedSummary);
  });

  it.each([
    ['mcp__exa__search', { query: 'latest docs', url: 'https://example.com' }, 'latest docs'],
    ['web-search-prime_web_search_prime', { query: 'AI news', url: 'https://example.com' }, 'AI news'],
    ['mcp__fetch__get', { url: 'https://example.com/docs', query: 'ignored query' }, 'https://example.com/docs'],
    ['mcp__fs__read', { path: '/tmp/demo.md', url: 'https://example.com/fallback' }, 'demo.md'],
    ['mcp__vault__list', { directory: '/tmp/notes', pattern: '*.md' }, 'notes'],
    ['mcp__shell__run', { command: 'git status', args: '--short' }, 'git status'],
    ['mcp__fs__write', { output: '/tmp/result.json', name: 'ignored' }, 'result.json'],
    ['mcp__editor__patch', { target: '/tmp/a.ts', instruction: 'rename symbol' }, '/tmp/a.ts'],
    ['mcp__fs__delete', { path: '/tmp/trash.txt', name: 'ignored' }, 'trash.txt'],
    ['mcp__browser__click', { selector: '#submit', name: 'ignored' }, '#submit'],
    ['mcp__auth__login', { url: 'https://example.com/login', provider: 'github' }, 'https://example.com/login'],
    ['mcp__service__status', { name: 'search-index', path: '/tmp/status.json' }, 'search-index'],
    ['mcp__unknown__thing', { target: 'fallback target', query: 'fallback query' }, 'fallback query'],
    ['mcp__unknown__thing', { filters: { tag: 'a' }, items: [] }, ''],
  ])('prefers semantic MCP summary fields for %s', (toolName, input, expectedSummary) => {
    const header = getHeader(toolName, input, 'running', 'mcp');
    expect(header.summary ?? '').toBe(expectedSummary);
  });

  it('renders non-wrench fallback for OpenCode external tools when kind is provided', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-mcp-2',
      name: 'exa_search',
      kind: 'custom',
      input: { query: 'latest docs' },
      status: 'running',
    });

    expect(parentEl.querySelector('.streaming-tool-icon svg')?.getAttribute('data-icon')).toBe('layers');
  });

  it('renders MCP server chip in header when toolMetadata.server is present', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-mcp-server',
      name: 'mcp__filesystem__read_file',
      kind: 'mcp',
      input: { path: '/tmp/demo.md' },
      status: 'running',
      toolMetadata: { server: 'filesystem' },
    });

    const chip = parentEl.querySelector('.streaming-tool-server-chip');
    expect(chip?.textContent).toBe('filesystem');
    expect(chip?.getAttribute('title')).toContain('filesystem');
  });

  it('does not render MCP server chip for non-MCP tools even with toolMetadata.server', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-read',
      name: 'read',
      kind: 'builtin',
      input: { file_path: 'docs/spec.md' },
      status: 'running',
      toolMetadata: { server: 'ignored' },
    });

    expect(parentEl.querySelector('.streaming-tool-server-chip')).toBeNull();
  });

  it('shows Server: detail when expanding a completed MCP tool call', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-mcp-detail',
      name: 'mcp__web__fetch',
      kind: 'mcp',
      input: { url: 'https://example.com' },
      status: 'completed',
      result: 'ok',
      toolMetadata: { server: 'web' },
    });

    parentEl.querySelector<HTMLElement>('.streaming-tool-header')?.click();

    expect(parentEl.querySelector('.streaming-tool-content')?.textContent).toContain('Server: web');
  });

  it('renders server chip as a passive span when no onOpenMcpServerDetail callback is provided', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-mcp-passive',
      name: 'mcp__fs__read',
      kind: 'mcp',
      input: { path: '/tmp' },
      status: 'running',
      toolMetadata: { server: 'filesystem' },
    });

    const chip = parentEl.querySelector('.streaming-tool-server-chip');
    expect(chip?.tagName).toBe('SPAN');
    expect(chip?.classList.contains('is-interactive')).toBe(false);
  });

  it('renders server chip as a clickable button when onOpenMcpServerDetail is provided', () => {
    const parentEl = document.createElement('div');
    const onOpenMcpServerDetail = jest.fn();
    const renderer = new ToolCallRenderer({ onOpenMcpServerDetail });

    renderer.render(parentEl, {
      id: 'tool-mcp-clickable',
      name: 'mcp__fs__read',
      kind: 'mcp',
      input: { path: '/tmp' },
      status: 'running',
      toolMetadata: { server: 'filesystem' },
    });

    const chip = parentEl.querySelector('.streaming-tool-server-chip');
    expect(chip?.tagName).toBe('BUTTON');
    expect(chip?.classList.contains('is-interactive')).toBe(true);
    expect(chip?.getAttribute('aria-label')).toContain('filesystem');
  });

  it('calls onOpenMcpServerDetail with server name when interactive chip is clicked', () => {
    const parentEl = document.createElement('div');
    const onOpenMcpServerDetail = jest.fn();
    const onCollapsibleToggle = jest.fn();
    const renderer = new ToolCallRenderer({ onOpenMcpServerDetail, onCollapsibleToggle });

    renderer.render(parentEl, {
      id: 'tool-mcp-open',
      name: 'mcp__fs__read',
      kind: 'mcp',
      input: { path: '/tmp' },
      status: 'running',
      toolMetadata: { server: 'filesystem' },
    });

    const chip = parentEl.querySelector<HTMLButtonElement>('.streaming-tool-server-chip');
    chip?.click();

    expect(onOpenMcpServerDetail).toHaveBeenCalledWith('filesystem');
    expect(onCollapsibleToggle).not.toHaveBeenCalled();
  });

  it('shows View server details link in expanded content when callback is provided', () => {
    const parentEl = document.createElement('div');
    const onOpenMcpServerDetail = jest.fn();
    const renderer = new ToolCallRenderer({ onOpenMcpServerDetail });

    renderer.render(parentEl, {
      id: 'tool-mcp-expand',
      name: 'mcp__fs__read',
      kind: 'mcp',
      input: { path: '/tmp' },
      status: 'completed',
      result: 'ok',
      toolMetadata: { server: 'filesystem' },
    });

    parentEl.querySelector<HTMLElement>('.streaming-tool-header')?.click();

    const link = parentEl.querySelector('.streaming-mcp-server-link');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('View server details');

    link?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenMcpServerDetail).toHaveBeenCalledWith('filesystem');
  });

  it('does not show View server details link in expanded content when no callback is provided', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-mcp-no-link',
      name: 'mcp__fs__read',
      kind: 'mcp',
      input: { path: '/tmp' },
      status: 'completed',
      result: 'ok',
      toolMetadata: { server: 'filesystem' },
    });

    parentEl.querySelector<HTMLElement>('.streaming-tool-header')?.click();

    expect(parentEl.querySelector('.streaming-mcp-server-link')).toBeNull();
  });
});

describe('ToolCallRenderer MCP inline auth button', () => {
  it('renders auth button on failed MCP tool call with auth error result', () => {
    const parentEl = document.createElement('div');
    const onAuthenticateMcpServer = jest.fn();
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer });

    renderer.render(parentEl, {
      id: 'tool-mcp-auth',
      name: 'mcp__linear__get_issue',
      kind: 'mcp',
      input: { issueId: 'LIN-123' },
      status: 'error',
      result: 'Error: authentication required',
      toolMetadata: { server: 'linear-test' },
    });

    const authBtn = parentEl.querySelector('.streaming-tool-auth-btn');
    expect(authBtn).not.toBeNull();
    expect(authBtn?.tagName).toBe('BUTTON');
    expect(authBtn?.textContent).toContain('Authenticate');
  });

  it('does not render auth button for non-auth errors', () => {
    const parentEl = document.createElement('div');
    const onAuthenticateMcpServer = jest.fn();
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer });

    renderer.render(parentEl, {
      id: 'tool-mcp-err',
      name: 'mcp__fs__read',
      kind: 'mcp',
      input: { path: '/tmp' },
      status: 'error',
      result: 'File not found',
      toolMetadata: { server: 'filesystem' },
    });

    expect(parentEl.querySelector('.streaming-tool-auth-btn')).toBeNull();
  });

  it('does not render auth button for completed MCP calls', () => {
    const parentEl = document.createElement('div');
    const onAuthenticateMcpServer = jest.fn();
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer });

    renderer.render(parentEl, {
      id: 'tool-mcp-ok',
      name: 'mcp__fs__read',
      kind: 'mcp',
      input: { path: '/tmp' },
      status: 'completed',
      result: 'ok',
      toolMetadata: { server: 'filesystem' },
    });

    expect(parentEl.querySelector('.streaming-tool-auth-btn')).toBeNull();
  });

  it('does not render auth button when no onAuthenticateMcpServer callback is provided', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-mcp-no-cb',
      name: 'mcp__fs__read',
      kind: 'mcp',
      input: { path: '/tmp' },
      status: 'error',
      result: 'authentication required',
      toolMetadata: { server: 'filesystem' },
    });

    expect(parentEl.querySelector('.streaming-tool-auth-btn')).toBeNull();
  });

  it('does not render auth button for non-MCP tools', () => {
    const parentEl = document.createElement('div');
    const onAuthenticateMcpServer = jest.fn();
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer });

    renderer.render(parentEl, {
      id: 'tool-builtin',
      name: 'read',
      kind: 'builtin',
      input: { file_path: '/tmp' },
      status: 'error',
      result: 'authentication required',
    });

    expect(parentEl.querySelector('.streaming-tool-auth-btn')).toBeNull();
  });

  it('calls onAuthenticateMcpServer with server name when clicked', () => {
    const parentEl = document.createElement('div');
    const onAuthenticateMcpServer = jest.fn();
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer });

    renderer.render(parentEl, {
      id: 'tool-mcp-click',
      name: 'mcp__notion__search',
      kind: 'mcp',
      input: { query: 'test' },
      status: 'error',
      result: 'Unauthorized: token expired',
      toolMetadata: { server: 'notion-test' },
    });

    const authBtn = parentEl.querySelector<HTMLButtonElement>('.streaming-tool-auth-btn');
    authBtn?.click();

    expect(onAuthenticateMcpServer).toHaveBeenCalledWith('notion-test');
  });

  it('does not trigger collapsible toggle when auth button is clicked', () => {
    const parentEl = document.createElement('div');
    const onAuthenticateMcpServer = jest.fn();
    const onCollapsibleToggle = jest.fn();
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer, onCollapsibleToggle });

    renderer.render(parentEl, {
      id: 'tool-mcp-stop',
      name: 'mcp__linear__get_issue',
      kind: 'mcp',
      input: { issueId: 'LIN-1' },
      status: 'error',
      result: '401 Unauthorized',
      toolMetadata: { server: 'linear-test' },
    });

    const authBtn = parentEl.querySelector<HTMLButtonElement>('.streaming-tool-auth-btn');
    authBtn?.click();

    expect(onCollapsibleToggle).not.toHaveBeenCalled();
  });

  it('adds auth button dynamically via updateResult when result becomes auth error', () => {
    const parentEl = document.createElement('div');
    const onAuthenticateMcpServer = jest.fn();
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer });

    renderer.render(parentEl, {
      id: 'tool-mcp-dynamic',
      name: 'mcp__linear__search',
      kind: 'mcp',
      input: { query: 'test' },
      status: 'running',
      toolMetadata: { server: 'linear-test' },
    });

    expect(parentEl.querySelector('.streaming-tool-auth-btn')).toBeNull();

    renderer.updateResult(parentEl.querySelector('.streaming-tool-call')!, {
      id: 'tool-mcp-dynamic',
      name: 'mcp__linear__search',
      kind: 'mcp',
      input: { query: 'test' },
      status: 'error',
      result: 'authentication required',
      toolMetadata: { server: 'linear-test' },
    });

    expect(parentEl.querySelector('.streaming-tool-auth-btn')).not.toBeNull();
  });

  it('removes auth button via updateResult when result changes to non-auth error', () => {
    const parentEl = document.createElement('div');
    const onAuthenticateMcpServer = jest.fn();
    const renderer = new ToolCallRenderer({ onAuthenticateMcpServer });

    renderer.render(parentEl, {
      id: 'tool-mcp-remove',
      name: 'mcp__linear__search',
      kind: 'mcp',
      input: { query: 'test' },
      status: 'error',
      result: 'authentication required',
      toolMetadata: { server: 'linear-test' },
    });

    expect(parentEl.querySelector('.streaming-tool-auth-btn')).not.toBeNull();

    renderer.updateResult(parentEl.querySelector('.streaming-tool-call')!, {
      id: 'tool-mcp-remove',
      name: 'mcp__linear__search',
      kind: 'mcp',
      input: { query: 'test' },
      status: 'error',
      result: 'Connection timeout',
      toolMetadata: { server: 'linear-test' },
    });

    expect(parentEl.querySelector('.streaming-tool-auth-btn')).toBeNull();
  });

  it('shows auth hint in expanded content for auth-failed MCP tool call', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-mcp-hint',
      name: 'mcp__linear__get_issue',
      kind: 'mcp',
      input: { issueId: 'LIN-1' },
      status: 'error',
      result: 'authentication required',
      toolMetadata: { server: 'linear-test' },
    });

    parentEl.querySelector<HTMLElement>('.streaming-tool-header')?.click();

    const hint = parentEl.querySelector('.streaming-mcp-auth-hint');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toContain('authentication');
  });
});

describe('ToolCallRenderer interactions', () => {
  it('calls the collapsible toggle callback when tool details expand', () => {
    const parentEl = document.createElement('div');
    const onCollapsibleToggle = jest.fn();
    const renderer = new ToolCallRenderer({ onCollapsibleToggle });

    renderer.render(parentEl, {
      id: 'tool-expand-1',
      name: 'read',
      input: { file_path: 'docs/spec.md' },
      status: 'completed',
      result: 'done',
    });

    parentEl.querySelector<HTMLElement>('.streaming-tool-header')?.click();

    expect(onCollapsibleToggle).toHaveBeenCalledTimes(1);
  });

  it('renders task metadata without exposing raw task_result output by default', () => {
    const parentEl = document.createElement('div');
    const onOpenToolSession = jest.fn();
    const renderer = new ToolCallRenderer({ onOpenToolSession } as never);

    renderer.render(parentEl, {
      id: 'tool-task-1',
      name: 'task',
      kind: 'task',
      input: {
        subagent_type: 'explorer',
        description: 'Audit routes',
      },
      toolMetadata: {
        sessionId: 'child-session-1',
      },
      resultVisibility: 'hidden',
      status: 'completed',
      result: 'task_id: child-session-1\n\n<task_result\u003e\nSecret subagent answer\n</task_result\u003e',
    });

    parentEl.querySelector<HTMLElement>('.streaming-tool-header')?.click();

    const contentEl = parentEl.querySelector('.streaming-tool-content');
    expect(contentEl?.textContent).toContain('explorer');
    expect(contentEl?.textContent).toContain('Audit routes');
    expect(contentEl?.textContent).toContain('child-session-1');
    expect(contentEl?.textContent).not.toContain('Secret subagent answer');
    expect(contentEl?.textContent).not.toContain('task_result');

    const openButton = parentEl.querySelector<HTMLButtonElement>('.streaming-task-session-button');
    expect(openButton).not.toBeNull();
    openButton?.click();

    expect(onOpenToolSession).toHaveBeenCalledWith(
      'child-session-1',
      expect.objectContaining({ id: 'tool-task-1', name: 'task' }),
    );
  });
});

import { ToolCallRenderer } from '../../../../src/utils/streaming/ToolCallRenderer';

describe('ToolCallRenderer', () => {
  const getHeader = (
    name: string,
    input: Record<string, unknown>,
    status: 'running' | 'completed' = 'running',
    kind?: 'builtin' | 'mcp' | 'custom' | 'task' | 'question' | 'skill' | 'plan' | 'unknown'
  ) => {
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
  };

  it('shows file names for write-style tools across path key variants', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-1',
      name: 'write',
      input: {
        filePath: 'docs/architecture/README.md',
      },
      status: 'running',
    });

    const summaryEl = parentEl.querySelector('.streaming-tool-summary');
    expect(summaryEl?.textContent).toBe('README.md');
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
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-3',
      name: 'skill',
      input: {
        name: 'imagegen',
      },
      status: 'running',
    });

    const nameEl = parentEl.querySelector('.streaming-tool-name');
    const summaryEl = parentEl.querySelector('.streaming-tool-summary');

    expect(nameEl?.textContent).toBe('Skill');
    expect(summaryEl?.textContent).toBe('imagegen');
  });

  it.each([
    ['read', { filePath: 'docs/architecture/README.md', offset: 5, limit: 10 }, 'Read', 'README.md · 5-14'],
    ['multiedit', { filePath: 'src/main.ts', edits: [{}, {}] }, 'MultiEdit', 'main.ts · 2 edits'],
    ['apply_patch', { patchText: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-x\n+y\n*** End Patch' }, 'Patch', 'main.ts'],
    ['list', { path: 'src/features/chat' }, 'List', 'chat'],
    ['glob', { pattern: '**/*.ts', path: 'src' }, 'Glob', '**/*.ts · src'],
    ['grep', { pattern: 'TODO', include: '*.ts' }, 'Grep', 'TODO · *.ts'],
    ['lsp', { operation: 'goToDefinition', filePath: 'src/main.ts', line: 12, character: 3 }, 'LSP', 'goToDefinition · main.ts:12:3'],
    ['websearch', { query: 'obsidian plugin api' }, 'WebSearch', 'obsidian plugin api'],
    ['webfetch', { url: 'https://example.com/docs' }, 'WebFetch', 'https://example.com/docs'],
    ['task', { subagent_type: 'explorer', description: 'audit routes' }, 'Background Task', 'explorer · audit routes'],
    ['question', { questions: [{ header: 'Build Agent', question: 'Continue?' }] }, 'Questions', 'Build Agent'],
    ['question', { questions: [{ question: 'A?' }, { question: 'B?' }] }, 'Questions', '2 questions'],
    ['todoread', {}, 'Todo Read', 'Current tasks'],
  ])('renders typed summary for %s', (toolName, input, expectedName, expectedSummary) => {
    const header = getHeader(toolName, input);
    expect(header.name).toBe(expectedName);
    expect(header.summary).toBe(expectedSummary);
  });

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
});

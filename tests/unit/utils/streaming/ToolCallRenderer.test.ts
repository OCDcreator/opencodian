import { ToolCallRenderer } from '../../../../src/utils/streaming/ToolCallRenderer';

describe('ToolCallRenderer', () => {
  const getHeader = (name: string, input: Record<string, unknown>, status: 'running' | 'completed' = 'running') => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();

    renderer.render(parentEl, {
      id: 'tool-test',
      name,
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
});

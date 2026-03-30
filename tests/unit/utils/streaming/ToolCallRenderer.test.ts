import { ToolCallRenderer } from '../../../../src/utils/streaming/ToolCallRenderer';

describe('ToolCallRenderer', () => {
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
});

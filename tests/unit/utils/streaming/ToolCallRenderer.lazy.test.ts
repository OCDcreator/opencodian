import { ToolCallRenderer } from '../../../../src/utils/streaming/ToolCallRenderer';

function createRenderer(options: ConstructorParameters<typeof ToolCallRenderer>[0] = {}) {
  const renderExpandedContent = jest.fn().mockImplementation((
    container: HTMLElement,
    _toolName: string,
    result: string | undefined,
  ) => {
    container.textContent = result ?? '(no result)';
  });
  const renderer = new ToolCallRenderer({
    renderExpandedContent,
    ...options,
  });
  return { renderer, renderExpandedContent };
}

function completedTool(overrides: Partial<{ id: string; name: string; kind: string; result: string }> = {}) {
  return {
    id: overrides.id ?? 'tool-1',
    name: overrides.name ?? 'read',
    kind: overrides.kind as never,
    input: { path: 'a.md' },
    status: 'completed' as const,
    result: overrides.result ?? 'file content',
  };
}

describe('ToolCallRenderer lazy expanded content', () => {
  it('does not render expanded content when lazy + collapsed (default)', () => {
    const { renderer, renderExpandedContent } = createRenderer({ lazy: true });
    const parent = document.createElement('div');

    renderer.render(parent, completedTool());

    // Header is rendered, but expanded content is deferred.
    expect(parent.querySelector('.streaming-tool-name')).not.toBeNull();
    expect(renderExpandedContent).not.toHaveBeenCalled();
    const content = parent.querySelector('.streaming-tool-content') as HTMLElement;
    expect(content.style.display).toBe('none');
  });

  it('renders expanded content eagerly when not lazy', () => {
    const { renderer, renderExpandedContent } = createRenderer();
    const parent = document.createElement('div');

    renderer.render(parent, completedTool());

    expect(renderExpandedContent).toHaveBeenCalledTimes(1);
  });

  it('renders on first expand, then reuses on collapse/expand', () => {
    const { renderer, renderExpandedContent } = createRenderer({ lazy: true });
    const parent = document.createElement('div');

    renderer.render(parent, completedTool());
    expect(renderExpandedContent).not.toHaveBeenCalled();

    const header = parent.querySelector('.streaming-tool-header') as HTMLElement;
    const content = parent.querySelector('.streaming-tool-content') as HTMLElement;

    // First expand triggers render.
    header.click();
    expect(renderExpandedContent).toHaveBeenCalledTimes(1);
    expect(content.style.display).toBe('block');
    expect(content.textContent).toBe('file content');

    // Collapse does not re-render.
    header.click();
    expect(renderExpandedContent).toHaveBeenCalledTimes(1);
    expect(content.style.display).toBe('none');

    // Second expand reuses (no new render).
    header.click();
    expect(renderExpandedContent).toHaveBeenCalledTimes(1);
    expect(content.style.display).toBe('block');
  });

  it('restores expanded state and renders eagerly when previously expanded', () => {
    const getInitialExpanded = jest.fn().mockReturnValue(true);
    const { renderer, renderExpandedContent } = createRenderer({
      lazy: true,
      getInitialExpanded,
    });
    const parent = document.createElement('div');

    renderer.render(parent, completedTool({ id: 'tool-1' }));

    expect(getInitialExpanded).toHaveBeenCalledWith('tool-1');
    expect(renderExpandedContent).toHaveBeenCalledTimes(1);
    const content = parent.querySelector('.streaming-tool-content') as HTMLElement;
    expect(content.style.display).toBe('block');
  });

  it('persists expansion changes via onExpandedChange', () => {
    const onExpandedChange = jest.fn();
    const { renderer } = createRenderer({ lazy: true, onExpandedChange });
    const parent = document.createElement('div');

    renderer.render(parent, completedTool({ id: 'tool-1' }));
    const header = parent.querySelector('.streaming-tool-header') as HTMLElement;

    header.click();
    expect(onExpandedChange).toHaveBeenCalledWith('tool-1', true);

    header.click();
    expect(onExpandedChange).toHaveBeenCalledWith('tool-1', false);
  });
});

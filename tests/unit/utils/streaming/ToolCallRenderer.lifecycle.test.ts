import { disposeCollapsiblesWithin } from '../../../../src/features/chat/rendering/collapsible';
import { ToolCallRenderer } from '../../../../src/utils/streaming/ToolCallRenderer';

describe('ToolCallRenderer lifecycle', () => {
  it('releases tool header listeners before a cleared card is rebuilt', () => {
    const parentEl = document.createElement('div');
    const onCollapsibleToggle = jest.fn();
    const renderer = new ToolCallRenderer({ onCollapsibleToggle });
    const toolCall = {
      id: 'tool-rebuild-1',
      name: 'read',
      input: { file_path: 'docs/spec.md' },
      status: 'completed' as const,
      result: 'done',
    };

    const firstToolEl = renderer.render(parentEl, toolCall);
    const firstHeader = firstToolEl.querySelector<HTMLElement>('.streaming-tool-header');
    renderer.cleanup(firstToolEl);
    firstHeader?.click();
    expect(onCollapsibleToggle).not.toHaveBeenCalled();

    parentEl.replaceChildren();
    const secondToolEl = renderer.render(parentEl, { ...toolCall, id: 'tool-rebuild-2' });
    secondToolEl.querySelector<HTMLElement>('.streaming-tool-header')?.click();
    expect(onCollapsibleToggle).toHaveBeenCalledTimes(1);

    disposeCollapsiblesWithin(parentEl);
    secondToolEl.querySelector<HTMLElement>('.streaming-tool-header')?.click();
    expect(onCollapsibleToggle).toHaveBeenCalledTimes(1);
  });
});

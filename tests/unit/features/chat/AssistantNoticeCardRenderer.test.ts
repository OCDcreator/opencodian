import type { ChatMessage } from '../../../../src/core/types';
import { AssistantNoticeCardRenderer } from '../../../../src/features/chat/runtime/AssistantNoticeCardRenderer';

describe('AssistantNoticeCardRenderer', () => {
  function createRenderer() {
    const renderMarkdownInto = jest.fn(async (container: HTMLElement, markdown: string) => {
      container.setText(`markdown:${markdown}`);
    });
    const handleNoticeAction = jest.fn();
    const renderer = new AssistantNoticeCardRenderer({
      renderMarkdownInto,
      handleNoticeAction,
    });

    return {
      handleNoticeAction,
      renderMarkdownInto,
      renderer,
    };
  }

  it('renders notice tone, markdown body, and actions through a narrow host', async () => {
    const { handleNoticeAction, renderMarkdownInto, renderer } = createRenderer();
    const container = document.createElement('div');
    const message: ChatMessage = {
      id: 'notice-1',
      role: 'assistant',
      content: 'Notice body',
      timestamp: 123,
      displayStyle: 'notice',
      noticeTitle: 'Heads up',
      noticeTone: 'warning',
      noticeActions: [{ type: 'restore_rewind' }],
    };

    await renderer.render(container, message);

    expect(container.querySelector('.opencodian-chat-notice-card.is-warning')).not.toBeNull();
    expect(container.querySelector('.opencodian-chat-notice-title')?.textContent).toBe('Heads up');
    expect(renderMarkdownInto).toHaveBeenCalledWith(expect.any(HTMLElement), 'Notice body');

    const actionButton = container.querySelector<HTMLButtonElement>('.opencodian-chat-notice-action-btn');
    expect(actionButton?.textContent).toBeTruthy();
    actionButton?.click();
    expect(handleNoticeAction).toHaveBeenCalledWith('restore_rewind');
  });

  it('normalizes OMO system reminders into notice body and raw detail blocks', async () => {
    const { renderMarkdownInto, renderer } = createRenderer();
    const container = document.createElement('div');
    const message: ChatMessage = {
      id: 'omo-notice-1',
      role: 'assistant',
      content: 'Fallback content',
      timestamp: 456,
      displayStyle: 'notice',
      omo: {
        kind: 'system-reminder',
        reminderType: 'background-task-completed',
        reminderText: 'Task completed\nEdited [[note.md]]',
        rawText: '<system-reminder>Task completed</system-reminder>',
        headline: 'Task completed',
        isInternalInitiator: false,
      },
    };

    await renderer.render(container, message);

    expect(container.querySelector('.opencodian-chat-notice-title')?.textContent).toBeTruthy();
    expect(renderMarkdownInto).toHaveBeenCalledWith(expect.any(HTMLElement), 'Edited [[note.md]]');
    expect(container.querySelector('.opencodian-omo-raw-block--notice')).not.toBeNull();
    expect(container.querySelector('.opencodian-omo-raw-content')?.textContent)
      .toBe('<system-reminder>Task completed</system-reminder>');
  });
});

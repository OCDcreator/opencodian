import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

describe('OpenCodianView streaming assistant shell visibility', () => {
  function createView(): OpenCodianView {
    return new OpenCodianView(new WorkspaceLeaf(), {
      settings: {
        effortLevel: 'medium',
        thinkingBudget: 0,
        locale: 'en',
      },
      openCodeService: {},
      storage: {},
    } as never);
  }

  it('keeps deferred streaming assistant shells hidden until reveal is requested', () => {
    const view = createView() as unknown as {
      createAssistantMessageElement: (
        tabId: string,
        hiddenUntilVisible?: boolean,
      ) => { messageEl: HTMLElement; contentEl: HTMLElement };
      revealStreamingAssistantMessageElement: (tabId: string) => HTMLElement | null;
      getTabPaneState: (tabId: string) => {
        runtime: {
          streamingMessageEl: HTMLElement | null;
          streamingContentEl: HTMLElement | null;
        };
      } | null;
      ensureTurnBody: (tabId: string) => HTMLElement;
      getActiveTabId: () => string;
      shouldAutoScroll: (tabId: string) => boolean;
      scheduleSettledScrollToBottomIfNeeded: (autoScroll?: boolean, tabId?: string) => void;
    };

    const turnBody = document.createElement('div');
    const runtime = {
      streamingMessageEl: null as HTMLElement | null,
      streamingContentEl: null as HTMLElement | null,
    };

    jest.spyOn(view, 'getTabPaneState').mockReturnValue({ runtime } as never);
    jest.spyOn(view, 'ensureTurnBody').mockReturnValue(turnBody);
    jest.spyOn(view, 'getActiveTabId').mockReturnValue('tab-1');
    jest.spyOn(view, 'shouldAutoScroll').mockReturnValue(true);
    const scrollSpy = jest.spyOn(view, 'scheduleSettledScrollToBottomIfNeeded').mockImplementation(() => {});

    const { messageEl, contentEl } = view.createAssistantMessageElement('tab-1', true);

    expect(messageEl.hidden).toBe(true);
    expect(turnBody.contains(messageEl)).toBe(true);
    expect(runtime.streamingMessageEl).toBe(messageEl);
    expect(runtime.streamingContentEl).toBe(contentEl);

    const revealed = view.revealStreamingAssistantMessageElement('tab-1');

    expect(revealed).toBe(messageEl);
    expect(messageEl.hidden).toBe(false);
    expect(scrollSpy).toHaveBeenCalledWith(true, 'tab-1');
  });

  it('reveals a hidden streaming shell when adding an inline card', () => {
    const view = createView() as unknown as {
      createStreamingInlineCard: (className: string, tabId: string) => HTMLElement | null;
      getTabRuntimeState: (tabId: string) => { streamingMessageEl: HTMLElement | null } | null;
      getActiveTabId: () => string;
      shouldAutoScroll: (tabId: string) => boolean;
      scheduleSettledScrollToBottomIfNeeded: (autoScroll?: boolean, tabId?: string) => void;
    };

    const messageEl = document.createElement('div');
    messageEl.hidden = true;
    messageEl.createDiv({ cls: 'opencodian-message-content' });

    jest.spyOn(view, 'getTabRuntimeState').mockReturnValue({ streamingMessageEl: messageEl } as never);
    jest.spyOn(view, 'getActiveTabId').mockReturnValue('tab-1');
    jest.spyOn(view, 'shouldAutoScroll').mockReturnValue(true);
    jest.spyOn(view, 'scheduleSettledScrollToBottomIfNeeded').mockImplementation(() => {});

    const cardEl = view.createStreamingInlineCard('opencodian-question-inline', 'tab-1');

    expect(cardEl).not.toBeNull();
    expect(messageEl.hidden).toBe(false);
    expect(messageEl.querySelector('.opencodian-question-inline')).toBe(cardEl);
  });
});

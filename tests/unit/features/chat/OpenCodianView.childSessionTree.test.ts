import { WorkspaceLeaf } from 'obsidian';

import type { ChildSessionGraph } from '../../../../src/core/agents';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

function createView(): OpenCodianView {
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      effortLevel: 'medium',
      thinkingBudget: 0,
      locale: 'en',
      maxTabs: 3,
    },
    openCodeService: {},
    storage: {},
    saveConversation: jest.fn().mockResolvedValue(undefined),
  } as never);
}

describe('OpenCodianView child-session tree', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('renders localized partial-graph rows and opens linked child sessions', () => {
    const view = createView() as OpenCodianView & {
      messagesContainer: HTMLElement | null;
      childSessionTreeEl: HTMLElement | null;
      renderSessionTree(graph: ChildSessionGraph): void;
      openTaskToolSession(sessionId: string): Promise<void>;
    };
    const messagesContainer = document.body.createDiv();
    view.messagesContainer = messagesContainer;
    view.childSessionTreeEl = null;

    const openSpy = jest
      .spyOn(view as unknown as { openTaskToolSession(sessionId: string): Promise<void> }, 'openTaskToolSession')
      .mockResolvedValue(undefined);

    view.renderSessionTree({
      parentSessionId: 'parent-1',
      status: 'partial',
      edges: [
        {
          parentSessionId: 'parent-1',
          parentMessageId: 'message-1',
          toolCallId: 'tool-1',
          childSessionId: 'child-1',
          subagentId: 'explore',
          description: 'Inspect runtime graph',
          title: 'explore · Inspect runtime graph',
          status: 'completed',
        },
      ],
      orphanedSessions: [
        {
          id: 'orphan-1',
          title: 'Recovered orphan',
          updatedAt: 20,
        },
      ],
      orphanedSessionIds: ['orphan-1'],
    });

    expect(messagesContainer.textContent).toContain('Child Sessions (2)');
    expect(messagesContainer.textContent).toContain('explore · Inspect runtime graph');
    expect(messagesContainer.textContent).toContain('Unknown task');
    expect(messagesContainer.textContent).toContain('Partial graph');
    expect(messagesContainer.textContent).toContain('Partial graph — some sessions lack task metadata');

    const buttons = Array.from(messagesContainer.querySelectorAll('button.opencodian-session-tree-open-btn'));
    expect(buttons).toHaveLength(2);

    (buttons[0] as HTMLButtonElement).click();
    expect(openSpy).toHaveBeenCalledWith('child-1');
  });
});

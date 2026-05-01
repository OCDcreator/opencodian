import type { ChildSessionGraph } from '../../../../src/core/agents';
import {
  ChildSessionGraphCoordinator,
} from '../../../../src/features/chat/services/ChildSessionGraphCoordinator';

function createCoordinator(
  messagesContainer: HTMLElement,
  openTaskToolSession: (sessionId: string) => void = () => {},
): ChildSessionGraphCoordinator {
  return new ChildSessionGraphCoordinator({
    getCurrentConversation: () => null,
    getSessionChildren: async () => [],
    onGraphUpdated: () => {},
    getMessagesContainerEl: () => messagesContainer,
    openTaskToolSession,
  });
}

function createGraph(): ChildSessionGraph {
  return {
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
  };
}

describe('ChildSessionGraphCoordinator child-session tree rendering', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('renders localized partial-graph rows and opens linked child sessions', () => {
    const messagesContainer = document.body.createDiv();
    const openSpy = jest.fn();
    const coordinator = createCoordinator(messagesContainer, openSpy);

    coordinator.render(createGraph());

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

  it('does not leave stale DOM nodes when switching containers (regression)', () => {
    const container1 = document.body.createDiv();
    const container2 = document.body.createDiv();
    let currentContainer = container1;

    const coordinator = new ChildSessionGraphCoordinator({
      getCurrentConversation: () => null,
      getSessionChildren: async () => [],
      onGraphUpdated: () => {},
      getMessagesContainerEl: () => currentContainer,
      openTaskToolSession: () => {},
    });

    coordinator.render(createGraph());
    expect(container1.querySelectorAll('.opencodian-session-tree')).toHaveLength(1);
    expect(container2.querySelectorAll('.opencodian-session-tree')).toHaveLength(0);

    currentContainer = container2;
    coordinator.render(createGraph());

    expect(container1.querySelectorAll('.opencodian-session-tree')).toHaveLength(0);
    expect(container2.querySelectorAll('.opencodian-session-tree')).toHaveLength(1);

    currentContainer = container1;
    coordinator.render(createGraph());

    expect(container2.querySelectorAll('.opencodian-session-tree')).toHaveLength(0);
    expect(container1.querySelectorAll('.opencodian-session-tree')).toHaveLength(1);
  });

  it('removes DOM element on clearContainer and allows re-render', () => {
    const messagesContainer = document.body.createDiv();
    const coordinator = createCoordinator(messagesContainer);

    coordinator.render(createGraph());
    expect(messagesContainer.querySelectorAll('.opencodian-session-tree')).toHaveLength(1);

    coordinator.clearContainer();
    expect(messagesContainer.querySelectorAll('.opencodian-session-tree')).toHaveLength(0);

    coordinator.render(createGraph());
    expect(messagesContainer.querySelectorAll('.opencodian-session-tree')).toHaveLength(1);
  });

  it('hides and re-shows the tree correctly', () => {
    const messagesContainer = document.body.createDiv();
    const coordinator = createCoordinator(messagesContainer);

    coordinator.render(createGraph());
    const treeEl = messagesContainer.querySelector('.opencodian-session-tree');
    expect(treeEl).not.toBeNull();
    expect((treeEl as HTMLElement).style.display).not.toBe('none');

    coordinator.hide();
    expect((treeEl as HTMLElement).style.display).toBe('none');
    expect((treeEl as HTMLElement).childElementCount).toBe(0);

    coordinator.render(createGraph());
    expect((treeEl as HTMLElement).style.display).not.toBe('none');
    expect((treeEl as HTMLElement).childElementCount).toBeGreaterThan(0);
  });
});

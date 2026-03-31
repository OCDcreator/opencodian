import { SessionTodoDock } from '../../../../src/features/chat/ui/SessionTodoDock';

describe('SessionTodoDock', () => {
  function createDock() {
    const parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    const dock = new SessionTodoDock(parentEl);
    const rootEl = parentEl.querySelector<HTMLElement>('[data-component="session-todo-dock"]');

    if (!rootEl) {
      throw new Error('Session todo dock root was not created');
    }

    return { dock, parentEl, rootEl };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the dock while there are incomplete todos', () => {
    const { dock, rootEl } = createDock();

    dock.update([
      { content: 'Finish analysis', status: 'in_progress' },
      { content: 'Write summary', status: 'pending' },
      { content: 'Set up context', status: 'completed' },
    ]);

    expect(rootEl.classList.contains('is-hidden')).toBe(false);
    expect(rootEl.querySelectorAll('.opencodian-session-todo-item')).toHaveLength(3);
  });

  it('hides the dock once all todos are completed', () => {
    const { dock, rootEl } = createDock();

    dock.update([
      { content: 'Finish analysis', status: 'completed' },
      { content: 'Write summary', status: 'completed' },
    ]);

    expect(rootEl.classList.contains('is-hidden')).toBe(true);
    expect(rootEl.querySelector('.opencodian-session-todo-label')?.textContent).toBe('');
    expect(rootEl.querySelectorAll('.opencodian-session-todo-item')).toHaveLength(0);
  });
});

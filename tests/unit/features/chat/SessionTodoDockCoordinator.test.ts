import type { SessionTodo } from '../../../../src/core/types';
import {
  SessionTodoDockCoordinator,
  type SessionTodoDockCoordinatorHost,
  type SessionTodoDockCoordinatorRuntimeState,
} from '../../../../src/features/chat/services/SessionTodoDockCoordinator';
import { setLocale } from '../../../../src/i18n';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createRuntime(
  sessionTodoSessionId: string | null,
): SessionTodoDockCoordinatorRuntimeState {
  return {
    sessionTodoSessionId,
  };
}

function createHost(options?: {
  activeTabId?: string | null;
  currentConversationSessionId?: string | null;
  runtimeSessionIdsByTab?: Record<string, string | null>;
  todosBySessionId?: Record<string, SessionTodo[]>;
}) {
  const activeTabId = options?.activeTabId ?? 'tab-active';
  const currentConversationSessionId = options?.currentConversationSessionId ?? 'session-active';
  const runtimeByTab = new Map<string, SessionTodoDockCoordinatorRuntimeState>([
    ['tab-active', createRuntime(options?.runtimeSessionIdsByTab?.['tab-active'] ?? 'session-runtime')],
  ]);

  for (const [tabId, sessionId] of Object.entries(options?.runtimeSessionIdsByTab ?? {})) {
    runtimeByTab.set(tabId, createRuntime(sessionId));
  }

  const todosBySessionId = new Map<string, SessionTodo[]>(
    Object.entries(options?.todosBySessionId ?? {
      'session-active': [{ content: 'Active todo', status: 'in_progress' }],
      'session-runtime': [{ content: 'Runtime todo', status: 'pending' }],
    }),
  );

  const host: Mocked<SessionTodoDockCoordinatorHost> = {
    getActiveTabId: jest.fn().mockReturnValue(activeTabId),
    getCurrentConversationSessionId: jest.fn().mockReturnValue(currentConversationSessionId),
    getTabRuntimeState: jest.fn((tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null)),
    getTabSessionTodos: jest.fn((_, sessionId) =>
      sessionId ? [...(todosBySessionId.get(sessionId) ?? [])] : []),
  };

  return { host };
}

function getRenderedTodoTexts(): string[] {
  return [...document.querySelectorAll('.opencodian-session-todo-text')]
    .map((node) => node.textContent ?? '');
}

describe('SessionTodoDockCoordinator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setLocale('en');
    jest.clearAllMocks();
  });

  it('renders the active tab from the current conversation session id', () => {
    const { host } = createHost();
    const coordinator = new SessionTodoDockCoordinator(host);

    coordinator.attach(document.body);
    coordinator.render('tab-active');

    expect(host.getTabSessionTodos).toHaveBeenCalledWith('tab-active', 'session-active');
    expect(getRenderedTodoTexts()).toEqual(['Active todo']);
  });

  it('uses the tab runtime session snapshot during activation preflight updates', () => {
    const { host } = createHost();
    const coordinator = new SessionTodoDockCoordinator(host);

    coordinator.attach(document.body);
    coordinator.updateForTab('tab-active');

    expect(host.getTabSessionTodos).toHaveBeenCalledWith('tab-active', 'session-runtime');
    expect(getRenderedTodoTexts()).toEqual(['Runtime todo']);
  });

  it('renders background tabs from their stored runtime session id', () => {
    const { host } = createHost({
      runtimeSessionIdsByTab: {
        'tab-active': 'session-active',
        'tab-background': 'session-background',
      },
      todosBySessionId: {
        'session-active': [{ content: 'Active todo', status: 'in_progress' }],
        'session-background': [{ content: 'Background todo', status: 'pending' }],
      },
    });
    const coordinator = new SessionTodoDockCoordinator(host);

    coordinator.attach(document.body);
    coordinator.render('tab-background');

    expect(host.getTabSessionTodos).toHaveBeenCalledWith('tab-background', 'session-background');
    expect(getRenderedTodoTexts()).toEqual(['Background todo']);
  });

  it('removes the owned dock slot on destroy', () => {
    const { host } = createHost();
    const coordinator = new SessionTodoDockCoordinator(host);

    coordinator.attach(document.body);
    expect(document.querySelector('.opencodian-session-todo-slot')).not.toBeNull();

    coordinator.destroy();

    expect(document.querySelector('.opencodian-session-todo-slot')).toBeNull();
  });
});

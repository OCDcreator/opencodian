import type { SessionTodo } from '../../../core/types';
import type { TabId } from '../tabs';
import { SessionTodoDock } from '../ui/SessionTodoDock';

export interface SessionTodoDockCoordinatorRuntimeState {
  sessionTodoSessionId: string | null;
}

export interface SessionTodoDockCoordinatorHost {
  getActiveTabId(): TabId | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getTabRuntimeState(tabId: TabId | null): SessionTodoDockCoordinatorRuntimeState | null;
  getTabSessionTodos(tabId: TabId | null, sessionId?: string | null): SessionTodo[];
}

export class SessionTodoDockCoordinator {
  private mountEl: HTMLElement | null = null;
  private dock: SessionTodoDock | null = null;

  constructor(private readonly host: SessionTodoDockCoordinatorHost) {}

  attach(parentEl: HTMLElement): void {
    this.destroy();
    this.mountEl = parentEl.createDiv({ cls: 'opencodian-session-todo-slot' });
    this.dock = new SessionTodoDock(this.mountEl);
  }

  render(tabId: TabId | null = this.host.getActiveTabId()): void {
    this.dock?.update(this.host.getTabSessionTodos(tabId, this.getRenderSessionId(tabId)));
  }

  updateForTab(tabId: TabId): void {
    const sessionId = this.host.getTabRuntimeState(tabId)?.sessionTodoSessionId ?? null;
    this.dock?.update(this.host.getTabSessionTodos(tabId, sessionId));
  }

  destroy(): void {
    this.dock?.destroy();
    this.dock = null;
    this.mountEl?.remove();
    this.mountEl = null;
  }

  private getRenderSessionId(tabId: TabId | null): string | null {
    if (tabId === this.host.getActiveTabId()) {
      return this.host.getCurrentConversationSessionId() ?? null;
    }

    return this.host.getTabRuntimeState(tabId)?.sessionTodoSessionId ?? null;
  }
}

import type { ChildSessionGraph, ChildSessionInfo } from '../../../core/agents';
import { ChildSessionGraphService } from '../../../core/agents';
import type { Conversation } from '../../../core/types';
import { t } from '../../../i18n';

export interface ChildSessionGraphCoordinatorHost {
  getCurrentConversation(): Conversation | null;
  getSessionChildren(sessionId: string): Promise<ChildSessionInfo[]>;
  onGraphUpdated(graph: ChildSessionGraph): void;
  getMessagesContainerEl(): HTMLElement | null;
  openTaskToolSession(sessionId: string): void;
}

export const SESSION_TREE_BASE_CSS = `
.opencodian-session-tree {
  margin: 8px 12px 0;
  border-top: 1px solid var(--background-modifier-border);
  padding-top: 8px;
}

.opencodian-session-tree-details {
  display: block;
}

.opencodian-session-tree-header {
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.opencodian-session-tree-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.opencodian-session-tree-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 0;
  font-size: 12px;
}

.opencodian-session-tree-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}

.opencodian-session-tree-dot--completed { background: var(--text-success, var(--color-green)); }
.opencodian-session-tree-dot--active { background: var(--text-warning, var(--color-orange)); }
.opencodian-session-tree-dot--error { background: var(--text-error, var(--color-red)); }
.opencodian-session-tree-dot--unknown { background: var(--text-muted); }

.opencodian-session-tree-content {
  flex: 1;
  min-width: 0;
}

.opencodian-session-tree-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-normal);
}

.opencodian-session-tree-description {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11px;
  margin-top: 2px;
}

.opencodian-session-tree-row--orphaned .opencodian-session-tree-title {
  color: var(--text-muted);
  font-style: italic;
}

.opencodian-session-tree-badge {
  border-radius: 999px;
  padding: 1px 6px;
  background: var(--background-modifier-hover);
}

.opencodian-session-tree-open-btn {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  cursor: pointer;
  background: var(--background-modifier-hover);
  color: var(--text-muted);
  border: none;
}

.opencodian-session-tree-open-btn:hover {
  background: var(--background-modifier-active-hover);
  color: var(--text-normal);
}

.opencodian-session-tree-notice {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
  margin-top: 6px;
}
`;

export class ChildSessionGraphCoordinator {
  private readonly service = new ChildSessionGraphService();
  private currentGraph: ChildSessionGraph | null = null;
  private childSessionTreeEl: HTMLElement | null = null;

  constructor(private readonly host: ChildSessionGraphCoordinatorHost) {}

  getGraph(): ChildSessionGraph | null {
    return this.currentGraph;
  }

  async refreshGraph(): Promise<ChildSessionGraph | null> {
    const conversation = this.host.getCurrentConversation();
    if (!conversation?.openCodeSessionId) {
      this.currentGraph = null;
      return null;
    }

    let childSessions: ChildSessionInfo[] | undefined;
    try {
      childSessions = await this.host.getSessionChildren(conversation.openCodeSessionId);
    } catch {
      childSessions = undefined;
    }

    const graph = this.service.reconstructGraph({
      parentSessionId: conversation.openCodeSessionId,
      messages: conversation.messages,
      childSessions,
    });

    this.currentGraph = graph;
    this.host.onGraphUpdated(graph);
    return graph;
  }

  clearGraph(): void {
    this.currentGraph = null;
  }

  clearContainer(): void {
    this.childSessionTreeEl?.remove();
    this.childSessionTreeEl = null;
  }

  hide(): void {
    if (!this.childSessionTreeEl) {
      return;
    }

    this.childSessionTreeEl.empty();
    this.childSessionTreeEl.style.display = 'none';
  }

  render(graph: ChildSessionGraph): void {
    const container = this.ensureContainer();
    if (!container) {
      return;
    }

    container.empty();
    if (graph.status === 'empty') {
      container.style.display = 'none';
      return;
    }

    container.style.display = '';

    const detailsEl = container.createEl('details', {
      cls: 'opencodian-session-tree-details',
    });
    detailsEl.open = true;

    detailsEl.createEl('summary', {
      cls: 'opencodian-session-tree-header',
      text: t('chat.childSessionTree.header', {
        count: String(graph.edges.length + graph.orphanedSessions.length),
      }),
    });

    const listEl = detailsEl.createDiv({ cls: 'opencodian-session-tree-list' });

    for (const edge of graph.edges) {
      const rowEl = listEl.createDiv({ cls: 'opencodian-session-tree-row' });
      rowEl.createSpan({
        cls: `opencodian-session-tree-dot opencodian-session-tree-dot--${edge.status}`,
      });

      const contentEl = rowEl.createDiv({ cls: 'opencodian-session-tree-content' });
      contentEl.createDiv({
        cls: 'opencodian-session-tree-title',
        text: edge.title ?? edge.subagentId ?? edge.childSessionId,
      });
      if (edge.description && edge.description !== edge.title) {
        contentEl.createDiv({
          cls: 'opencodian-session-tree-description',
          text: edge.description,
        });
      }

      const openBtn = rowEl.createEl('button', {
        cls: 'opencodian-session-tree-open-btn',
        text: t('chat.childSessionTree.open'),
      });
      openBtn.addEventListener('click', () => {
        this.host.openTaskToolSession(edge.childSessionId);
      });
    }

    for (const orphaned of graph.orphanedSessions) {
      const rowEl = listEl.createDiv({
        cls: 'opencodian-session-tree-row opencodian-session-tree-row--orphaned',
      });
      rowEl.createSpan({
        cls: 'opencodian-session-tree-dot opencodian-session-tree-dot--unknown',
      });

      const contentEl = rowEl.createDiv({ cls: 'opencodian-session-tree-content' });
      contentEl.createDiv({
        cls: 'opencodian-session-tree-title',
        text: t('chat.childSessionTree.unknownTask'),
      });
      const metaEl = contentEl.createDiv({ cls: 'opencodian-session-tree-description' });
      metaEl.createSpan({
        cls: 'opencodian-session-tree-badge',
        text: t('chat.childSessionTree.partialBadge'),
      });
      if (orphaned.title) {
        metaEl.createSpan({
          cls: 'opencodian-session-tree-orphaned-title',
          text: orphaned.title,
        });
      }

      const openBtn = rowEl.createEl('button', {
        cls: 'opencodian-session-tree-open-btn',
        text: t('chat.childSessionTree.open'),
      });
      openBtn.addEventListener('click', () => {
        this.host.openTaskToolSession(orphaned.id);
      });
    }

    if (graph.status === 'partial') {
      detailsEl.createDiv({
        cls: 'opencodian-session-tree-notice',
        text: t('chat.childSessionTree.partialNotice'),
      });
    }
  }

  private ensureContainer(): HTMLElement | null {
    const messagesContainer = this.host.getMessagesContainerEl();
    if (!messagesContainer) {
      this.childSessionTreeEl?.remove();
      this.childSessionTreeEl = null;
      return null;
    }

    if (this.childSessionTreeEl?.parentElement !== messagesContainer) {
      this.childSessionTreeEl?.remove();
      this.childSessionTreeEl = messagesContainer.createDiv({ cls: 'opencodian-session-tree' });
    }

    return this.childSessionTreeEl;
  }
}

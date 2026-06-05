import { App, Modal } from 'obsidian';

import { getBackendSessionPreview, listBackendSessions, type NormalizedSessionPreviewMessage, type NormalizedSessionRow } from '../../../core/agents/backend/AgentBackendRouting';
import type { AgentServiceRegistry } from '../../../core/agents/backend/AgentServiceRegistry';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';

const logger = createLogger('BackendSessionBrowserModal');

export interface BackendSessionBrowserHost {
  getAgentServiceRegistry(): AgentServiceRegistry | null;
  createConversationFromBackendSession(sessionId: string, title: string): Promise<string | null>;
  loadConversation(conversationId: string): Promise<void>;
  getActiveBackendKind(): string | null;
  showNotice(message: string): void;
  isStreaming(): boolean;
}

export class BackendSessionBrowserModal extends Modal {
  private sessions: NormalizedSessionRow[] = [];
  private selectedSessionId: string | null = null;
  private previewEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private loading = false;

  constructor(
    app: App,
    private readonly host: BackendSessionBrowserHost,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t('chat.backendSessions.modalTitle'));
    this.modalEl.addClass('opencodian-backend-session-browser');

    const contentEl = this.contentEl;
    contentEl.empty();

    // Two-column layout: list on left, preview on right
    const containerEl = contentEl.createDiv({ cls: 'opencodian-backend-session-browser-container' });

    // Left: session list
    const listContainer = containerEl.createDiv({ cls: 'opencodian-backend-session-browser-list' });
    this.listEl = listContainer.createDiv({ cls: 'opencodian-backend-session-browser-list-inner' });

    // Right: preview
    this.previewEl = containerEl.createDiv({ cls: 'opencodian-backend-session-browser-preview' });
    this.previewEl.createEl('p', {
      cls: 'opencodian-backend-session-browser-preview-hint',
      text: t('chat.backendSessions.previewHint'),
    });

    // Footer: actions
    const footerEl = contentEl.createDiv({ cls: 'opencodian-backend-session-browser-footer' });

    const resumeBtn = footerEl.createEl('button', {
      cls: 'mod-cta opencodian-backend-session-browser-resume-btn',
      text: t('chat.backendSessions.resumeButton'),
    });
    resumeBtn.disabled = true;
    resumeBtn.addEventListener('click', () => {
      if (this.selectedSessionId) {
        void this.resumeSession(this.selectedSessionId);
      }
    });

    const refreshBtn = footerEl.createEl('button', {
      text: t('chat.backendSessions.refreshButton'),
    });
    refreshBtn.addEventListener('click', () => {
      void this.loadSessions();
    });

    void this.loadSessions();
  }

  onClose(): void {
    this.sessions = [];
    this.selectedSessionId = null;
  }

  private async loadSessions(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    if (!this.listEl) return;
    this.listEl.empty();
    this.listEl.createEl('p', {
      cls: 'opencodian-backend-session-browser-loading',
      text: t('chat.backendSessions.loading'),
    });

    const registry = this.host.getAgentServiceRegistry();
    try {
      this.sessions = await listBackendSessions(registry);
    } catch (err) {
      logger.warn('Failed to list backend sessions', { error: err instanceof Error ? err.message : String(err) });
      this.sessions = [];
    }

    this.loading = false;
    this.renderSessionList();
  }

  private renderSessionList(): void {
    if (!this.listEl) return;
    this.listEl.empty();

    if (this.sessions.length === 0) {
      this.listEl.createEl('p', {
        cls: 'opencodian-backend-session-browser-empty',
        text: t('chat.backendSessions.empty'),
      });
      return;
    }

    for (const session of this.sessions) {
      const itemEl = this.listEl.createDiv({
        cls: 'opencodian-backend-session-browser-item',
        attr: { 'data-session-id': session.id },
      });

      if (this.selectedSessionId === session.id) {
        itemEl.addClass('is-selected');
      }

      itemEl.createDiv({
        cls: 'opencodian-backend-session-browser-item-title',
        text: session.title || t('chat.backendSessions.untitled'),
      });

      if (session.updatedAt) {
        itemEl.createDiv({
          cls: 'opencodian-backend-session-browser-item-date',
          text: this.formatDate(session.updatedAt),
        });
      }

      itemEl.addEventListener('click', () => {
        this.selectedSessionId = session.id;
        this.updateSelection();
        void this.loadPreview(session.id);

        // Enable resume button
        const resumeBtn = this.contentEl.querySelector('.opencodian-backend-session-browser-resume-btn') as HTMLButtonElement | null;
        if (resumeBtn) {
          resumeBtn.disabled = this.host.isStreaming();
        }
      });
    }
  }

  private updateSelection(): void {
    if (!this.listEl) return;
    const items = this.listEl.querySelectorAll('.opencodian-backend-session-browser-item');
    for (const item of items) {
      const el = item as HTMLElement;
      if (el.getAttribute('data-session-id') === this.selectedSessionId) {
        el.addClass('is-selected');
      } else {
        el.removeClass('is-selected');
      }
    }
  }

  private async loadPreview(sessionId: string): Promise<void> {
    if (!this.previewEl) return;
    this.previewEl.empty();
    this.previewEl.createEl('p', {
      cls: 'opencodian-backend-session-browser-preview-loading',
      text: t('chat.backendSessions.previewLoading'),
    });

    const registry = this.host.getAgentServiceRegistry();
    let preview: NormalizedSessionPreviewMessage[] | null = null;
    try {
      preview = await getBackendSessionPreview(registry, sessionId);
    } catch (err) {
      logger.warn('Failed to load session preview', { sessionId, error: err instanceof Error ? err.message : String(err) });
    }

    this.previewEl.empty();

    if (!preview || preview.length === 0) {
      this.previewEl.createEl('p', {
        cls: 'opencodian-backend-session-browser-preview-empty',
        text: t('chat.backendSessions.previewEmpty'),
      });
      return;
    }

    const headerEl = this.previewEl.createDiv({ cls: 'opencodian-backend-session-browser-preview-header' });
    headerEl.createEl('h4', { text: t('chat.backendSessions.previewTitle') });
    headerEl.createEl('span', {
      cls: 'opencodian-backend-session-browser-preview-count',
      text: t('chat.backendSessions.previewCount', { count: preview.length }),
    });

    const messagesEl = this.previewEl.createDiv({ cls: 'opencodian-backend-session-browser-preview-messages' });

    for (const msg of preview) {
      const msgEl = messagesEl.createDiv({
        cls: `opencodian-backend-session-browser-preview-msg opencodian-backend-session-browser-preview-msg-${msg.role}`,
      });

      msgEl.createDiv({
        cls: 'opencodian-backend-session-browser-preview-role',
        text: msg.role,
      });

      for (const part of msg.parts) {
        if (part.type === 'text' && part.text) {
          const textContent = part.text.length > 300 ? part.text.slice(0, 300) + '…' : part.text;
          msgEl.createDiv({
            cls: 'opencodian-backend-session-browser-preview-text',
            text: textContent,
          });
        }
      }
    }
  }

  private async resumeSession(sessionId: string): Promise<void> {
    if (this.host.isStreaming()) {
      this.host.showNotice(t('chat.backendSessions.resumeBlocked'));
      return;
    }

    const session = this.sessions.find((s) => s.id === sessionId);
    const title = session?.title || t('chat.backendSessions.untitled');

    try {
      const conversationId = await this.host.createConversationFromBackendSession(sessionId, title);
      if (!conversationId) {
        this.host.showNotice(t('chat.backendSessions.createFailed'));
        return;
      }

      this.close();
      await this.host.loadConversation(conversationId);
      this.host.showNotice(t('chat.backendSessions.resumed', { title }));
    } catch (err) {
      logger.warn('Failed to resume backend session', { sessionId, error: err instanceof Error ? err.message : String(err) });
      this.host.showNotice(t('chat.backendSessions.resumeFailed'));
    }
  }

  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return t('chat.backendSessions.justNow');
    if (diffMins < 60) return t('chat.backendSessions.minutesAgo', { count: diffMins });

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t('chat.backendSessions.hoursAgo', { count: diffHours });

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t('chat.backendSessions.daysAgo', { count: diffDays });

    return date.toLocaleDateString();
  }
}

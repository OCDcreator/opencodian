import { App, Modal } from 'obsidian';

import { AgentCapability } from '../../../core/agents/AgentCapability';
import {
  archiveBackendSession,
  forkBackendSession,
  getBackendSessionPreview,
  listBackendSessions,
  type NormalizedSessionPreviewMessage,
  type NormalizedSessionRow,
  unarchiveBackendSession,
} from '../../../core/agents/backend/AgentBackendRouting';
import type { AgentServiceRegistry } from '../../../core/agents/backend/AgentServiceRegistry';
import type { AgentBackendKind } from '../../../core/types/chat';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import { renderBackendSessionDetail } from './BackendSessionBrowserDetail';

const logger = createLogger('BackendSessionBrowserModal');

/** Icon prefix for an activity part type. */
function activityIcon(partType: string): string {
  switch (partType) {
    case 'tool_call': return '\u2699'; // gear
    case 'file_change': return '\u{1F4C4}'; // page facing up
    case 'web_search': return '\u{1F50D}'; // magnifying glass
    default: return '\u2022'; // bullet
  }
}

/** Render a single activity line (tool call / file change / web search) in preview. */
function renderPreviewActivityLine(containerEl: HTMLElement, part: { type: string; text: string }): void {
  const icon = activityIcon(part.type);
  const label = part.type === 'tool_call'
    ? t('chat.backendSessions.activityTool')
    : part.type === 'file_change'
      ? t('chat.backendSessions.activityFile')
      : part.type === 'web_search'
        ? t('chat.backendSessions.activitySearch')
        : '';
  const lineEl = containerEl.createDiv({
    cls: 'opencodian-backend-session-browser-preview-activity',
    attr: { 'data-activity': part.type },
  });
  lineEl.createSpan({ cls: 'opencodian-backend-session-browser-preview-activity-icon', text: icon });
  if (label) {
    lineEl.createSpan({ cls: 'opencodian-backend-session-browser-preview-activity-label', text: label });
  }
  const textContent = part.text.length > 120 ? part.text.slice(0, 120) + '\u2026' : part.text;
  lineEl.createSpan({ cls: 'opencodian-backend-session-browser-preview-activity-text', text: textContent });
}

/** Lightweight chat message used to seed a resumed conversation with preview content. */
export interface BackendSessionPreviewChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface BackendSessionBrowserHost {
  getAgentServiceRegistry(): AgentServiceRegistry | null;
  createConversationFromBackendSession(sessionId: string, title: string, initialMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }>, backend?: string): Promise<string | null>;
  loadConversation(conversationId: string): Promise<void>;
  getActiveBackendKind(): string | null;
  showNotice(message: string): void;
  isStreaming(): boolean;
  /** When false, the Resume button is hidden. Default: true. */
  supportsResume?(): boolean;
  /**
   * When set, the modal forces all session queries to this specific backend
   * instead of using the registry's active backend.
   * Used by settings launchers that must remain backend-scoped
   * (e.g. Claude Code settings only showing Claude sessions).
   */
  forcedBackendKind?: AgentBackendKind;
}

type ViewMode = 'preview' | 'detail';

export class BackendSessionBrowserModal extends Modal {
  private sessions: NormalizedSessionRow[] = [];
  private selectedSessionId: string | null = null;
  private previewEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;
  private loading = false;
  private viewMode: ViewMode = 'preview';
  private searchQuery = '';

  constructor(
    app: App,
    private readonly host: BackendSessionBrowserHost,
  ) {
    super(app);
  }

  /**
   * Return the registry scoped to `host.forcedBackendKind` when set,
   * so all routing functions use the correct backend instead of the global
   * active one.  Uses `Object.create` to inherit all methods while overriding
   * only `getActive()`.
   */
  private getScopedRegistry(): AgentServiceRegistry | null {
    const registry = this.host.getAgentServiceRegistry();
    if (!registry) return null;
    const forcedKind = this.host.forcedBackendKind;
    if (!forcedKind) return registry;
    const scoped = Object.create(registry) as AgentServiceRegistry;
    scoped.getActive = () => registry.get(forcedKind) ?? null;
    return scoped;
  }

  onOpen(): void {
    this.titleEl.setText(t('chat.backendSessions.modalTitle'));
    this.modalEl.addClass('opencodian-backend-session-browser');

    const contentEl = this.contentEl;
    contentEl.empty();

    // Two-column layout: list on left, preview/detail on right
    const containerEl = contentEl.createDiv({ cls: 'opencodian-backend-session-browser-container' });

    // Left: session list
    const listContainer = containerEl.createDiv({ cls: 'opencodian-backend-session-browser-list' });

    // Search box at top of list
    const searchWrapper = listContainer.createDiv({ cls: 'opencodian-backend-session-browser-search' });
    const searchInput = searchWrapper.createEl('input', {
      cls: 'opencodian-backend-session-browser-search-input',
      attr: {
        type: 'search',
        placeholder: t('chat.backendSessions.searchPlaceholder'),
        'aria-label': t('chat.backendSessions.searchPlaceholder'),
      },
    });
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.toLowerCase().trim();
      this.renderSessionList();
    });

    this.listEl = listContainer.createDiv({ cls: 'opencodian-backend-session-browser-list-inner' });

    // Right: preview / detail
    this.previewEl = containerEl.createDiv({ cls: 'opencodian-backend-session-browser-preview' });
    this.previewEl.createEl('p', {
      cls: 'opencodian-backend-session-browser-preview-hint',
      text: t('chat.backendSessions.previewHint'),
    });

    // Footer: actions
    this.footerEl = contentEl.createDiv({ cls: 'opencodian-backend-session-browser-footer' });
    this.renderFooter();

    void this.loadSessions();
  }

  onClose(): void {
    this.sessions = [];
    this.selectedSessionId = null;
    this.viewMode = 'preview';
    this.searchQuery = '';
  }

  // ─── Footer rendering ────────────────────────────────────────────

  private renderFooter(): void {
    if (!this.footerEl) return;
    this.footerEl.empty();

    const canResume = this.host.supportsResume?.() ?? true;
    const showResume = canResume && this.viewMode === 'preview';
    const hasSelection = Boolean(this.selectedSessionId);

    if (showResume) {
      const resumeBtn = this.footerEl.createEl('button', {
        cls: 'mod-cta opencodian-backend-session-browser-resume-btn',
        text: t('chat.backendSessions.resumeButton'),
      });
      resumeBtn.disabled = !hasSelection || this.host.isStreaming();
      resumeBtn.addEventListener('click', () => {
        if (this.selectedSessionId) {
          void this.resumeSession(this.selectedSessionId);
        }
      });
    }

    // Lifecycle actions (fork / archive / unarchive) when the active backend
    // session service supports them. State-specific: only show the action that
    // matches the selected session's current archive state.
    this.renderLifecycleActions(hasSelection, this.host.isStreaming());

    // View Details / Back button
    if (this.viewMode === 'preview') {
      const detailBtn = this.footerEl.createEl('button', {
        cls: 'opencodian-backend-session-browser-detail-btn',
        text: t('chat.backendSessions.viewDetails'),
      });
      detailBtn.disabled = !hasSelection;
      detailBtn.addEventListener('click', () => {
        if (this.selectedSessionId) {
          this.viewMode = 'detail';
          void this.renderDetailView(this.selectedSessionId);
          this.renderFooter();
        }
      });
    } else {
      const backBtn = this.footerEl.createEl('button', {
        cls: 'opencodian-backend-session-browser-back-btn',
        text: t('chat.backendSessions.backToPreview'),
      });
      backBtn.addEventListener('click', () => {
        this.viewMode = 'preview';
        if (this.selectedSessionId) {
          void this.loadPreview(this.selectedSessionId);
        }
        this.renderFooter();
      });
    }

    const refreshBtn = this.footerEl.createEl('button', {
      text: t('chat.backendSessions.refreshButton'),
    });
    refreshBtn.addEventListener('click', () => {
      this.viewMode = 'preview';
      void this.loadSessions();
    });
  }

  /**
   * Render the state-specific lifecycle action buttons (fork / archive /
   * unarchive). Only the action matching the selected session's current archive
   * state is shown, and only when the active backend session service advertises
   * the relevant capability. No-op outside preview mode.
   */
  private renderLifecycleActions(hasSelection: boolean, streaming: boolean): void {
    if (!this.footerEl) return;
    if (this.viewMode !== 'preview') return;

    const registry = this.getScopedRegistry();
    const activeService = registry?.getActive() ?? null;
    const selectedSession = this.sessions.find((s) => s.id === this.selectedSessionId);
    const selectedArchived = selectedSession?.archived ?? false;
    const disabled = !hasSelection || streaming;

    if (activeService?.hasCapability(AgentCapability.Fork) && !selectedArchived) {
      const forkBtn = this.footerEl.createEl('button', {
        cls: 'opencodian-backend-session-browser-fork-btn',
        text: t('chat.backendSessions.forkButton'),
      });
      forkBtn.disabled = disabled;
      forkBtn.addEventListener('click', () => {
        if (this.selectedSessionId) {
          void this.forkSession(this.selectedSessionId);
        }
      });
    }

    if (activeService?.hasCapability(AgentCapability.Sessions) && hasSelection && !selectedArchived) {
      const archiveBtn = this.footerEl.createEl('button', {
        cls: 'opencodian-backend-session-browser-archive-btn',
        text: t('chat.backendSessions.archiveButton'),
      });
      archiveBtn.disabled = disabled;
      archiveBtn.addEventListener('click', () => {
        if (this.selectedSessionId) {
          void this.archiveSession(this.selectedSessionId);
        }
      });
    }

    if (activeService?.hasCapability(AgentCapability.Sessions) && hasSelection && selectedArchived) {
      const unarchiveBtn = this.footerEl.createEl('button', {
        cls: 'mod-cta opencodian-backend-session-browser-unarchive-btn',
        text: t('chat.backendSessions.unarchiveButton'),
      });
      unarchiveBtn.disabled = disabled;
      unarchiveBtn.addEventListener('click', () => {
        if (this.selectedSessionId) {
          void this.unarchiveSession(this.selectedSessionId);
        }
      });
    }
  }

  // ─── Session list ────────────────────────────────────────────────

  private async loadSessions(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    if (!this.listEl) return;
    this.listEl.empty();
    this.listEl.createEl('p', {
      cls: 'opencodian-backend-session-browser-loading',
      text: t('chat.backendSessions.loading'),
    });

    const registry = this.getScopedRegistry();
    try {
      this.sessions = await listBackendSessions(registry);
    } catch (err) {
      logger.warn('Failed to list backend sessions', { error: err instanceof Error ? err.message : String(err) });
      this.sessions = [];
    }

    this.loading = false;
    this.renderSessionList();
    this.renderFooter();
  }

  private getFilteredSessions(): NormalizedSessionRow[] {
    if (!this.searchQuery) return this.sessions;
    return this.sessions.filter((s) =>
      (s.title || '').toLowerCase().includes(this.searchQuery),
    );
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

    const filtered = this.getFilteredSessions();

    if (filtered.length === 0) {
      this.listEl.createEl('p', {
        cls: 'opencodian-backend-session-browser-empty',
        text: t('chat.backendSessions.searchNoMatch'),
      });
      return;
    }

    for (const session of filtered) {
      const itemEl = this.listEl.createDiv({
        cls: 'opencodian-backend-session-browser-item',
        attr: { 'data-session-id': session.id },
      });

      if (this.selectedSessionId === session.id) {
        itemEl.addClass('is-selected');
      }

      if (session.archived) {
        itemEl.addClass('is-archived');
      }

      itemEl.createDiv({
        cls: 'opencodian-backend-session-browser-item-title',
        text: session.title || t('chat.backendSessions.untitled'),
      });

      if (session.archived) {
        itemEl.createDiv({
          cls: 'opencodian-backend-session-browser-item-archived',
          text: t('chat.backendSessions.archivedLabel'),
        });
      }

      if (session.updatedAt) {
        itemEl.createDiv({
          cls: 'opencodian-backend-session-browser-item-date',
          text: this.formatDate(session.updatedAt),
        });
      }

      itemEl.addEventListener('click', () => {
        this.selectedSessionId = session.id;
        this.viewMode = 'preview';
        this.updateSelection();
        void this.loadPreview(session.id);
        this.renderFooter();
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

  // ─── Preview mode (existing behavior) ────────────────────────────

  private async loadPreview(sessionId: string): Promise<void> {
    if (!this.previewEl) return;
    this.previewEl.empty();
    this.previewEl.createEl('p', {
      cls: 'opencodian-backend-session-browser-preview-loading',
      text: t('chat.backendSessions.previewLoading'),
    });

    const registry = this.getScopedRegistry();
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

    const noticeEl = this.previewEl.createDiv({
      cls: 'opencodian-backend-session-browser-preview-notice',
    });
    noticeEl.createEl('p', { text: t('chat.backendSessions.previewNotice') });

    const messagesEl = this.previewEl.createDiv({ cls: 'opencodian-backend-session-browser-preview-messages' });

    for (const msg of preview) {
      if (msg.role === 'activity') {
        for (const part of msg.parts) {
          renderPreviewActivityLine(messagesEl, part);
        }
        continue;
      }

      // Skip messages that would produce a blank role-only row
      const hasText = msg.parts.some((p) => p.type === 'text' && p.text && p.text.trim().length > 0);
      if (!hasText) continue;

      const msgEl = messagesEl.createDiv({
        cls: `opencodian-backend-session-browser-preview-msg opencodian-backend-session-browser-preview-msg-${msg.role}`,
      });

      msgEl.createDiv({
        cls: 'opencodian-backend-session-browser-preview-role',
        text: msg.role,
      });

      for (const part of msg.parts) {
        if (part.type === 'text' && part.text) {
          const textContent = part.text.length > 300 ? part.text.slice(0, 300) + '\u2026' : part.text;
          msgEl.createDiv({
            cls: 'opencodian-backend-session-browser-preview-text',
            text: textContent,
          });
        }
      }
    }
  }

  // ─── Detail mode (session metadata + full transcript) ────────────

  private async renderDetailView(sessionId: string): Promise<void> {
    if (!this.previewEl) return;
    await renderBackendSessionDetail(this.previewEl, sessionId, this.getScopedRegistry());
  }

  // ─── Resume flow ─────────────────────────────────────────────────

  private async resumeSession(sessionId: string): Promise<void> {
    if (this.host.isStreaming()) {
      this.host.showNotice(t('chat.backendSessions.resumeBlocked'));
      return;
    }

    const session = this.sessions.find((s) => s.id === sessionId);
    const title = session?.title || t('chat.backendSessions.untitled');

    try {
      // Load preview transcript to seed the conversation with visible history.
      // This is a preview snapshot, not an authoritative full transcript.
      let previewChatMessages: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }> | undefined;
      const registry = this.getScopedRegistry();
      try {
        const preview = await getBackendSessionPreview(registry, sessionId);
        if (preview && preview.length > 0) {
          previewChatMessages = preview.map((msg, idx) => ({
            id: `preview-${idx}-${Date.now()}`,
            role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: msg.parts
              .filter((p) => p.type === 'text' && p.text)
              .map((p) => p.text)
              .join('\n') || '(empty)',
            timestamp: Date.now(),
          }));
        }
      } catch {
        // Preview load failure is non-blocking; resume with empty messages.
      }

      const backend = this.host.forcedBackendKind ?? this.host.getActiveBackendKind() ?? 'opencode';
      const conversationId = await this.host.createConversationFromBackendSession(sessionId, title, previewChatMessages, backend);
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

  // ─── Fork flow ───────────────────────────────────────────────────

  private async forkSession(sessionId: string): Promise<void> {
    if (this.host.isStreaming()) {
      this.host.showNotice(t('chat.backendSessions.forkBlocked'));
      return;
    }

    this.setFooterLoading(true);
    try {
      const result = await forkBackendSession(this.getScopedRegistry(), sessionId);
      if (!result) {
        this.host.showNotice(t('chat.backendSessions.forkFailed'));
        return;
      }
      this.host.showNotice(t('chat.backendSessions.forked', { title: result.title }));
      this.selectedSessionId = result.id;
      await this.loadSessions();
    } catch (err) {
      logger.warn('Failed to fork backend session', { sessionId, error: err instanceof Error ? err.message : String(err) });
      this.host.showNotice(t('chat.backendSessions.forkFailed'));
    } finally {
      this.setFooterLoading(false);
    }
  }

  // ─── Archive flow ────────────────────────────────────────────────

  private async archiveSession(sessionId: string): Promise<void> {
    this.setFooterLoading(true);
    try {
      const ok = await archiveBackendSession(this.getScopedRegistry(), sessionId);
      if (!ok) {
        this.host.showNotice(t('chat.backendSessions.archiveFailed'));
        return;
      }
      this.host.showNotice(t('chat.backendSessions.archived'));
      await this.loadSessions();
    } catch (err) {
      logger.warn('Failed to archive backend session', { sessionId, error: err instanceof Error ? err.message : String(err) });
      this.host.showNotice(t('chat.backendSessions.archiveFailed'));
    } finally {
      this.setFooterLoading(false);
    }
  }

  // ─── Unarchive flow ──────────────────────────────────────────────

  private async unarchiveSession(sessionId: string): Promise<void> {
    this.setFooterLoading(true);
    try {
      const ok = await unarchiveBackendSession(this.getScopedRegistry(), sessionId);
      if (!ok) {
        this.host.showNotice(t('chat.backendSessions.unarchiveFailed'));
        return;
      }
      this.host.showNotice(t('chat.backendSessions.unarchived'));
      await this.loadSessions();
    } catch (err) {
      logger.warn('Failed to unarchive backend session', { sessionId, error: err instanceof Error ? err.message : String(err) });
      this.host.showNotice(t('chat.backendSessions.unarchiveFailed'));
    } finally {
      this.setFooterLoading(false);
    }
  }

  private setFooterLoading(loading: boolean): void {
    if (!this.footerEl) return;
    const buttons = this.footerEl.querySelectorAll('button');
    for (const btn of buttons) {
      (btn as HTMLButtonElement).disabled = loading;
    }
  }

  // ─── Formatting helpers ──────────────────────────────────────────

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

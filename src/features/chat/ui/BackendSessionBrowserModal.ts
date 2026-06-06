import { App, Modal } from 'obsidian';

import {
  getBackendSessionDetail,
  getBackendSessionPreview,
  listBackendSessions,
  type NormalizedSessionDetail,
  type NormalizedSessionPreviewMessage,
  type NormalizedSessionPreviewPart,
  type NormalizedSessionRow,
} from '../../../core/agents/backend/AgentBackendRouting';
import type { AgentServiceRegistry } from '../../../core/agents/backend/AgentServiceRegistry';
import type { AgentBackendKind } from '../../../core/types/chat';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';

const logger = createLogger('BackendSessionBrowserModal');

/** Lightweight chat message used to seed a resumed conversation with preview content. */
export interface BackendSessionPreviewChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface BackendSessionBrowserHost {
  getAgentServiceRegistry(): AgentServiceRegistry | null;
  createConversationFromBackendSession(sessionId: string, title: string, initialMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }>): Promise<string | null>;
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
  }

  // ─── Footer rendering ────────────────────────────────────────────

  private renderFooter(): void {
    if (!this.footerEl) return;
    this.footerEl.empty();

    const canResume = this.host.supportsResume?.() ?? true;
    const showResume = canResume && this.viewMode === 'preview';

    if (showResume) {
      const resumeBtn = this.footerEl.createEl('button', {
        cls: 'mod-cta opencodian-backend-session-browser-resume-btn',
        text: t('chat.backendSessions.resumeButton'),
      });
      resumeBtn.disabled = !this.selectedSessionId || this.host.isStreaming();
      resumeBtn.addEventListener('click', () => {
        if (this.selectedSessionId) {
          void this.resumeSession(this.selectedSessionId);
        }
      });
    }

    // View Details / Back button
    if (this.viewMode === 'preview') {
      const detailBtn = this.footerEl.createEl('button', {
        cls: 'opencodian-backend-session-browser-detail-btn',
        text: t('chat.backendSessions.viewDetails'),
      });
      detailBtn.disabled = !this.selectedSessionId;
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
    this.previewEl.empty();
    this.previewEl.createEl('p', {
      cls: 'opencodian-backend-session-browser-preview-loading',
      text: t('chat.backendSessions.detailLoading'),
    });

    const registry = this.getScopedRegistry();

    // Fetch metadata and transcript in parallel
    const [detailResult, transcriptResult] = await Promise.all([
      getBackendSessionDetail(registry, sessionId).catch(() => null),
      getBackendSessionPreview(registry, sessionId).catch(() => null),
    ]);

    this.previewEl.empty();

    // Render metadata card
    this.renderDetailMetadata(this.previewEl, detailResult);

    // Render full transcript
    this.renderDetailTranscript(this.previewEl, transcriptResult);
  }

  private renderDetailMetadata(containerEl: HTMLElement, detail: NormalizedSessionDetail | null): void {
    const metaEl = containerEl.createDiv({
      cls: 'opencodian-backend-session-browser-detail-metadata',
    });

    metaEl.createEl('h4', { text: t('chat.backendSessions.detailTitle') });

    if (!detail) {
      metaEl.createEl('p', {
        cls: 'opencodian-backend-session-browser-detail-unavailable',
        text: t('chat.backendSessions.detailMetadataUnavailable'),
      });
      return;
    }

    const fields: Array<{ label: string; value: string | null }> = [
      { label: t('chat.backendSessions.detailField.id'), value: detail.id },
      { label: t('chat.backendSessions.detailField.backend'), value: detail.backendKind },
      { label: t('chat.backendSessions.detailField.title'), value: detail.title || null },
      { label: t('chat.backendSessions.detailField.customTitle'), value: detail.customTitle },
      { label: t('chat.backendSessions.detailField.createdAt'), value: detail.createdAt ? this.formatDateTime(detail.createdAt) : null },
      { label: t('chat.backendSessions.detailField.updatedAt'), value: detail.updatedAt ? this.formatDateTime(detail.updatedAt) : null },
      { label: t('chat.backendSessions.detailField.gitBranch'), value: detail.gitBranch },
      { label: t('chat.backendSessions.detailField.cwd'), value: detail.cwd },
      { label: t('chat.backendSessions.detailField.tag'), value: detail.tag },
      { label: t('chat.backendSessions.detailField.fileSize'), value: detail.fileSize !== null ? this.formatFileSize(detail.fileSize) : null },
    ];

    for (const field of fields) {
      if (field.value === null) continue;
      const rowEl = metaEl.createDiv({
        cls: 'opencodian-backend-session-browser-detail-field',
        attr: { 'data-detail-field': field.label },
      });
      rowEl.createEl('span', {
        cls: 'opencodian-backend-session-browser-detail-field-label',
        text: field.label,
      });
      rowEl.createEl('span', {
        cls: 'opencodian-backend-session-browser-detail-field-value',
        text: field.value,
      });
    }
  }

  private renderDetailTranscript(containerEl: HTMLElement, transcript: NormalizedSessionPreviewMessage[] | null): void {
    const transcriptEl = containerEl.createDiv({
      cls: 'opencodian-backend-session-browser-detail-transcript',
    });

    transcriptEl.createEl('h4', { text: t('chat.backendSessions.detailTranscriptTitle') });

    const noticeEl = transcriptEl.createDiv({
      cls: 'opencodian-backend-session-browser-detail-transcript-notice',
    });
    noticeEl.createEl('p', { text: t('chat.backendSessions.detailTranscriptNotice') });

    if (!transcript || transcript.length === 0) {
      transcriptEl.createEl('p', {
        cls: 'opencodian-backend-session-browser-detail-transcript-empty',
        text: t('chat.backendSessions.detailTranscriptEmpty'),
      });
      return;
    }

    transcriptEl.createEl('p', {
      cls: 'opencodian-backend-session-browser-detail-transcript-count',
      text: t('chat.backendSessions.detailTranscriptCount', { count: transcript.length }),
    });

    const messagesEl = transcriptEl.createDiv({
      cls: 'opencodian-backend-session-browser-detail-messages',
    });

    for (const msg of transcript) {
      // Skip messages that would produce a blank role-only row
      const hasRenderableContent = msg.parts.some((p) => this.partHasContent(p));
      if (!hasRenderableContent) continue;

      const msgEl = messagesEl.createDiv({
        cls: `opencodian-backend-session-browser-detail-msg opencodian-backend-session-browser-detail-msg-${msg.role}`,
      });

      msgEl.createDiv({
        cls: 'opencodian-backend-session-browser-detail-msg-role',
        text: msg.role,
      });

      for (const part of msg.parts) {
        this.renderDetailPart(msgEl, part);
      }
    }
  }

  /** Whether a part has renderable content (not empty/whitespace-only). */
  private partHasContent(part: NormalizedSessionPreviewPart): boolean {
    if (part.type === 'text') {
      return !!part.text && part.text.trim().length > 0;
    }
    // Non-text parts always have some content (serialized JSON or type label)
    return true;
  }

  /** Render a single transcript part — text inline, non-text as a collapsed summary. */
  private renderDetailPart(containerEl: HTMLElement, part: NormalizedSessionPreviewPart): void {
    if (part.type === 'text' && part.text && part.text.trim().length > 0) {
      // No truncation in detail view — full text
      containerEl.createDiv({
        cls: 'opencodian-backend-session-browser-detail-msg-text',
        text: part.text,
      });
      return;
    }

    if (part.type === 'text') {
      // Empty or whitespace-only text part — skip
      return;
    }

    // Non-text part: render as collapsed <details> with type label
    const detailsEl = containerEl.createEl('details', {
      cls: 'opencodian-backend-session-browser-detail-part-collapsed',
    });
    detailsEl.createEl('summary', {
      text: t('chat.backendSessions.detailNonTextPart', { type: part.type }),
    });
    const content = part.text || t('chat.backendSessions.detailNonTextPartEmpty');
    detailsEl.createEl('pre', {
      cls: 'opencodian-backend-session-browser-detail-part-content',
      text: content,
    });
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

      const conversationId = await this.host.createConversationFromBackendSession(sessionId, title, previewChatMessages);
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

  private formatDateTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

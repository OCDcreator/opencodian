import { type App, Modal } from 'obsidian';

import type { AppServerCatalogReadResult } from '../../core/agents/backend/CodexAppServerClient';
import { t } from '../../i18n';

export interface CodexReadbackModalOptions<T> {
  app: App;
  title: string;
  intro: string;
  readonlyNote: string;
  refreshNote: string;
  loadingText: string;
  unavailableText: string;
  failedText: string;
  emptyText: string;
  fetchItems?: () => Promise<T[] | null>;
  fetchCatalog?: () => Promise<AppServerCatalogReadResult<T>>;
  renderItems: (container: HTMLElement, items: T[]) => void;
}

export type CodexReadbackModalState = 'loading' | 'unavailable' | 'failed' | 'empty' | 'success' | 'partial';

export class CodexReadbackModal<T> extends Modal {
  private readonly options: CodexReadbackModalOptions<T>;
  private contentAreaEl: HTMLElement | null = null;
  private statusValueEl: HTMLElement | null = null;

  constructor(options: CodexReadbackModalOptions<T>) {
    super(options.app);
    this.options = options;
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title);
    this.modalEl.addClass('opencodian-codex-readback-modal');
    this.contentEl.empty();
    this.renderShell();
    void this.load();
  }

  private renderShell(): void {
    const shellEl = this.contentEl.createDiv({ cls: 'opencodian-modal-shell opencodian-inspection-panel' });

    const summaryEl = shellEl.createDiv({ cls: 'opencodian-modal-section opencodian-inspection-summary' });
    summaryEl.createEl('p', {
      cls: 'opencodian-codex-readback-intro opencodian-inspection-summary-intro',
      text: this.options.intro,
    });

    const metaEl = summaryEl.createDiv({ cls: 'opencodian-inspection-summary-meta' });
    this.statusValueEl = metaEl.createEl('span', {
      cls: 'opencodian-codex-readback-status-value opencodian-inspection-badge',
      attr: { 'data-readback-state': 'loading' },
    });
    metaEl.createEl('span', {
      cls: 'opencodian-codex-readback-note opencodian-codex-readback-note--readonly opencodian-inspection-summary-meta-item',
      text: this.options.readonlyNote,
    });
    metaEl.createEl('span', {
      cls: 'opencodian-codex-readback-note opencodian-codex-readback-note--refresh opencodian-inspection-summary-meta-item',
      text: this.options.refreshNote,
    });

    this.contentAreaEl = shellEl.createDiv({
      cls: 'opencodian-codex-readback-content opencodian-modal-section opencodian-inspection-content',
      attr: { 'data-readback-content': 'true' },
    });
  }

  private async load(): Promise<void> {
    this.setState('loading');
    try {
      if (this.options.fetchCatalog) {
        const result = await this.options.fetchCatalog();
        if (result.status !== 'complete') {
          this.setState(result.status, result.data);
          return;
        }
        this.setState(result.data.length === 0 ? 'empty' : 'success', result.data);
        return;
      }
      const items = await this.options.fetchItems?.() ?? null;
      if (items === null) {
        this.setState('unavailable');
      } else if (items.length === 0) {
        this.setState('empty');
      } else {
        this.setState('success', items);
      }
    } catch {
      this.setState('failed');
    }
  }

  private setState(state: CodexReadbackModalState, items?: T[]): void {
    if (!this.contentAreaEl || !this.statusValueEl) {
      return;
    }

    this.contentAreaEl.empty();
    this.statusValueEl.setAttribute('data-readback-state', state);
    this.statusValueEl.setAttribute('role', 'status');
    this.statusValueEl.setAttribute('aria-live', 'polite');
    this.statusValueEl.setAttribute('aria-busy', String(state === 'loading'));

    switch (state) {
      case 'loading':
        this.statusValueEl.setText(t('settings.codex.readback.statusLoading'));
        this.renderStateMessage(this.options.loadingText);
        return;
      case 'unavailable':
        this.statusValueEl.setText(t('settings.codex.readback.statusUnavailable'));
        this.renderStateMessage(this.options.unavailableText);
        return;
      case 'failed':
        this.statusValueEl.setText(t('settings.codex.readback.statusFailed'));
        this.renderStateMessage(this.options.failedText);
        return;
      case 'empty':
        this.statusValueEl.setText(t('settings.codex.readback.statusEmpty'));
        this.renderStateMessage(this.options.emptyText);
        return;
      case 'partial':
      case 'success':
        this.statusValueEl.setText(state === 'partial'
          ? t('settings.codex.readback.statusPartial', { count: items?.length ?? 0 })
          : t('settings.codex.readback.statusCount', { count: items?.length ?? 0 }));
        if (state === 'partial') this.renderStateMessage(t('settings.codex.readback.messagePartial'));
        if (items && items.length > 0) {
          const listEl = this.contentAreaEl.createDiv({ cls: 'opencodian-inspection-list' });
          this.options.renderItems(listEl, items);
        }
        return;
      default:
        return;
    }
  }

  private renderStateMessage(message: string): void {
    const stateEl = this.contentAreaEl!.createDiv({ cls: 'opencodian-inspection-state' });
    stateEl.createEl('p', {
      cls: 'opencodian-codex-readback-state-message',
      text: message,
    });
  }
}

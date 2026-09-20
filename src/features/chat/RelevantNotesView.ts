/**
 * RelevantNotesView — R-E3 (advantage-parity): the relevant-notes side panel.
 *
 * Copilot's Relevant Notes entry point, inherited without its cloud ranking:
 * for the active note the panel shows (a) link-graph neighbours from
 * Obsidian's resolvedLinks (same truth as the backlinks pane) and (b) the
 * R-C1 lexical index's top matches for the note's own text — grouped,
 * collapsible, live-refreshing (debounced) on note switch. Every entry opens
 * the note; every entry attaches to the active chat tab through the same
 * channel the `+` picker uses (identical context items).
 *
 * Honesty rules: the retrieval channel states plainly when the R-C1 index is
 * off (it is opt-in) instead of showing an empty list; a non-markdown leaf or
 * no active note shows the empty state; retrieval failures degrade to a
 * visible error line, never a silent blank.
 */

import { ItemView, Notice, setIcon, TFile } from 'obsidian';

import type { VaultRetrievalSnippet } from '../../core/memory';
import { t } from '../../i18n';
import { createLogger } from '../../shared';
import {
  buildRetrievalQuery,
  computeGraphNeighbours,
  foldRetrievalMatches,
  noteDisplayName,
} from './RelevantNotesModel';

const logger = createLogger('RelevantNotesView');

/**
 * Feature-level port (ChatPluginPort convention): the view never imports
 * main.ts; the plugin instance satisfies this structurally.
 */
export interface RelevantNotesPort {
  readonly settings: { vaultRetrievalEnabled: boolean };
  readonly vaultIndexService: {
    select(query: string): Promise<readonly VaultRetrievalSnippet[]>;
  } | null;
  attachVaultFileToActiveChatContext(path: string): Promise<boolean>;
}

export const VIEW_TYPE_RELEVANT_NOTES = 'opencodian-relevant-notes';

const REFRESH_DEBOUNCE_MS = 500;
const RETRIEVAL_LIMIT = 8;

export class RelevantNotesView extends ItemView {
  private readonly plugin: RelevantNotesPort;
  private refreshTimer: number | null = null;
  private refreshSequence = 0;
  private registeredEventRefs: unknown[] = [];

  constructor(leaf: import('obsidian').WorkspaceLeaf, plugin: RelevantNotesPort) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_RELEVANT_NOTES;
  }

  getDisplayText(): string {
    return t('relevantNotes.viewTitle');
  }

  getIcon(): string {
    return 'network';
  }

  async onOpen(): Promise<void> {
    this.registerEvents();
    await this.scheduleRefresh();
  }

  async onClose(): Promise<void> {
    this.clearRefreshTimer();
    for (const ref of this.registeredEventRefs) {
      (this.app.workspace as unknown as { offref?: (ref: unknown) => void }).offref?.(ref);
    }
    this.registeredEventRefs = [];
  }

  private registerEvents(): void {
    // Live refresh on note switch (debounced) + link-graph updates.
    const leafRef = this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        void this.scheduleRefresh();
      }),
    );
    const linksRef = this.registerEvent(
      this.app.metadataCache.on('resolved', () => {
        void this.scheduleRefresh();
      }),
    );
    this.registeredEventRefs = [leafRef, linksRef];
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async scheduleRefresh(): Promise<void> {
    this.clearRefreshTimer();
    this.refreshTimer = window.setTimeout(() => {
      void this.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  private activeNoteFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      return null;
    }
    return file;
  }

  private async refresh(): Promise<void> {
    const sequence = ++this.refreshSequence;
    const container = this.contentEl;
    container.empty();
    container.addClass('opencodian-relevant-notes');

    const file = this.activeNoteFile();
    if (!file) {
      this.renderEmptyState(container, t('relevantNotes.emptyState.noActiveNote'));
      return;
    }
    this.renderHeader(container, file);

    // Graph channel: pure metadataCache read, always available.
    const neighbours = computeGraphNeighbours(
      this.app.metadataCache.resolvedLinks,
      file.path,
    );
    this.renderSection(container, {
      title: t('relevantNotes.graphSection.title'),
      desc: t('relevantNotes.graphSection.desc'),
      entries: neighbours.map((neighbour) => ({
        path: neighbour.path,
        meta: t('relevantNotes.graphSection.linkMeta', { count: neighbour.linkCount }),
      })),
      emptyMessage: neighbours.length === 0 ? t('relevantNotes.graphSection.empty') : null,
    });

    // Retrieval channel: R-C1 index reuse — honest about its opt-in nature.
    const retrievalSection = container.createDiv({ cls: 'opencodian-relevant-notes-section' });
    this.renderSectionHeader(
      retrievalSection,
      t('relevantNotes.retrievalSection.title'),
      t('relevantNotes.retrievalSection.desc'),
    );
    if (!this.plugin.settings.vaultRetrievalEnabled) {
      this.renderHintLine(retrievalSection, t('relevantNotes.retrievalSection.disabledHint'));
      return;
    }
    const listHost = retrievalSection.createDiv({ cls: 'opencodian-relevant-notes-list' });
    const loadingEl = this.renderHintLine(listHost, t('relevantNotes.retrievalSection.loading'));

    let noteContent: string;
    try {
      noteContent = await this.app.vault.cachedRead(file);
    } catch (error) {
      logger.warn('relevant-notes: failed to read active note', { error: String(error) });
      loadingEl.setText(t('relevantNotes.retrievalSection.error'));
      return;
    }
    const query = buildRetrievalQuery(noteContent);
    if (query.trim() === '') {
      loadingEl.setText(t('relevantNotes.retrievalSection.emptyQuery'));
      return;
    }
    const index = this.plugin.vaultIndexService;
    if (!index) {
      loadingEl.setText(t('relevantNotes.retrievalSection.error'));
      return;
    }
    let snippets: readonly VaultRetrievalSnippet[];
    try {
      snippets = await index.select(query);
    } catch (error) {
      logger.warn('relevant-notes: retrieval failed', { error: String(error) });
      if (sequence !== this.refreshSequence) {
        return;
      }
      loadingEl.setText(t('relevantNotes.retrievalSection.error'));
      return;
    }
    if (sequence !== this.refreshSequence) {
      return; // a newer refresh already took over the DOM
    }
    loadingEl.remove();
    const matches = foldRetrievalMatches(snippets, file.path, RETRIEVAL_LIMIT);
    if (matches.length === 0) {
      this.renderHintLine(listHost, t('relevantNotes.retrievalSection.empty'));
      return;
    }
    for (const match of matches) {
      this.renderEntryRow(listHost, {
        path: match.path,
        meta: t('relevantNotes.retrievalSection.scoreMeta', { score: match.score.toFixed(1) }),
      });
    }
  }

  private renderEmptyState(container: HTMLElement, message: string): void {
    container.createDiv({ cls: 'opencodian-relevant-notes-empty', text: message });
  }

  private renderHeader(container: HTMLElement, file: TFile): void {
    const headerEl = container.createDiv({ cls: 'opencodian-relevant-notes-header' });
    headerEl.createDiv({
      cls: 'opencodian-relevant-notes-title',
      text: noteDisplayName(file.path),
    });
    headerEl.createDiv({
      cls: 'opencodian-relevant-notes-subtitle',
      text: file.path,
    });
  }

  private renderSection(
    container: HTMLElement,
    options: {
      title: string;
      desc: string;
      entries: Array<{ path: string; meta: string }>;
      emptyMessage: string | null;
    },
  ): void {
    const sectionEl = container.createDiv({ cls: 'opencodian-relevant-notes-section' });
    this.renderSectionHeader(sectionEl, options.title, options.desc);
    if (options.entries.length === 0 && options.emptyMessage) {
      this.renderHintLine(sectionEl, options.emptyMessage);
      return;
    }
    const listEl = sectionEl.createDiv({ cls: 'opencodian-relevant-notes-list' });
    for (const entry of options.entries) {
      this.renderEntryRow(listEl, entry);
    }
  }

  private renderSectionHeader(sectionEl: HTMLElement, title: string, desc: string): void {
    sectionEl.createDiv({ cls: 'opencodian-relevant-notes-section-title', text: title });
    sectionEl.createDiv({ cls: 'opencodian-relevant-notes-section-desc', text: desc });
  }

  private renderHintLine(sectionEl: HTMLElement, message: string): HTMLElement {
    return sectionEl.createDiv({ cls: 'opencodian-relevant-notes-hint', text: message });
  }

  private renderEntryRow(listEl: HTMLElement, entry: { path: string; meta: string }): void {
    const rowEl = listEl.createDiv({ cls: 'opencodian-relevant-notes-item' });
    const contentEl = rowEl.createDiv({ cls: 'opencodian-relevant-notes-item-content' });
    contentEl.createDiv({
      cls: 'opencodian-relevant-notes-item-title',
      text: noteDisplayName(entry.path),
    });
    contentEl.createDiv({
      cls: 'opencodian-relevant-notes-item-meta',
      text: entry.meta,
    });
    contentEl.addEventListener('click', () => {
      void this.app.workspace.openLinkText(entry.path, '/', false);
    });
    const attachBtn = rowEl.createEl('button', {
      cls: 'opencodian-relevant-notes-item-attach',
      attr: {
        type: 'button',
        title: t('relevantNotes.attachAction'),
        'aria-label': t('relevantNotes.attachAction'),
      },
    });
    setIcon(attachBtn, 'plus');
    attachBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.attachNoteToChat(entry.path);
    });
  }

  /**
   * Same channel as the `+` picker / `add-current-note-to-context` command:
   * activate the chat view, build the file context item with the shared
   * builder, attach to the active tab. Identical items by construction.
   */
  private async attachNoteToChat(path: string): Promise<void> {
    const attached = await this.plugin.attachVaultFileToActiveChatContext(path);
    if (attached) {
      new Notice(t('relevantNotes.attachSuccess', { path: noteDisplayName(path) }));
    } else {
      new Notice(t('relevantNotes.attachFailed'));
    }
  }
}

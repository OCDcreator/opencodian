/**
 * ModifiedFilesSidebar - compact, clickable summary of the active session diff.
 *
 * The entries are supplied by the chat runtime; this component never requests
 * Git state or renders patch content.
 */

import { App, Component, setIcon } from 'obsidian';

import type { SessionDiffEntry } from '../../../core/types';
import { t } from '../../../i18n';
import type { EditRevertSidebarModel } from '../../../shared';
import { getFilePathBasename, toVaultRelativePath } from '../../../shared';
import { ConversationRenderService } from '../services/ConversationRenderService';

export type ModifiedFilesSidebarAvailability = 'ready' | 'unavailable';

export interface ModifiedFilesRevertActions {
  revertFile(path: string): Promise<void>;
  revertAll(): Promise<void>;
  restoreFile(path: string): Promise<void>;
}

export class ModifiedFilesSidebar extends Component {
  private static nextInstanceId = 0;
  private readonly panelId: string;
  private wrapperEl: HTMLElement;
  private hostEl: HTMLButtonElement;
  private badgeEl: HTMLElement;
  private containerEl: HTMLElement;
  private headerEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private listEl!: HTMLElement;
  private revertSectionEl: HTMLElement | null = null;
  private expanded = false;
  private entries: SessionDiffEntry[] = [];
  private availability: ModifiedFilesSidebarAvailability = 'unavailable';
  private revertModel: EditRevertSidebarModel | null = null;
  private revertActions: ModifiedFilesRevertActions | null = null;
  private linkedNote: { path?: string; exists: boolean } = { exists: false };
  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.expanded) {
      event.preventDefault();
      this.setExpanded(false);
      this.hostEl.focus();
    }
  };

  constructor(
    private readonly app: App,
    private readonly parentEl: HTMLElement,
  ) {
    super();
    this.panelId = `opencodian-modified-files-panel-${++ModifiedFilesSidebar.nextInstanceId}`;
    this.wrapperEl = this.parentEl.createDiv({ cls: 'opencodian-modified-files-sidebar-host' });
    const hoverZone = this.wrapperEl.createDiv({ cls: 'opencodian-modified-files-hover-zone' });
    this.hostEl = hoverZone.createEl('button', {
      cls: 'opencodian-modified-files-trigger-strip is-empty',
      attr: {
        type: 'button',
        'aria-expanded': 'false',
        'aria-controls': this.panelId,
      },
    });
    const iconEl = this.hostEl.createSpan({ cls: 'opencodian-modified-files-trigger-icon' });
    setIcon(iconEl, 'file-diff');
    this.badgeEl = this.hostEl.createSpan({ cls: 'opencodian-modified-files-strip-badge', text: '0' });
    this.hostEl.addEventListener('click', () => this.setExpanded(!this.expanded));

    // Keep the eight-pixel right-side exit strip available in narrow leaves by
    // positioning the panel eight pixels inside the hover zone boundary.
    this.containerEl = hoverZone.createDiv({
      cls: 'opencodian-modified-files-sidebar opencodian-composer-popover-frame',
      attr: {
        id: this.panelId,
        role: 'dialog',
        'aria-label': t('modifiedFiles.title'),
      },
    });
    this.load();
  }

  onload(): void {
    // Obsidian calls this through Component.load(); the guard also makes the
    // component safe for lightweight test harnesses that call onload directly.
    if (this.headerEl) {
      return;
    }
    this.headerEl = this.containerEl.createDiv({
      cls: 'opencodian-modified-files-sidebar-header opencodian-composer-popover-header',
    });
    this.headerEl.createSpan({
      cls: 'opencodian-modified-files-sidebar-title opencodian-composer-popover-title',
      text: t('modifiedFiles.title'),
    });
    this.summaryEl = this.headerEl.createSpan({ cls: 'opencodian-modified-files-sidebar-summary', text: '+0 -0' });

    const collapseButtonEl = this.headerEl.createEl('button', {
      cls: 'opencodian-modified-files-sidebar-collapse opencodian-tooltip-trigger',
      attr: {
        type: 'button',
        'data-tooltip-align': 'left',
      },
    });
    setIcon(collapseButtonEl, 'panel-right-close');
    ConversationRenderService.setTooltipLabel(collapseButtonEl, t('modifiedFiles.toggleTooltip'));
    collapseButtonEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setExpanded(false);
      this.hostEl.focus();
    });

    this.listEl = this.containerEl.createDiv({ cls: 'opencodian-modified-files-sidebar-list' });
    this.render();
    this.updateSummary();
    this.setExpanded(false);
    window.addEventListener('keydown', this.handleKeydown);
  }

  onunload(): void {
    window.removeEventListener('keydown', this.handleKeydown);
  }

  unload(): void {
    this.onunload();
    super.unload();
  }

  updateEntries(
    entries: SessionDiffEntry[],
    availability: ModifiedFilesSidebarAvailability = 'ready',
    linkedNote: { path?: string; exists: boolean } = { exists: false },
  ): void {
    this.entries = entries.map((entry) => ({ ...entry }));
    this.availability = availability;
    this.linkedNote = { ...linkedNote };
    this.updateSummary();
    this.render();
  }

  /** R-B3: backend-neutral revert state for the active conversation's latest round. */
  updateRevertState(
    model: EditRevertSidebarModel | null,
    actions: ModifiedFilesRevertActions | null,
  ): void {
    this.revertModel = model;
    this.revertActions = actions;
    this.updateSummary();
    this.render();
    this.renderRevertSection();
  }

  setVisible(enabled: boolean): void {
    this.wrapperEl.classList.toggle('is-disabled', !enabled);
    if (!enabled) {
      this.setExpanded(false);
    }
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded && !this.wrapperEl.classList.contains('is-disabled');
    const hoverZone = this.hostEl.parentElement;
    hoverZone?.classList.toggle('is-expanded', this.expanded);
    this.containerEl.classList.toggle('is-expanded', this.expanded);
    this.hostEl.setAttribute('aria-expanded', String(this.expanded));
  }

  private updateSummary(): void {
    const showingRevert = this.hasRevertEntries();
    const revertCount = this.revertModel?.entries.length ?? 0;
    const revertibleCount = this.revertModel?.revertibleCount ?? 0;
    const additions = this.entries.reduce((total, entry) => total + entry.additions, 0);
    const deletions = this.entries.reduce((total, entry) => total + entry.deletions, 0);
    const summary = `+${additions} -${deletions}`;
    const hasEntries = showingRevert ? revertCount > 0 : this.entries.length > 0;
    this.badgeEl.textContent = hasEntries ? String(showingRevert ? revertCount : this.entries.length) : '';
    this.badgeEl.classList.toggle('is-hidden', !hasEntries);
    this.badgeEl.classList.toggle('is-empty', !hasEntries && this.availability === 'ready');
    this.hostEl.classList.toggle('is-empty', !hasEntries && this.availability === 'ready');
    this.hostEl.classList.toggle('is-unavailable', this.availability === 'unavailable');
    this.hostEl.dataset.state = hasEntries ? 'changed' : this.availability;
    if (this.summaryEl) {
      if (showingRevert) {
        this.summaryEl.textContent = `${revertCount} · ${t('editRevert.revertibleShort', { count: revertibleCount })}`;
      } else {
        this.summaryEl.textContent = hasEntries
          ? `${this.entries.length} · ${summary}`
          : this.availability === 'ready'
            ? t('modifiedFiles.readyShort')
            : t('modifiedFiles.unavailableShort');
      }
    }
    const tooltip = hasEntries
      ? showingRevert
        ? `${t('editRevert.sectionTitle')}: ${revertCount}`
        : `${t('modifiedFiles.title')}: ${this.entries.length}, ${summary}`
      : this.availability === 'ready'
        ? t('modifiedFiles.empty')
        : t('modifiedFiles.unavailable');
    ConversationRenderService.setTooltipLabel(
      this.hostEl,
      tooltip,
    );
  }

  private render(): void {
    if (!this.listEl) {
      return;
    }

    // R-B3: when the backend-neutral revert round has entries it replaces the
    // read-only session-diff list (same files, plus revert actions).
    const showingRevert = this.hasRevertEntries();
    this.listEl.classList.toggle('is-hidden', showingRevert);
    if (showingRevert) {
      return;
    }

    this.listEl.empty();
    this.renderLinkedNoteState();
    if (this.entries.length === 0) {
      this.listEl.createDiv({
        cls: `opencodian-modified-files-sidebar-empty is-${this.availability}`,
        text: this.availability === 'ready' ? t('modifiedFiles.empty') : t('modifiedFiles.unavailable'),
      });
      return;
    }

    for (const entry of this.entries) {
      const itemEl = this.listEl.createEl('details', {
        cls: `opencodian-modified-files-sidebar-item status-${entry.status ?? 'modified'}`,
      });
      itemEl.open = true;

      const summaryEl = itemEl.createEl('summary', {
        cls: 'opencodian-modified-files-sidebar-item-summary',
      });
      const relativePath = this.formatPath(entry.file);
      const displayPath = relativePath ?? getFilePathBasename(entry.file);
      const pathEl = summaryEl.createSpan({
        cls: 'opencodian-modified-files-sidebar-path',
        text: displayPath,
      });
      pathEl.title = displayPath;
      if (relativePath) {
        pathEl.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.app.workspace.openLinkText(relativePath, '', false);
        });
      } else {
        pathEl.classList.add('is-unresolved');
      }

      const metaEl = itemEl.createDiv({ cls: 'opencodian-modified-files-sidebar-meta' });
      const statsEl = metaEl.createSpan({ cls: 'opencodian-modified-files-sidebar-stats' });
      statsEl.createSpan({ cls: 'opencodian-modified-files-sidebar-additions', text: `+${entry.additions}` });
      statsEl.createSpan({ cls: 'opencodian-modified-files-sidebar-deletions', text: `-${entry.deletions}` });

      metaEl.createSpan({
        cls: `opencodian-modified-files-sidebar-status status-${entry.status ?? 'modified'}`,
        text: this.getStatusLabel(entry.status),
      });
      if (this.linkedNote.path === relativePath && this.linkedNote.exists) {
        metaEl.createSpan({
          cls: 'opencodian-modified-files-linked-note-badge',
          text: t('modifiedFiles.linkedNoteDraft'),
        });
      }
    }
  }

  private renderLinkedNoteState(): void {
    if (!this.linkedNote.path || !this.listEl) {
      return;
    }
    this.renderLinkedNoteStateInto(this.listEl);
  }

  private renderLinkedNoteStateInto(parentEl: HTMLElement): void {
    if (!this.linkedNote.path) {
      return;
    }
    const state = this.linkedNote.exists ? 'explicit-draft' : 'locked';
    const rowEl = parentEl.createDiv({
      cls: 'opencodian-modified-files-linked-note',
      attr: { 'data-linked-note-state': state },
    });
    if (this.linkedNote.exists) {
      const pathButton = rowEl.createEl('button', {
        cls: 'opencodian-modified-files-sidebar-path',
        text: this.linkedNote.path,
        attr: { type: 'button' },
      });
      pathButton.addEventListener('click', () => {
        void this.app.workspace.openLinkText(this.linkedNote.path!, '', false);
      });
    } else {
      rowEl.createSpan({
        cls: 'opencodian-modified-files-sidebar-path is-unresolved',
        text: this.linkedNote.path,
      });
    }
    rowEl.createSpan({
      cls: 'opencodian-modified-files-linked-note-badge',
      text: this.linkedNote.exists
        ? t('modifiedFiles.linkedNoteDraft')
        : t('modifiedFiles.linkedNoteLocked'),
    });
  }

  private shouldRenderStandaloneLinkedNote(entries: EditRevertSidebarModel['entries']): boolean {
    return Boolean(
      this.linkedNote.path
      && !entries.some((entry) => entry.path === this.linkedNote.path),
    );
  }

  private getStatusLabel(status: SessionDiffEntry['status']): string {
    switch (status) {
      case 'added':
        return t('modifiedFiles.statusAdded');
      case 'deleted':
        return t('modifiedFiles.statusDeleted');
      default:
        return t('modifiedFiles.statusModified');
    }
  }

  private hasRevertEntries(): boolean {
    return !!this.revertModel && this.revertModel.enabled && this.revertModel.entries.length > 0;
  }

  private renderRevertSection(): void {
    if (!this.headerEl || !this.listEl) {
      return;
    }
    const model = this.revertModel;
    if (!this.hasRevertEntries() || !model) {
      this.revertSectionEl?.remove();
      this.revertSectionEl = null;
      this.containerEl.querySelector('.opencodian-modified-files-linked-note-section')?.remove();
      this.render();
      this.updateSummary();
      return;
    }

    if (!this.revertSectionEl) {
      this.revertSectionEl = this.containerEl.createDiv({ cls: 'opencodian-edit-revert-section' });
      this.headerEl.after(this.revertSectionEl);
    }
    this.revertSectionEl.empty();

    const headerRow = this.revertSectionEl.createDiv({ cls: 'opencodian-edit-revert-header' });
    headerRow.createSpan({
      cls: 'opencodian-edit-revert-title',
      text: t('editRevert.sectionTitle'),
    });
    if (model.roundOpen) {
      headerRow.createSpan({
        cls: 'opencodian-edit-revert-hint',
        text: t('editRevert.roundOpenHint'),
      });
    } else if (model.revertibleCount > 0 && this.revertActions) {
      const revertAllButton = headerRow.createEl('button', {
        cls: 'opencodian-edit-revert-all opencodian-tooltip-trigger',
        attr: { type: 'button' },
      });
      revertAllButton.textContent = t('editRevert.revertAll');
      revertAllButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.runRevertAction(() => this.revertActions?.revertAll() ?? Promise.resolve());
      });
    }

    if (model.degraded) {
      this.revertSectionEl.createDiv({
        cls: 'opencodian-edit-revert-hint',
        text: t('editRevert.degradedHint'),
      });
    }

    const listEl = this.revertSectionEl.createDiv({ cls: 'opencodian-edit-revert-list' });
    for (const entry of model.entries) {
      const rowEl = listEl.createDiv({
        cls: `opencodian-edit-revert-item status-${entry.status} state-${entry.state}`,
      });
      const pathEl = rowEl.createSpan({
        cls: 'opencodian-edit-revert-path',
        text: entry.path,
      });
      pathEl.title = entry.path;
      if (this.linkedNote.path === entry.path && this.linkedNote.exists) {
        rowEl.createSpan({
          cls: 'opencodian-modified-files-linked-note-badge',
          text: t('modifiedFiles.linkedNoteDraft'),
        });
      }
      pathEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.app.workspace.openLinkText(entry.path, '', false);
      });

      if (entry.state === 'reverted') {
        if (entry.restorable && this.revertActions) {
          const restoreButton = rowEl.createEl('button', {
            cls: 'opencodian-edit-revert-action',
            attr: { type: 'button' },
          });
          restoreButton.textContent = t('editRevert.restore');
          restoreButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void this.runRevertAction(
              () => this.revertActions?.restoreFile(entry.path) ?? Promise.resolve(),
            );
          });
        }
        continue;
      }

      if (entry.revertible) {
        if (this.revertActions) {
          const revertButton = rowEl.createEl('button', {
            cls: 'opencodian-edit-revert-action',
            attr: {
              type: 'button',
              ...(model.roundOpen ? { disabled: 'true' } : {}),
            },
          });
          revertButton.textContent = t('editRevert.revert');
          revertButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void this.runRevertAction(
              () => this.revertActions?.revertFile(entry.path) ?? Promise.resolve(),
            );
          });
        }
      } else {
        rowEl.createSpan({
          cls: 'opencodian-edit-revert-excluded',
          text: t(entry.excludedReason === 'oversize'
            ? 'editRevert.excludedOversize'
            : 'editRevert.excludedNoPreimage'),
        });
      }
    }

    this.renderStandaloneLinkedNoteSection(model.entries);
  }

  private renderStandaloneLinkedNoteSection(entries: EditRevertSidebarModel['entries']): void {
    this.containerEl.querySelector('.opencodian-modified-files-linked-note-section')?.remove();
    if (!this.shouldRenderStandaloneLinkedNote(entries)) {
      return;
    }

    const bindingSectionEl = this.containerEl.createDiv({
      cls: 'opencodian-modified-files-linked-note-section',
    });
    this.revertSectionEl?.after(bindingSectionEl);
    bindingSectionEl.createDiv({
      cls: 'opencodian-modified-files-linked-note-section-title',
      text: t('modifiedFiles.linkedNoteSection'),
    });
    this.renderLinkedNoteStateInto(bindingSectionEl);
    bindingSectionEl.createDiv({
      cls: 'opencodian-modified-files-linked-note-section-hint',
      text: t('modifiedFiles.linkedNoteExcludedHint'),
    });
  }

  private revertBusy = false;

  private async runRevertAction(action: () => Promise<void>): Promise<void> {
    if (this.revertBusy) {
      return;
    }
    this.revertBusy = true;
    try {
      await action();
    } finally {
      this.revertBusy = false;
    }
  }

  private formatPath(filePath: string): string | null {
    return toVaultRelativePath(filePath, this.getVaultBasePath());
  }

  private getVaultBasePath(): string | null {
    const adapter = this.app.vault?.adapter as { getBasePath?: () => string } | undefined;
    return adapter?.getBasePath?.() ?? null;
  }

  destroy(): void {
    this.unload();
    this.wrapperEl.remove();
  }
}

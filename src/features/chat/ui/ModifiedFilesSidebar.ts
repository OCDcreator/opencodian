/**
 * ModifiedFilesSidebar - compact, clickable summary of the active session diff.
 *
 * The entries are supplied by the chat runtime; this component never requests
 * Git state or renders patch content.
 */

import { App, Component, setIcon } from 'obsidian';

import type { SessionDiffEntry } from '../../../core/types/chat';
import { t } from '../../../i18n';
import { ConversationRenderService } from '../services/ConversationRenderService';

export type ModifiedFilesSidebarAvailability = 'ready' | 'unavailable';

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
  private expanded = false;
  private entries: SessionDiffEntry[] = [];
  private availability: ModifiedFilesSidebarAvailability = 'unavailable';
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

  updateEntries(entries: SessionDiffEntry[], availability: ModifiedFilesSidebarAvailability = 'ready'): void {
    this.entries = entries.map((entry) => ({ ...entry }));
    this.availability = availability;
    this.updateSummary();
    this.render();
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
    const additions = this.entries.reduce((total, entry) => total + entry.additions, 0);
    const deletions = this.entries.reduce((total, entry) => total + entry.deletions, 0);
    const summary = `+${additions} -${deletions}`;
    const hasEntries = this.entries.length > 0;
    this.badgeEl.textContent = hasEntries ? String(this.entries.length) : '';
    this.badgeEl.classList.toggle('is-hidden', !hasEntries);
    this.badgeEl.classList.toggle('is-empty', !hasEntries && this.availability === 'ready');
    this.hostEl.classList.toggle('is-empty', !hasEntries && this.availability === 'ready');
    this.hostEl.classList.toggle('is-unavailable', this.availability === 'unavailable');
    this.hostEl.dataset.state = hasEntries ? 'changed' : this.availability;
    if (this.summaryEl) {
      this.summaryEl.textContent = hasEntries
        ? `${this.entries.length} · ${summary}`
        : this.availability === 'ready'
          ? t('modifiedFiles.readyShort')
          : t('modifiedFiles.unavailableShort');
    }
    const tooltip = hasEntries
      ? `${t('modifiedFiles.title')}: ${this.entries.length}, ${summary}`
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

    this.listEl.empty();
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
      const pathEl = summaryEl.createSpan({
        cls: 'opencodian-modified-files-sidebar-path',
        text: this.formatPath(entry.file),
      });
      pathEl.title = entry.file;
      pathEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.app.workspace.openLinkText(this.formatPath(entry.file), '', false);
      });

      const metaEl = itemEl.createDiv({ cls: 'opencodian-modified-files-sidebar-meta' });
      const statsEl = metaEl.createSpan({ cls: 'opencodian-modified-files-sidebar-stats' });
      statsEl.createSpan({ cls: 'opencodian-modified-files-sidebar-additions', text: `+${entry.additions}` });
      statsEl.createSpan({ cls: 'opencodian-modified-files-sidebar-deletions', text: `-${entry.deletions}` });

      metaEl.createSpan({
        cls: `opencodian-modified-files-sidebar-status status-${entry.status ?? 'modified'}`,
        text: this.getStatusLabel(entry.status),
      });
    }
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

  private formatPath(filePath: string): string {
    const basePath = this.getVaultBasePath();
    if (!basePath) return filePath;
    const normFile = filePath.replace(/\\/g, '/');
    const normBase = basePath.replace(/\\/g, '/');
    if (normFile.startsWith(`${normBase}/`)) {
      return normFile.slice(normBase.length + 1);
    }
    return filePath;
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

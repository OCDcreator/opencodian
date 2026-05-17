/**
 * ModifiedFilesSidebar - Floating sidebar for session diff entries.
 *
 * Shows files changed by the active OpenCode session on the right side of the
 * chat surface without replacing the existing inline diff notice.
 */

import { App, Component, setIcon } from 'obsidian';

import type { SessionDiffEntry } from '../../../core/types/chat';
import { t } from '../../../i18n';

export class ModifiedFilesSidebar extends Component {
  private hostEl: HTMLElement;
  private containerEl: HTMLElement;
  private headerEl!: HTMLElement;
  private listEl!: HTMLElement;
  private toggleButtonEl!: HTMLButtonElement;
  private isVisible = false;
  private entries: SessionDiffEntry[] = [];

  constructor(
    private readonly app: App,
    private readonly parentEl: HTMLElement,
  ) {
    super();
    this.hostEl = this.parentEl.createDiv({ cls: 'opencodian-modified-files-sidebar-host' });
    this.containerEl = this.hostEl.createDiv({ cls: 'opencodian-modified-files-sidebar' });
    this.load();
  }

  onload(): void {
    this.headerEl = this.containerEl.createDiv({ cls: 'opencodian-modified-files-sidebar-header' });
    this.headerEl.createSpan({ cls: 'opencodian-modified-files-sidebar-title', text: t('modifiedFiles.title') });

    this.toggleButtonEl = this.headerEl.createEl('button', {
      cls: 'opencodian-modified-files-sidebar-collapse opencodian-tooltip-trigger',
      attr: {
        type: 'button',
        'aria-label': t('modifiedFiles.toggleTooltip'),
        'data-tooltip': t('modifiedFiles.toggleTooltip'),
        'data-tooltip-align': 'left',
      },
    });
    setIcon(this.toggleButtonEl, 'panel-right-close');
    this.registerDomEvent(this.toggleButtonEl, 'click', () => this.toggle());

    this.listEl = this.containerEl.createDiv({ cls: 'opencodian-modified-files-sidebar-list' });
    this.render();
  }

  updateEntries(entries: SessionDiffEntry[]): void {
    this.entries = entries.map((entry) => ({ ...entry }));
    this.render();
  }

  toggle(): void {
    this.isVisible = !this.isVisible;
    this.containerEl.classList.toggle('visible', this.isVisible);
    this.containerEl.classList.toggle('collapsed', !this.isVisible);
  }

  show(): void {
    if (!this.isVisible) {
      this.toggle();
    }
  }

  private render(): void {
    this.containerEl.classList.toggle('visible', this.isVisible);
    this.containerEl.classList.toggle('collapsed', !this.isVisible);

    if (!this.listEl) {
      return;
    }

    this.listEl.empty();
    if (this.entries.length === 0) {
      this.listEl.createDiv({ cls: 'opencodian-modified-files-sidebar-empty', text: t('modifiedFiles.empty') });
      return;
    }

    for (const entry of this.entries) {
      const itemEl = this.listEl.createDiv({
        cls: `opencodian-modified-files-sidebar-item status-${entry.status ?? 'modified'}`,
      });

      const pathEl = itemEl.createEl('button', {
        cls: 'opencodian-modified-files-sidebar-path',
        text: this.formatPath(entry.file),
        attr: {
          type: 'button',
          title: entry.file,
        },
      });
      pathEl.addEventListener('click', () => {
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
    // Normalize separators so Windows backslash paths (C:\vault\...) are handled
    const normFile = filePath.replace(/\\/g, '/');
    const normBase = basePath.replace(/\\/g, '/');
    if (normFile.startsWith(`${normBase}/`)) {
      return normFile.slice(normBase.length + 1);
    }
    return filePath;
  }

  private getVaultBasePath(): string | null {
    const adapter = this.app.vault.adapter as { getBasePath?: () => string };
    return adapter.getBasePath?.() ?? null;
  }

  destroy(): void {
    this.unload();
    this.hostEl.remove();
  }
}

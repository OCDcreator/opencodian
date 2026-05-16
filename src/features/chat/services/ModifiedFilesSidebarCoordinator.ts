import { App, setIcon } from 'obsidian';

import type { SessionDiffEntry } from '../../../core/types';
import { t } from '../../../i18n';
import { ModifiedFilesSidebar } from '../ui/ModifiedFilesSidebar';

export class ModifiedFilesSidebarCoordinator {
  private sidebar: ModifiedFilesSidebar | null = null;
  private toggleEl: HTMLButtonElement | null = null;
  private badgeEl: HTMLElement | null = null;

  mountToggle(container: HTMLElement): void {
    container.empty();
    this.toggleEl = container.createEl('button', {
      cls: 'opencodian-modified-files-toggle opencodian-tooltip-trigger',
      attr: {
        type: 'button',
        'aria-label': t('modifiedFiles.toggleTooltip'),
        'data-tooltip': t('modifiedFiles.toggleTooltip'),
        'data-tooltip-align': 'top',
      },
    });
    setIcon(this.toggleEl, 'files');
    this.badgeEl = this.toggleEl.createSpan({
      cls: 'opencodian-modified-files-toggle-badge is-empty',
      text: '0',
    });
    this.toggleEl.addEventListener('click', () => {
      this.sidebar?.toggle();
      this.toggleEl?.classList.toggle('is-active');
    });
  }

  mountSidebar(parentEl: HTMLElement, app: App): void {
    this.sidebar?.destroy();
    this.sidebar = new ModifiedFilesSidebar(app, parentEl);
  }

  refresh(sessionId: string | null, getEntries: (id: string) => SessionDiffEntry[]): void {
    const entries = sessionId ? getEntries(sessionId) : [];
    this.sidebar?.updateEntries(entries);

    if (this.badgeEl) {
      this.badgeEl.textContent = String(entries.length);
      this.badgeEl.classList.toggle('is-empty', entries.length === 0);
    }
  }

  destroy(): void {
    this.sidebar?.destroy();
    this.sidebar = null;
    this.toggleEl = null;
    this.badgeEl = null;
  }
}

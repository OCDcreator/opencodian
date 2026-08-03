import { App } from 'obsidian';

import type { SessionDiffEntry } from '../../../core/types';
import {
  ModifiedFilesSidebar,
  type ModifiedFilesSidebarAvailability,
} from '../ui/ModifiedFilesSidebar';

export class ModifiedFilesSidebarCoordinator {
  private sidebar: ModifiedFilesSidebar | null = null;

  mountSidebar(parentEl: HTMLElement, app: App): void {
    this.sidebar?.destroy();
    const boundaryEl = parentEl.matches('.opencodian-container')
      ? parentEl
      : parentEl.querySelector<HTMLElement>('.opencodian-container') ?? parentEl;
    this.sidebar = new ModifiedFilesSidebar(app, boundaryEl);
  }

  refresh(
    sessionId: string | null,
    getEntries: (id: string) => SessionDiffEntry[],
    availability: ModifiedFilesSidebarAvailability = 'ready',
  ): void {
    const entries = availability === 'ready' && sessionId ? getEntries(sessionId) : [];
    this.sidebar?.updateEntries(entries, availability);
  }

  setVisible(enabled: boolean): void {
    this.sidebar?.setVisible(enabled);
  }

  destroy(): void {
    this.sidebar?.destroy();
    this.sidebar = null;
  }
}

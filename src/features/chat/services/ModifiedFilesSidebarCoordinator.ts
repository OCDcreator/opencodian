import { App } from 'obsidian';

import {
  type ChatMessage,
  getTurnDiffNoticeMeta,
  type SessionDiffEntry,
} from '../../../core/types';
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
    persistedMessages: readonly ChatMessage[] = [],
  ): void {
    const canReadSessionChanges = availability === 'ready' && sessionId !== null;
    const canonicalEntries = canReadSessionChanges ? getEntries(sessionId) : [];
    const entries = canonicalEntries.length > 0
      ? canonicalEntries
      : canReadSessionChanges
        ? this.getPersistedTurnDiffEntries(persistedMessages)
        : [];
    this.sidebar?.updateEntries(entries, availability);
  }

  private getPersistedTurnDiffEntries(
    messages: readonly ChatMessage[],
  ): SessionDiffEntry[] {
    const latestEntryByFile = new Map<string, SessionDiffEntry>();
    for (const message of messages) {
      const noticeMeta = getTurnDiffNoticeMeta(message);
      for (const entry of noticeMeta?.entries ?? []) {
        latestEntryByFile.set(entry.file, { ...entry });
      }
    }
    return [...latestEntryByFile.values()];
  }

  setVisible(enabled: boolean): void {
    this.sidebar?.setVisible(enabled);
  }

  destroy(): void {
    this.sidebar?.destroy();
    this.sidebar = null;
  }
}

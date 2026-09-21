import { App } from 'obsidian';

import {
  type ChatMessage,
  getTurnDiffNoticeMeta,
  type SessionDiffEntry,
} from '../../../core/types';
import type { EditRevertSidebarModel } from '../../../shared';
import {
  type ModifiedFilesRevertActions,
  ModifiedFilesSidebar,
  type ModifiedFilesSidebarAvailability,
} from '../ui/ModifiedFilesSidebar';

export interface LinkedNoteSidebarState {
  path?: string;
  exists: boolean;
}

export class ModifiedFilesSidebarCoordinator {
  private sidebar: ModifiedFilesSidebar | null = null;

  mountSidebar(parentEl: HTMLElement, app: App): void {
    this.sidebar?.destroy();
    const boundaryEl = parentEl.matches('.opencodian-container')
      ? parentEl
      : parentEl.querySelector<HTMLElement>('.opencodian-container') ?? parentEl;
    this.sidebar = new ModifiedFilesSidebar(app, boundaryEl);
  }

  // eslint-disable-next-line max-params -- session-diff inputs remain positional; linked-note state is an adjacent display-only input.
  refresh(
    sessionId: string | null,
    getEntries: (id: string) => SessionDiffEntry[],
    availability: ModifiedFilesSidebarAvailability = 'ready',
    persistedMessages: readonly ChatMessage[] = [],
    linkedNote: LinkedNoteSidebarState = { exists: false },
  ): void {
    const canReadSessionChanges = availability === 'ready' && sessionId !== null;
    const canonicalEntries = canReadSessionChanges ? getEntries(sessionId) : [];
    const entries = canonicalEntries.length > 0
      ? canonicalEntries
      : canReadSessionChanges
        ? this.getPersistedTurnDiffEntries(persistedMessages)
        : [];
    this.sidebar?.updateEntries(entries, availability, linkedNote);
  }

  /** R-B3: backend-neutral revert state + actions for the active conversation. */
  refreshRevertState(
    model: EditRevertSidebarModel | null,
    actions: ModifiedFilesRevertActions | null,
  ): void {
    this.sidebar?.updateRevertState(model, actions);
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

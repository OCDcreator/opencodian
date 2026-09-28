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
  private refreshRevision = 0;

  mountSidebar(parentEl: HTMLElement, app: App): void {
    this.refreshRevision += 1;
    this.sidebar?.destroy();
    const boundaryEl = parentEl.matches('.opencodian-container')
      ? parentEl
      : parentEl.querySelector<HTMLElement>('.opencodian-container') ?? parentEl;
    this.sidebar = new ModifiedFilesSidebar(app, boundaryEl);
  }

  // eslint-disable-next-line max-params -- session-diff inputs remain positional; linked-note state is an adjacent display-only input.
  refresh(
    sessionId: string | null,
    getEntries: (id: string) => SessionDiffEntry[] | Promise<SessionDiffEntry[] | null>,
    availability: ModifiedFilesSidebarAvailability = 'ready',
    persistedMessages: readonly ChatMessage[] = [],
    linkedNote: LinkedNoteSidebarState = { exists: false },
  ): void {
    const revision = ++this.refreshRevision;
    const canReadSessionChanges = availability === 'ready' && sessionId !== null;
    const canonicalEntries = canReadSessionChanges ? getEntries(sessionId) : [];
    if (!Array.isArray(canonicalEntries)) {
      // A native read is authoritative even when it returns an empty list (for
      // example, after session revert). Persisted turn snapshots cannot stand
      // in for the current session state while that read is in flight.
      const sidebar = this.sidebar;
      sidebar?.updateEntries([], 'unavailable', linkedNote);
      void canonicalEntries.then((entries) => {
        if (revision === this.refreshRevision && sidebar === this.sidebar) {
          const canonical = entries ?? this.getPersistedTurnDiffEntries(persistedMessages);
          const merged = new Map(canonical.map((entry) => [entry.file, entry]));
          // Child tasks can finish after the parent snapshot. Their own
          // immutable records extend the session overview without changing
          // an already completed parent Turn Change Record.
          for (const message of persistedMessages) {
            const meta = getTurnDiffNoticeMeta(message);
            if (!meta?.taskIds?.length) continue;
            for (const entry of meta.entries) merged.set(entry.file, { ...entry });
          }
          sidebar?.updateEntries([...merged.values()], 'ready', linkedNote);
        }
      }).catch(() => {
        if (revision === this.refreshRevision && sidebar === this.sidebar) {
          sidebar?.updateEntries([], 'unavailable', linkedNote);
        }
      });
      return;
    }
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
    this.refreshRevision += 1;
    this.sidebar?.destroy();
    this.sidebar = null;
  }
}

/**
 * VaultRetrievalComposerCoordinator (R-C1): the visible, cancellable half of
 * the opt-in whole-vault retrieval.
 *
 * When `vaultRetrievalEnabled` is on, the coordinator observes composer text
 * changes, asks the `VaultIndexService` for the top-K matching snippets and
 * manages them as dedicated draft context chips (`origin: 'vault-retrieval'`)
 * through the existing composer context store — so they render through the
 * normal chip row, can be removed individually with the existing chip ✕, and
 * ride the normal `contextItems` channel into the request.
 *
 * Removal stickiness: keys the user removed during the current draft are not
 * re-added until the next submit (turn boundary). Off state is structural:
 * with the setting disabled the coordinator makes no retrieval calls and
 * clears any lingering managed chips, so outgoing requests stay byte-identical
 * to the pre-feature behavior.
 */

import type {
  VaultRetrievalSettingsSlice,
  VaultRetrievalSnippet,
} from '../../../core/memory';
import type { PromptContextItem } from '../../../core/types';
import { createLogger, formatContextLabel } from '../../../shared';
import { getPromptContextTargetKey } from '../composerContext';
import type { TabId } from '../tabs';

const logger = createLogger('VaultRetrievalComposerCoordinator');

/** Debounce for composer text → retrieval query. */
const RETRIEVAL_DEBOUNCE_MS = 600;

export interface VaultRetrievalComposerPort {
  getDraftContextItems(tabId?: TabId | null): PromptContextItem[];
  mergeVaultRetrievalDraftItems(items: PromptContextItem[], tabId?: TabId | null): void;
}

export interface VaultRetrievalQueryPort {
  select(query: string): Promise<readonly VaultRetrievalSnippet[]>;
}

export interface VaultRetrievalComposerCoordinatorDeps {
  facade: VaultRetrievalComposerPort;
  /** Null when the plugin has no index service (feature fully dormant). */
  retrieval: VaultRetrievalQueryPort | null;
  getSettings: () => VaultRetrievalSettingsSlice;
  getActiveTabId(): TabId | null;
}

export class VaultRetrievalComposerCoordinator {
  private readonly cancelledKeysByTab = new Map<TabId | null, Set<string>>();
  private readonly injectedKeysByTab = new Map<TabId | null, Set<string>>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshSequence = 0;
  private itemIdSequence = 0;

  constructor(private readonly deps: VaultRetrievalComposerCoordinatorDeps) {}

  /**
   * Composer text changed. Empty text (or the feature being off) tears the
   * managed chips down; anything else schedules a debounced refresh.
   */
  onComposerInputChanged(value: string): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const settings = this.deps.getSettings();
    if (!settings.vaultRetrievalEnabled || !this.deps.retrieval) {
      this.clearManagedChips();
      return;
    }
    if (value.trim() === '') {
      this.beginNewDraftCycle();
      this.clearManagedChips();
      return;
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.refresh(value);
    }, RETRIEVAL_DEBOUNCE_MS);
  }

  /**
   * Turn boundary: the send has been handed to the pipeline, which will clear
   * the draft items once the stream starts. Cancelled keys reset here so the
   * next draft gets a fresh retrieval decision.
   */
  onComposerSubmitted(): void {
    this.beginNewDraftCycle();
  }

  /** Release the debounce timer (view teardown). */
  dispose(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.refreshSequence += 1;
  }

  private beginNewDraftCycle(): void {
    this.cancelledKeysByTab.clear();
    this.injectedKeysByTab.clear();
  }

  private clearManagedChips(): void {
    const tabId = this.deps.getActiveTabId();
    const hasManaged = this.deps.facade
      .getDraftContextItems(tabId)
      .some((item) => item.origin === 'vault-retrieval');
    if (hasManaged) {
      this.deps.facade.mergeVaultRetrievalDraftItems([], tabId);
    }
    this.injectedKeysByTab.delete(tabId);
  }

  private async refresh(query: string): Promise<void> {
    const settings = this.deps.getSettings();
    const retrieval = this.deps.retrieval;
    if (!settings.vaultRetrievalEnabled || !retrieval) {
      return;
    }
    const tabId = this.deps.getActiveTabId();
    const sequence = ++this.refreshSequence;
    let snippets: readonly VaultRetrievalSnippet[] = [];
    try {
      snippets = await retrieval.select(query);
    } catch (error) {
      // Fail-soft: never let retrieval break the composer. Existing managed
      // chips stay visible so the user can remove them; nothing new injects.
      logger.debug('vault retrieval refresh failed', { error });
      return;
    }
    if (sequence !== this.refreshSequence) {
      return;
    }
    const cancelled = this.collectCancelledKeys(tabId);
    const items = snippets
      // Defensive second cap: the service already enforces top-K.
      .slice(0, Math.max(0, settings.vaultRetrievalTopK))
      .map((snippet) => this.toContextItem(snippet))
      .filter((item) => !cancelled.has(getPromptContextTargetKey(item)));
    this.deps.facade.mergeVaultRetrievalDraftItems(items, tabId);
    this.injectedKeysByTab.set(tabId, new Set(items.map(getPromptContextTargetKey)));
  }

  /**
   * Keys this coordinator previously injected that are no longer in the draft
   * store were removed by the user — remember them for the current draft
   * cycle so a refresh does not silently re-add them.
   */
  private collectCancelledKeys(tabId: TabId | null): Set<string> {
    const cancelled = this.cancelledKeysByTab.get(tabId) ?? new Set<string>();
    const injected = this.injectedKeysByTab.get(tabId);
    if (injected) {
      const currentKeys = new Set(
        this.deps.facade.getDraftContextItems(tabId).map(getPromptContextTargetKey),
      );
      for (const key of injected) {
        if (!currentKeys.has(key)) {
          cancelled.add(key);
        }
      }
    }
    this.cancelledKeysByTab.set(tabId, cancelled);
    return cancelled;
  }

  private toContextItem(snippet: VaultRetrievalSnippet): PromptContextItem {
    this.itemIdSequence += 1;
    const lineRange = { startLine: snippet.startLine, endLine: snippet.endLine };
    return {
      id: `vault-retrieval-${this.itemIdSequence}`,
      kind: 'selection',
      path: snippet.path,
      label: formatContextLabel(snippet.path, lineRange),
      mime: 'text/markdown',
      lineRange,
      textSnapshot: snippet.text,
      origin: 'vault-retrieval',
    };
  }
}

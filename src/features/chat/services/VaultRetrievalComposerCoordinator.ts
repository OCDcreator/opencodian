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
import type { SelectedPdfSnippet } from '../../../core/pdf';
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

/**
 * R-C4: optional PDF index port. Hits merge into the same managed-chip flow
 * (visible, individually cancellable) but become `pdf_document` items that
 * carry only the matched page fragment — the whole document is never
 * injected (flowtext-c4-design §3.2).
 */
export interface PdfRetrievalQueryPort {
  select(query: string): Promise<readonly SelectedPdfSnippet[]>;
}

export interface VaultRetrievalComposerCoordinatorDeps {
  facade: VaultRetrievalComposerPort;
  /** Null when the plugin has no index service (feature fully dormant). */
  retrieval: VaultRetrievalQueryPort | null;
  /** Null when the PDF index service is absent or the engine is unavailable. */
  pdfRetrieval?: PdfRetrievalQueryPort | null;
  /**
   * R-E4: the optional embedding channel (null when the service is absent —
   * lexical-only behavior, byte-identical to the pre-feature flow).
   */
  semanticRetrieval?: SemanticRetrievalQueryPort | null;
  getSettings: () => VaultRetrievalSettingsSlice;
  getActiveTabId(): TabId | null;
}

/**
 * R-E4: the embedding channel's query port (subset of
 * VaultEmbeddingIndexService). Hits carry the semantic score; the channel
 * label rides the context item.
 */
export interface SemanticRetrievalQueryPort {
  query(
    queryText: string,
    options?: { reportDegradation?: (reason: string, detail?: string) => void },
  ): Promise<{ hits: Array<{ path: string; score: number }>; degradation: string | null }>;
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
    const vaultActive = settings.vaultRetrievalEnabled && this.deps.retrieval;
    const pdfActive = settings.pdfIndexEnabled && this.deps.pdfRetrieval;
    if (!vaultActive && !pdfActive) {
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
    const vaultActive = settings.vaultRetrievalEnabled && retrieval !== null;
    const pdfRetrieval = this.deps.pdfRetrieval ?? null;
    const pdfActive = settings.pdfIndexEnabled && pdfRetrieval !== null;
    const semanticRetrieval = this.deps.semanticRetrieval ?? null;
    // R-E4: the embedding channel rides only on top of the lexical one
    // (design §4) — no lexical channel, no semantic injection either.
    const semanticActive = vaultActive && settings.semanticRetrievalEnabled && semanticRetrieval !== null;
    // Either retrieval surface alone can drive managed chips: PDF indexing
    // (pdfIndexEnabled) does not require the note-retrieval master switch.
    if (!vaultActive && !pdfActive) {
      return;
    }
    const tabId = this.deps.getActiveTabId();
    const sequence = ++this.refreshSequence;
    const collected = await this.collectRetrievalResults({
      query,
      vaultActive,
      pdfActive,
      semanticActive,
      retrieval,
      pdfRetrieval,
      semanticRetrieval,
    });
    if (collected.vaultFailed && collected.pdfSnippets.length === 0) {
      // Original R-C1 contract: when the retrieval surface throws and nothing
      // new is available, keep the existing chips visible (nothing re-merges,
      // so the user can still remove them) and inject nothing new.
      return;
    }
    if (sequence !== this.refreshSequence) {
      return;
    }
    const cancelled = this.collectCancelledKeys(tabId);
    const lexicalItems = collected.snippets
      // Defensive second cap: the service already enforces top-K.
      .slice(0, Math.max(0, settings.vaultRetrievalTopK))
      .map((snippet) => this.toContextItem(snippet));
    // R-E4 merge (design §4): lexical first, semantic fills in unseen paths.
    const lexicalPaths = new Set(lexicalItems.map((item) => item.path));
    const semanticItems = collected.semanticHits
      .filter((hit) => !lexicalPaths.has(hit.path))
      .slice(0, Math.max(0, settings.vaultRetrievalTopK))
      .map((hit) => this.toSemanticContextItem(hit));
    const items = [
      ...lexicalItems,
      ...semanticItems,
      ...collected.pdfSnippets.slice(0, Math.max(0, settings.vaultRetrievalTopK))
        .map((snippet) => this.toPdfContextItem(snippet)),
    ].filter((item) => !cancelled.has(getPromptContextTargetKey(item)));
    this.deps.facade.mergeVaultRetrievalDraftItems(items, tabId);
    this.injectedKeysByTab.set(tabId, new Set(items.map(getPromptContextTargetKey)));
  }

  /**
   * Fan out the three retrieval surfaces (lexical / semantic / PDF) with the
   * per-surface fail-soft semantics; the semantic surface degrades honestly
   * to [] on failure (the service has already noticed the degradation).
   */
  private async collectRetrievalResults(input: {
    query: string;
    vaultActive: boolean;
    pdfActive: boolean;
    semanticActive: boolean;
    retrieval: VaultRetrievalQueryPort | null;
    pdfRetrieval: PdfRetrievalQueryPort | null;
    semanticRetrieval: SemanticRetrievalQueryPort | null;
  }): Promise<{
    snippets: readonly VaultRetrievalSnippet[];
    pdfSnippets: readonly SelectedPdfSnippet[];
    semanticHits: Array<{ path: string; score: number }>;
    vaultFailed: boolean;
  }> {
    let snippets: readonly VaultRetrievalSnippet[] = [];
    let pdfSnippets: readonly SelectedPdfSnippet[] = [];
    let semanticHits: Array<{ path: string; score: number }> = [];
    let vaultFailed = false;
    if (input.vaultActive && input.retrieval) {
      try {
        snippets = await input.retrieval.select(input.query);
      } catch (error) {
        // Fail-soft: never let retrieval break the composer.
        vaultFailed = true;
        logger.debug('vault retrieval refresh failed', { error });
      }
    }
    if (input.semanticActive && input.semanticRetrieval) {
      try {
        const result = await input.semanticRetrieval.query(input.query);
        semanticHits = result.hits;
      } catch (error) {
        // R-E4 honest degradation: a semantic failure never breaks the turn
        // nor fakes hits; lexical results keep flowing and the service has
        // already surfaced its one-time degradation notice.
        logger.debug('semantic retrieval refresh failed', { error });
      }
    }
    if (input.pdfActive && input.pdfRetrieval) {
      try {
        pdfSnippets = await input.pdfRetrieval.select(input.query);
      } catch (error) {
        logger.debug('pdf retrieval refresh failed', { error });
      }
    }
    return { snippets, pdfSnippets, semanticHits, vaultFailed };
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
      retrievalChannel: 'lexical',
    };
  }

  /**
   * R-E4: a semantic hit is a note-level match (no line range); the chip and
   * the sent attachment both carry the channel label honestly. The snapshot
   * is not read here — the user opts the chip in like any retrieval chip, and
   * the backend reads the note by path (same contract as folder items).
   */
  private toSemanticContextItem(hit: { path: string; score: number }): PromptContextItem {
    this.itemIdSequence += 1;
    return {
      id: `semantic-retrieval-${this.itemIdSequence}`,
      kind: 'file',
      path: hit.path,
      label: formatContextLabel(hit.path),
      mime: 'text/markdown',
      origin: 'vault-retrieval',
      retrievalChannel: 'semantic',
    };
  }

  /**
   * R-C4: a retrieved PDF hit becomes a `pdf_document` item whose payload is
   * ONLY the matched page fragment. No `textSnapshot` (PDF items never write
   * it); `pdf.fragment` marks the injected page span so the serializer can
   * label it honestly, and the retrieval chip can be removed like any other.
   */
  private toPdfContextItem(snippet: SelectedPdfSnippet): PromptContextItem {
    this.itemIdSequence += 1;
    return {
      id: `pdf-retrieval-${this.itemIdSequence}`,
      kind: 'pdf_document',
      path: snippet.pdfPath,
      label: `${snippet.pdfPath.replace(/\\/gu, '/').split('/').pop() ?? snippet.pdfPath} p.${snippet.pageFrom}${snippet.pageTo !== snippet.pageFrom ? `-${snippet.pageTo}` : ''}`,
      mime: 'application/pdf',
      pdf: {
        textLayerPresent: true,
        pageCount: 0,
        extractedChars: snippet.text.length,
        extraction: 'embedded',
        fragment: { pageFrom: snippet.pageFrom, pageTo: snippet.pageTo },
      },
      pdfPages: [{ page: snippet.pageFrom, text: snippet.text }],
      origin: 'vault-retrieval',
    };
  }
}

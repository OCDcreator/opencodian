/**
 * PdfChatIntegration (R-C4 phase 3, flowtext-c4-design §3.3): the PDF-view
 * side of "select text → ask → save as annotation".
 *
 * Structural work only in this file: the degradation ladder decision is the
 * pure `resolvePdfIntegrationLevel` (core.pdf), the sidecar entry format is
 * the pure `buildAnnotationEntry` (core.pdf), and the only write path is a
 * single `vault.process` / `vault.create` on the markdown sidecar, covered
 * by the R-B3 revert system (beginBatchCapture → notePluginWrite →
 * endBatchCapture). The PDF binary itself is never modified (design §1.2).
 *
 * Ladder (probed at runtime per leaf, honestly reported in settings debug):
 *  - A: toolbar button + native `getTextSelectionRangeStr` serialization +
 *    `#page&selection` back links + `highlightText` feedback — claimed ONLY
 *    after the serializer has serialized a REAL selection end to end;
 *  - B: toolbar button + DOM selection text, `#page=N` only. This is the
 *    honest state of a callable-but-unproven serializer too (a bare probe
 *    with no selection on screen proves nothing about real captures — the
 *    deployed build reported A while every real capture threw inside the
 *    host because the ctx lacked a `contains` predicate);
 *  - C: command opens the chat for manual paste — always available.
 *
 * The serializer ctx is `{ win, contains }` — Obsidian's implementation
 * (1.13.7 bundle) runs `if (!e.contains(t)) return null` and then walks
 * parent nodes from the selection looking for `.textLayerNode`, so the ctx
 * must be a working containment ROOT. `document.contains` was measured
 * working on a real selection; `pdfViewer.contains` was measured returning
 * null (the stop-at-root rule eats the walk), and `{ win }` alone throws
 * "e.contains is not a function" on every real selection.
 *
 * A real capture is the evidence channel in BOTH directions: the first
 * successful serialization on a live selection UPGRADES the bridge to A
 * (recorded verbatim in the reasons), and a serializer failure on a live
 * selection DOWNGRADES a claimed A to B — the reported level and the real
 * capability are never allowed to disagree (same defect class as R-C4-D1).
 *
 * First probe is never final (live-acceptance fix): Obsidian builds a pdf
 * view's internals (`viewer.child.pdfViewer`, toolbar containers) AFTER the
 * leaf appears, so the very first probe usually lands on an empty viewer.
 * A C-verdict leaf is therefore re-probed on a short bounded backoff (and on
 * every later workspace sync) and the bridge is UPGRADED only when a fresh
 * probe genuinely proves a higher rung. A viewer that never becomes ready
 * stays at C with the honest reason.
 */

import type { App, WorkspaceLeaf } from 'obsidian';
import { Notice, setIcon,TFile } from 'obsidian';

import {
  annotationsSidecarPathFor,
  buildAnnotationEntry,
  isValidRangeStr,
  pageNumberOfSelectionNode,
  type PdfIntegrationDecision,
  type PdfIntegrationLevel,
  resolvePdfIntegrationLevel,
} from '../../../core/pdf';
import type {
  Conversation,
  EditRevertServicePort,
  PromptContextItem,
} from '../../../core/types';
import { t } from '../../../i18n';
import { PdfAnnotationPreviewModal } from './PdfAnnotationPreviewModal';

/** Minimal structural shape of Obsidian's internal pdf view (unexported). */
interface PdfViewLike {
  containerEl?: HTMLElement;
  file?: { path?: string };
  viewer?: {
    child?: {
      pdfViewer?: unknown;
      toolbar?: { toolbarLeftEl?: HTMLElement; toolbarRightEl?: HTMLElement };
      getTextSelectionRangeStr?: (ctx: unknown) => unknown;
      highlightText?: (page: number, rangeStr: string) => unknown;
    };
  };
}

export interface PdfChatIntegrationPorts {
  attachContextItemToActiveChat(item: PromptContextItem): Promise<void>;
  /** Reveal/open the chat view (level C: nothing is attached, say so). */
  openChat(): Promise<void>;
  getActiveConversation(): Conversation | null;
  getEditRevert(): EditRevertServicePort | null;
  buildPdfSelectionItem(input: {
    pdfPath: string;
    page: number;
    text: string;
    rangeStr?: string;
  }): PromptContextItem | null;
}

interface LeafBridge {
  leaf: WorkspaceLeaf;
  decision: PdfIntegrationDecision;
  toolbarButton: HTMLElement | null;
  onSelectionReleased: () => void;
}

/** Ladder rank for the one-directional (upgrade-only) re-probe rule. */
const LEVEL_ORDER: Record<PdfIntegrationLevel, number> = { C: 0, B: 1, A: 2 };

/**
 * Bounded re-probe schedule for a leaf whose first probe said C. Obsidian's
 * pdf viewer finishes loading its internals within a few seconds of the leaf
 * appearing (live-measured ~6s), so the cumulative ~7.75s budget covers the
 * real open path while still being finite: a viewer that never becomes ready
 * keeps the honest C verdict instead of retrying forever.
 */
const DEFAULT_VIEWER_READY_RETRY_DELAYS_MS: readonly number[] = [250, 500, 1000, 2000, 4000];

export interface PdfChatIntegrationOptions {
  /**
   * Injectable re-probe schedule (tests pass tiny delays). The budget is
   * consumed once per bridge mount; exhausting it stops the retries.
   */
  viewerReadyRetryDelaysMs?: readonly number[];
}

export class PdfChatIntegration {
  private readonly bridges = new Map<WorkspaceLeaf, LeafBridge>();
  private registeredRefs: Array<() => void> = [];
  private lastDecision: PdfIntegrationDecision | null = null;
  private readonly readyRetryTimers = new Map<WorkspaceLeaf, ReturnType<typeof setTimeout>>();
  private readonly readyRetryAttempts = new Map<WorkspaceLeaf, number>();
  private readonly viewerReadyRetryDelaysMs: readonly number[];

  constructor(
    private readonly app: App,
    private readonly ports: PdfChatIntegrationPorts,
    options?: PdfChatIntegrationOptions,
  ) {
    this.viewerReadyRetryDelaysMs = options?.viewerReadyRetryDelaysMs
      ?? DEFAULT_VIEWER_READY_RETRY_DELAYS_MS;
  }

  /** Register workspace listeners; dormant-safe (no pdf leaf → no bridge). */
  attach(): void {
    const workspace = this.app.workspace;
    const layoutRef = workspace.on('layout-change', () => this.syncLeaves());
    const activeRef = workspace.on('active-leaf-change', () => this.syncLeaves());
    this.registeredRefs = [
      () => workspace.offref(layoutRef),
      () => workspace.offref(activeRef),
    ];
    this.syncLeaves();
  }

  /** Release every listener and unmount all toolbar buttons. */
  detach(): void {
    for (const offref of this.registeredRefs) {
      offref();
    }
    this.registeredRefs = [];
    for (const [leaf, bridge] of [...this.bridges.entries()]) {
      this.releaseBridge(leaf, bridge);
    }
    this.bridges.clear();
  }

  /** Debug surface: the most recent probe decision (never fabricated). */
  getLadderReport(): PdfIntegrationDecision | null {
    return this.lastDecision;
  }

  /**
   * Command entry `pdf:ask-selection`: capture the active pdf selection (A/B)
   * and open the chat with it attached; with nothing capturable it degrades
   * to level C — open the chat and say so honestly.
   */
  async askSelectionFromActivePdf(): Promise<void> {
    const bridge = this.resolveActiveBridge();
    const captured = bridge ? this.captureSelection(bridge) : null;
    if (!bridge || !captured) {
      // Level C: no viewer internals required, never pretends success.
      new Notice(t('chat.context.notice.pdfNoSelection'));
      await this.ports.openChat();
      return;
    }
    const pdfPath = this.pdfPathOf(bridge.leaf);
    const item = this.ports.buildPdfSelectionItem({
      pdfPath,
      page: captured.page,
      text: captured.text,
      rangeStr: captured.rangeStr,
    });
    if (!item) {
      return;
    }
    await this.ports.attachContextItemToActiveChat(item);
  }

  /**
   * Command entry `pdf:save-annotation`: preview + write the latest PDF
   * Q&A from the active conversation to the sidecar note.
   */
  async saveLastAnnotation(): Promise<void> {
    const exchange = this.findLastPdfExchange();
    if (!exchange) {
      new Notice(t('chat.context.notice.pdfAnnotationNoExchange'));
      return;
    }
    const sidecarPath = annotationsSidecarPathFor(exchange.pdfPath);
    const entry = buildAnnotationEntry({
      timestamp: new Date(),
      pdfPath: exchange.pdfPath,
      selection: {
        page: exchange.page,
        text: exchange.selectionText,
        rangeStr: exchange.rangeStr,
      },
      question: exchange.question,
      answer: exchange.answer,
    });

    const confirmed = await new Promise<boolean>((resolve) => {
      new PdfAnnotationPreviewModal(this.app, {
        entry,
        sidecarPath,
        revertAvailable: this.isRevertCoverageAvailable(),
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      }).open();
    });
    if (!confirmed) {
      return;
    }
    await this.applyAnnotationWrite(exchange.conversationId, sidecarPath, entry);
    this.highlightLastSelection(exchange.page, exchange.rangeStr);
  }

  // -------------------------------------------------------------------------
  // Leaf bridging (runtime gate + toolbar entry)
  // -------------------------------------------------------------------------

  private syncLeaves(): void {
    const pdfLeaves = this.app.workspace.getLeavesOfType('pdf');
    for (const leaf of pdfLeaves) {
      const existing = this.bridges.get(leaf);
      if (existing) {
        // A bridged leaf may still be waiting for Obsidian to finish building
        // the viewer internals: re-probe so a later, genuinely-proven rung
        // can upgrade the bridge (D1) instead of caching the first verdict.
        this.reevaluateBridge(leaf, existing);
      } else {
        this.mountBridge(leaf);
      }
    }
    for (const [leaf, bridge] of [...this.bridges.entries()]) {
      if (!pdfLeaves.includes(leaf)) {
        // Per-bridge resilience (D2): one broken bridge must not abort the
        // sweep for the remaining leaves.
        this.releaseBridge(leaf, bridge);
        this.bridges.delete(leaf);
      }
    }
  }

  /**
   * Runtime confirmation gate (design §3.3): feature-detect the viewer
   * internals, then actually call the native serializer with the best-guess
   * context — running without throwing verifies the A path; a throw or a
   * malformed result honestly degrades to B. A C verdict on a fresh leaf is
   * usually just "probed too early", so the bounded readiness re-probe is
   * armed immediately (see `reevaluateBridge`).
   */
  private mountBridge(leaf: WorkspaceLeaf): void {
    const decision = this.probeLeaf(leaf);
    this.lastDecision = decision;

    const toolbarButton = decision.level !== 'C'
      ? this.mountToolbarButton(leaf)
      : null;
    this.bridges.set(leaf, {
      leaf,
      decision,
      toolbarButton,
      onSelectionReleased: () => undefined,
    });
    if (decision.level === 'C') {
      this.readyRetryAttempts.set(leaf, 0);
      this.scheduleViewerReadyRetry(leaf);
    }
  }

  /** Structural probe of one pdf leaf → honest ladder decision. */
  private probeLeaf(leaf: WorkspaceLeaf): PdfIntegrationDecision {
    const child = this.childOf(leaf);
    const probe = {
      hasPdfViewer: Boolean(child?.pdfViewer),
      hasToolbar: Boolean(child?.toolbar?.toolbarLeftEl ?? child?.toolbar?.toolbarRightEl),
      hasNativeRangeSerializer: typeof child?.getTextSelectionRangeStr === 'function',
      nativeRangeStrWorks: false,
      // A probe never carries a real selection, so it can never PROVE A —
      // that evidence only comes from a live capture (see captureSelection).
      nativeRangeStrProvenOnSelection: false,
      hasDomSelection: this.hasReadableDomSelection(leaf),
    };
    if (probe.hasNativeRangeSerializer) {
      try {
        const result = child?.getTextSelectionRangeStr?.(this.serializerCtx(leaf));
        // Any non-throwing run (empty string included — no selection yet)
        // proves the method accepts our context shape; it does NOT prove A.
        probe.nativeRangeStrWorks = (result === undefined || result === null)
          || typeof result === 'string';
      } catch {
        probe.nativeRangeStrWorks = false;
      }
    }
    return resolvePdfIntegrationLevel(probe);
  }

  /**
   * Arm one step of the bounded readiness backoff for a C-verdict leaf.
   * Guarded against double-scheduling; a finite budget keeps a viewer that
   * never becomes usable at C with the honest reasons (fail-closed).
   */
  private scheduleViewerReadyRetry(leaf: WorkspaceLeaf): void {
    if (this.readyRetryTimers.has(leaf)) {
      return;
    }
    const attempt = this.readyRetryAttempts.get(leaf) ?? 0;
    const delay = this.viewerReadyRetryDelaysMs[attempt];
    if (delay === undefined) {
      return; // budget exhausted: the C verdict stands, no infinite retrying
    }
    const timer = setTimeout(() => {
      this.readyRetryTimers.delete(leaf);
      this.readyRetryAttempts.set(leaf, attempt + 1);
      const bridge = this.bridges.get(leaf);
      if (bridge) {
        this.reevaluateBridge(leaf, bridge);
      }
    }, delay);
    this.readyRetryTimers.set(leaf, timer);
  }

  /**
   * Re-probe a bridged leaf and move the ladder UP only. The fresh decision
   * is adopted when it proves a higher rung (the probe actually CALLS the
   * native serializer, so an upgrade is evidence, never a guess — §6.7) or
   * restates the current rung; a lower re-probe never silently downgrades an
   * already-proven bridge. A still-C leaf keeps the backoff walking.
   */
  private reevaluateBridge(leaf: WorkspaceLeaf, bridge: LeafBridge): void {
    const next = this.probeLeaf(leaf);
    const nextRank = LEVEL_ORDER[next.level];
    const currentRank = LEVEL_ORDER[bridge.decision.level];
    if (nextRank > currentRank) {
      this.unmountBridge(bridge);
      bridge.decision = next;
      bridge.toolbarButton = next.level !== 'C' ? this.mountToolbarButton(leaf) : null;
      this.lastDecision = next;
    } else if (nextRank === currentRank) {
      bridge.decision = next;
      this.lastDecision = next;
    }
    if (bridge.decision.level === 'C') {
      this.scheduleViewerReadyRetry(leaf);
    }
  }

  private mountToolbarButton(leaf: WorkspaceLeaf): HTMLElement | null {
    const child = this.childOf(leaf);
    const host = child?.toolbar?.toolbarRightEl ?? child?.toolbar?.toolbarLeftEl;
    if (!host) {
      return null;
    }
    const button = this.docOf(leaf).createElement('div');
    button.className = 'clickable-icon';
    button.setAttribute('aria-label', t('chat.pdf.command.askSelection'));
    setIcon(button, 'message-square-text');
    button.addEventListener('click', () => {
      void this.askSelectionFromBridge(leaf);
    });
    host.appendChild(button);
    return button;
  }

  /**
   * Teardown must never throw (D2): a level-C bridge has no toolbar button,
   * a failed mount may be missing either field, and a viewer being torn down
   * concurrently can make even `remove()` throw. One bad bridge used to
   * abort `syncLeaves`' cleanup loop, which blocked any self-healing.
   */
  private unmountBridge(bridge: LeafBridge | null | undefined): void {
    if (!bridge) {
      return;
    }
    try {
      bridge.toolbarButton?.remove();
    } catch {
      // Best-effort: the sweep continues.
    }
    try {
      bridge.onSelectionReleased();
    } catch {
      // Best-effort: the sweep continues.
    }
  }

  /** Full release of one bridge: stop pending readiness retries, tear down. */
  private releaseBridge(leaf: WorkspaceLeaf, bridge: LeafBridge | null | undefined): void {
    const timer = this.readyRetryTimers.get(leaf);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.readyRetryTimers.delete(leaf);
    }
    this.readyRetryAttempts.delete(leaf);
    this.unmountBridge(bridge);
  }

  private async askSelectionFromBridge(leaf: WorkspaceLeaf): Promise<void> {
    const captured = this.captureSelection(this.bridges.get(leaf) ?? {
      leaf,
      decision: { level: 'B', reasons: [] },
      toolbarButton: null,
      onSelectionReleased: () => undefined,
    });
    if (!captured) {
      new Notice(t('chat.context.notice.pdfNoSelection'));
      return;
    }
    const item = this.ports.buildPdfSelectionItem({
      pdfPath: this.pdfPathOf(leaf),
      page: captured.page,
      text: captured.text,
      rangeStr: captured.rangeStr,
    });
    if (!item) {
      return;
    }
    await this.ports.attachContextItemToActiveChat(item);
  }

  // -------------------------------------------------------------------------
  // Selection capture (A ⇄ B, evidence-driven)
  // -------------------------------------------------------------------------

  /**
   * The ctx the native serializer needs (Obsidian 1.13.7 bundle:
   * `getTextSelectionRangeStr(e)` reads `e.win.getSelection()` and runs
   * `e.contains(...)` as the containment ROOT when locating the selection's
   * `.textLayerNode` ancestor). `{ win }` alone throws
   * "e.contains is not a function" on every real selection; `document.contains`
   * was measured working on a real selection (the narrowest predicate that
   * keeps the host's own behaviour correct — `pdfViewer.contains` was
   * measured returning null).
   */
  private serializerCtx(leaf: WorkspaceLeaf): { win: Window | null; contains: (node: Node) => boolean } {
    const doc = this.docOf(leaf);
    return {
      win: doc.defaultView,
      contains: (node: Node) => {
        try {
          return doc.contains(node);
        } catch {
          return false;
        }
      },
    };
  }

  private captureSelection(
    bridge: LeafBridge,
  ): { text: string; page: number; rangeStr?: string } | null {
    const child = this.childOf(bridge.leaf);
    const doc = this.docOf(bridge.leaf);
    // Level A candidate: Obsidian's native selection serialization. Tried
    // whenever the function exists — a B-level bridge with a working
    // serializer earns its A exactly here, on a REAL selection.
    if (typeof child?.getTextSelectionRangeStr === 'function') {
      try {
        const rangeStr = child.getTextSelectionRangeStr(this.serializerCtx(bridge.leaf));
        if (isValidRangeStr(rangeStr)) {
          const selection = doc.getSelection();
          const text = selection?.toString() ?? '';
          const page = pageNumberOfSelectionNode(selection?.anchorNode ?? null);
          if (text.trim() !== '' && page !== null) {
            this.recordCaptureEvidence(bridge, true);
            return { text, page, rangeStr };
          }
        }
        // No-throw but unusable output on a REAL selection: only downgrade a
        // claimed A when a selection was actually present (an empty-selection
        // run — e.g. the probe — proves nothing either way).
        const liveSelection = doc.getSelection();
        if (liveSelection && !liveSelection.isCollapsed && liveSelection.toString().trim() !== '') {
          this.recordCaptureEvidence(bridge, false);
        }
      } catch {
        // A serializer throw on a real selection is hard evidence the A
        // capability does not work: downgrade a claimed A honestly and fall
        // through to the DOM path (level B behaviour).
        this.recordCaptureEvidence(bridge, false);
      }
    }
    // Level B: plain DOM selection, page anchored via data-page-number.
    const selection = doc.getSelection();
    if (!selection || selection.isCollapsed) {
      return null;
    }
    const text = selection.toString();
    if (text.trim() === '') {
      return null;
    }
    const page = pageNumberOfSelectionNode(selection.anchorNode);
    if (page === null) {
      return null;
    }
    return { text, page };
  }

  /**
   * Fold a REAL capture outcome into the bridge's reported level so the
   * capability report can never disagree with the real capability:
   * proven serialization upgrades B → A (kept in the reasons verbatim);
   * a failure on a live selection downgrades a claimed A → B.
   */
  private recordCaptureEvidence(bridge: LeafBridge, proven: boolean): void {
    if (proven) {
      if (bridge.decision.level !== 'A') {
        const next: PdfIntegrationDecision = {
          level: 'A',
          reasons: ['native serializer proven on a live selection'],
        };
        bridge.decision = next;
        this.lastDecision = next;
      }
      return;
    }
    if (bridge.decision.level === 'A') {
      const next: PdfIntegrationDecision = {
        level: 'B',
        reasons: ['native range serializer failed on a live selection — downgraded to #page links'],
      };
      bridge.decision = next;
      this.lastDecision = next;
    }
  }

  // -------------------------------------------------------------------------
  // Annotation write path (the phase's ONLY new write path)
  // -------------------------------------------------------------------------

  private isRevertCoverageAvailable(): boolean {
    const revert = this.ports.getEditRevert();
    return Boolean(revert?.beginBatchCapture && revert.notePluginWrite && revert.endBatchCapture);
  }

  /**
   * The phase's ONLY new write path (design §3.3): append the confirmed
   * annotation entry to the markdown sidecar via a single `vault.process`
   * (existing file) or `vault.create` (new file), covered by the R-B3
   * revert system (begin → note → end). The PDF binary is never touched.
   *
   * Public for contract tests; the command path (`saveLastAnnotation`) is
   * the only production caller and always shows the preview modal first.
   */
  async applyAnnotationWrite(
    conversationId: string,
    sidecarPath: string,
    entry: string,
  ): Promise<void> {
    const revert = this.ports.getEditRevert();
    let captured = false;
    if (revert?.beginBatchCapture && revert.notePluginWrite && revert.endBatchCapture) {
      captured = await revert.beginBatchCapture(conversationId, [sidecarPath]);
    }
    try {
      const existing = this.app.vault.getAbstractFileByPath(sidecarPath);
      if (existing instanceof TFile) {
        // Single vault.process: read-then-write inside the closure is the
        // dirty check (design §4 row 3); any throw leaves the file untouched.
        await this.app.vault.process(existing, (content) => {
          const base = content.replace(/\s+$/u, '');
          return base === '' ? entry : `${base}\n\n${entry}`;
        });
      } else {
        await this.app.vault.create(sidecarPath, entry);
      }
    } catch (error) {
      new Notice(t('chat.context.notice.pdfAnnotationFailed', {
        message: error instanceof Error ? error.message : String(error),
      }));
      return;
    }
    if (captured && revert?.notePluginWrite && revert?.endBatchCapture) {
      await revert.notePluginWrite(conversationId, sidecarPath);
      await revert.endBatchCapture(conversationId);
    }
    new Notice(t('chat.context.notice.pdfAnnotationSaved', { path: sidecarPath }));
  }

  private highlightLastSelection(page: number, rangeStr?: string): void {
    const bridge = this.resolveActiveBridge();
    const child = this.childOf(bridge?.leaf ?? null);
    if (!bridge || bridge.decision.level !== 'A' || !rangeStr) {
      return;
    }
    if (typeof child?.highlightText === 'function') {
      try {
        child.highlightText(page, rangeStr);
      } catch {
        // Visual feedback is best-effort; the write already succeeded.
      }
    }
  }

  // -------------------------------------------------------------------------
  // Conversation scan for the latest PDF exchange
  // -------------------------------------------------------------------------

  private findLastPdfExchange(): {
    conversationId: string;
    pdfPath: string;
    page: number;
    selectionText: string;
    rangeStr?: string;
    question: string;
    answer: string;
  } | null {
    const conversation = this.ports.getActiveConversation();
    if (!conversation) {
      return null;
    }
    const messages = conversation.messages;
    let answer = '';
    let answerIndex = messages.length - 1;
    while (answerIndex >= 0 && messages[answerIndex].role !== 'assistant') {
      answerIndex -= 1;
    }
    if (answerIndex < 0) {
      return null;
    }
    answer = messages[answerIndex].content;
    for (let i = answerIndex - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== 'user') {
        continue;
      }
      const pdfAttachment = message.contextAttachments?.find((attachment) =>
        attachment.kind === 'pdf_selection' || attachment.kind === 'pdf_document');
      if (pdfAttachment) {
        return {
          conversationId: conversation.id,
          pdfPath: pdfAttachment.path,
          page: pdfAttachment.pdfSelection?.page ?? 1,
          selectionText: pdfAttachment.pdfSelection?.text ?? '',
          rangeStr: pdfAttachment.pdfSelection?.rangeStr,
          question: message.content,
          answer,
        };
      }
      return null; // Latest exchange has no PDF context — nothing to save.
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Structural helpers
  // -------------------------------------------------------------------------

  private resolveActiveBridge(): LeafBridge | null {
    const active = this.app.workspace.activeLeaf ?? null;
    if (active && this.bridges.has(active)) {
      return this.bridges.get(active) ?? null;
    }
    for (const bridge of this.bridges.values()) {
      return bridge;
    }
    return null;
  }

  private childOf(leaf: WorkspaceLeaf | null): NonNullable<PdfViewLike['viewer']>['child'] | undefined {
    const view = leaf?.view as PdfViewLike | undefined;
    return view?.viewer?.child;
  }

  private docOf(leaf: WorkspaceLeaf): Document {
    const container = (leaf?.view as PdfViewLike | undefined)?.containerEl;
    return container?.ownerDocument ?? document;
  }

  private pdfPathOf(leaf: WorkspaceLeaf): string {
    const view = leaf.view as PdfViewLike | undefined;
    return view?.file?.path ?? '';
  }

  private hasReadableDomSelection(leaf: WorkspaceLeaf): boolean {
    try {
      return this.docOf(leaf).getSelection() !== null;
    } catch {
      return false;
    }
  }
}

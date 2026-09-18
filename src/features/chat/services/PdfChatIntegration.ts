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
 *    `#page&selection` back links + `highlightText` feedback;
 *  - B: command entry + DOM selection text, `#page=N` only;
 *  - C: command opens the chat for manual paste — always available.
 */

import type { App, WorkspaceLeaf } from 'obsidian';
import { Notice, setIcon,TFile } from 'obsidian';

import {
  annotationsSidecarPathFor,
  buildAnnotationEntry,
  isValidRangeStr,
  pageNumberOfSelectionNode,
  type PdfIntegrationDecision,
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

export class PdfChatIntegration {
  private readonly bridges = new Map<WorkspaceLeaf, LeafBridge>();
  private registeredRefs: Array<() => void> = [];
  private lastDecision: PdfIntegrationDecision | null = null;

  constructor(
    private readonly app: App,
    private readonly ports: PdfChatIntegrationPorts,
  ) {}

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
    for (const bridge of [...this.bridges.values()]) {
      this.unmountBridge(bridge);
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
      if (!this.bridges.has(leaf)) {
        this.mountBridge(leaf);
      }
    }
    for (const [leaf, bridge] of [...this.bridges.entries()]) {
      if (!pdfLeaves.includes(leaf)) {
        this.unmountBridge(bridge);
        this.bridges.delete(leaf);
      }
    }
  }

  /**
   * Runtime confirmation gate (design §3.3): feature-detect the viewer
   * internals, then actually call the native serializer with the best-guess
   * context — running without throwing verifies the A path; a throw or a
   * malformed result honestly degrades to B.
   */
  private mountBridge(leaf: WorkspaceLeaf): void {
    const child = this.childOf(leaf);
    const probe = {
      hasPdfViewer: Boolean(child?.pdfViewer),
      hasToolbar: Boolean(child?.toolbar?.toolbarLeftEl ?? child?.toolbar?.toolbarRightEl),
      hasNativeRangeSerializer: typeof child?.getTextSelectionRangeStr === 'function',
      nativeRangeStrWorks: false,
      hasDomSelection: this.hasReadableDomSelection(leaf),
    };
    if (probe.hasNativeRangeSerializer) {
      try {
        const result = child?.getTextSelectionRangeStr?.({ win: this.docOf(leaf).defaultView });
        // Any non-throwing run (empty string included — no selection yet)
        // proves the method accepts our context shape.
        probe.nativeRangeStrWorks = (result === undefined || result === null)
          || typeof result === 'string';
      } catch {
        probe.nativeRangeStrWorks = false;
      }
    }
    const decision = resolvePdfIntegrationLevel(probe);
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

  private unmountBridge(bridge: LeafBridge): void {
    bridge.toolbarButton?.remove();
    bridge.onSelectionReleased();
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
  // Selection capture (A → B degradation)
  // -------------------------------------------------------------------------

  private captureSelection(
    bridge: Pick<LeafBridge, 'leaf' | 'decision'>,
  ): { text: string; page: number; rangeStr?: string } | null {
    const child = this.childOf(bridge.leaf);
    const doc = this.docOf(bridge.leaf);
    // Level A: Obsidian's native selection serialization.
    if (bridge.decision.level === 'A' && typeof child?.getTextSelectionRangeStr === 'function') {
      try {
        const rangeStr = child.getTextSelectionRangeStr({ win: doc.defaultView });
        if (isValidRangeStr(rangeStr)) {
          const selection = doc.getSelection();
          const text = selection?.toString() ?? '';
          const page = pageNumberOfSelectionNode(selection?.anchorNode ?? null);
          if (text.trim() !== '' && page !== null) {
            return { text, page, rangeStr };
          }
        }
      } catch {
        // Fall through to the DOM path — level B behavior, honestly degraded.
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

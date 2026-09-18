/**
 * CanvasIntegrationController — the plugin's bridge into Obsidian's
 * (unexported) canvas view (R-C5, flowtext-c5-design §3.4).
 *
 * Structural work only; every capability is feature-detected at runtime and
 * the degradation ladder is the designed one:
 *
 * - A: floating selection-menu button + direct write-back (gate fully passes);
 * - B: command entry reading `canvas.selection` (same write-back);
 * - C: when the selection set is unreadable, a node picker over
 *   `canvas.getData()` (deliberately independent of selection, §7-U4);
 * - D: the write surface (`setData`/`requestSave`) is missing — the rewrite
 *   result is offered as copy-to-clipboard with an explicit notice, never a
 *   fake write.
 *
 * When even the READ side cannot be proven at runtime, the feature registers
 * NOTHING for that leaf and the debug surface says so honestly (§6.7). The
 * guaranteed undo channel is the R-B3 revert system (view-independent): file
 * node writes ride it; text-node `setData` writes cannot (markdown-only
 * funnel) and say so in the preview instead of claiming an undo that is
 * unverified (design §3.4 / E2).
 */

import type { App, WorkspaceLeaf } from 'obsidian';
import { Notice, setIcon,TFile } from 'obsidian';

import {
  type CanvasGateDecision,
  type CanvasRuntimeLike,
  type CanvasViewLike,
  probeCanvasView,
  resolveSelectedNode,
  writeFileNodeContent,
  writeTextNode,
} from '../../core/canvas';
import type { EditRevertServicePort } from '../../core/types';
import { getLocale, t } from '../../i18n';
import { describeInlineEditFailure } from '../inline-edit/InlineEditPrompt';
import type { CanvasAuxTarget } from './CanvasNodeRewriteService';
import { CanvasNodeRewriteService } from './CanvasNodeRewriteService';
import {
  CanvasNodePickModal,
  type CanvasNodePickRow,
  CanvasRewriteInstructionModal,
  CanvasRewritePreviewModal,
} from './CanvasRewriteModals';

export interface CanvasIntegrationPorts {
  readonly app: App;
  readonly getEditRevert: () => EditRevertServicePort | null;
  readonly getActiveConversationId: () => string | null;
  readonly resolveAuxTarget: () => CanvasAuxTarget | null;
  /** User-visible honesty channel; main.ts injects the Notice sink. */
  readonly notify: (message: string) => void;
}

/** The node content a rewrite works on (file nodes carry the note path too). */
interface RewriteTarget {
  readonly nodeId: string;
  readonly kind: 'text' | 'file';
  /** Text-node body, or the whole markdown note behind a file node. */
  readonly text: string;
  readonly filePath?: string;
}

interface CanvasContextMenuHost extends CanvasRuntimeLike {
  onSelectionContextMenu?: (event: MouseEvent) => unknown;
  menu?: { menuEl?: HTMLElement; hide?: () => unknown };
}

interface CanvasLeafBridge {
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;
  decision: CanvasGateDecision;
  menuObserver: MutationObserver | null;
  menuButton: HTMLElement | null;
  contextMenuPatch: {
    canvas: CanvasContextMenuHost;
    original: (event: MouseEvent) => unknown;
  } | null;
}

export class CanvasIntegrationController {
  private readonly bridges = new Map<WorkspaceLeaf, CanvasLeafBridge>();
  private registeredRefs: Array<() => void> = [];
  private lastDecision: CanvasGateDecision | null = null;

  constructor(private readonly ports: CanvasIntegrationPorts) {}

  /** Register workspace listeners; dormant-safe (no canvas leaf → no bridge). */
  attach(): void {
    const workspace = this.ports.app.workspace;
    const layoutRef = workspace.on('layout-change', () => this.syncLeaves());
    const activeRef = workspace.on('active-leaf-change', () => this.syncLeaves());
    this.registeredRefs = [
      () => workspace.offref(layoutRef),
      () => workspace.offref(activeRef),
    ];
    this.syncLeaves();
  }

  /** Release every listener, observer, DOM addition and menu patch. */
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

  /** Debug surface: the most recent runtime gate decision (never fabricated). */
  getGateReport(): CanvasGateDecision | null {
    return this.lastDecision;
  }

  /**
   * Command entry `canvas-ai-edit-node` (ladder B → C). Works on every
   * backend through the aux seam; degrades honestly when the gate failed.
   */
  async aiEditNodeFromCommand(): Promise<void> {
    const bridge = this.activeBridge();
    if (!bridge || !bridge.decision.supported) {
      this.ports.notify(t('canvas.rewrite.unsupported'));
      return;
    }
    await this.rewriteFromBridge(bridge);
  }

  // -------------------------------------------------------------------------
  // Leaf bridging (runtime gate + entries)
  // -------------------------------------------------------------------------

  private syncLeaves(): void {
    const canvasLeaves = this.ports.app.workspace.getLeavesOfType('canvas');
    for (const leaf of canvasLeaves) {
      if (!this.bridges.has(leaf)) {
        this.mountBridge(leaf);
      }
    }
    for (const [leaf, bridge] of [...this.bridges.entries()]) {
      if (!canvasLeaves.includes(leaf)) {
        this.unmountBridge(bridge);
        this.bridges.delete(leaf);
      }
    }
  }

  /** Runtime confirmation gate (design §3.4 first task): probe, then mount. */
  private mountBridge(leaf: WorkspaceLeaf): void {
    const view = leaf.view as CanvasViewLike & { containerEl?: HTMLElement };
    const decision = probeCanvasView(view);
    this.lastDecision = decision;
    const containerEl = view.containerEl;
    if (!decision.supported || !containerEl) {
      // §6.7: register nothing for this leaf; the debug area reports why.
      this.bridges.set(leaf, {
        leaf,
        containerEl: containerEl ?? document.createElement('div'),
        decision,
        menuObserver: null,
        menuButton: null,
        contextMenuPatch: null,
      });
      return;
    }
    const bridge: CanvasLeafBridge = {
      leaf,
      containerEl,
      decision,
      menuObserver: null,
      menuButton: null,
      contextMenuPatch: null,
    };
    this.observeMenu(bridge);
    this.patchContextMenu(bridge);
    this.bridges.set(leaf, bridge);
  }

  private unmountBridge(bridge: CanvasLeafBridge): void {
    bridge.menuObserver?.disconnect();
    bridge.menuButton?.remove();
    if (bridge.contextMenuPatch) {
      try {
        bridge.contextMenuPatch.canvas.onSelectionContextMenu = bridge.contextMenuPatch.original;
      } catch {
        // The host object is gone with its leaf; nothing to restore.
      }
    }
  }

  private activeBridge(): CanvasLeafBridge | null {
    const active = this.ports.app.workspace.activeLeaf ?? null;
    if (active && this.bridges.has(active)) {
      return this.bridges.get(active) ?? null;
    }
    for (const bridge of this.bridges.values()) {
      return bridge;
    }
    return null;
  }

  // --- ladder A: floating selection-menu button (DOM append = low risk) -----

  /**
   * The canvas menu container appears when the selection menu renders; a
   * MutationObserver re-mounts the button whenever the host rebuilds. If the
   * container never appears, the button simply stays absent (honest) — the
   * command entries (B/C) remain.
   */
  private observeMenu(bridge: CanvasLeafBridge): void {
    const observer = new MutationObserver(() => this.ensureMenuButton(bridge));
    observer.observe(bridge.containerEl, { childList: true, subtree: true });
    bridge.menuObserver = observer;
    this.ensureMenuButton(bridge);
  }

  private ensureMenuButton(bridge: CanvasLeafBridge): void {
    if (bridge.menuButton?.isConnected) {
      return;
    }
    const host = bridge.containerEl.querySelector<HTMLElement>('.canvas-menu-container .canvas-menu')
      ?? bridge.containerEl.querySelector<HTMLElement>('.canvas-menu-container');
    if (!host) {
      return;
    }
    const button = bridge.containerEl.ownerDocument.createElement('div');
    button.className = 'clickable-icon';
    button.setAttribute('aria-label', t('canvas.rewrite.command.name'));
    setIcon(button, 'sparkles');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.rewriteFromBridge(bridge);
    });
    host.appendChild(button);
    bridge.menuButton = button;
  }

  // --- context-menu equivalent entry (design §3.4) ---------------------------

  /**
   * Wrap `canvas.onSelectionContextMenu` (feature-detected) and append our
   * item into the just-shown menu element. Every step is guarded: when the
   * menu element seam is absent the entry degrades to a no-op — never breaks
   * the native menu.
   */
  private patchContextMenu(bridge: CanvasLeafBridge): void {
    const canvas = (bridge.leaf.view as CanvasViewLike).canvas as CanvasContextMenuHost | undefined;
    if (!canvas || typeof canvas.onSelectionContextMenu !== 'function') {
      return;
    }
    const original = canvas.onSelectionContextMenu.bind(canvas);
    const patched = (event: MouseEvent): unknown => {
      try {
        return original(event);
      } finally {
        try {
          this.appendContextMenuItem(bridge, canvas);
        } catch {
          // Menu seam absent in this version — button + command still work.
        }
      }
    };
    canvas.onSelectionContextMenu = patched;
    bridge.contextMenuPatch = { canvas, original };
  }

  private appendContextMenuItem(bridge: CanvasLeafBridge, canvas: CanvasContextMenuHost): void {
    const menuEl = canvas.menu?.menuEl;
    if (!menuEl || !menuEl.isConnected) {
      return;
    }
    const item = menuEl.ownerDocument.createElement('div');
    item.className = 'menu-item';
    item.setText(t('canvas.rewrite.command.name'));
    item.addEventListener('click', () => {
      try {
        canvas.menu?.hide?.();
      } catch {
        // Closing is cosmetic; the flow still runs.
      }
      void this.rewriteFromBridge(bridge);
    });
    menuEl.appendChild(item);
  }

  // -------------------------------------------------------------------------
  // Rewrite flow (B → C → rewrite → preview → write-back)
  // -------------------------------------------------------------------------

  private async rewriteFromBridge(bridge: CanvasLeafBridge): Promise<void> {
    const canvas = (bridge.leaf.view as CanvasViewLike).canvas;
    if (!canvas) {
      return;
    }
    const selected = resolveSelectedNode(canvas);
    let target: RewriteTarget;
    if (selected.ok) {
      if (selected.extraSelectionCount > 0) {
        this.ports.notify(t('canvas.rewrite.multiSelection'));
      }
      const resolved = await this.contentFor(selected.content.kind, selected.content.nodeId,
        selected.content.text, selected.content.filePath);
      if (!resolved) {
        return;
      }
      target = resolved;
    } else if (selected.reason === 'no-selection' || selected.reason === 'selection-unreadable') {
      // Ladder C: pick from getData() — independent of the selection set.
      const picked = await this.pickNodeFromDocument(canvas);
      if (!picked) {
        return;
      }
      target = picked;
    } else {
      this.ports.notify(t('canvas.rewrite.nodeUnusable'));
      return;
    }

    const instruction = await new Promise<string | null>((resolve) => {
      new CanvasRewriteInstructionModal(this.ports.app, {
        targetLabel: this.describeTarget(target),
        onResolve: (value) => resolve(value),
        onCancel: () => resolve(null),
      }).open();
    });
    if (instruction === null) {
      return;
    }

    const auxTarget = this.ports.resolveAuxTarget();
    if (!auxTarget) {
      this.ports.notify(t('canvas.rewrite.backendUnavailable'));
      return;
    }
    const service = new CanvasNodeRewriteService({
      adapter: auxTarget.adapter,
      workingDirectory: auxTarget.workingDirectory,
      locale: getLocale(),
    });
    const outcome = await service.rewrite({
      canvasPath: this.leafPathOf(bridge),
      nodeType: target.kind,
      content: target.text,
      instruction,
    });
    if (outcome.status === 'error') {
      this.ports.notify(this.describeRewriteError(outcome.reason, outcome.detail));
      return;
    }
    if (outcome.status === 'clarification') {
      this.ports.notify(t('canvas.rewrite.clarification', { text: outcome.text }));
      return;
    }

    await this.previewAndWrite(bridge, canvas, target, outcome.text);
  }

  /** Preview + explicit confirm, then the single designed write path. */
  private async previewAndWrite(
    bridge: CanvasLeafBridge,
    canvas: CanvasRuntimeLike,
    target: RewriteTarget,
    nextText: string,
  ): Promise<void> {
    const copyOnly = !bridge.decision.canWriteBack;
    const revertNote = target.kind === 'file'
      ? (this.isRevertCoverageAvailable() ? undefined : t('canvas.rewrite.preview.noRevertCoverage'))
      : t('canvas.rewrite.preview.textNodeUndoNote');
    const confirmed = await new Promise<boolean>((resolve) => {
      new CanvasRewritePreviewModal(this.ports.app, {
        originalText: target.text,
        nextText,
        targetLabel: this.describeTarget(target),
        revertNote,
        copyOnly,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      }).open();
    });
    if (!confirmed) {
      return;
    }
    if (copyOnly) {
      // Ladder D: honest terminal state — copy, never a fake write.
      await navigator.clipboard.writeText(nextText);
      this.ports.notify(t('canvas.rewrite.copied'));
      return;
    }
    if (target.kind === 'text') {
      const result = writeTextNode({
        canvas,
        nodeId: target.nodeId,
        nextText,
        snapshotAtRequest: target.text,
      });
      if (!result.ok) {
        this.ports.notify(this.describeWriteFailure(result.reason, result.detail));
        return;
      }
      this.ports.notify(t('canvas.rewrite.textNodeWritten'));
      return;
    }
    await this.writeFileNode(target, nextText);
  }

  /** File-node write: the markdown note via ONE vault.process under R-B3 coverage. */
  private async writeFileNode(target: RewriteTarget, nextText: string): Promise<void> {
    const filePath = target.filePath ?? '';
    const file = this.ports.app.vault.getAbstractFileByPath(filePath);
    if (!filePath || !(file instanceof TFile)) {
      this.ports.notify(t('canvas.rewrite.noteMissing'));
      return;
    }
    const conversationId = this.ports.getActiveConversationId();
    const revert = this.ports.getEditRevert();
    // R-B3 pre-snapshot (budget-free batch convention) before the write; an
    // unavailable surface aborts the write instead of writing unrevertable.
    if (!conversationId || !revert?.beginBatchCapture || !revert.notePluginWrite || !revert.endBatchCapture) {
      this.ports.notify(t('canvas.rewrite.preview.noRevertCoverage'));
      return;
    }
    const captured = await revert.beginBatchCapture(conversationId, [filePath]);
    if (!captured) {
      this.ports.notify(t('canvas.rewrite.preview.noRevertCoverage'));
      return;
    }
    try {
      const result = await writeFileNodeContent({
        port: {
          process: async (path, transform) => {
            const note = this.ports.app.vault.getAbstractFileByPath(path);
            if (!(note instanceof TFile)) {
              throw new Error(`missing file: ${path}`);
            }
            await this.ports.app.vault.process(note, transform);
          },
        },
        filePath,
        nextContent: nextText,
        snapshotAtRequest: target.text,
      });
      if (!result.ok) {
        // No write happened (or it failed) — close the round so nothing dangles.
        await revert.endBatchCapture(conversationId);
        this.ports.notify(this.describeWriteFailure(result.reason, result.detail));
        return;
      }
    } catch (error) {
      await revert.endBatchCapture(conversationId);
      this.ports.notify(t('canvas.rewrite.error.writeFailed', {
        message: error instanceof Error ? error.message : String(error),
      }));
      return;
    }
    await revert.notePluginWrite(conversationId, filePath);
    await revert.endBatchCapture(conversationId);
    new Notice(t('canvas.rewrite.fileNodeWritten', { path: filePath }));
  }

  // -------------------------------------------------------------------------
  // Node content resolution (selection → getData fallback)
  // -------------------------------------------------------------------------

  private async contentFor(
    kind: 'text' | 'file',
    nodeId: string,
    text?: string,
    filePath?: string,
  ): Promise<RewriteTarget | null> {
    if (kind === 'text' && typeof text === 'string') {
      return { nodeId, kind, text };
    }
    if (kind === 'file' && typeof filePath === 'string') {
      const noteText = await this.readNoteText(filePath);
      if (noteText === null) {
        this.ports.notify(t('canvas.rewrite.noteMissing'));
        return null;
      }
      return { nodeId, kind, text: noteText, filePath };
    }
    this.ports.notify(t('canvas.rewrite.nodeUnusable'));
    return null;
  }

  /** Ladder C: list all document nodes and let the user pick the target. */
  private async pickNodeFromDocument(canvas: CanvasRuntimeLike): Promise<RewriteTarget | null> {
    let nodes: Array<Record<string, unknown>> = [];
    try {
      const doc = canvas.getData?.() as { nodes?: unknown } | null;
      if (doc && Array.isArray(doc.nodes)) {
        nodes = doc.nodes as Array<Record<string, unknown>>;
      }
    } catch {
      nodes = [];
    }
    const rows: CanvasNodePickRow[] = nodes.map((node, index) => ({
      id: String(node.id ?? index),
      type: String(node.type ?? ''),
      preview: typeof node.text === 'string' && node.text
        ? node.text.split('\n')[0].slice(0, 80)
        : typeof node.file === 'string' ? node.file : `${String(node.type ?? '?')} #${index + 1}`,
      selectable: node.type === 'text' || node.type === 'file',
    }));
    const pickedId = await new Promise<string | null>((resolve) => {
      new CanvasNodePickModal(this.ports.app, rows, (nodeId) => resolve(nodeId)).open();
    });
    if (pickedId === null) {
      return null;
    }
    const node = nodes.find((entry, index) => String(entry.id ?? index) === pickedId);
    if (!node) {
      return null;
    }
    return this.contentFor(
      node.type === 'file' ? 'file' : 'text',
      pickedId,
      typeof node.text === 'string' ? node.text : undefined,
      typeof node.file === 'string' ? node.file : undefined,
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async readNoteText(path: string): Promise<string | null> {
    const file = this.ports.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return null;
    }
    try {
      return await this.ports.app.vault.cachedRead(file);
    } catch {
      return null;
    }
  }

  private leafPathOf(bridge: CanvasLeafBridge): string {
    return (bridge.leaf.view as { file?: { path?: string } }).file?.path ?? '';
  }

  private describeTarget(target: RewriteTarget): string {
    return target.kind === 'file'
      ? t('canvas.rewrite.preview.targetNote', { path: target.filePath ?? '' })
      : t('canvas.rewrite.preview.targetTextNode');
  }

  private isRevertCoverageAvailable(): boolean {
    const revert = this.ports.getEditRevert();
    return Boolean(revert?.beginBatchCapture && revert.notePluginWrite && revert.endBatchCapture);
  }

  private describeRewriteError(reason: string, detail?: string): string {
    if (reason === 'write-tool-observed') {
      return detail
        ? `${t('canvas.rewrite.error.writeToolObserved')} (${detail})`
        : t('canvas.rewrite.error.writeToolObserved');
    }
    if (reason === 'session-unavailable' || reason === 'turn-failed') {
      return detail
        ? `${t('canvas.rewrite.error.sessionUnavailable')} ${detail}`
        : t('canvas.rewrite.error.sessionUnavailable');
    }
    if (reason === 'cancelled') {
      return t('canvas.rewrite.error.cancelled');
    }
    return t(describeInlineEditFailure(reason));
  }

  private describeWriteFailure(reason: string, detail?: string): string {
    switch (reason) {
      case 'node-changed':
        return t('canvas.rewrite.error.nodeChanged');
      case 'node-not-found':
        return t('canvas.rewrite.error.nodeNotFound');
      case 'invalid-document':
        return t('canvas.rewrite.error.invalidDocument');
      case 'write-failed':
      case 'write-refused':
      default:
        return t('canvas.rewrite.error.writeFailed', { message: detail ?? '' });
    }
  }
}

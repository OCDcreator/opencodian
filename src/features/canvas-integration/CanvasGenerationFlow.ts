/**
 * CanvasGenerationFlow — the "pick notes → generate a .canvas" flow
 * (R-C5, flowtext-c5-design §3.3).
 *
 * Sources (E3): the R-A7 multi-select picker is the primary entry (its
 * resolved entries already include R-B2 topic groups); the file-browser
 * multiselect enhancement is NOT implemented — the design's own feature-detect
 * fallback applies and the picker remains the entry (reported as such).
 *
 * Modes (E1): file-reference nodes are the default (zero AI, zero content
 * copy); AI topic split is an explicit secondary option that runs on the
 * read-only aux contract (findWriteToolCalls audit stays blocking). A failed
 * split is announced and falls back to file-reference mode explicitly —
 * never a silent downgrade, never a fake success (§6.4).
 *
 * Landing (acceptance 4) goes through `CanvasGenerationService` (core.canvas):
 * in-memory build → double validation → ONE `vault.create` → failure reclaim.
 * The created file is registered with `EditRevertService.registerPluginCreatedAsset`
 * (R-B3: revert = Obsidian trash) when a conversation is resolvable; if the
 * revert surface is unavailable the success notice says so honestly.
 */

import type { App } from 'obsidian';
import { Modal, normalizePath,Setting, TFile } from 'obsidian';

import { findWriteToolCalls } from '../../core/agents/backend/AgentAuxQueryCapability';
import {
  buildCanvasSplitPrompt,
  buildCanvasSplitSystemPrompt,
  CANVAS_SPLIT_MAX_NOTES,
  CanvasGenerationService,
  type CanvasSplitNoteInput,
  type CanvasSplitProposal,
  type CanvasVaultPort,
  oversizeSplitNotes,
  parseCanvasSplitProposal,
} from '../../core/canvas';
import type { EditRevertServicePort } from '../../core/types';
import { getLocale, t } from '../../i18n';
import type { CanvasAuxTarget } from './CanvasNodeRewriteService';

/** One picked entry handed over by composition (picker result, already resolved). */
export interface CanvasPickedEntry {
  readonly path: string;
  readonly kind: 'file' | 'folder';
}

export interface CanvasGenerationFlowPorts {
  readonly app: App;
  readonly getEditRevert: () => EditRevertServicePort | null;
  /** Active chat conversation for R-B3 round attribution; `null` → no coverage. */
  readonly getActiveConversationId: () => string | null;
  /** Resolved aux session inputs; `null` → the split option is unavailable. */
  readonly resolveAuxTarget: () => CanvasAuxTarget | null;
  /** Opens the note multi-picker; resolves `null` on cancel. */
  readonly pickNotes: () => Promise<readonly CanvasPickedEntry[] | null>;
  /** User-visible honesty channel (Notices). */
  readonly notify: (message: string) => void;
}

type SplitOutcome =
  | { readonly status: 'ok'; readonly proposals: readonly CanvasSplitProposal[] }
  | { readonly status: 'fallback'; readonly reason: string };

export class CanvasGenerationFlow {
  private readonly service: CanvasGenerationService;

  constructor(private readonly ports: CanvasGenerationFlowPorts) {
    this.service = new CanvasGenerationService(this.buildVaultPort());
  }

  /** Command entry: pick → mode → (optional aux split) → create → register revert. */
  async generateFromNotes(): Promise<void> {
    const picked = await this.ports.pickNotes();
    if (!picked || picked.length === 0) {
      return; // Cancelled or empty picker — nothing happened, nothing to say.
    }
    const notes = this.expandToMarkdownFiles(picked);
    if (notes.length === 0) {
      this.ports.notify(t('canvas.generate.noMarkdownNotes'));
      return;
    }

    const choice = await openCanvasGenerationModeModal(
      this.ports.app,
      { splitAvailable: this.ports.resolveAuxTarget() !== null },
    );
    if (!choice) {
      return;
    }
    await this.generateFromResolvedNotes(notes, choice);
  }

  /**
   * Mode execution once the notes and the mode are known. Public for contract
   * tests (the R-C4 `applyAnnotationWrite` precedent): split mode that fails
   * announces its reason and falls back to file-reference mode explicitly.
   */
  async generateFromResolvedNotes(notes: readonly string[], choice: CanvasGenerationChoice): Promise<void> {
    if (choice.mode === 'split') {
      const split = await this.buildSplitProposals(notes);
      if (split.status === 'ok') {
        await this.create(choice.title, { proposals: split.proposals });
        return;
      }
      // Announced fallback (design §3.3 mode 2): the split result was unusable,
      // so the canvas is still generated with file-reference nodes.
      this.ports.notify(`${t('canvas.generate.splitFailed')} ${this.describeSplitReason(split.reason)}`);
    }
    await this.create(choice.title, { notes });
  }

  /** Stable reason keys → honest, localized explanations (never silent). */
  private describeSplitReason(reason: string): string {
    switch (reason) {
      case 'tooManyNotes': return t('canvas.generate.splitReason.tooManyNotes');
      case 'backendUnavailable': return t('canvas.generate.splitReason.backendUnavailable');
      case 'allNotesTooLong': return t('canvas.generate.splitReason.allNotesTooLong');
      case 'modelUnavailable': return t('canvas.generate.splitReason.modelUnavailable');
      case 'writeToolObserved': return t('canvas.generate.splitReason.writeToolObserved');
      case 'unparseable': return t('canvas.generate.splitReason.unparseable');
      default: return t('canvas.generate.splitReason.turnFailed');
    }
  }

  /**
   * The ONLY vault-writing path of the flow: build → validate → create. Any
   * failure surfaces a notice and leaves the vault unchanged (the service
   * reclaims a half-created file, acceptance 4).
   */
  private async create(
    title: string,
    input: { notes?: readonly string[]; proposals?: readonly CanvasSplitProposal[] },
  ): Promise<void> {
    const directory = this.currentDirectory();
    try {
      const result = await this.service.generate({ title, directory, ...input });
      const revertRegistered = await this.registerRevert(result.path);
      this.ports.notify(
        revertRegistered
          ? t('canvas.generate.created', { path: result.path, count: result.nodeCount })
          : `${t('canvas.generate.created', { path: result.path, count: result.nodeCount })} ${t('canvas.generate.noRevertWarning')}`,
      );
    } catch (error) {
      this.ports.notify(t('canvas.generate.failed', {
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  /**
   * R-B3 coverage for the created file (created-entry revert = Obsidian
   * trash). Generation has no paired follow-up write, so the plugin round is
   * closed immediately after registration (the R-B5 record-then-close
   * convention) and one-click revert is available right away.
   */
  private async registerRevert(canvasPath: string): Promise<boolean> {
    const conversationId = this.ports.getActiveConversationId();
    const revert = this.ports.getEditRevert();
    if (!conversationId || !revert?.registerPluginCreatedAsset) {
      return false;
    }
    try {
      await revert.registerPluginCreatedAsset(conversationId, canvasPath);
      await revert.endBatchCapture?.(conversationId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * AI topic split on the read-only aux contract. Any unusable result →
   * `{status: 'fallback'}` with a stable reason key; the model never writes.
   */
  private async buildSplitProposals(notePaths: readonly string[]): Promise<SplitOutcome> {
    if (notePaths.length > CANVAS_SPLIT_MAX_NOTES) {
      return { status: 'fallback', reason: 'tooManyNotes' };
    }
    const target = this.ports.resolveAuxTarget();
    const capability = target?.adapter.getAuxQuery() ?? null;
    if (!target || !capability) {
      return { status: 'fallback', reason: 'backendUnavailable' };
    }

    const inputs: CanvasSplitNoteInput[] = [];
    for (const path of notePaths) {
      const content = await this.readNoteText(path);
      if (content === null) {
        continue;
      }
      inputs.push({ path, content });
    }
    const oversize = oversizeSplitNotes(inputs);
    if (oversize.length > 0) {
      this.ports.notify(t('canvas.generate.notesTooLong', { paths: oversize.join(', ') }));
    }
    const oversizeSet = new Set(oversize);
    const usable = inputs.filter((input) => !oversizeSet.has(input.path));
    if (usable.length === 0) {
      return { status: 'fallback', reason: 'allNotesTooLong' };
    }

    const resolved = target.adapter.resolveModel();
    if (!resolved.ok) {
      return { status: 'fallback', reason: 'modelUnavailable' };
    }
    const effort = target.adapter.getEffort();
    try {
      const session = await capability.startAuxQuerySession({
        systemPrompt: buildCanvasSplitSystemPrompt(getLocale()),
        workingDirectory: target.workingDirectory,
        ...(resolved.model ? { model: resolved.model } : {}),
        ...(effort ? { effort } : {}),
      });
      try {
        const result = await session.query({ prompt: buildCanvasSplitPrompt(usable) });
        if (!result.success) {
          return { status: 'fallback', reason: 'turnFailed' };
        }
        // Blocking audit, same contract as every aux consumer (§6.1).
        if (findWriteToolCalls(result.toolCalls).length > 0) {
          return { status: 'fallback', reason: 'writeToolObserved' };
        }
        const parsed = parseCanvasSplitProposal(
          result.text,
          new Set(usable.map((input) => input.path)),
        );
        if (!parsed.ok) {
          return { status: 'fallback', reason: 'unparseable' };
        }
        if (parsed.proposals.length === 0) {
          return { status: 'fallback', reason: 'unparseable' };
        }
        return { status: 'ok', proposals: parsed.proposals };
      } finally {
        await session.dispose();
      }
    } catch {
      // Session start rejected (backend cannot prove read-only execution, …).
      return { status: 'fallback', reason: 'turnFailed' };
    }
  }

  // -------------------------------------------------------------------------
  // Vault plumbing
  // -------------------------------------------------------------------------

  /** Folder entries expand to their markdown files (design §3.3 source 1). */
  private expandToMarkdownFiles(picked: readonly CanvasPickedEntry[]): string[] {
    const files: string[] = [];
    const seen = new Set<string>();
    for (const entry of picked) {
      if (entry.kind === 'file') {
        if (entry.path.toLowerCase().endsWith('.md') && !seen.has(entry.path)) {
          seen.add(entry.path);
          files.push(entry.path);
        }
        continue;
      }
      const prefix = `${entry.path}/`;
      for (const file of this.ports.app.vault.getMarkdownFiles()) {
        if (file.path.startsWith(prefix) && !seen.has(file.path)) {
          seen.add(file.path);
          files.push(file.path);
        }
      }
    }
    return files;
  }

  private async readNoteText(path: string): Promise<string | null> {
    const file = this.ports.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) {
      return null;
    }
    try {
      return await this.ports.app.vault.cachedRead(file);
    } catch {
      return null;
    }
  }

  private currentDirectory(): string {
    return this.ports.app.workspace.getActiveFile()?.parent?.path ?? '';
  }

  /** CanvasVaultPort over the real Obsidian vault (design §3.3 steps 3–4). */
  private buildVaultPort(): CanvasVaultPort {
    const vault = this.ports.app.vault;
    return {
      pathExists: (path) => vault.getAbstractFileByPath(normalizePath(path)) !== null,
      create: (path, data) => vault.create(normalizePath(path), data),
      trash: async (path) => {
        const file = vault.getAbstractFileByPath(normalizePath(path));
        if (file instanceof TFile) {
          await vault.trash(file, true);
        }
      },
    };
  }
}

/** Mode + title choice (E1: file-reference default, AI split the explicit option). */
export interface CanvasGenerationChoice {
  readonly mode: 'files' | 'split';
  readonly title: string;
}

class CanvasGenerationModeModal extends Modal {
  private settled = false;
  private title = '';
  private resolveChoice: ((choice: CanvasGenerationChoice | null) => void) | null = null;

  constructor(
    app: App,
    private readonly options: { splitAvailable: boolean },
  ) {
    super(app);
  }

  onOpen(): void {
    // Shared plugin-modal contrast contract scope (plugin-modal-contrast.css).
    this.modalEl.addClass('opencodian-canvas-modal');
    this.setTitle(t('canvas.generate.mode.title'));
    new Setting(this.contentEl)
      .setName(t('canvas.generate.mode.titleName'))
      .addText((text) => {
        text
          .setPlaceholder(t('canvas.generate.mode.titlePlaceholder'))
          .setValue(this.title)
          .onChange((value) => {
            this.title = value;
          });
      });

    new Setting(this.contentEl)
      .addButton((button) => {
        button
          .setButtonText(t('canvas.generate.mode.files'))
          .setCta()
          .onClick(() => this.settle({ mode: 'files', title: this.title || 'Untitled' }));
      })
      .addButton((button) => {
        button
          .setButtonText(t('canvas.generate.mode.split'))
          .setDisabled(!this.options.splitAvailable)
          .setTooltip(this.options.splitAvailable
            ? t('canvas.generate.mode.split')
            : t('canvas.generate.mode.splitUnavailable'))
          .onClick(() => this.settle({ mode: 'split', title: this.title || 'Untitled' }));
      });
  }

  onClose(): void {
    this.contentEl.empty();
    this.settle(null);
  }

  private settle(choice: CanvasGenerationChoice | null): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.close();
    this.resolveChoice?.(choice);
    this.resolveChoice = null;
  }

  /** Open the modal and resolve the choice, or `null` when cancelled. */
  openAsync(): Promise<CanvasGenerationChoice | null> {
    return new Promise((resolve) => {
      this.resolveChoice = resolve;
      this.open();
    });
  }
}

/** Open the mode modal; resolves the choice, or `null` when cancelled. */
export function openCanvasGenerationModeModal(
  app: App,
  options: { splitAvailable: boolean },
): Promise<CanvasGenerationChoice | null> {
  return new CanvasGenerationModeModal(app, options).openAsync();
}

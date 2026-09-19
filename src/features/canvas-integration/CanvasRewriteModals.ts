/**
 * CanvasRewriteModals — the explicit, visible dialogs of canvas node AI
 * editing (R-C5, flowtext-c5-design §3.4): instruction input, the
 * preview-and-confirm gate before ANY write-back, and the ladder-C node
 * picker used when the selection set cannot be read.
 *
 * All dialogs use Obsidian-native components and theme styling; the only
 * plugin CSS surface is the shared modal contrast contract (the
 * `opencodian-canvas-modal` root class scopes plugin-modal-contrast.css,
 * which lifts the CTA label and the warning note above the measured
 * contrast floor). Fail states are shown, never silently swallowed (§6.7).
 */

import type { App } from 'obsidian';
import { Component, MarkdownRenderer, Modal, Setting } from 'obsidian';

import { t } from '../../i18n';

/** Instruction input for one node rewrite (the entry's "what should change?"). */
export class CanvasRewriteInstructionModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly options: {
      /** One-line description of the rewrite target (node kind / note path). */
      targetLabel: string;
      onResolve(instruction: string): void;
      onCancel(): void;
    },
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('opencodian-canvas-modal');
    this.setTitle(t('canvas.rewrite.instruction.title'));
    let instruction = '';
    new Setting(this.contentEl)
      .setName(t('canvas.rewrite.instruction.target'))
      .setDesc(this.options.targetLabel);
    new Setting(this.contentEl)
      .setName(t('canvas.rewrite.instruction.name'))
      .addTextArea((textarea) => {
        textarea
          .setPlaceholder(t('canvas.rewrite.instruction.placeholder'))
          .onChange((value) => {
            instruction = value;
          });
        textarea.inputEl.addEventListener('keydown', (event) => {
          // Enter submits; Shift+Enter is a newline; IME composition never submits.
          if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            this.resolve(instruction);
          }
        });
        setTimeout(() => textarea.inputEl.focus(), 0);
      });

    new Setting(this.contentEl)
      .addButton((button) => {
        button
          .setButtonText(t('canvas.rewrite.instruction.submit'))
          .setCta()
          .onClick(() => this.resolve(instruction));
      })
      .addButton((button) => {
        button
          .setButtonText(t('canvas.rewrite.instruction.cancel'))
          .onClick(() => this.resolve(''));
      });
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve('');
  }

  private resolve(instruction: string): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.close();
    const trimmed = instruction.trim();
    if (trimmed) {
      this.options.onResolve(trimmed);
    } else {
      this.options.onCancel();
    }
  }
}

const MERMAID_FENCE = /^```mermaid\s*\n([\s\S]*?)\n?```$/u;

/** True when the rewritten content is exactly one mermaid code block. */
export function isSingleMermaidBlock(text: string): boolean {
  return MERMAID_FENCE.test(text.trim());
}

export interface CanvasRewritePreviewModalOptions {
  /** The node content the rewrite session started from. */
  originalText: string;
  /** The parsed rewrite result (the node's proposed new content). */
  nextText: string;
  /** Where the content will go ("text node …" / "note <path>"). */
  targetLabel: string;
  /**
   * Honest revert note shown before confirming: shown only when the R-B3
   * coverage surface is not composed (both node kinds refuse the write in
   * that case). Absent = coverage exists, and both undo channels work
   * (host Ctrl+Z via the canvas history pipeline + the sidebar revert).
   */
  revertNote?: string;
  /**
   * Ladder D: the canvas runtime refused write-back — the confirm button
   * copies the result instead, and the dialog says so explicitly.
   */
  copyOnly?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

/**
 * Preview + confirm gate (§3.4 step 2 / §6.3): the write happens only after
 * this dialog resolves `true`. Mermaid-targeted rewrites additionally get a
 * live rendered preview; when rendering fails the raw block stays visible.
 */
export class CanvasRewritePreviewModal extends Modal {
  private resolved = false;
  private readonly renderComponent = new Component();

  constructor(
    app: App,
    private readonly options: CanvasRewritePreviewModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('opencodian-canvas-modal');
    this.setTitle(t('canvas.rewrite.preview.title'));

    const original = this.contentEl.createDiv();
    new Setting(original).setName(t('canvas.rewrite.preview.original'));
    const originalPre = original.createEl('pre');
    originalPre.textContent = this.options.originalText;

    const next = this.contentEl.createDiv();
    new Setting(next).setName(t('canvas.rewrite.preview.next'));
    if (isSingleMermaidBlock(this.options.nextText)) {
      this.renderMermaid(next);
    }
    const nextPre = next.createEl('pre');
    nextPre.textContent = this.options.nextText;

    new Setting(this.contentEl)
      .setName(t('canvas.rewrite.preview.target'))
      .setDesc(this.options.targetLabel);

    if (this.options.copyOnly) {
      const copyOnly = this.contentEl.createEl('p');
      copyOnly.setText(t('canvas.rewrite.preview.copyOnly'));
      copyOnly.style.color = 'var(--text-warning)';
    }
    if (this.options.revertNote) {
      const warning = this.contentEl.createEl('p');
      warning.setText(this.options.revertNote);
      // Shared plugin-modal warning ink (plugin-modal-contrast.css):
      // raw --text-error measured 4.20:1 as modal body copy — below floor.
      warning.addClass('opencodian-modal-warning-note');
    }

    new Setting(this.contentEl)
      .addButton((button) => {
        button
          .setButtonText(this.options.copyOnly
            ? t('canvas.rewrite.preview.copy')
            : t('canvas.rewrite.preview.confirm'))
          .setCta()
          .onClick(() => this.resolve(true));
      })
      .addButton((button) => {
        button
          .setButtonText(t('canvas.rewrite.preview.cancel'))
          .onClick(() => this.resolve(false));
      });
  }

  onClose(): void {
    this.renderComponent.unload();
    this.contentEl.empty();
    this.resolve(false);
  }

  private resolve(confirmed: boolean): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.close();
    if (confirmed) {
      this.options.onConfirm();
    } else {
      this.options.onCancel();
    }
  }

  /** Best-effort live mermaid preview; failure keeps the raw block below. */
  private renderMermaid(host: HTMLElement): void {
    const holder = host.createDiv();
    const match = this.options.nextText.trim().match(MERMAID_FENCE);
    if (!match) {
      return;
    }
    MarkdownRenderer.render(
      this.app,
      `\`\`\`mermaid\n${match[1]}\n\`\`\``,
      holder,
      '',
      this.renderComponent,
    ).catch(() => {
      holder.remove();
    });
  }
}

export interface CanvasNodePickRow {
  readonly id: string;
  readonly type: string;
  /** Short preview of the node content (text) or the file path (file nodes). */
  readonly preview: string;
  readonly selectable: boolean;
}

/**
 * Ladder C: pick the target node from `canvas.getData()` when the selection
 * set cannot be read (design §3.4 — deliberately independent of
 * `canvas.selection`, see §7-U4).
 */
export class CanvasNodePickModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly rows: readonly CanvasNodePickRow[],
    private readonly onResolve: (nodeId: string | null) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('opencodian-canvas-modal');
    this.setTitle(t('canvas.rewrite.pick.title'));
    if (this.rows.length === 0) {
      this.contentEl.createDiv({ text: t('canvas.rewrite.pick.empty') });
    }
    for (const row of this.rows) {
      const setting = new Setting(this.contentEl)
        .setName(row.preview)
        .setDesc(row.type === 'file' ? t('canvas.rewrite.pick.fileNode') : row.type);
      if (row.selectable) {
        setting.addButton((button) => {
          button
            .setIcon(row.type === 'file' ? 'file-text' : 'sticky-note')
            .setTooltip(t('canvas.rewrite.pick.select'))
            .onClick(() => this.resolve(row.id));
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(null);
  }

  private resolve(nodeId: string | null): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.close();
    this.onResolve(nodeId);
  }
}

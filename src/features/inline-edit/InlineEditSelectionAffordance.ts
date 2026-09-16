/**
 * InlineEditSelectionAffordance — a small floating button that appears next to
 * the active text selection in every markdown editor and opens inline edit on
 * click (docs/requirements/inline-edit.md §7.1 "selection affordance").
 *
 * A CodeMirror `ViewPlugin` (registered once via `registerEditorExtension`)
 * watches selection changes in each editor. While a non-empty selection
 * exists and the feature gate passes, a single button element is positioned
 * at the selection end using `coordsAtPos` (the same coordinate space
 * obsidian-copilot's Quick Ask overlay uses). Positioning runs in a scheduled
 * frame — `coordsAtPos` must not run inside the editor's update cycle — and
 * the button repositions on scroll, hides when the selection collapses or an
 * inline edit is already open, and swallows mousedown so clicking it never
 * disturbs the selection.
 */

import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import type { MarkdownView } from 'obsidian';
import { setIcon } from 'obsidian';

import { t } from '../../i18n';
import { getEditorView } from './InlineEditController';

export interface InlineEditAffordanceDeps {
  /** Feature + backend gate; false hides the button everywhere. */
  readonly canShow: () => boolean;
  /** True while an inline edit is open in any editor. */
  readonly isEditing: () => boolean;
  /** Resolve the Obsidian editor for an EditorView and open inline edit. */
  readonly openForView: (editorView: EditorView) => void;
}

/** Button size + gap used for positioning math; keep in sync with the CSS. */
const BUTTON_SIZE = 22;
const BUTTON_GAP = 4;

class SelectionAffordancePlugin {
  private button: HTMLElement | null = null;
  private frame = 0;

  constructor(
    private readonly view: EditorView,
    private readonly deps: InlineEditAffordanceDeps,
  ) {
    this.view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
    this.scheduleSync();
  }

  private readonly onScroll = (): void => {
    this.scheduleSync();
  };

  update(): void {
    this.scheduleSync();
  }

  destroy(): void {
    this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
    if (this.frame) cancelAnimationFrame(this.frame);
    this.button?.remove();
    this.button = null;
  }

  /** Measurement must happen outside the editor's update cycle. */
  private scheduleSync(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.sync();
    });
  }

  private sync(): void {
    const selection = this.view.state.selection.main;
    const shouldShow = !selection.empty
      && this.deps.canShow()
      && !this.deps.isEditing()
      && !this.view.state.readOnly;
    if (!shouldShow) {
      this.hide();
      return;
    }

    // `coordsAtPos` only resolves for viewport positions; null means the
    // selection end is scrolled out of view, so hide instead of guessing.
    const coords = this.view.coordsAtPos(selection.to);
    if (!coords) {
      this.hide();
      return;
    }

    const button = this.ensureButton();
    // `coordsAtPos` is viewport-relative; the absolutely-positioned button is
    // placed relative to `view.dom`, so convert before clamping.
    const domRect = this.view.dom.getBoundingClientRect();
    const maxLeft = Math.max(0, this.view.dom.clientWidth - BUTTON_SIZE);
    const left = Math.min(Math.max(coords.left - domRect.left, 0), maxLeft);
    const top = Math.max(0, coords.bottom - domRect.top + BUTTON_GAP);
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
  }

  private hide(): void {
    this.button?.remove();
    this.button = null;
  }

  private ensureButton(): HTMLElement {
    if (this.button?.isConnected) return this.button;
    this.hide();
    const button = this.view.dom.createEl('button', {
      cls: 'opencodian-inline-edit-affordance',
      attr: {
        type: 'button',
        'aria-label': t('inlineEdit.command.name'),
        title: t('inlineEdit.command.name'),
      },
    });
    setIcon(button, 'pencil');
    button.addEventListener('mousedown', (event) => {
      // Never let the click collapse the selection it acts on.
      event.preventDefault();
    });
    button.addEventListener('click', () => {
      this.hide();
      this.deps.openForView(this.view);
    });
    this.view.dom.appendChild(button);
    this.button = button;
    return button;
  }
}

/** The CM6 extension; register once with `registerEditorExtension`. */
export function inlineEditSelectionAffordanceExtension(deps: InlineEditAffordanceDeps): Extension {
  return ViewPlugin.define((view) => new SelectionAffordancePlugin(view, deps));
}

/**
 * Resolve the `MarkdownView` that owns an `EditorView`, or null when the view
 * no longer belongs to an open markdown leaf.
 */
export function findMarkdownViewForView(app: unknown, editorView: EditorView): MarkdownView | null {
  const workspace = (app as { workspace?: {
    getLeavesOfType?: (type: string) => { view?: MarkdownView }[];
  } }).workspace;
  if (!workspace?.getLeavesOfType) return null;
  return workspace
    .getLeavesOfType('markdown')
    .find((entry) => entry.view?.editor && getEditorView(entry.view.editor) === editorView)
    ?.view ?? null;
}

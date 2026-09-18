/**
 * InlineEditModeSwitch — the 选区/光标/整篇 segmented control of the
 * floating bar (docs/requirements/flowtext-parity.md R-A6).
 *
 * Extracted from `InlineEditInputOverlay` so the bar stays a skeleton: the
 * overlay owns the row's placement (top of the panel) and delegates row
 * construction and syncing here. The control is mutually exclusive with the
 * other forms by construction — clicking a segment calls `onModeChange`,
 * which the controller only honours while the edit is still in the input
 * phase (`modeSwitchable`).
 */

import type { EditorState } from '@codemirror/state';

import { t } from '../../i18n';
import type { InlineEditMode } from './InlineEditTypes';

/** Mode choices offered by the row, in display order. */
const MODE_ROW_ORDER: readonly InlineEditMode[] = ['selection', 'cursor-inline', 'document'];

export interface InlineEditModeRowState {
  readonly mode: InlineEditMode;
  /** Modes the row may offer for this edit (e.g. no 选区 on an empty selection). */
  readonly modeOptions: readonly InlineEditMode[];
  /** False disables the row (busy, or the session already started). */
  readonly modeSwitchable: boolean;
}

export interface InlineEditModeRowCallbacks {
  onModeChange(mode: InlineEditMode): void;
}

export interface InlineEditModeRow {
  readonly element: HTMLElement;
  sync(state: InlineEditModeRowState): void;
}

/** Build the segmented control into `root` (hidden until synced). */
export function buildInlineEditModeRow(
  root: HTMLElement,
  callbacks: InlineEditModeRowCallbacks,
): InlineEditModeRow {
  const row = root.createDiv({ cls: 'opencodian-inline-edit-moderow' });
  row.style.display = 'none';
  for (const mode of MODE_ROW_ORDER) {
    const button = row.createEl('button', {
      cls: 'opencodian-inline-edit-mode-btn',
      attr: {
        type: 'button',
        'data-inline-edit-mode': mode,
        'aria-label': modeLabel(mode),
        title: modeLabel(mode),
      },
    });
    button.createSpan({ cls: 'opencodian-inline-edit-mode-label', text: modeLabel(mode) });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      callbacks.onModeChange(mode);
    });
  }

  return {
    element: row,
    sync: (state) => {
      row.style.display = state.modeOptions.length > 1 ? '' : 'none';
      const shown = new Set(state.modeOptions);
      for (const button of row.querySelectorAll<HTMLButtonElement>('.opencodian-inline-edit-mode-btn')) {
        const mode = button.dataset.inlineEditMode as InlineEditMode | undefined;
        if (!mode) continue;
        const visible = shown.has(mode);
        // 光标 covers both cursor forms: the anchor derives the concrete form.
        const active = mode === 'cursor-inline'
          ? state.mode === 'cursor-inline' || state.mode === 'cursor-inbetween'
          : state.mode === mode;
        button.style.display = visible ? '' : 'none';
        button.classList.toggle('is-active', active);
        button.disabled = !state.modeSwitchable;
      }
    },
  };
}

function modeLabel(mode: InlineEditMode): string {
  switch (mode) {
    case 'selection':
      return t('inlineEdit.mode.selection');
    case 'document':
      return t('inlineEdit.mode.document');
    default:
      return t('inlineEdit.mode.cursor');
  }
}

/** Placeholder copy for the instruction field, per request form. */
export function placeholderForMode(mode: InlineEditMode): string {
  if (mode === 'document') return t('inlineEdit.placeholder.document');
  return mode === 'selection'
    ? t('inlineEdit.placeholder.edit')
    : t('inlineEdit.placeholder.insert');
}

/** Mode choices the bar offers for one edit (选区 needs a live range). */
export function inlineEditModeOptions(
  state: Pick<EditorState, 'selection'>,
  documentEnabled: boolean,
): readonly InlineEditMode[] {
  const options: InlineEditMode[] = [];
  if (!state.selection.main.empty) options.push('selection');
  options.push(state.selection.main.empty ? 'cursor-inbetween' : 'cursor-inline');
  if (documentEnabled) options.push('document');
  return options;
}

/**
 * InlineEditEditorView — the Obsidian `Editor` → CodeMirror 6 `EditorView`
 * resolution, shared by the controller and the selection affordance.
 *
 * `editor.cm` is an undocumented but stable Obsidian internal (used by
 * Claudian and obsidian-copilot alike). When it is missing the feature must
 * stop rather than guess — docs/requirements/inline-edit.md §7.4.
 */

import type { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';

/** Read Obsidian's CodeMirror 6 view off an `Editor`; null when absent. */
export function getEditorView(editor: Editor): EditorView | null {
  const candidate = (editor as unknown as { cm?: unknown }).cm;
  return isEditorView(candidate) ? candidate : null;
}

function isEditorView(value: unknown): value is EditorView {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { state?: unknown; dispatch?: unknown; dom?: unknown };
  return typeof record.dispatch === 'function'
    && typeof record.state === 'object'
    && record.state !== null
    && typeof record.dom === 'object';
}

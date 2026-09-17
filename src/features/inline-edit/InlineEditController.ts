/**
 * InlineEditController — the CM6 state machine behind the inline-edit command.
 *
 * Flow (docs/requirements/inline-edit.md §7.3):
 *
 *   idle → input → generating → preview → applied / rejected → idle
 *            ↳ clarification (reply shown above the input, same session)
 *            ↳ error (reason shown above the input, retry allowed)
 *
 * Invariants this file is responsible for:
 * - only one inline edit exists at a time; opening a new one rejects the old one;
 * - the accepted text reaches the note through exactly one
 *   `editor.replaceRange` call, so Obsidian's undo stack sees a single edit;
 * - the accepted text is only written when the anchored text still equals the
 *   snapshot taken when the request was built (§7.5);
 * - every exit path disposes the auxiliary session.
 */

import type { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';
import { Notice } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import { hideSelectionHighlight, showSelectionHighlight } from '../../utils/editorSelectionHighlight';
import type {
  InlineEditChoice,
  InlineEditContextFile,
  InlineEditHost,
  InlineEditHostAdapter,
} from './InlineEditHost';
import {
  choicesToMenuItems,
  InlineEditInputOverlay,
  type InlineEditOverlayChipState,
} from './InlineEditInputOverlay';
import {
  describeInlineEditFailure,
  INLINE_EDIT_MAX_ATTACHED_NOTES,
  type InlineEditRequest,
  normalizeInsertionText,
} from './InlineEditPrompt';
import { canApplyEdit, InlineEditService } from './InlineEditService';
import type { InlineEditAnchor, InlineEditMode, InlineEditOutcome } from './InlineEditTypes';

/**
 * The editor context an inline edit needs.
 *
 * Deliberately narrower than `MarkdownView`: Obsidian's `editor-menu` event
 * hands over `MarkdownView | MarkdownFileInfo`, and only the note path is used.
 */
export interface InlineEditEditorContext {
  readonly file?: { readonly path: string } | null;
}
import {
  applyInlineEditEffect,
  clearInlineEdit,
  ensureInlineEditField,
  readInlineEditRange,
  showInlineEditPreview,
} from './InlineEditWidgets';

/** Observable phase of the active edit, exposed for tests. */
type InlineEditPhase = 'input' | 'generating' | 'preview';

interface ActiveEdit {
  readonly editor: Editor;
  readonly editorView: EditorView;
  readonly anchor: InlineEditAnchor;
  readonly adapter: InlineEditHostAdapter;
  service: InlineEditService;
  phase: InlineEditPhase;
  instruction: string;
  reply: string;
  error: string;
  preview: { readonly mode: 'replacement' | 'insertion'; readonly text: string } | null;
  overlay: InlineEditInputOverlay | null;
  /** Model choices for the picker; `null` until the async catalog resolves. */
  modelChoices: readonly InlineEditChoice[] | null;
  /**
   * Notes the user attached as extra context, in pick order. Kept on the edit
   * (not the overlay) so a clarification round keeps them.
   */
  contextFiles: readonly InlineEditContextFile[];
  onDocumentKeydown: (event: KeyboardEvent) => void;
}

export interface InlineEditControllerOptions {
  readonly host: InlineEditHost;
  /** Surfaces user-visible messages; injectable so tests do not need Obsidian. */
  readonly notify?: (message: string) => void;
  /** Overrides service construction for tests. */
  readonly createService?: (config: ConstructorParameters<typeof InlineEditService>[0]) => InlineEditService;
}

export class InlineEditController {
  private active: ActiveEdit | null = null;
  private token = 0;

  constructor(private readonly options: InlineEditControllerOptions) {}

  /** The phase of the active edit, or `null` when idle. */
  get phase(): InlineEditPhase | null {
    return this.active?.phase ?? null;
  }

  /** Start an inline edit for the editor's current selection or cursor. */
  open(editor: Editor, view: InlineEditEditorContext): void {
    if (this.active) {
      this.reject();
    }
    const editorView = getEditorView(editor);
    if (!editorView) {
      this.notify(t('inlineEdit.error.editorUnavailable'));
      return;
    }
    const anchor = this.buildAnchor(editor, view, editorView);
    if (!anchor) return;

    const adapter = this.options.host.resolveAdapter();
    if (!adapter) {
      this.notify(t('inlineEdit.error.backendUnavailable'));
      return;
    }
    if (!adapter.getAuxQuery()) {
      this.notify(t('inlineEdit.error.capabilityUnavailable', { backend: adapter.displayName }));
      return;
    }

    const config = {
      adapter,
      workingDirectory: this.options.host.getWorkingDirectory(),
      locale: this.options.host.getLocale(),
    };
    const service = this.options.createService?.(config) ?? new InlineEditService(config);

    this.token += 1;
    const edit: ActiveEdit = {
      editor,
      editorView,
      anchor,
      adapter,
      service,
      phase: 'input',
      instruction: '',
      reply: '',
      error: '',
      preview: null,
      overlay: null,
      modelChoices: null,
      contextFiles: [],
      onDocumentKeydown: () => { /* replaced below */ },
    };
    this.active = edit;

    ensureInlineEditField(editorView);
    showSelectionHighlight(editorView, anchor.from, anchor.to);
    this.renderInput();
    this.bindDocumentKeys(edit);
    void this.loadModelChoices(edit);
  }

  /** Tear down any active edit and its native session. */
  async close(): Promise<void> {
    const edit = this.active;
    this.active = null;
    if (!edit) return;
    this.unbindDocumentKeys(edit);
    edit.overlay?.hide();
    edit.overlay = null;
    applyInlineEditEffect(edit.editorView, clearInlineEdit.of(null));
    hideSelectionHighlight(edit.editorView);
    await edit.service.dispose();
  }

  /**
   * Open the editor view for `editor`.
   *
   * `editor.cm` is an undocumented but stable Obsidian internal (used by
   * Claudian and obsidian-copilot alike). When it is missing the feature must
   * stop rather than guess — docs/requirements/inline-edit.md §7.4.
   */
  private buildAnchor(editor: Editor, view: InlineEditEditorContext, editorView: EditorView): InlineEditAnchor | null {
    const state = editorView.state;
    const selection = state.selection.main;
    const from = selection.from;
    const to = selection.to;
    const notePath = view.file?.path ?? '';
    if (!notePath) {
      this.notify(t('inlineEdit.error.noNote'));
      return null;
    }

    // Snapshot via the document, never `editor.getSelection()`: the latter
    // normalises line endings and would break the dirty check (§7.4).
    let snapshot: string;
    try {
      snapshot = state.doc.sliceString(from, to);
    } catch {
      this.notify(t('inlineEdit.error.editorUnavailable'));
      return null;
    }

    const startLine = state.doc.lineAt(from).number;
    const endLine = state.doc.lineAt(to).number;
    const mode: InlineEditMode = from !== to
      ? 'selection'
      : state.doc.lineAt(from).text.trim().length > 0
        ? 'cursor-inline'
        : 'cursor-inbetween';

    let before = '';
    let after = '';
    if (mode !== 'selection') {
      const line = state.doc.lineAt(from);
      before = state.doc.sliceString(line.from, from);
      after = state.doc.sliceString(from, line.to);
    }

    return { mode, notePath, from, to, snapshot, startLine, endLine, before, after };
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private renderInput(): void {
    const edit = this.active;
    if (!edit) return;
    if (!edit.overlay) {
      edit.overlay = new InlineEditInputOverlay(edit.editorView, {
        onSubmit: (instruction) => { void this.submit(instruction); },
        onReject: () => { this.reject(); },
        onPickModel: (id) => { void this.pickModel(id); },
        onPickEffort: (id) => { void this.pickEffort(id); },
        createProviderIcon: (providerId, size) => this.options.host.createProviderIcon?.(providerId, size) ?? null,
        onRequestContextFiles: () => { this.openContextPicker(); },
        onToggleContext: (path) => { this.toggleContextFile(path); },
      });
      edit.overlay.show(edit.anchor.from);
      edit.overlay.focusInput();
    }
    edit.overlay.update({
      reply: edit.reply,
      error: edit.error,
      busy: edit.phase === 'generating',
      value: edit.instruction,
      placeholder: edit.anchor.mode === 'selection'
        ? t('inlineEdit.placeholder.edit')
        : t('inlineEdit.placeholder.insert'),
      model: this.modelChipState(edit),
      effort: this.effortChipState(edit),
      context: edit.contextFiles.map((file) => ({ path: file.path, label: file.name })),
      contextSupported: this.options.host.listContextFiles != null,
    });
  }

  /** Fetch the backend's model list for the picker (best effort). */
  private async loadModelChoices(edit: ActiveEdit): Promise<void> {
    const lister = edit.adapter.listModels;
    if (!lister) return;
    try {
      const choices = await lister.call(edit.adapter);
      if (this.active !== edit) return;
      edit.modelChoices = choices ?? [];
    } catch {
      if (this.active === edit) edit.modelChoices = [];
    }
    if (this.active === edit) this.renderInput();
  }

  private modelChipState(edit: ActiveEdit): InlineEditOverlayChipState {
    const selection = edit.adapter.describeModelSelection();
    const activeId = selection.source === 'default' ? null : selection.label;
    const kind = edit.adapter.kind;
    return {
      label: activeId ?? '',
      iconProvider: activeId ? inferInlineEditModelProvider(activeId, kind) : null,
      loading: edit.adapter.listModels != null && edit.modelChoices === null,
      disabled: edit.service.hasSession,
      items: choicesToMenuItems(edit.modelChoices ?? [], activeId).map((item) => ({
        ...item,
        iconProvider: item.id === null ? null : inferInlineEditModelProvider(item.id, kind),
      })),
    };
  }

  private effortChipState(edit: ActiveEdit): InlineEditOverlayChipState | null {
    const efforts = edit.adapter.listEfforts?.() ?? null;
    if (!efforts) return null;
    const current = edit.adapter.getEffort();
    return {
      label: current ?? '',
      disabled: edit.service.hasSession,
      items: choicesToMenuItems(efforts, current),
    };
  }

  /**
   * Open the attached-notes picker. Candidates come from the host on demand, so
   * a vault is enumerated only when the user actually asks for it.
   */
  private openContextPicker(): void {
    const edit = this.active;
    if (!edit || edit.service.hasSession) return;
    const files = this.options.host.listContextFiles?.() ?? null;
    if (!files) return;
    edit.overlay?.showContextPicker(files);
  }

  /** Attach or detach one note; the cap mirrors INLINE_EDIT_MAX_ATTACHED_NOTES. */
  private toggleContextFile(path: string): void {
    const edit = this.active;
    if (!edit || edit.service.hasSession) return;
    const attached = edit.contextFiles.some((file) => file.path === path);
    if (attached) {
      edit.contextFiles = edit.contextFiles.filter((file) => file.path !== path);
    } else {
      const file = this.options.host.listContextFiles?.()?.find((entry) => entry.path === path);
      if (!file) return;
      if (edit.contextFiles.length >= INLINE_EDIT_MAX_ATTACHED_NOTES) {
        this.notify(t('inlineEdit.context.limit', { count: INLINE_EDIT_MAX_ATTACHED_NOTES }));
        return;
      }
      edit.contextFiles = [...edit.contextFiles, file];
    }
    this.renderInput();
    edit.overlay?.refreshContextPicker();
  }

  private async pickModel(id: string | null): Promise<void> {
    const edit = this.active;
    if (!edit || edit.service.hasSession) return;
    try {
      await edit.adapter.setModelOverride?.(id);
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error));
    }
    if (this.active === edit) this.renderInput();
  }

  private async pickEffort(id: string | null): Promise<void> {
    const edit = this.active;
    if (!edit || edit.service.hasSession) return;
    try {
      await edit.adapter.setEffortOverride?.(id);
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error));
    }
    if (this.active === edit) this.renderInput();
  }

  private renderPreview(): void {
    const edit = this.active;
    const preview = edit?.preview;
    if (!edit || !preview) return;
    // The preview replaces the anchored selection range. `readInlineEditRange`
    // would read the *input* decoration here — a collapsed widget position,
    // which is an invalid range for a replace decoration. The anchor range is
    // the selection snapshot; if the note changed during generation these
    // offsets are stale and the accept-time dirty check refuses the write
    // (fail safe). Offsets are clamped to the current document so a shrunken
    // note cannot produce an out-of-bounds decoration range.
    const docLength = edit.editorView.state.doc.length;
    const from = Math.min(edit.anchor.from, docLength);
    const to = Math.min(Math.max(edit.anchor.to, from), docLength);
    this.token += 1;
    applyInlineEditEffect(edit.editorView, showInlineEditPreview.of({
      token: `${this.token}:preview`,
      from,
      to,
      before: edit.anchor.snapshot,
      after: preview.text,
      insertion: preview.mode === 'insertion',
      busy: false,
      callbacks: {
        onSubmit: () => { /* no input in the preview phase */ },
        onAccept: () => { this.accept(); },
        onReject: () => { this.reject(); },
      },
      acceptLabel: t('inlineEdit.action.accept'),
      rejectLabel: t('inlineEdit.action.reject'),
    }));
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------

  private async submit(instruction: string): Promise<void> {
    const edit = this.active;
    if (!edit) return;
    const trimmed = instruction.trim();
    if (!trimmed) return;
    edit.instruction = '';
    edit.error = '';
    edit.reply = '';

    const isFirstTurn = !edit.service.hasSession;
    edit.phase = 'generating';
    this.renderInput();

    const outcome = isFirstTurn
      ? await edit.service.submit(buildRequest(edit.anchor, trimmed, edit.contextFiles))
      : await edit.service.clarify(trimmed);

    if (this.active !== edit) return;
    this.applyOutcome(edit, outcome);
  }

  private applyOutcome(edit: ActiveEdit, outcome: InlineEditOutcome): void {
    switch (outcome.status) {
      case 'preview':
        edit.preview = { mode: outcome.mode, text: outcome.text };
        edit.phase = 'preview';
        // The in-flow preview replaces the floating bar; the preview's own
        // accept/reject (Enter/Esc via the document handler) takes over.
        edit.overlay?.hide();
        edit.overlay = null;
        this.renderPreview();
        return;
      case 'clarification':
        edit.reply = outcome.text;
        edit.phase = 'input';
        this.renderInput();
        return;
      default:
        edit.error = describeOutcome(outcome.reason, outcome.detail);
        edit.phase = 'input';
        this.renderInput();
    }
  }

  /** Apply the previewed text after the dirty check (§7.5). */
  private accept(): void {
    const edit = this.active;
    const preview = edit?.preview;
    if (!edit || !preview) return;

    const range = readInlineEditRange(edit.editorView.state);
    if (!range) {
      this.notify(t('inlineEdit.error.editorUnavailable'));
      return;
    }
    const current = edit.editorView.state.doc.sliceString(range.from, range.to);
    if (!canApplyEdit(edit.anchor.snapshot, current)) {
      // The note changed under us; refuse rather than write at stale offsets.
      this.notify(t('inlineEdit.error.staleSelection'));
      this.reject();
      return;
    }

    const text = preview.mode === 'insertion'
      ? normalizeInsertionText(preview.text)
      : preview.text;

    void this.close().then(() => {
      const start = edit.editor.offsetToPos(range.from);
      const end = edit.editor.offsetToPos(range.to);
      // Single transaction: Ctrl+Z undoes the whole inline edit in one step.
      edit.editor.replaceRange(text, start, end);
    });
  }

  private reject(): void {
    const edit = this.active;
    if (!edit) return;
    this.notify(t('inlineEdit.notice.rejected'));
    void this.close();
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  /**
   * Enter accepts and Escape rejects while a preview is showing.
   *
   * Bound on the editor's own document because the preview widget holds no
   * focusable field. Every branch checks `isComposing` so an IME candidate
   * window cannot trigger accept or reject.
   */
  private bindDocumentKeys(edit: ActiveEdit): void {
    const handler = (event: KeyboardEvent): void => {
      if (this.active !== edit) return;
      if (event.isComposing) return;
      if (edit.phase !== 'preview') return;
      if (event.key === 'Enter') {
        event.preventDefault();
        this.accept();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.reject();
      }
    };
    edit.onDocumentKeydown = handler;
    edit.editorView.dom.ownerDocument.addEventListener('keydown', handler, true);  }

  private unbindDocumentKeys(edit: ActiveEdit): void {
    edit.editorView.dom.ownerDocument.removeEventListener('keydown', edit.onDocumentKeydown, true);
  }

  private notify(message: string): void {
    if (this.options.notify) {
      this.options.notify(message);
      return;
    }
    new Notice(message);
  }
}

/** Build the request payload for an anchor. */
function buildRequest(
  anchor: InlineEditAnchor,
  instruction: string,
  contextFiles: readonly InlineEditContextFile[] = [],
): InlineEditRequest {
  // Paths only: §6.1 keeps vault text out of the prompt, the read-only tools
  // do the reading. An empty list leaves the field out entirely.
  const attachedNotes = contextFiles.length > 0 ? contextFiles.map((file) => file.path) : undefined;
  if (anchor.mode === 'selection') {
    return {
      kind: 'selection',
      instruction,
      notePath: anchor.notePath,
      startLine: anchor.startLine,
      endLine: anchor.endLine,
      selectionText: anchor.snapshot,
      attachedNotes,
    };
  }
  return {
    kind: anchor.mode,
    instruction,
    notePath: anchor.notePath,
    line: anchor.startLine,
    before: anchor.before,
    after: anchor.after,
    attachedNotes,
  };
}

/** Build the user-facing reason for a failed outcome. */
function describeOutcome(reason: string, detail?: string): string {
  switch (reason) {
    case 'turn-failed':
    case 'session-unavailable':
      return detail
        ? `${t('inlineEdit.error.sessionUnavailable')} ${detail}`
        : t('inlineEdit.error.sessionUnavailable');
    case 'write-tool-observed':
      return detail
        ? `${t('inlineEdit.error.writeToolObserved')} (${detail})`
        : t('inlineEdit.error.writeToolObserved');
    case 'model-unavailable':
      return detail
        ? `${t('inlineEdit.error.modelUnavailable')} ${detail}`
        : t('inlineEdit.error.modelUnavailable');
    case 'capability-unavailable':
      return t('inlineEdit.error.capabilityUnavailable', { backend: detail ?? '' });
    case 'cancelled':
      return t('inlineEdit.notice.cancelled');
    case 'no-session':
      return t('inlineEdit.error.sessionUnavailable');
    default:
      return t(describeInlineEditFailure(reason));
  }
}

/**
 * Read Obsidian's CodeMirror 6 view off an `Editor`.
 *
 * Returns `null` when the internal field is absent, which disables the feature
 * for that editor instead of falling back to guessing.
 */
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

/**
 * Provider id used to resolve the model chip / menu row icon. OpenCode and pi
 * refs carry `provider/model`; bare claude-code and codex ids map to the
 * provider their models come from. Anything else renders a generic glyph.
 */
function inferInlineEditModelProvider(ref: string, kind: AgentBackendKind): string | null {
  const slash = ref.indexOf('/');
  if (slash > 0) return ref.slice(0, slash);
  if (kind === 'claude-code') return 'anthropic';
  if (kind === 'codex') return 'openai';
  return null;
}

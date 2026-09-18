/**
 * InlineEditController — the CM6 state machine behind the inline-edit command.
 *
 * Flow (docs/requirements/inline-edit.md §7.3):
 *
 *   idle → input → generating → preview → applied / rejected → idle
 *            ↳ clarification (reply shown above the input, same session)
 *            ↳ error (reason shown above the input, retry allowed)
 *
 * Parallel edits (docs/requirements/flowtext-parity.md R-A5): edits are bucketed
 * by `EditorView`, each keyed by a stable `editId`. Opening a new edit never
 * kills an existing one (the old single-edit `open() → reject()` behaviour is
 * gone); the per-editor concurrency cap (`inlineEditMaxConcurrentEdits`)
 * refuses extras with a notice instead. Enter/Esc dispatch by focus
 * ownership: the overlay registers its edit as the current one on focus, and
 * each edit's document key handler only acts when its own id is current.
 *
 * Invariants this file is responsible for:
 * - the accepted text reaches the note through exactly one
 *   `editor.replaceRange` call, so Obsidian's undo stack sees a single edit
 *   (whole-document edits included — §R-A6 single-step undo);
 * - the accepted text is only written when the anchored text still equals the
 *   snapshot taken when the request was built (§7.5), and every edit compares
 *   only its own range, so accepting edit A cannot corrupt edit B's check;
 * - whole-document accepts pass a second confirmation before writing (R-A6);
 * - every exit path disposes exactly that edit's auxiliary session, and
 *   `close()` without an id disposes everything (editor unload, plugin exit).
 */

import type { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';
import { Notice } from 'obsidian';

import type { AuxQueryImageAttachment } from '../../core/agents/backend/AgentAuxQueryCapability';
import { t } from '../../i18n';
import { hideSelectionHighlight, showSelectionHighlight } from '../../utils/editorSelectionHighlight';
import { executeInlineEditAccept } from './InlineEditAccept';
import { buildInlineEditAnchor, rebuildAnchorForMode } from './InlineEditAnchor';
import {
  attachContextEntryToEdit,
  attachImageToEdit,
  contextPickerCandidates,
  type InlineEditAttachmentEdit,
  type InlineEditAttachmentHost,
  inlineEditImageChipModel,
  removeImageFromEdit,
  toggleContextEntry,
} from './InlineEditAttachments';
import { getEditorView } from './InlineEditEditorView';
import type {
  InlineEditChoice,
  InlineEditContextFile,
  InlineEditHost,
  InlineEditHostAdapter,
} from './InlineEditHost';
import {
  InlineEditInputOverlay,
} from './InlineEditInputOverlay';
import {
  InlineEditKeyboardDispatcher,
} from './InlineEditKeyboard';
import { inlineEditModeOptions, placeholderForMode } from './InlineEditModeSwitch';
import {
  inlineEditEffortChipState,
  inlineEditModelChipState,
  type InlineEditPickDeps,
  type InlineEditPickEditHost,
  loadInlineEditModelChoices,
  runInlineEditEffortPick,
  runInlineEditModelPick,
} from './InlineEditOverlayChips';
import {
  buildInlineEditRequestForAnchor,
  INLINE_EDIT_MAX_DOCUMENT_CHARS,
} from './InlineEditPrompt';
import { describeInlineEditOutcome, InlineEditService } from './InlineEditService';
import {
  createInlineEditStreamSession,
  inlineEditFrameScheduler,
  type InlineEditStreamSession,
} from './InlineEditStreamPreview';
import type { InlineEditAnchor, InlineEditMode, InlineEditOutcome } from './InlineEditTypes';
import {
  applyInlineEditEffect,
  ensureInlineEditField,
  removeInlineEditPreview,
  upsertInlineEditPreview,
} from './InlineEditWidgets';

/**
 * The editor context an inline edit needs.
 *
 * Deliberately narrower than `MarkdownView`: Obsidian's `editor-menu` event
 * hands over `MarkdownView | MarkdownFileInfo`, and only the note path is used.
 */
export interface InlineEditEditorContext {
  readonly file?: { readonly path: string } | null;
}

/** Observable phase of one edit, exposed for tests. */
type InlineEditPhase = 'input' | 'generating' | 'preview';

interface ActiveEdit {
  readonly editId: string;
  readonly editor: Editor;
  readonly editorView: EditorView;
  anchor: InlineEditAnchor;
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
   * Entries the user attached as extra context, in pick order. Kept on the
   * edit (not the overlay) so a clarification round keeps them. Every entry —
   * file or directory — counts as one against the cap (R-A7).
   */
  contextFiles: readonly InlineEditContextFile[];
  /**
   * Image attached to this edit (R-A4, at most one). Sent with the first
   * turn; clarification follow-ups reuse the session that already saw it.
   */
  image: AuxQueryImageAttachment | null;
  /** Per-turn streaming session; non-null only while generating. */
  stream: InlineEditStreamSession | null;
  /**
   * Stable decoration token for the preview of this edit: streaming updates
   * reuse it so the widget's `eq()` can compare accumulated text instead of
   * rebuilding on every frame for other reasons.
   */
  previewToken: number | null;
  /** True while a streaming preview decoration is live in the editor. */
  previewShown: boolean;
}

export interface InlineEditOpenOptions {
  /** Force the whole-document form (the `inline-edit-document` command). */
  readonly mode?: 'document';
}

export interface InlineEditControllerOptions {
  readonly host: InlineEditHost;
  /** Surfaces user-visible messages; injectable so tests do not need Obsidian. */
  readonly notify?: (message: string) => void;
  /** Second confirmation for whole-document accepts (R-A6). */
  readonly confirmDocumentReplace?: (info: { notePath: string; charCount: number }) => Promise<boolean>;
  /** Overrides service construction for tests. */
  readonly createService?: (config: ConstructorParameters<typeof InlineEditService>[0]) => InlineEditService;
}

/** Fallback cap when the host does not expose the setting (R-A5 default). */
export const DEFAULT_INLINE_EDIT_MAX_CONCURRENT_EDITS = 3;

export class InlineEditController {
  /** Active edits bucketed by editor view, keyed by edit id (R-A5). */
  private readonly editsByView = new Map<EditorView, Map<string, ActiveEdit>>();
  /** The edit keyboard dispatch treats as current; owned via focus events. */
  private focusedEditId: string | null = null;
  private token = 0;
  private readonly keyboard = new InlineEditKeyboardDispatcher({
    getFocusedEdit: () => {
      const edit = this.focusedEdit();
      return edit
        ? { editId: edit.editId, phase: edit.phase, ownerDocument: edit.editorView.dom.ownerDocument }
        : null;
    },
    accept: (editId) => this.accept(editId),
    reject: (editId) => { this.reject(editId); },
  });

  constructor(private readonly options: InlineEditControllerOptions) {}

  /** The phase of the focused edit, or `null` when none is focused. */
  get phase(): InlineEditPhase | null {
    return this.focusedEdit()?.phase ?? null;
  }

  /** True while any edit exists in any editor. */
  hasActiveEdits(): boolean {
    return [...this.editsByView.values()].some((bucket) => bucket.size > 0);
  }

  /** Active edits in one editor view (tests, per-editor caps). */
  activeEditCountForView(editorView: EditorView): number {
    return this.editsByView.get(editorView)?.size ?? 0;
  }

  /** Register `editId` as the current edit (panel focus, preview render). */
  focusEdit(editId: string): void {
    if (this.findEdit(editId)) this.focusedEditId = editId;
  }


  /**
   * Start an inline edit for the editor's current selection or cursor.
   *
   * Existing edits are left alone; when the per-editor concurrency cap is
   * reached the user is told to settle the open edits first and nothing is
   * destroyed. Returns whether a new edit actually opened.
   */
  open(editor: Editor, view: InlineEditEditorContext, options: InlineEditOpenOptions = {}): boolean {
    const editorView = getEditorView(editor);
    if (!editorView) {
      this.notify(t('inlineEdit.error.editorUnavailable'));
      return false;
    }
    const bucket = this.editsByView.get(editorView) ?? new Map<string, ActiveEdit>();
    const maxEdits = this.maxConcurrentEdits();
    if (bucket.size >= maxEdits) {
      // Fail visibly, never silently replace an existing edit (R-A5 需求 2).
      this.notify(t('inlineEdit.error.tooManyEdits', { count: maxEdits }));
      return false;
    }

    const notePath = view.file?.path ?? '';
    if (options.mode === 'document' && !this.documentModeEnabled()) {
      this.notify(t('inlineEdit.error.documentModeDisabled'));
      return false;
    }
    if (options.mode === 'document'
      && editorView.state.doc.length > INLINE_EDIT_MAX_DOCUMENT_CHARS) {
      // Fail-closed before any session exists (R-A6 验收 2).
      this.notify(t('inlineEdit.error.documentTooLong'));
      return false;
    }
    const anchor = buildInlineEditAnchor(editorView.state, {
      notePath,
      ...(options.mode === 'document' ? { forcedMode: 'document' as const } : {}),
    });
    if (!anchor) {
      this.notify(notePath ? t('inlineEdit.error.editorUnavailable') : t('inlineEdit.error.noNote'));
      return false;
    }

    const adapter = this.options.host.resolveAdapter();
    if (!adapter) {
      this.notify(t('inlineEdit.error.backendUnavailable'));
      return false;
    }
    if (!adapter.getAuxQuery()) {
      this.notify(t('inlineEdit.error.capabilityUnavailable', { backend: adapter.displayName }));
      return false;
    }

    const config = {
      adapter,
      workingDirectory: this.options.host.getWorkingDirectory(),
      locale: this.options.host.getLocale(),
    };
    const service = this.options.createService?.(config) ?? new InlineEditService(config);

    this.token += 1;
    const edit: ActiveEdit = {
      editId: `edit-${this.token}`,
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
      image: null,
      stream: null,
      previewToken: null,
      previewShown: false,
    };
    if (!this.editsByView.has(editorView)) this.editsByView.set(editorView, bucket);
    bucket.set(edit.editId, edit);
    this.focusedEditId = edit.editId;

    ensureInlineEditField(editorView);
    showSelectionHighlight(editorView, anchor.from, anchor.to, edit.editId);
    this.renderInput(edit);
    this.keyboard.bind(editorView.dom.ownerDocument);
    void this.loadModelChoices(edit);
    return true;
  }

  /**
   * Dispose every edit whose editor view has left the DOM (note tab closed,
   * file switched in the pane, leaf moved) along with its native session.
   * Called from workspace lifecycle events; returns how many edits were
   * disposed (R-A5 验收 5: no surviving decorations or native sessions).
   */
  async pruneDetachedEdits(): Promise<number> {
    const detached = [...this.editsByView.values()].flatMap((bucket) => [...bucket.values()])
      .filter((edit) => !edit.editorView.dom.isConnected);
    await Promise.all(detached.map((edit) => this.disposeEdit(edit)));
    return detached.length;
  }

  /**
   * Tear down one edit (given `editId`) or every edit (no argument — editor
   * unload, vault switch, plugin exit) along with its native session.
   */
  async close(editId?: string): Promise<void> {
    if (editId !== undefined) {
      const edit = this.findEdit(editId);
      if (edit) await this.disposeEdit(edit);
      return;
    }
    const all = [...this.editsByView.values()].flatMap((bucket) => [...bucket.values()]);
    await Promise.all(all.map((edit) => this.disposeEdit(edit)));
  }

  /** Re-anchor one edit after a mode switch in the floating bar (R-A6). */
  setEditMode(editId: string, mode: InlineEditMode): void {
    const edit = this.findEdit(editId);
    if (!edit || edit.phase !== 'input' || edit.service.hasSession) return;
    const next = rebuildAnchorForMode(edit.editorView.state, edit.anchor.notePath, mode);
    if (!next) {
      if (mode === 'selection') this.notify(t('inlineEdit.error.noSelectionForMode'));
      return;
    }
    edit.anchor = next;
    edit.error = '';
    showSelectionHighlight(edit.editorView, next.from, next.to, edit.editId);
    this.renderInput(edit);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private renderInput(edit: ActiveEdit): void {
    if (this.findEdit(edit.editId) !== edit) return;
    if (!edit.overlay) {
      edit.overlay = new InlineEditInputOverlay(edit.editorView, {
        editId: edit.editId,
        onSubmit: (instruction) => { void this.submit(edit, instruction); },
        onReject: () => { this.reject(edit.editId); },
        onPickModel: (id) => { void this.pickModel(edit, id); },
        onPickEffort: (id) => { void this.pickEffort(edit, id); },
        createProviderIcon: (providerId, size) => this.options.host.createProviderIcon?.(providerId, size) ?? null,
        onRequestContextFiles: () => { this.openContextPicker(edit); },
        onToggleContext: (path) => { this.toggleContextFile(edit, path); },
        onAttachImage: (files) => { void this.attachImage(edit, files); },
        onRemoveImage: () => { this.removeImage(edit); },
        onModeChange: (mode) => { this.setEditMode(edit.editId, mode); },
        onFocus: () => { this.focusEdit(edit.editId); },
      });
      edit.overlay.show(edit.anchor.from);
      edit.overlay.focusInput();
    }
    edit.overlay.update({
      reply: edit.reply,
      error: edit.error,
      busy: edit.phase === 'generating',
      value: edit.instruction,
      placeholder: placeholderForMode(edit.anchor.mode),
      model: inlineEditModelChipState(this.pickEdit(edit)),
      effort: inlineEditEffortChipState(this.pickEdit(edit)),
      context: edit.contextFiles.map((file) => ({
        path: file.path,
        label: file.name,
        kind: file.kind ?? 'file',
      })),
      contextSupported: this.options.host.listContextFiles != null,
      presets: this.options.host.listPresetPrompts?.() ?? [],
      image: edit.image ? inlineEditImageChipModel(edit.image) : null,
      imageSupported: edit.adapter.supportsImages !== false,
      mode: edit.anchor.mode,
      modeOptions: inlineEditModeOptions(edit.editorView.state, this.documentModeEnabled()),
      modeSwitchable: edit.phase === 'input' && !edit.service.hasSession,
    });
  }

  /** Fetch the backend's model list for the picker (best effort). */
  private async loadModelChoices(edit: ActiveEdit): Promise<void> {
    await loadInlineEditModelChoices(this.pickEdit(edit), {
      rerender: () => { if (this.findEdit(edit.editId) === edit) this.renderInput(edit); },
    });
  }

  /**
   * Open the attached-entries picker. Candidates come from the host on demand,
   * so a vault is enumerated only when the user actually asks for it.
   */
  private openContextPicker(edit: ActiveEdit): void {
    if (this.findEdit(edit.editId) !== edit) return;
    const files = contextPickerCandidates(this.attachmentEdit(edit), this.attachmentHost());
    if (files) edit.overlay?.showContextPicker(files);
  }

  /** Attach or detach one entry (cap and notice semantics: InlineEditAttachments). */
  private toggleContextFile(edit: ActiveEdit, path: string): void {
    if (this.findEdit(edit.editId) !== edit) return;
    toggleContextEntry(this.attachmentEdit(edit), this.attachmentHost(), path);
  }

  /**
   * Attach one entry resolved from a vault drop (R-A7). The host has already
   * validated the path via `app.vault.getAbstractFileByPath()`; an entry that
   * no longer resolves never reaches here, and a full list is a notice, not a
   * truncation.
   */
  attachContextEntry(editId: string, entry: InlineEditContextFile): void {
    const edit = this.findEdit(editId);
    if (!edit) return;
    attachContextEntryToEdit(this.attachmentEdit(edit), this.attachmentHost(), entry);
  }

  /** Attach one image from a paste or drop (R-A4, fail-closed). */
  private async attachImage(edit: ActiveEdit, files: readonly File[]): Promise<void> {
    if (this.findEdit(edit.editId) !== edit) return;
    await attachImageToEdit(this.attachmentEdit(edit), this.attachmentHost(), files);
    if (this.findEdit(edit.editId) === edit) edit.error = '';
  }

  private removeImage(edit: ActiveEdit): void {
    if (this.findEdit(edit.editId) !== edit) return;
    removeImageFromEdit(this.attachmentEdit(edit));
  }

  /** Adapter view of one edit for the attachment helpers. */
  private attachmentEdit(edit: ActiveEdit): InlineEditAttachmentEdit {
    return {
      get contextFiles() { return edit.contextFiles; },
      set contextFiles(value: readonly InlineEditContextFile[]) { edit.contextFiles = value; },
      get image() { return edit.image; },
      set image(value: AuxQueryImageAttachment | null) { edit.image = value; },
      hasSession: edit.service.hasSession,
      rerender: () => { this.renderInput(edit); },
      refreshPicker: () => { edit.overlay?.refreshContextPicker(); },
    };
  }

  private attachmentHost(): InlineEditAttachmentHost {
    return { host: this.options.host, notify: (message) => { this.notify(message); } };
  }

  private async pickModel(edit: ActiveEdit, id: string | null): Promise<void> {
    if (this.findEdit(edit.editId) !== edit) return;
    await runInlineEditModelPick(this.pickEdit(edit), this.pickDeps(edit), id);
  }

  private async pickEffort(edit: ActiveEdit, id: string | null): Promise<void> {
    if (this.findEdit(edit.editId) !== edit) return;
    await runInlineEditEffortPick(this.pickEdit(edit), this.pickDeps(edit), id);
  }

  private pickEdit(edit: ActiveEdit): InlineEditPickEditHost {
    return {
      get adapter() { return edit.adapter; },
      get modelChoices() { return edit.modelChoices; },
      set modelChoices(value: readonly InlineEditChoice[] | null) { edit.modelChoices = value; },
      get sessionStarted() { return edit.service.hasSession; },
    };
  }

  private pickDeps(edit: ActiveEdit): InlineEditPickDeps {
    return {
      notify: (message) => { this.notify(message); },
      rerender: () => { if (this.findEdit(edit.editId) === edit) this.renderInput(edit); },
    };
  }

  /**
   * Dispatch the preview decoration for `edit`.
   *
   * Streaming updates reuse `edit.previewToken` so the widget's `eq()`
   * compares the accumulated text and skips the rebuild when a frame carries
   * no visible change; the final (strictly parsed) payload only differs in
   * `busy` and text, so the decoration updates in place. The payload is keyed
   * by `editId`, so parallel previews replace only their own decoration.
   */
  private renderPreview(edit: ActiveEdit, busy: boolean): void {
    const preview = edit.preview;
    if (!preview) return;
    // The preview replaces the anchored selection range. The anchor range is
    // the selection snapshot; if the note changed during generation these
    // offsets are stale and the accept-time dirty check refuses the write
    // (fail safe). Offsets are clamped to the current document so a shrunken
    // note cannot produce an out-of-bounds decoration range.
    const docLength = edit.editorView.state.doc.length;
    const from = Math.min(edit.anchor.from, docLength);
    const to = Math.min(Math.max(edit.anchor.to, from), docLength);
    if (edit.previewToken === null) {
      this.token += 1;
      edit.previewToken = this.token;
    }
    edit.previewShown = true;
    // A fresh preview makes this the edit the keyboard talks to.
    this.focusedEditId = edit.editId;
    applyInlineEditEffect(edit.editorView, upsertInlineEditPreview.of({
      editId: edit.editId,
      token: `${edit.previewToken}:preview`,
      from,
      to,
      before: edit.anchor.snapshot,
      after: preview.text,
      insertion: preview.mode === 'insertion',
      busy,
      callbacks: {
        onSubmit: () => { /* no input in the preview phase */ },
        onAccept: () => { void this.accept(edit.editId); },
        onReject: () => { this.reject(edit.editId); },
      },
      acceptLabel: t('inlineEdit.action.accept'),
      rejectLabel: t('inlineEdit.action.reject'),
    }));
  }

  /** Clear a live streaming preview from the editor (error paths). */
  private clearStreamingPreview(edit: ActiveEdit): void {
    if (!edit.previewShown) return;
    edit.previewShown = false;
    edit.previewToken = null;
    applyInlineEditEffect(edit.editorView, removeInlineEditPreview.of(edit.editId));
  }

  /**
   * Per-frame preview update while a tag body streams in (R-A3). The payload
   * carries `busy: true`, so the widget shows the generating marker and keeps
   * accept/reject disabled until the strict parse settles the turn.
   */
  private renderStreamingPreview(edit: ActiveEdit, mode: 'replacement' | 'insertion', text: string): void {
    if (this.findEdit(edit.editId) !== edit || edit.phase !== 'generating') return;
    edit.preview = { mode, text };
    edit.reply = '';
    this.renderPreview(edit, true);
  }

  /**
   * Per-frame reply update for pre-tag plain text: a clarification-shaped
   * reply streams into the area above the input instead of the preview
   * channel. The moment a tag opens, `renderStreamingPreview` takes over and
   * clears this text.
   */
  private renderStreamingReply(edit: ActiveEdit, text: string): void {
    if (this.findEdit(edit.editId) !== edit || edit.phase !== 'generating') return;
    if (edit.reply === text) return;
    edit.reply = text;
    this.renderInput(edit);
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------

  private async submit(edit: ActiveEdit, instruction: string): Promise<void> {
    if (this.findEdit(edit.editId) !== edit) return;
    const trimmed = instruction.trim();
    if (!trimmed) return;
    edit.instruction = '';
    edit.error = '';
    edit.reply = '';

    if (edit.image && edit.adapter.supportsImages === false) {
      // Explicit capability gap: never downgrade an image request to a
      // text-only one behind the user's back (R-A4).
      edit.error = t('inlineEdit.error.imagesUnsupported');
      this.renderInput(edit);
      return;
    }

    const isFirstTurn = !edit.service.hasSession;
    edit.phase = 'generating';
    this.renderInput(edit);

    // R-A3: one streaming session per turn. Chunks re-parse the accumulated
    // text; a per-frame batch dispatches at most one decoration update per
    // animation frame, whatever chunk pacing the backend uses.
    const stream = createInlineEditStreamSession({
      onReply: (text) => { this.renderStreamingReply(edit, text); },
      onPreview: (mode, text) => { this.renderStreamingPreview(edit, mode, text); },
    }, inlineEditFrameScheduler(edit.editorView.dom.ownerDocument.defaultView ?? window));
    edit.stream = stream;

    const outcome = isFirstTurn
      ? await edit.service.submit(
        buildInlineEditRequestForAnchor(edit.anchor, trimmed, edit.contextFiles),
        {
          ...(edit.image ? { images: [edit.image] } : {}),
          onTextChunk: (accumulated) => { stream.handleChunk(accumulated); },
        },
      )
      : await edit.service.clarify(trimmed, {
          onTextChunk: (accumulated) => { stream.handleChunk(accumulated); },
        });

    stream.flush();
    stream.dispose();
    if (edit.stream === stream) edit.stream = null;
    if (this.findEdit(edit.editId) !== edit) return;
    this.applyOutcome(edit, outcome);
  }

  private applyOutcome(edit: ActiveEdit, outcome: InlineEditOutcome): void {
    switch (outcome.status) {
      case 'preview':
        // Strict parse is the only authority: the final payload always uses
        // the strictly-parsed text, so a divergent streaming frame can never
        // be applied (R-A3 需求 3/4).
        edit.preview = { mode: outcome.mode, text: outcome.text };
        edit.phase = 'preview';
        // The in-flow preview replaces the floating bar; the preview's own
        // accept/reject (Enter/Esc via the document handler) takes over.
        edit.overlay?.hide();
        edit.overlay = null;
        this.renderPreview(edit, false);
        return;
      case 'clarification':
        edit.preview = null;
        this.clearStreamingPreview(edit);
        edit.reply = outcome.text;
        edit.phase = 'input';
        this.renderInput(edit);
        return;
      default:
        // A streaming preview may be live in the editor when the strict parse
        // rejects the turn (multiple tags, unclosed tag): clear it and report
        // — never leave a partial apply path behind.
        edit.preview = null;
        this.clearStreamingPreview(edit);
        edit.error = describeInlineEditOutcome(outcome.reason, outcome.detail);
        edit.phase = 'input';
        this.renderInput(edit);
    }
  }

  /** Apply the previewed text after the dirty check (§7.5). */
  private async accept(editId: string): Promise<void> {
    const edit = this.findEdit(editId);
    if (!edit) return;
    await executeInlineEditAccept(edit, {
      notify: (message) => { this.notify(message); },
      confirmDocumentReplace: this.options.confirmDocumentReplace,
      isCurrent: (candidate) => this.findEdit(candidate.editId)?.preview != null
        && this.findEdit(candidate.editId) === edit,
      closeEdit: (id) => this.close(id),
      rejectEdit: (id) => { this.reject(id); },
    });
  }

  private reject(editId?: string): void {
    const edit = editId !== undefined ? this.findEdit(editId) : this.focusedEdit();
    if (!edit) return;
    this.notify(t('inlineEdit.notice.rejected'));
    void this.close(edit.editId);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle internals
  // ---------------------------------------------------------------------------

  private async disposeEdit(edit: ActiveEdit): Promise<void> {
    const bucket = this.editsByView.get(edit.editorView);
    bucket?.delete(edit.editId);
    if (bucket && bucket.size === 0) this.editsByView.delete(edit.editorView);
    this.keyboard.unbind(edit.editorView.dom.ownerDocument);
    // Cancel any pending streaming frame first: the decoration clear below
    // must be the last word on the editor state (Esc mid-stream leaves no
    // residual preview).
    edit.stream?.dispose();
    edit.stream = null;
    edit.overlay?.hide();
    edit.overlay = null;
    applyInlineEditEffect(edit.editorView, removeInlineEditPreview.of(edit.editId));
    hideSelectionHighlight(edit.editorView, edit.editId);
    if (this.focusedEditId === edit.editId) {
      const remaining = bucket ? [...bucket.values()] : [];
      this.focusedEditId = remaining.length > 0 ? remaining[remaining.length - 1]!.editId : null;
    }
    await edit.service.dispose();
  }

  private findEdit(editId: string): ActiveEdit | null {
    for (const bucket of this.editsByView.values()) {
      const edit = bucket.get(editId);
      if (edit) return edit;
    }
    return null;
  }


  private focusedEdit(): ActiveEdit | null {
    return this.focusedEditId !== null ? this.findEdit(this.focusedEditId) : null;
  }

  private maxConcurrentEdits(): number {
    const configured = this.options.host.getMaxConcurrentEdits?.();
    return typeof configured === 'number' && Number.isFinite(configured)
      ? Math.max(1, Math.floor(configured))
      : DEFAULT_INLINE_EDIT_MAX_CONCURRENT_EDITS;
  }

  private documentModeEnabled(): boolean {
    return this.options.host.isDocumentModeEnabled?.() ?? true;
  }

  private notify(message: string): void {
    if (this.options.notify) {
      this.options.notify(message);
      return;
    }
    new Notice(message);
  }
}
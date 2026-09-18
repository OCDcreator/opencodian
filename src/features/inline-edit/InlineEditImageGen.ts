/**
 * InlineEditImageGen — the inline-edit entry of text-to-image generation
 * (R-C2, design §3.4) and the shared failure-semantics core for both entry
 * points.
 *
 * The two-step write contract lives here so neither entry can drift from it:
 *
 *   generate (fail-closed: no document, no disk change)
 *     → W-asset: ImageAssetStorage.save (fail → NO document change)
 *     → register with the R-B3 revert system (fail-soft; honesty over silence)
 *     → build the `![[...]]` embed text for the caller's insertion form
 *
 * The reference write (W-ref) stays with each entry's own insertion flow —
 * the inline edit goes through the existing preview → single
 * `editor.replaceRange` accept path, so dirty check and single-step undo are
 * inherited unchanged. W-ref failure semantics ("asset kept, actual path
 * reported") are enforced in `InlineEditAccept` / the chat controller.
 *
 * Deps are injected: everything vault- or credential-flavored is provided by
 * the composition root, so this module never imports `core.storage` and the
 * unit tests run without Obsidian.
 */

import { buildImageEmbedText, type ImageEmbedForm, type ImageGenerationFailureKind, type ImageGenerationMimeType, type ImageGenerationResult } from '../../core/agents/imagegen/ImageGenerationService';
import type { ImageGenerationModelConfig } from '../../core/types';
import { t } from '../../i18n';

export type { ImageEmbedForm } from '../../core/agents/imagegen/ImageGenerationService';

/** Everything the inline edit needs from the runtime (implemented in main.ts). */
export interface InlineEditImageGenDeps {
  /** Configured models, normalized; the first entry is the default. */
  readonly models: readonly ImageGenerationModelConfig[];
  /** Default embed width from `imageGenerationMaxWidth`. */
  readonly maxWidth: number;
  /** Orphan policy from `imageGenerationAssetCleanup`. */
  readonly cleanup: 'trash' | 'keep';
  generate(
    model: ImageGenerationModelConfig,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult>;
  saveAsset(
    bytes: ArrayBuffer,
    mimeType: ImageGenerationMimeType,
    baseName: string,
  ): Promise<{ path: string }>;
  /** Best-effort orphan trash; resolves false when nothing was trashed. */
  trashAsset(path: string): Promise<boolean>;
  /** R-B3 registration (fail-soft inside the service); fire and forget. */
  registerAsset(assetPath: string, notePath: string): void;
  /**
   * R-B3 record-then-close for the accepted reference write (D2): record the
   * note modification explicitly — no vault-event autosave timing dependency
   * — before `endAssetCapture` closes the round. Optional so doubles stay
   * valid.
   */
  noteReferenceWrite?(notePath: string): void;
  /**
   * R-B3 (D2): close the plugin asset round once the paired write attempt is
   * terminal (accepted, failed, or the asset was released without an
   * insert), so revert is available without waiting out the post-turn grace.
   * Optional so doubles stay valid.
   */
  endAssetCapture?(): void;
  notify(message: string): void;
}

/** What a completed generation hands to the preview/insert flow. */
export type ImageGenInsertPlan =
  | { ok: true; path: string; embedText: string }
  | { ok: false; error: string };

/**
 * Run generate → W-asset → register → embed text. Every failure resolves
 * with `{ ok: false }` and leaves the document AND the disk untouched,
 * except the two explicit post-save cases noted inline.
 */
export async function runInlineEditImageGeneration(
  deps: InlineEditImageGenDeps,
  options: {
    prompt: string;
    form: ImageEmbedForm;
    notePath: string;
    signal?: AbortSignal;
  },
): Promise<ImageGenInsertPlan> {
  const model = deps.models[0];
  if (!model) {
    return { ok: false, error: t('inlineEdit.imageGen.error.noModels') };
  }

  // 1. Generation. Any failure here is terminal and side-effect free.
  const result = await deps.generate(model, options.prompt, options.signal);
  if (!result.ok) {
    return {
      ok: false,
      error: t('inlineEdit.imageGen.error.failed', { kind: result.kind, message: result.error }),
    };
  }

  // 2. W-asset. A failed save must never produce a document change, so the
  // error propagates as a plain failure (W-ref is never attempted).
  let path: string;
  try {
    const saved = await deps.saveAsset(result.bytes, result.mimeType, options.prompt);
    path = saved.path;
  } catch (error) {
    return {
      ok: false,
      error: t('inlineEdit.imageGen.error.saveFailed', {
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }

  // Cancellation that raced the save: the asset would otherwise become an
  // unnoticed orphan, so it is trashed immediately (best effort).
  if (options.signal?.aborted) {
    await deps.trashAsset(path);
    return { ok: false, error: t('inlineEdit.imageGen.error.failedAborted') };
  }

  // 3. R-B3 registration (fail-soft by contract — never blocks the flow).
  deps.registerAsset(path, options.notePath);

  // 4. Embed text for the entry's own insertion flow (W-ref happens there).
  return { ok: true, path, embedText: buildImageEmbedText(path, deps.maxWidth, options.form) };
}

/**
 * Preview-rejected (or orphaned) asset handling per `imageGenerationAssetCleanup`
 * (design §4.6): `trash` is the default and removes the asset; `keep` retains
 * it. Either way the user is told exactly what happened — never silent.
 * The reference write will never happen, so the plugin asset round is closed
 * here as well (D2 failure branch): revert must not wait out the grace.
 */
export async function cleanupRejectedImageAsset(
  deps: InlineEditImageGenDeps,
  path: string,
): Promise<void> {
  deps.endAssetCapture?.();
  if (deps.cleanup === 'trash') {
    const trashed = await deps.trashAsset(path);
    deps.notify(trashed
      ? t('inlineEdit.imageGen.notice.rejectedTrash', { path })
      : t('inlineEdit.imageGen.notice.rejectedTrashFailed', { path }));
    return;
  }
  deps.notify(t('inlineEdit.imageGen.notice.rejectedKeep', { path }));
}

/** Localized label for a failure kind (acceptance 5: the kind is shown as-is). */
export function describeImageGenFailureKind(kind: ImageGenerationFailureKind): string {
  return t(`imageGen.errorKind.${kind}` as Parameters<typeof t>[0]);
}

// --- per-edit turn state (kept here so the controller stays in budget) -------

/** The image-generation chip form of one edit: off, own-line block, or inline. */
export type InlineEditImageGenForm = 'off' | ImageEmbedForm;

/**
 * Per-edit image-generation state and its teardown transitions. One instance
 * lives on each `ActiveEdit`; the controller only calls into it, so the
 * state machine (and its failure-semantics comments) stay in this owner.
 */
export class InlineEditImageGenTurnState {
  form: InlineEditImageGenForm = 'off';
  /** In-flight generation abort (Esc during generation cancels, R-C2). */
  abort: AbortController | null = null;
  /** Vault path of the asset backing the current preview, if W-asset succeeded. */
  pendingAssetPath: string | null = null;

  chipState(deps: InlineEditImageGenDeps | null): { available: boolean; form: InlineEditImageGenForm } {
    if (!deps || deps.models.length === 0) {
      return { available: false, form: 'off' };
    }
    return { available: true, form: this.form };
  }

  /** Cycle off → exclusive line → inline → off; returns true when it changed. */
  cycle(allowed: boolean): boolean {
    if (!allowed) return false;
    this.form = this.form === 'off'
      ? 'line'
      : this.form === 'line'
        ? 'inline'
        : 'off';
    return true;
  }

  /** Abort an in-flight generation (Esc, editor unload, plugin teardown). */
  cancel(): void {
    this.abort?.abort();
    this.abort = null;
  }

  /** Take ownership of the pending asset (clears it); `null` when none. */
  takePendingAsset(): string | null {
    const path = this.pendingAssetPath;
    this.pendingAssetPath = null;
    return path;
  }
}

/** Cycle the chip when the edit is still live and in the input phase (R-C2). */
export function cycleInlineEditImageGen(
  edit: { imageGen: InlineEditImageGenTurnState; phase: string },
  allowed: boolean,
  rerender: () => void,
): void {
  if (edit.imageGen.cycle(allowed)) rerender();
}

/**
 * Teardown/release path shared by preview-reject, editor unload and plugin
 * teardown: cancel any in-flight generation, take the pending asset and, per
 * `imageGenerationAssetCleanup` (design §4.6), trash or keep it — with a
 * Notice either way. Never silent.
 */
export function releaseInlineEditImageAsset(
  edit: { imageGen: InlineEditImageGenTurnState },
  deps: InlineEditImageGenDeps | null,
): void {
  edit.imageGen.cancel();
  const path = edit.imageGen.takePendingAsset();
  if (path && deps) void cleanupRejectedImageAsset(deps, path);
}

/** Structural slice of the controller's active edit the turn needs to drive. */
export interface InlineEditImageGenTurnEdit {
  readonly editId: string;
  phase: 'input' | 'generating' | 'preview';
  readonly imageGen: InlineEditImageGenTurnState;
  readonly anchor: { readonly notePath: string };
  error: string;
  preview: {
    readonly mode: 'replacement' | 'insertion';
    readonly text: string;
    readonly preserveWhitespace?: boolean;
  } | null;
  overlay: { hide(): void } | null;
}

/**
 * One image-generation submit turn (design §3.4 step 2-3): generate →
 * W-asset → revert registration → hand the embed preview back to the
 * controller's existing accept flow. Failure branches leave document AND
 * disk untouched except the abort-raced save, which is trashed immediately.
 */
export async function submitInlineEditImageGenerationTurn<E extends InlineEditImageGenTurnEdit>(
  deps: InlineEditImageGenDeps | null,
  host: {
    /** The controller's live-edit lookup (guards across awaits). */
    findEdit(editId: string): E | null;
    /** Re-render the input bar (failure paths return to the input phase). */
    renderInput(edit: E): void;
    /** Render the insertion preview (success path). */
    renderPreview(edit: E, busy: boolean): void;
  },
  edit: E,
  prompt: string,
): Promise<void> {
  if (!deps) {
    edit.error = t('inlineEdit.imageGen.error.noModels');
    edit.phase = 'input';
    host.renderInput(edit);
    return;
  }
  const isLive = (): boolean => host.findEdit(edit.editId) === edit;
  const form = edit.imageGen.form;
  if (form === 'off') return;
  const abort = new AbortController();
  edit.imageGen.abort = abort;
  edit.phase = 'generating';
  host.renderInput(edit);

  const plan = await runInlineEditImageGeneration(deps, {
    prompt,
    form,
    notePath: edit.anchor.notePath,
    signal: abort.signal,
  });
  edit.imageGen.abort = null;

  if (!isLive()) {
    // The edit was torn down mid-flight; never leak a saved asset.
    if (plan.ok) void cleanupRejectedImageAsset(deps, plan.path);
    return;
  }
  if (!plan.ok) {
    edit.error = plan.error;
    edit.phase = 'input';
    host.renderInput(edit);
    return;
  }
  // W-ref enters the existing preview → accept path. The blank-line padding
  // of the exclusive-line form is feature behaviour, so the accept-time
  // insertion trimming is bypassed for this preview.
  edit.imageGen.pendingAssetPath = plan.path;
  edit.preview = { mode: 'insertion', text: plan.embedText, preserveWhitespace: true };
  edit.phase = 'preview';
  edit.overlay?.hide();
  host.renderPreview(edit, false);
}

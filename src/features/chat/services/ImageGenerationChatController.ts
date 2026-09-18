/**
 * ImageGenerationChatController — the chat entry of text-to-image generation
 * (R-C2, design §3.5).
 *
 * Order-of-writes contract for chat (§3.5 step 3): generation happens first
 * and the result is presented on a card; the asset write (W-asset) and the
 * reference write (W-ref) happen ONLY on an explicit insert click, targeted
 * at the active markdown editor's cursor. Chat never writes a note by
 * itself — there is no anchor semantics, and writes are always explicit.
 *
 * Failure semantics (same matrix as the inline entry, design §4.2):
 * - generation failure → nothing on disk, nothing in any document;
 * - W-asset failure → no document change;
 * - W-ref failure (no active editor counts here: nothing was written yet)
 *   → the asset is kept and its actual path is reported.
 *
 * All vault/credential access is injected (`ImageGenerationChatPorts`), so
 * this service imports neither `core.storage` nor Obsidian's workspace.
 */

import type { Editor } from 'obsidian';

import { buildImageEmbedText, type ImageEmbedForm, type ImageGenerationResult } from '../../../core/agents/imagegen/ImageGenerationService';
import type { ImageGenerationModelConfig } from '../../../core/types';
import { t } from '../../../i18n';

/** A generation that succeeded and is being held for an explicit insert. */
export interface GeneratedImageCandidate {
  readonly model: ImageGenerationModelConfig;
  readonly prompt: string;
  readonly bytes: ArrayBuffer;
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly durationMs: number;
}

/** Runtime bridges assembled by the composition root. */
export interface ImageGenerationChatPorts {
  /** Configured models + insert/cleanup settings (normalized). */
  getConfiguration(): {
    readonly models: readonly ImageGenerationModelConfig[];
    readonly maxWidth: number;
    readonly cleanup: 'trash' | 'keep';
  };
  generate(
    model: ImageGenerationModelConfig,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult>;
  saveAsset(
    bytes: ArrayBuffer,
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
    baseName: string,
  ): Promise<{ path: string }>;
  trashAsset(path: string): Promise<boolean>;
  /** R-B3 registration (fail-soft inside the service). */
  registerAsset(assetPath: string, notePath: string): void;
  /**
   * R-B3 record-then-close for the paired reference write (D2): record the
   * note modification explicitly — no vault-event autosave timing dependency
   * — before `endAssetCapture` closes the round. Optional so chat-side
   * doubles stay valid.
   */
  noteReferenceWrite?(notePath: string): void;
  /**
   * R-B3 (D2): close the plugin asset round once the paired write attempt is
   * terminal (success or failure), so revert is available without waiting
   * out the post-turn grace. Optional so chat-side doubles stay valid.
   */
  endAssetCapture?(): void;
  /** Active markdown editor for explicit inserts; `null` when none. */
  resolveInsertTarget(): { editor: Editor; notePath: string } | null;
  notify(message: string): void;
}

/** Outcome of one generation round for the card. */
export type ChatImageGenerationOutcome =
  | { ok: true; candidate: GeneratedImageCandidate }
  | { ok: false; error: string };

export class ImageGenerationChatController {
  constructor(private readonly ports: ImageGenerationChatPorts) {}

  /** Configured models (the card's picker source; empty means "configure first"). */
  listModels(): readonly ImageGenerationModelConfig[] {
    return this.ports.getConfiguration().models;
  }

  /**
   * Run one generation. Failure resolves with a localized message and zero
   * side effects — no disk write, no document change (acceptance 5).
   */
  async generate(prompt: string, model?: ImageGenerationModelConfig): Promise<ChatImageGenerationOutcome> {
    const { models } = this.ports.getConfiguration();
    const chosen = model ?? models[0];
    if (!chosen) {
      return { ok: false, error: t('chat.imageGen.error.noModels') };
    }
    const startedAt = Date.now();
    const result = await this.ports.generate(chosen, prompt);
    if (!result.ok) {
      return {
        ok: false,
        error: t('chat.imageGen.error.failed', { kind: result.kind, message: result.error }),
      };
    }
    return {
      ok: true,
      candidate: {
        model: chosen,
        prompt,
        bytes: result.bytes,
        mimeType: result.mimeType,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  /**
   * Explicit insert click (design §3.5 step 3): W-asset → register → W-ref
   * at the active editor's cursor. Returns `false` when nothing was written;
   * the failure branches follow the shared matrix and always tell the user
   * what happened to the asset.
   */
  async insertIntoActiveNote(candidate: GeneratedImageCandidate, form: ImageEmbedForm): Promise<boolean> {
    const target = this.ports.resolveInsertTarget();
    if (!target) {
      // Nothing written yet at this point, so there is nothing to keep.
      this.ports.notify(t('chat.imageGen.insert.noEditor'));
      return false;
    }

    // W-asset: a failure here must leave the document untouched (W-ref is
    // never attempted).
    let assetPath: string;
    try {
      const saved = await this.ports.saveAsset(candidate.bytes, candidate.mimeType, candidate.prompt);
      assetPath = saved.path;
    } catch (error) {
      this.ports.notify(t('chat.imageGen.error.saveFailed', {
        message: error instanceof Error ? error.message : String(error),
      }));
      return false;
    }

    // R-B3 registration (fail-soft) with the paired note pre-image.
    this.ports.registerAsset(assetPath, target.notePath);

    // W-ref: single `replaceRange` at the live cursor — one Obsidian undo
    // step, and the cursor is current by construction (click-to-insert has
    // no async anchor gap, so a snapshot dirty check does not apply here).
    const { maxWidth } = this.ports.getConfiguration();
    const embedText = buildImageEmbedText(assetPath, maxWidth, form);
    try {
      const cursor = target.editor.getCursor();
      target.editor.replaceRange(embedText, cursor);
    } catch {
      // Insert failed: no reference write will be recorded, so the round can
      // close right away (asset kept — revert stays available for it).
      this.ports.endAssetCapture?.();
      this.ports.notify(t('inlineEdit.imageGen.notice.insertFailedKeepAsset', { path: assetPath }));
      return false;
    }
    // Paired write done: record it explicitly (order matters — record before
    // close) and free the round so one-click revert is available immediately.
    this.ports.noteReferenceWrite?.(target.notePath);
    this.ports.endAssetCapture?.();
    this.ports.notify(t('chat.imageGen.insert.ok', { path: assetPath }));
    return true;
  }
}

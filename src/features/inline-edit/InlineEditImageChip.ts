/**
 * InlineEditImageChip — the image-attachment surface of the floating bar
 * (docs/requirements/flowtext-parity.md R-A4).
 *
 * Kept out of the overlay for the same reason the context chips are: the bar
 * stays a skeleton, and the paste / drag-drop / validation mechanics live
 * here next to the chip renderer. Three pieces:
 *
 * - validation (`validateInlineEditImage`, `readInlineEditImage`): media-type
 *   whitelist and size cap mirror the chat composer, so an image the chat
 *   would accept is accepted here and vice versa. Fail-closed: an oversized
 *   or mistyped image is rejected with a reason the caller surfaces, never
 *   silently dropped.
 * - the chip (`syncInlineEditImageChip`): one thumbnail with a remove button;
 *   the row hides while empty.
 * - input glue (`installInlineEditImageInput`): paste on the instruction
 *   field and drag-drop on the panel, both gated on `enabled` so a backend
 *   without image support keeps a dead surface from appearing.
 *
 * Images never touch the vault: the file is read into base64 in memory and
 * travels as an `AuxQueryImageAttachment` on the turn request.
 */

import { setIcon } from 'obsidian';

import type { AuxQueryImageAttachment } from '../../core/agents/backend/AgentAuxQueryCapability';
import { t } from '../../i18n';

/** Most images one edit may carry (R-A4 caps this milestone at one). */
export const INLINE_EDIT_MAX_IMAGES = 1;
/**
 * Per-image size cap before base64 encoding, mirroring the chat composer
 * budget. Internal constant by requirement decision: R-A3/R-A4 add no user
 * settings, and the chat side already established 4MB as the working limit.
 */
export const INLINE_EDIT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** Media-type whitelist, same four types the chat composer accepts. */
export const INLINE_EDIT_IMAGE_MEDIA_TYPES: readonly AuxQueryImageAttachment['mediaType'][] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export type InlineEditImageRejection =
  | 'inlineEdit.error.imageTypeUnsupported'
  | 'inlineEdit.error.imageTooLarge'
  | 'inlineEdit.error.imageLimit';

export type InlineEditImageValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: InlineEditImageRejection };

/**
 * Validate one candidate file before any reading happens.
 *
 * `size` is the decoded byte size (what `File.size` reports), i.e. the
 * "before base64" budget the requirement names; the base64 payload grows the
 * wire size by ~4/3, which is the transport's concern, not the user's.
 */
export function validateInlineEditImage(
  file: { readonly type: string; readonly size: number },
  hasImage: boolean,
): InlineEditImageValidation {
  if (hasImage) return { ok: false, reason: 'inlineEdit.error.imageLimit' };
  if (!(INLINE_EDIT_IMAGE_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: 'inlineEdit.error.imageTypeUnsupported' };
  }
  if (file.size > INLINE_EDIT_IMAGE_MAX_BYTES) {
    return { ok: false, reason: 'inlineEdit.error.imageTooLarge' };
  }
  return { ok: true };
}

export type InlineEditImageReadResult =
  | { readonly ok: true; readonly attachment: AuxQueryImageAttachment }
  | { readonly ok: false; readonly reason: InlineEditImageRejection };

/** Validate and base64-decode one file into an attachment, all in memory. */
export async function readInlineEditImage(file: File): Promise<InlineEditImageReadResult> {
  const validation = validateInlineEditImage(file, false);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read-failed'));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(',');
  return {
    ok: true,
    attachment: {
      mediaType: file.type as AuxQueryImageAttachment['mediaType'],
      data: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
    },
  };
}

/** Keep only image files from a FileList/DataTransfer payload. */
export function filterInlineEditImageFiles(files: readonly File[]): File[] {
  return files.filter((file) =>
    (INLINE_EDIT_IMAGE_MEDIA_TYPES as readonly string[]).includes(file.type));
}

/** One chip as the bar renders it. */
export interface InlineEditImageChipModel {
  readonly mediaType: AuxQueryImageAttachment['mediaType'];
  readonly data: string;
  readonly label: string;
}

/**
 * Rebuild the image chip row and hide it while empty. Rebuilt like the
 * context chips: at most one entry, no focusable state inside.
 */
export function syncInlineEditImageChip(
  row: HTMLElement,
  image: InlineEditImageChipModel | null,
  onRemove: () => void,
): void {
  row.empty();
  row.style.display = image ? '' : 'none';
  if (!image) return;
  const removeLabel = t('inlineEdit.image.remove', { name: image.label });
  const chip = row.createEl('button', {
    cls: 'opencodian-inline-edit-chip opencodian-inline-edit-image-chip',
    attr: { type: 'button', title: removeLabel, 'aria-label': removeLabel },
  });
  chip.createEl('img', {
    cls: 'opencodian-inline-edit-image-chip-thumb',
    attr: { src: `data:${image.mediaType};base64,${image.data}`, alt: image.label },
  });
  chip.createSpan({ cls: 'opencodian-inline-edit-chip-value', text: image.label });
  const remove = chip.createSpan({ cls: 'opencodian-inline-edit-image-chip-remove' });
  setIcon(remove, 'x');
  chip.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onRemove();
  });
}

export interface InlineEditImageInputOptions {
  /** The instruction field: paste lands here. */
  readonly field: HTMLTextAreaElement;
  /** The panel root: drag-drop lands here. */
  readonly panel: HTMLElement;
  /** False disables both surfaces (backend without image support, busy). */
  readonly enabled: () => boolean;
  /** Called with the image-bearing files from a paste or drop. */
  readonly onFiles: (files: readonly File[]) => void;
}

/**
 * Wire paste + drag-drop for images; returns a teardown. Both surfaces only
 * react to whitelist images — anything else falls through to the normal
 * paste/drop behavior (text paste, Obsidian's own drop handling).
 */
export function installInlineEditImageInput(options: InlineEditImageInputOptions): () => void {
  const handlePaste = (event: ClipboardEvent): void => {
    if (!options.enabled()) return;
    const files = filterInlineEditImageFiles(Array.from(event.clipboardData?.files ?? []));
    if (files.length === 0) return;
    event.preventDefault();
    options.onFiles(files);
  };
  const handleDragOver = (event: DragEvent): void => {
    if (!options.enabled()) return;
    const files = filterInlineEditImageFiles(Array.from(event.dataTransfer?.files ?? []));
    if (files.length === 0) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    options.panel.addClass('is-image-drag-over');
  };
  const handleDragLeave = (event: DragEvent): void => {
    if (!options.panel.contains(event.relatedTarget as Node)) {
      options.panel.removeClass('is-image-drag-over');
    }
  };
  const handleDrop = (event: DragEvent): void => {
    options.panel.removeClass('is-image-drag-over');
    if (!options.enabled()) return;
    const files = filterInlineEditImageFiles(Array.from(event.dataTransfer?.files ?? []));
    if (files.length === 0) return;
    event.preventDefault();
    options.onFiles(files);
  };

  options.field.addEventListener('paste', handlePaste);
  options.panel.addEventListener('dragover', handleDragOver);
  options.panel.addEventListener('dragleave', handleDragLeave);
  options.panel.addEventListener('drop', handleDrop);
  // Drag-over text rides a data attribute so CSS can render it ::after,
  // mirroring the chat composer's drop surface.
  options.panel.dataset.inlineImageDropLabel = t('inlineEdit.image.dropHint');
  return () => {
    options.field.removeEventListener('paste', handlePaste);
    options.panel.removeEventListener('dragover', handleDragOver);
    options.panel.removeEventListener('dragleave', handleDragLeave);
    options.panel.removeEventListener('drop', handleDrop);
    delete options.panel.dataset.inlineImageDropLabel;
  };
}

/** Live image surface owned by the overlay: one chip row + paste/drop glue. */
export interface InlineEditImageSurface {
  readonly row: HTMLElement;
  sync(image: InlineEditImageChipModel | null): void;
  teardown(): void;
}

export interface InlineEditImageSurfaceOptions {
  readonly field: HTMLTextAreaElement;
  readonly panel: HTMLElement;
  /** The chip row is inserted directly before this element (the config row). */
  readonly anchor: HTMLElement;
  readonly enabled: () => boolean;
  readonly onFiles: (files: readonly File[]) => void;
  readonly onRemove: () => void;
}

/**
 * Build the whole image surface in one call so the overlay stays a skeleton:
 * chip row (hidden while empty, placed above the config row) plus the
 * paste/drag-drop listeners. `sync` re-renders the chip from state.
 */
export function attachInlineEditImageSurface(options: InlineEditImageSurfaceOptions): InlineEditImageSurface {
  const row = options.panel.createDiv({ cls: 'opencodian-inline-edit-image-row' });
  row.style.display = 'none';
  options.anchor.parentElement?.insertBefore(row, options.anchor);
  const teardownInput = installInlineEditImageInput({
    field: options.field,
    panel: options.panel,
    enabled: options.enabled,
    onFiles: options.onFiles,
  });
  return {
    row,
    sync: (image) => syncInlineEditImageChip(row, image, options.onRemove),
    teardown: () => {
      teardownInput();
      row.remove();
    },
  };
}

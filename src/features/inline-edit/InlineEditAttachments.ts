/**
 * InlineEditAttachments — attached-context and image management for one edit,
 * extracted from `InlineEditController` so the state machine stays under the
 * file-size gate (docs/requirements/flowtext-parity.md R-A4 / R-A7).
 *
 * Everything here mutates one `ActiveEdit`-shaped record; the controller
 * delegates and keeps the transition logic. Two rules live here:
 *
 * - Cap semantics (R-A7): every entry — file or directory — counts as one
 *   against `INLINE_EDIT_MAX_ATTACHED_NOTES`; exceeding the cap is a notice,
 *   never a silent truncation.
 * - Fail-closed images (R-A4): an oversized, mistyped, or extra image is
 *   rejected with a reason the caller surfaces; nothing is dropped silently,
 *   and the file is read into memory only (it never lands in the vault).
 */

import type { AuxQueryImageAttachment } from '../../core/agents/backend/AgentAuxQueryCapability';
import { t } from '../../i18n';
import type { InlineEditContextFile, InlineEditHost } from './InlineEditHost';
import {
  type InlineEditImageChipModel,
  readInlineEditImage,
  validateInlineEditImage,
} from './InlineEditImageChip';
import { INLINE_EDIT_MAX_ATTACHED_NOTES } from './InlineEditPrompt';

/** The slice of one active edit this module mutates. */
export interface InlineEditAttachmentEdit {
  contextFiles: readonly InlineEditContextFile[];
  image: AuxQueryImageAttachment | null;
  readonly hasSession: boolean;
  rerender(): void;
  refreshPicker(): void;
}

export interface InlineEditAttachmentHost {
  readonly host: Pick<InlineEditHost, 'listContextFiles'>;
  notify(message: string): void;
}

/**
 * Candidates for the attached-entries picker, or `null` when the picker may
 * not open (session started, or the host offers no vault). The caller renders
 * the picker through its overlay.
 */
export function contextPickerCandidates(
  edit: InlineEditAttachmentEdit,
  attachments: InlineEditAttachmentHost,
): readonly InlineEditContextFile[] | null {
  if (edit.hasSession) return null;
  return attachments.host.listContextFiles?.() ?? null;
}

/**
 * Attach or detach one entry; the cap counts every entry — file or directory
 * — as one (R-A7), and exceeding it is a notice, never a silent truncation.
 */
export function toggleContextEntry(
  edit: InlineEditAttachmentEdit,
  attachments: InlineEditAttachmentHost,
  path: string,
): void {
  if (edit.hasSession) return;
  const attached = edit.contextFiles.some((file) => file.path === path);
  if (attached) {
    edit.contextFiles = edit.contextFiles.filter((file) => file.path !== path);
  } else {
    const file = attachments.host.listContextFiles?.()?.find((entry) => entry.path === path);
    if (!file) return;
    if (edit.contextFiles.length >= INLINE_EDIT_MAX_ATTACHED_NOTES) {
      attachments.notify(t('inlineEdit.context.limit', { count: INLINE_EDIT_MAX_ATTACHED_NOTES }));
      return;
    }
    edit.contextFiles = [...edit.contextFiles, file];
  }
  edit.rerender();
  edit.refreshPicker();
}

/**
 * Attach one entry resolved from a vault drop (R-A7). The host has already
 * validated the path via `app.vault.getAbstractFileByPath()`; an entry that
 * no longer resolves is ignored, and a full list is a notice, not a
 * truncation.
 */
export function attachContextEntryToEdit(
  edit: InlineEditAttachmentEdit,
  attachments: InlineEditAttachmentHost,
  entry: InlineEditContextFile,
): void {
  if (edit.hasSession) return;
  if (edit.contextFiles.some((file) => file.path === entry.path)) return;
  if (edit.contextFiles.length >= INLINE_EDIT_MAX_ATTACHED_NOTES) {
    attachments.notify(t('inlineEdit.context.limit', { count: INLINE_EDIT_MAX_ATTACHED_NOTES }));
    return;
  }
  edit.contextFiles = [...edit.contextFiles, entry];
  edit.rerender();
  edit.refreshPicker();
}

/** Validate + read one image from a paste or drop (R-A4, fail-closed). */
export async function attachImageToEdit(
  edit: InlineEditAttachmentEdit,
  attachments: InlineEditAttachmentHost,
  files: readonly File[],
): Promise<void> {
  const file = files[0];
  if (!file) return;
  const preCheck = validateInlineEditImage(file, edit.image !== null);
  if (!preCheck.ok) {
    attachments.notify(t(preCheck.reason));
    return;
  }
  const result = await readInlineEditImage(file);
  if (!result.ok) {
    attachments.notify(t(result.reason));
    return;
  }
  edit.image = result.attachment;
  edit.rerender();
}

export function removeImageFromEdit(edit: InlineEditAttachmentEdit): void {
  if (edit.hasSession) return;
  edit.image = null;
  edit.rerender();
}

/** Chip model for the overlay: label is the media type, thumb is the payload. */
export function inlineEditImageChipModel(image: AuxQueryImageAttachment): InlineEditImageChipModel {
  return { mediaType: image.mediaType, data: image.data, label: image.mediaType.replace('image/', '') };
}

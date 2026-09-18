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
import type { ContextGroup } from '../../core/types';
import { t } from '../../i18n';
import { planContextGroupAttach } from '../../shared';
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
  readonly host: Pick<InlineEditHost, 'listContextFiles' | 'resolveContextFile' | 'listContextGroups'>;
  notify(message: string): void;
}

/**
 * The slice of one active edit the coordinator operates on, kept structural
 * so this module never imports the controller's private `ActiveEdit` type.
 */
export interface InlineEditAttachmentEditSource {
  readonly editId: string;
  contextFiles: readonly InlineEditContextFile[];
  image: AuxQueryImageAttachment | null;
  error: string;
  overlay: {
    showContextPicker(files: readonly InlineEditContextFile[]): void;
    refreshContextPicker(): void;
  } | null;
}

export interface InlineEditAttachmentCoordinatorDeps {
  host(): InlineEditHost;
  notify(message: string): void;
  isLive(edit: InlineEditAttachmentEditSource): boolean;
  hasSession(edit: InlineEditAttachmentEditSource): boolean;
  rerender(edit: InlineEditAttachmentEditSource): void;
}

/**
 * Attachment orchestration for the controller (R-A4 / R-A7 / R-B2), extracted
 * so `InlineEditController` stays under the file-size gate: picker open,
 * toggle, vault-drop entry, one-click context group, and image attach/remove.
 * Liveness (`isLive`) and session state come from the owning controller.
 */
export class InlineEditAttachmentCoordinator {
  constructor(private readonly deps: InlineEditAttachmentCoordinatorDeps) {}

  /** Adapter view of one edit for the module-level helpers below. */
  viewFor(edit: InlineEditAttachmentEditSource): InlineEditAttachmentEdit {
    return {
      get contextFiles() { return edit.contextFiles; },
      set contextFiles(value: readonly InlineEditContextFile[]) { edit.contextFiles = value; },
      get image() { return edit.image; },
      set image(value: AuxQueryImageAttachment | null) { edit.image = value; },
      hasSession: this.deps.hasSession(edit),
      rerender: () => { this.deps.rerender(edit); },
      refreshPicker: () => { edit.overlay?.refreshContextPicker(); },
    };
  }

  host(): InlineEditAttachmentHost {
    return { host: this.deps.host(), notify: (message) => { this.deps.notify(message); } };
  }

  /** Open the attached-entries picker with the host's candidate list. */
  openPicker(edit: InlineEditAttachmentEditSource): void {
    if (!this.deps.isLive(edit)) return;
    const files = contextPickerCandidates(this.viewFor(edit), this.host());
    if (files) edit.overlay?.showContextPicker(files);
  }

  /** Attach or detach one entry (cap and notice semantics below). */
  toggle(edit: InlineEditAttachmentEditSource, path: string): void {
    if (!this.deps.isLive(edit)) return;
    toggleContextEntry(this.viewFor(edit), this.host(), path);
  }

  /** Attach one entry resolved from a vault drop (R-A7). */
  attachEntry(edit: InlineEditAttachmentEditSource, entry: InlineEditContextFile): void {
    if (!this.deps.isLive(edit)) return;
    attachContextEntryToEdit(this.viewFor(edit), this.host(), entry);
  }

  /**
   * Attach one persisted context group to an edit (R-B2). Effect equals
   * attaching every entry by hand; cap/omitted/missing semantics and the
   * notices live in `attachContextGroupById` below.
   */
  attachGroup(edit: InlineEditAttachmentEditSource, groupId: string): void {
    if (!this.deps.isLive(edit) || this.deps.hasSession(edit)) return;
    attachContextGroupById(this.viewFor(edit), this.host(), this.deps.host(), groupId);
  }

  /** Attach one image from a paste or drop (R-A4, fail-closed). */
  async attachImage(edit: InlineEditAttachmentEditSource, files: readonly File[]): Promise<void> {
    if (!this.deps.isLive(edit)) return;
    await attachImageToEdit(this.viewFor(edit), this.host(), files);
    if (this.deps.isLive(edit)) edit.error = '';
  }

  removeImage(edit: InlineEditAttachmentEditSource): void {
    if (!this.deps.isLive(edit)) return;
    removeImageFromEdit(this.viewFor(edit));
  }
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

/** Outcome of attaching one context group to an edit (R-B2). */
export interface InlineEditContextGroupAttachSummary {
  readonly attachedCount: number;
  readonly omittedCount: number;
  readonly missingPaths: readonly string[];
}

/**
 * Attach every resolvable entry of one persisted context group (R-B2), in
 * group order, as if the user had attached them one by one. The per-edit cap
 * still applies: entries past the remaining room are counted as omitted —
 * reported, never silently truncated — and entries whose path no longer
 * resolves (moved/deleted note) are skipped and reported. Attaching zero
 * entries because nothing resolved is not an error.
 */
export function attachContextGroupToEdit(
  edit: InlineEditAttachmentEdit,
  attachments: InlineEditAttachmentHost,
  group: ContextGroup,
): InlineEditContextGroupAttachSummary {
  if (edit.hasSession) return { attachedCount: 0, omittedCount: 0, missingPaths: [] };
  const room = Math.max(
    0,
    INLINE_EDIT_MAX_ATTACHED_NOTES - edit.contextFiles.length,
  );
  const plan = planContextGroupAttach({
    entries: group.entries,
    resolve: (path) => attachments.host.resolveContextFile?.(path) ?? null,
    existingPaths: new Set(edit.contextFiles.map((file) => file.path)),
    cap: room,
  });
  if (plan.toAttach.length > 0) {
    edit.contextFiles = [...edit.contextFiles, ...plan.toAttach.map((resolved) => resolved.entry)];
    edit.rerender();
    edit.refreshPicker();
  }
  return {
    attachedCount: plan.toAttach.length,
    omittedCount: plan.omittedCount,
    missingPaths: plan.missingPaths,
  };
}

/** Max paths listed in the missing-entry notice before truncation. */
const MISSING_PATHS_SHOWN = 3;

/**
 * Attach one persisted context group to an edit by id (R-B2), notifying the
 * attached/omitted/missing summary. The group lookup and the notice wording
 * live here so the controller stays a thin delegate.
 */
export function attachContextGroupById(
  edit: InlineEditAttachmentEdit,
  attachments: InlineEditAttachmentHost,
  host: Pick<InlineEditHost, 'listContextGroups'>,
  groupId: string,
): void {
  const group = (host.listContextGroups?.() ?? []).find((entry) => entry.id === groupId);
  if (!group) return;
  const summary = attachContextGroupToEdit(edit, attachments, group);
  for (const message of buildContextGroupAttachNotices(group.name, summary)) {
    attachments.notify(message);
  }
}

/**
 * User-visible messages for one group attach (R-B2 提示语义): one notice for
 * what was attached (with the omitted count inline when the cap cut the
 * group) and one for missing entries. An all-empty summary yields nothing.
 */
export function buildContextGroupAttachNotices(
  groupName: string,
  summary: InlineEditContextGroupAttachSummary,
): string[] {
  const messages: string[] = [];
  if (summary.attachedCount > 0 || summary.omittedCount > 0) {
    let message = summary.attachedCount > 0
      ? t('inlineEdit.context.groupAttached', { name: groupName, count: summary.attachedCount })
      : t('inlineEdit.context.groupAttachedNone', { name: groupName });
    if (summary.omittedCount > 0) {
      message += t('inlineEdit.context.groupOmitted', {
        count: summary.omittedCount,
        max: INLINE_EDIT_MAX_ATTACHED_NOTES,
      });
    }
    messages.push(message);
  }
  if (summary.missingPaths.length > 0) {
    const shown = summary.missingPaths.slice(0, MISSING_PATHS_SHOWN).join('、');
    const more = summary.missingPaths.length - MISSING_PATHS_SHOWN;
    messages.push(
      more > 0
        ? t('inlineEdit.context.groupMissingMore', { count: summary.missingPaths.length, paths: shown, more })
        : t('inlineEdit.context.groupMissing', { count: summary.missingPaths.length, paths: shown }),
    );
  }
  return messages;
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

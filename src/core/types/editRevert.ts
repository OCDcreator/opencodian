/**
 * EditRevertServicePort — the consumer-owned seam for R-B3 edit revert.
 *
 * The canonical implementation lives in `src/core/storage/EditRevertService.ts`
 * (core.storage owner). This port is declared in core.types so both the
 * implementer and the feature-layer consumers (sidebar coordinator, chat
 * runtime composition, plugin composition root) can depend on it without
 * introducing new cross-owner runtime imports.
 */

import type {
  EditRevertActionResult,
  EditRevertSidebarModel,
} from '../../shared';
export type {
  EditRevertActionResult,
  EditRevertEntrySource,
  EditRevertEntryState,
  EditRevertExcludedReason,
  EditRevertFileEntry,
  EditRevertFileStatus,
  EditRevertPreImageStatus,
  EditRevertRoundMeta,
  EditRevertRoundSummary,
  EditRevertSidebarEntry,
  EditRevertSidebarModel,
  EditRevertWriteToolKind,
} from '../../shared';

/** Turn-begin signal issued by the send pipeline for one conversation. */
export interface EditRevertTurnBeginInfo {
  readonly conversationId: string;
  readonly backend: string;
  readonly sessionId?: string;
  /** Outgoing user message text (used for budgeted candidate pre-snapshot). */
  readonly userText: string;
  /** Vault-relative paths explicitly attached as context for this turn. */
  readonly contextPaths: readonly string[];
}

/** Write-tool declaration observed on the stream, before the tool result. */
export interface EditRevertWriteToolInfo {
  readonly conversationId: string;
  readonly toolName: string;
  readonly input: Record<string, unknown>;
}

export interface EditRevertServicePort {
  /** Sidebar view model for one conversation (empty when disabled/no round). */
  getSidebarModel(conversationId: string): EditRevertSidebarModel;
  /** Open a capture round and run the budgeted turn-start pre-snapshot. Fail-soft. */
  beginTurnCapture(info: EditRevertTurnBeginInfo): void;
  /** Close the capture window for the current round (post-turn grace starts). Fail-soft. */
  endTurnCapture(conversationId: string): void;
  /** Record a declared write-tool call and capture its pre-image. Fail-soft. */
  noteWriteToolUse(info: EditRevertWriteToolInfo): void;
  revertFile(conversationId: string, path: string): Promise<EditRevertActionResult>;
  revertAll(conversationId: string): Promise<EditRevertActionResult>;
  restoreFile(conversationId: string, path: string): Promise<EditRevertActionResult>;
  /** Subscribe to entry/state changes; returns the unsubscribe callback. */
  onEntriesChanged(listener: () => void): () => void;
}

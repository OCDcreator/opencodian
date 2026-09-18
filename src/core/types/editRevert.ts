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

  // --- R-B5: plugin-initiated batch capture (optional so chat-side doubles
  // stay valid; the concrete service always implements them and the batch
  // coordinator refuses to execute when they are missing — fail closed) ---

  /**
   * Open a plugin-initiated batch capture round and force-capture pre-images
   * for every listed path (no turn-start budget; over-limit paths are
   * honestly marked not revertible). Resolves `false` when snapshots are
   * unavailable — callers must not write in that case.
   */
  beginBatchCapture?(conversationId: string, paths: readonly string[]): Promise<boolean>;
  /** Record a plugin-performed move/rename (revert renames back, references included). */
  notePluginMove?(conversationId: string, fromPath: string, toPath: string): Promise<void>;
  /** Record a plugin-performed content write on an already-captured path. */
  notePluginWrite?(conversationId: string, path: string): Promise<void>;
  /**
   * Close the batch capture window. Unlike the turn path there is no
   * post-close grace: every batch write was recorded explicitly, so revert
   * becomes available immediately.
   */
  endBatchCapture?(conversationId: string): Promise<void>;
}

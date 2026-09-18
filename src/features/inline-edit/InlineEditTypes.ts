/**
 * InlineEditTypes — shared types for the inline edit feature.
 *
 * Kept separate so `InlineEditController` and `InlineEditService` never import
 * the plugin main class, the chat view, or the agent registry directly.
 */

import type {
  AgentAuxQueryCapability,
  AuxQuerySession,
  BackendModelSelection,
} from '../../core/agents/backend/AgentAuxQueryCapability';
import type { AgentBackendKind } from '../../core/types/chat';

export type { AgentAuxQueryCapability, AuxQuerySession, BackendModelSelection };

/** The backend chosen for one inline edit, already resolved by the host. */
export interface InlineEditHostAdapter {
  readonly kind: AgentBackendKind;
  readonly displayName: string;
  /** Aux query capability, or `null` when the backend cannot prove read-only execution. */
  getAuxQuery(): AgentAuxQueryCapability | null;
  /**
   * Documented precedence: `inlineEditModelOverrides[kind]` → active chat model →
   * `null`. Returns `{ error }` when an explicitly configured model cannot be
   * used, so the caller can abort instead of silently switching.
   */
  resolveModel(): { ok: true; model: BackendModelSelection | null } | { ok: false; error: string };
  /**
   * Model choices for the floating bar's picker. A resolved `null` leaves the
   * menu without model rows (backend without a listable catalog); the chip
   * still shows the effective model. Item ids use the override format.
   */
  listModels?(): Promise<readonly InlineEditChoice[] | null>;
  /** Effort levels for the effort chip; `null` hides it (no native seam). */
  listEfforts?(): readonly InlineEditChoice[] | null;
  /** Chip label for the model the next request would use. */
  describeModelSelection(): InlineEditModelSelectionLabel;
  /** Effort override id, or `null` when the backend default applies. */
  getEffort(): string | null;
  /**
   * Whether the backend transports per-turn image attachments (R-A4).
   * `false` surfaces an explicit capability gap instead of a silent
   * downgrade; absent means "not declared" (treated as supported).
   */
  readonly supportsImages?: boolean;
  /** Persist the model override (`null` clears → follow chat/default). */
  setModelOverride?(ref: string | null): Promise<void>;
  /** Persist the effort override (`null` clears → backend default). */
  setEffortOverride?(id: string | null): Promise<void>;
}

/** One dropdown entry in the floating bar. */
export interface InlineEditChoice {
  readonly id: string;
  readonly label: string;
}

/**
 * A vault entry the user attached as extra context.
 *
 * Only the path travels to the model: per docs/requirements/inline-edit.md §6.1
 * the prompt never inlines extra vault text, the read-only tools do the reading.
 * `kind` distinguishes file entries from directory entries (R-A7): a directory
 * entry means the notes under it are reference material, to be read on demand.
 */
export interface InlineEditContextFile {
  readonly path: string;
  /** Display name (the file's basename, or the folder name). */
  readonly name: string;
  /** Entry kind; absent means `'file'` (older hosts). */
  readonly kind?: 'file' | 'folder';
}

/** What the model chip should display and where it comes from. */
export interface InlineEditModelSelectionLabel {
  readonly label: string;
  readonly source: 'override' | 'chat' | 'default';
}

/**
 * One persisted context group as the picker's topic section renders it
 * (R-B2). The count is informational: the cap is enforced at attach time.
 */
export interface InlineEditContextGroupRow {
  readonly id: string;
  readonly name: string;
  readonly entryCount: number;
}

/** How the request was anchored in the editor. */
export type InlineEditMode = 'selection' | 'cursor-inline' | 'cursor-inbetween' | 'document';

/** The editor-side anchor captured when the request was issued. */
export interface InlineEditAnchor {
  readonly mode: InlineEditMode;
  /** Note path shown to the model and used in the dirty-check message. */
  readonly notePath: string;
  /** CM6 document range of the selection, or the cursor position for both ends. */
  readonly from: number;
  readonly to: number;
  /** Exact text of `[from, to)` at request time; the dirty check compares against this. */
  readonly snapshot: string;
  /** 1-based inclusive selection lines, or the single cursor line. */
  readonly startLine: number;
  readonly endLine: number;
  /** Text before the cursor on the line/paragraph (cursor modes only). */
  readonly before: string;
  /** Text after the cursor on the line/paragraph (cursor modes only). */
  readonly after: string;
}

/** Outcome of one submit / clarify round. */
export type InlineEditOutcome =
  | {
    readonly status: 'preview';
    readonly mode: 'replacement' | 'insertion';
    readonly text: string;
  }
  | { readonly status: 'clarification'; readonly text: string }
  | { readonly status: 'error'; readonly reason: string; readonly detail?: string };

/** Callbacks the controller exposes to the widget layer. */
export interface InlineEditWidgetCallbacks {
  onSubmit(instruction: string): void;
  onAccept(): void;
  onReject(): void;
}

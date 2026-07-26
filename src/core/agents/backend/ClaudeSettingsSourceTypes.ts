/**
 * Stable public contracts for Claude settings source inventory and mutation.
 *
 * These types are shared by the backend service, settings controllers, UI,
 * and tests. Keep the service module's type re-export so existing consumers do
 * not need to couple to this storage boundary directly.
 */
import type {
  ArchiveHistoryEntryIdentity,
} from './ConfigurationArchiveService';
import type {
  ConfigurationArchiveHistoryResult,
  ConfigurationEvidence,
  FileRevision,
  JsoncPathEdit,
  SafeFileMutationResult,
} from './ProjectResourceSecureWrite';

export type ClaudeSettingsSourceScope = 'global' | 'project' | 'local' | 'managed';

/** Inspection format: JSON sources are strict-validated; plist sources are path-only. */
export type ClaudeSettingsSourceFormat = 'json' | 'plist';

export interface ClaudeSettingsSourceCandidate {
  readonly scope: ClaudeSettingsSourceScope;
  readonly origin: string;
  readonly path: string;
  readonly exists: boolean;
  readonly editable: boolean;
  readonly priority: number;
  readonly revision: FileRevision | null;
  readonly evidence: ConfigurationEvidence;
  readonly format: ClaudeSettingsSourceFormat;
  /** Strict-JSON diagnostics when the raw source fails `JSON.parse` (json only). */
  readonly parseError?: string;
}

export type ClaudeSettingsReadResult =
  | { readonly status: 'success'; readonly source: ClaudeSettingsSourceCandidate; readonly content: string | null }
  | { readonly status: 'invalid-target'; readonly targetPath: string };

export interface ClaudeSettingsWriteParams {
  readonly targetPath: string;
  readonly content: string;
  readonly expectedRevision: FileRevision | null;
}

export interface ClaudeSettingsDeleteParams {
  readonly targetPath: string;
  /** Delete always carries a revision (never null): the target must be present at it. */
  readonly expectedRevision: FileRevision;
}

export interface ClaudeSettingsRestoreParams {
  /** Opaque identity returned by a validated history listing. */
  readonly entryIdentity: ArchiveHistoryEntryIdentity;
  /** `null` asserts the target is absent; a revision asserts presence at it. */
  readonly expectedRevision: FileRevision | null;
}

export interface ClaudeSettingsPathEditsParams {
  readonly targetPath: string;
  /** The caller's current single strict-JSON draft (form and source editor share it). */
  readonly baseContent: string;
  readonly edits: readonly JsoncPathEdit[];
  readonly expectedRevision: FileRevision | null;
}

export type ClaudeSettingsWriteResult = {
  readonly targetPath: string;
  readonly draft: string;
  readonly evidence: ConfigurationEvidence;
  readonly result: SafeFileMutationResult | { readonly status: 'read-only' } | { readonly status: 'invalid-target' };
};

export type ClaudeSettingsHistoryResult =
  | ConfigurationArchiveHistoryResult
  | { readonly status: 'invalid-target' }
  | { readonly status: 'read-only' };

export type ClaudeSettingsDeleteResult = {
  readonly targetPath: string;
  readonly evidence: ConfigurationEvidence;
  readonly result: SafeFileMutationResult | { readonly status: 'read-only' } | { readonly status: 'invalid-target' };
};

export type ClaudeSettingsRestoreResult = {
  readonly evidence: ConfigurationEvidence;
  readonly result: SafeFileMutationResult | { readonly status: 'read-only' } | { readonly status: 'invalid-target' };
};

export interface ClaudeSettingsSourceServiceOptions {
  readonly home?: string;
  readonly managedConfigDir?: string;
  readonly managedPreferencesDir?: string;
  readonly username?: string;
  readonly archiveRootPath?: string;
  /** Deterministic platform injection for exact default-path discovery tests. */
  readonly platform?: NodeJS.Platform;
}

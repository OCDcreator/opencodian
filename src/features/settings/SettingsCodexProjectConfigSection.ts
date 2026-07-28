/* eslint-disable max-lines -- SettingsCodexProjectConfigSection owns the vault-level .codex/config.toml editor as a single cohesive product surface. */
/**
 * SettingsCodexProjectConfigSection — vault-level `.codex/config.toml` editor.
 *
 * Manages exactly `<vault-root>/.codex/config.toml`. Defaults inherit global
 * per field; absence means inherit. Only project-safe behavior keys are
 * editable. The advanced TOML editor accepts a strict allowlist and blocks
 * save with focused diagnostics for forbidden/unknown keys.
 *
 * Reuses ProjectResourceSecureWrite + ConfigurationArchiveService for CAS,
 * archive-before-mutation, conflict detection, and history/restore.
 */

import path from 'node:path';

import {
  type ArchiveHistoryEntryIdentity,
  type ArchiveHistoryEntrySummary,
  type ConfigurationAllowlist,
  type FileRevision,
  listConfigurationArchiveHistory,
  readAllowlistedFileSnapshot,
  safeRestoreArchivedEntry,
  safeWriteFile,
} from '../../core/agents/backend/ProjectResourceSecureWrite';
import type OpenCodianPlugin from '../../main';
import {
  applyTomlScalarEdits,
  buildProjectConfigEdits,
  type CodexProjectConfigFormValues,
  type CodexProjectConfigTomlDiagnostic,
  EMPTY_CODEX_PROJECT_CONFIG_VALUES,
  parseProjectConfigFormValues,
  validateCodexProjectTomlContent,
} from './CodexProjectConfigFormModel';

const CODEX_CONFIG_RELATIVE_PATH = path.join('.codex', 'config.toml');
const CODEX_PROJECT_CONFIG_BACKEND = 'codex';
const CODEX_PROJECT_CONFIG_KIND = 'config';

export interface SettingsCodexProjectConfigSectionOptions {
  plugin: OpenCodianPlugin;
}

export interface ProjectConfigReadResult {
  status: 'success' | 'missing' | 'conflict' | 'read-failed' | 'invalid-path';
  content: string;
  revision: FileRevision | null;
  values: CodexProjectConfigFormValues;
}

export class SettingsCodexProjectConfigSection {
  constructor(private readonly options: SettingsCodexProjectConfigSectionOptions) {}

  private getVaultPath(): string | null {
    const adapter = this.options.plugin.app.vault.adapter;
    if ('getBasePath' in adapter && typeof adapter.getBasePath === 'function') {
      return adapter.getBasePath();
    }
    return null;
  }

  private buildAllowlist(vaultPath: string): ConfigurationAllowlist {
    // Narrow explicit allowlist: vault root is the only writable root.
    // The target path is resolved to .codex/config.toml within it.
    return [
      {
        scope: 'project',
        rootPath: vaultPath,
      },
    ];
  }

  private resolveTargetPath(vaultPath: string): string {
    return path.join(vaultPath, CODEX_CONFIG_RELATIVE_PATH);
  }

  /** Read the project config safely. Returns a typed result, never throws. */
  async read(): Promise<ProjectConfigReadResult> {
    const vaultPath = this.getVaultPath();
    if (!vaultPath) {
      return { status: 'invalid-path', content: '', revision: null, values: { ...EMPTY_CODEX_PROJECT_CONFIG_VALUES } };
    }
    const targetPath = this.resolveTargetPath(vaultPath);
    const allowlist = this.buildAllowlist(vaultPath);
    const snapshot = await readAllowlistedFileSnapshot({ allowlist, targetPath });
    if (snapshot.status === 'absent') {
      return { status: 'missing', content: '', revision: null, values: { ...EMPTY_CODEX_PROJECT_CONFIG_VALUES } };
    }
    if (snapshot.status === 'conflict') {
      return { status: 'conflict', content: '', revision: null, values: { ...EMPTY_CODEX_PROJECT_CONFIG_VALUES } };
    }
    if (snapshot.status !== 'success') {
      return { status: snapshot.status as 'read-failed' | 'invalid-path', content: '', revision: null, values: { ...EMPTY_CODEX_PROJECT_CONFIG_VALUES } };
    }
    return {
      status: 'success',
      content: snapshot.content,
      revision: snapshot.revision,
      values: parseProjectConfigFormValues(snapshot.content),
    };
  }

  /**
   * Save form values using surgical TOML editing (preserves comments) and
   * secure CAS write (archive-before-mutation, conflict detection).
   */
  async save(
    values: CodexProjectConfigFormValues,
    expectedRevision: FileRevision | null,
    additionalDirectories: string[] | null,
  ): Promise<{ status: 'success' | 'conflict' | 'invalid-content' | 'write-failed' | 'invalid-path'; revision: FileRevision | null }> {
    const vaultPath = this.getVaultPath();
    if (!vaultPath) {
      return { status: 'invalid-path', revision: null };
    }
    const targetPath = this.resolveTargetPath(vaultPath);
    const allowlist = this.buildAllowlist(vaultPath);

    // Read current content (or start from empty for create).
    let content = '';
    if (expectedRevision) {
      const snapshot = await readAllowlistedFileSnapshot({ allowlist, targetPath, expectedRevision });
      if (snapshot.status === 'conflict') {
        return { status: 'conflict', revision: null };
      }
      if (snapshot.status !== 'success') {
        return { status: 'write-failed', revision: null };
      }
      content = snapshot.content;
    }

    // Apply surgical scalar edits (preserves comments, key order, formatting).
    const scalarEdits = buildProjectConfigEdits(values);
    const edited = applyTomlScalarEdits(content, scalarEdits);
    if (edited === null) {
      // Cannot safely locate a key for surgical edit. Block save; guide
      // user to advanced mode. No canonical rewrite.
      return { status: 'invalid-content', revision: null };
    }

    // Handle additional_directories as a separate TOML array line.
    // Fail closed (invalid-content) when the existing format cannot be safely
    // edited surgically — user must use Advanced TOML for complex formatting.
    const dirResult = replaceAdditionalDirectories(edited, additionalDirectories);
    if (dirResult === null) {
      return { status: 'invalid-content', revision: null };
    }
    const finalContent = dirResult;

    // Validate the final TOML against the project allowlist.
    const validation = validateCodexProjectTomlContent(finalContent);
    if (!validation.valid) {
      return { status: 'invalid-content', revision: null };
    }

    const result = await safeWriteFile({
      targetPath,
      content: finalContent,
      expectedRevision,
      allowlist,
      format: 'toml',
      archive: {
        backend: CODEX_PROJECT_CONFIG_BACKEND,
        kind: CODEX_PROJECT_CONFIG_KIND,
        format: 'toml',
      },
    });

    if (result.status === 'success') {
      return { status: 'success', revision: result.revision };
    }
    return { status: result.status as 'conflict' | 'write-failed', revision: null };
  }

  /**
   * Save raw advanced TOML content directly (after allowlist validation).
   */
  async saveAdvancedToml(
    tomlContent: string,
    expectedRevision: FileRevision | null,
  ): Promise<{ status: 'success' | 'conflict' | 'invalid-content' | 'write-failed' | 'invalid-path'; diagnostics?: CodexProjectConfigTomlDiagnostic[] }> {
    const vaultPath = this.getVaultPath();
    if (!vaultPath) {
      return { status: 'invalid-path' };
    }
    const validation = validateCodexProjectTomlContent(tomlContent);
    if (!validation.valid) {
      return { status: 'invalid-content', diagnostics: validation.diagnostics };
    }
    const targetPath = this.resolveTargetPath(vaultPath);
    const allowlist = this.buildAllowlist(vaultPath);
    const result = await safeWriteFile({
      targetPath,
      content: tomlContent,
      expectedRevision,
      allowlist,
      format: 'toml',
      archive: {
        backend: CODEX_PROJECT_CONFIG_BACKEND,
        kind: CODEX_PROJECT_CONFIG_KIND,
        format: 'toml',
      },
    });
    if (result.status === 'success') {
      return { status: 'success' };
    }
    return { status: result.status as 'conflict' | 'write-failed' };
  }

  /**
   * List the protected archive history for the project config target.
   * Read-only; uses listConfigurationArchiveHistory which re-validates the
   * allowlist. Returns null on failure (never throws).
   */
  async listHistory(): Promise<ArchiveHistoryEntrySummary[] | null> {
    const vaultPath = this.getVaultPath();
    if (!vaultPath) {
      return null;
    }
    const targetPath = this.resolveTargetPath(vaultPath);
    const allowlist = this.buildAllowlist(vaultPath);
    try {
      const result = await listConfigurationArchiveHistory({
        targetPath,
        allowlist,
        archive: {
          backend: CODEX_PROJECT_CONFIG_BACKEND,
          kind: CODEX_PROJECT_CONFIG_KIND,
          format: 'toml',
        },
      });
      if (result.status !== 'success') {
        return null;
      }
      // Flatten targets (should be one target) into a single entry list.
      return result.targets.flatMap((target) => [...target.entries]);
    } catch {
      return null;
    }
  }

  /**
   * Restore a selected archive entry with CAS protection.
   *
   * Requires the current file revision to match expectedRevision (stale
   * revision blocks restore — no blind overwrite). The opaque entry identity
   * is resolved and re-validated by safeRestoreArchivedEntry internally.
   *
   * Returns 'success', 'conflict' (stale/external change), or error status.
   */
  async restoreEntry(
    entryIdentity: ArchiveHistoryEntryIdentity,
    expectedRevision: FileRevision | null,
  ): Promise<{ status: 'success' | 'conflict' | 'not-found' | 'archive-failed' | 'write-failed' | 'invalid-path' }> {
    const vaultPath = this.getVaultPath();
    if (!vaultPath) {
      return { status: 'invalid-path' };
    }
    const allowlist = this.buildAllowlist(vaultPath);
    try {
      const result = await safeRestoreArchivedEntry({
        entryIdentity,
        expectedRevision,
        allowlist,
      });
      if (result.status === 'success') {
        return { status: 'success' };
      }
      return { status: result.status as 'conflict' | 'not-found' | 'archive-failed' | 'write-failed' };
    } catch {
      return { status: 'write-failed' };
    }
  }
}

/**
 * Surgically replace the additional_directories TOML line.
 *
 * If the existing line is a multiline array or has inline comments, returns
 * null (fail closed) — the user must use Advanced TOML to edit complex
 * formatting safely. Never silently canonicalizes.
 *
 * Returns the edited content, or null when a safe surgical edit is not possible.
 */
/**
 * Check if an existing additional_directories line has complex formatting
 * (multiline array or inline comment) that cannot be safely edited surgically.
 * Returns true if the format is unsafe (should fail closed).
 */
function hasUnsafeAdditionalDirectoriesFormat(lines: readonly string[], scanLimit: number): boolean {
  for (let i = 0; i < scanLimit; i++) {
    if (!/^\s*additional_directories\s*=/.test(lines[i])) {
      continue;
    }
    const valuePart = lines[i].split('=')[1] ?? '';
    const trimmedValue = valuePart.trim();
    if (trimmedValue.startsWith('[') && !trimmedValue.includes(']')) {
      return true;
    }
    const afterArray = trimmedValue.replace(/^\[[^\]]*\]/, '');
    if (afterArray.includes('#')) {
      return true;
    }
  }
  return false;
}

function replaceAdditionalDirectories(content: string, dirs: string[] | null): string | null {
  const lines = content.split('\n');
  const firstTableHeader = lines.findIndex((line) => line.trimStart().startsWith('['));
  const scanLimit = firstTableHeader === -1 ? lines.length : firstTableHeader;

  if (hasUnsafeAdditionalDirectoriesFormat(lines, scanLimit)) {
    return null;
  }

  // Safe to proceed: remove existing line and insert new one.
  const filtered: string[] = [];
  let inMultilineArray = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (i < scanLimit && /^\s*additional_directories\s*=/.test(line)) {
      const valuePart = line.split('=')[1]?.trim() ?? '';
      if (valuePart.startsWith('[') && !valuePart.includes(']')) {
        inMultilineArray = true;
      }
      continue;
    }
    if (inMultilineArray) {
      if (trimmed.includes(']')) {
        inMultilineArray = false;
      }
      continue;
    }
    filtered.push(line);
  }

  if (!dirs || dirs.length === 0) {
    return filtered.join('\n');
  }

  const tomlArray = dirs.map((d) => `"${d.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(', ');
  const newLine = `additional_directories = [${tomlArray}]`;

  const newFirstTable = filtered.findIndex((line) => line.trimStart().startsWith('['));
  const insertAt = newFirstTable === -1 ? filtered.length : newFirstTable;
  if (insertAt > 0 && filtered[insertAt - 1].trim().length > 0) {
    filtered.splice(insertAt, 0, '', newLine);
  } else {
    filtered.splice(insertAt, 0, newLine);
  }
  return filtered.join('\n');
}

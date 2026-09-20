import type { App } from 'obsidian';

export function getVaultBasePath(app: App): string | null {
  return (app.vault?.adapter as unknown as { basePath?: string } | undefined)?.basePath ?? null;
}

function isAbsoluteFilePath(normalizedPath: string): boolean {
  return normalizedPath.startsWith('/') || /^[A-Za-z]:\//.test(normalizedPath);
}

function hasParentDirectorySegment(normalizedPath: string): boolean {
  return normalizedPath.split('/').some((segment) => segment === '..');
}

/** Return only the final path segment, without exposing parent directories. */
export function getFilePathBasename(filePath: string): string {
  const segments = filePath.replace(/\\/g, '/').split('/').filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? filePath;
}

/**
 * Resolve a session-diff style file path to a vault-relative path with `/` separators.
 *
 * Returns the relative path when the input is already relative, or when the
 * absolute input provably lives under `vaultBasePath` (directory-boundary match
 * only, so `/vault` never strips `/vault-two/...`). Returns `null` when an
 * absolute path cannot be proven to live inside the vault; callers must treat
 * that as unresolved instead of leaking host-absolute paths into links or UI.
 */
export function toVaultRelativePath(
  filePath: string,
  vaultBasePath: string | null | undefined,
): string | null {
  const normalizedFile = filePath.replace(/\\/g, '/');
  if (hasParentDirectorySegment(normalizedFile)) {
    return null;
  }
  if (!isAbsoluteFilePath(normalizedFile)) {
    return normalizedFile;
  }
  if (!vaultBasePath) {
    return null;
  }

  const normalizedBase = vaultBasePath.replace(/\\/g, '/').replace(/\/+$/, '');
  const isWindowsPath = /^[A-Za-z]:\//.test(normalizedFile);
  const comparableFile = isWindowsPath ? normalizedFile.toLowerCase() : normalizedFile;
  const comparableBase = isWindowsPath ? normalizedBase.toLowerCase() : normalizedBase;
  if (!comparableFile.startsWith(`${comparableBase}/`)) {
    return null;
  }

  const relativePath = normalizedFile.slice(normalizedBase.length + 1);
  return relativePath.length > 0 ? relativePath : null;
}

/** Fallback base name when a sanitized stem would be empty. */
export const DEFAULT_VAULT_FILE_BASE_NAME = 'file';
/** Hard cap for a sanitized file base name (kept readable in embeds/links). */
export const MAX_VAULT_FILE_BASE_CHARS = 60;

/**
 * Sanitize free text into a safe vault file base name (pure): strips the
 * characters Obsidian forbids in file names plus wiki-bracket syntax,
 * collapses whitespace, caps length, and falls back when nothing survives.
 * Shared by image-asset placement (R-C2) and conversation export (R-D1).
 */
export function sanitizeVaultFileBaseName(
  raw: string,
  fallback: string = DEFAULT_VAULT_FILE_BASE_NAME,
): string {
  const cleaned = raw
    .replace(/[[\]#^|\\/:*?"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return fallback;
  }
  return cleaned.length > MAX_VAULT_FILE_BASE_CHARS
    ? cleaned.slice(0, MAX_VAULT_FILE_BASE_CHARS).trim() || fallback
    : cleaned;
}

/**
 * True when `path` is a plain vault-relative file path. Rejects absolute
 * paths (POSIX and Windows drive forms — the out-of-vault attachment folder
 * case), `..` traversal, and empty segments.
 */
export function isSafeVaultRelativePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.startsWith('\\')) {
    return false;
  }
  if (/^[A-Za-z]:[\\/]/.test(path)) {
    return false;
  }
  const segments = path.split(/[\\/]/);
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

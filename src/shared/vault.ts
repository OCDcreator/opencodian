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

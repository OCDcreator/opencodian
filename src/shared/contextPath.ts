import * as path from 'path';

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const WINDOWS_FILE_URL_PATH = /^\/[A-Za-z]:\//;

function isWindowsDrivePath(pathValue: string): boolean {
  return WINDOWS_DRIVE_PATH.test(pathValue) || WINDOWS_FILE_URL_PATH.test(pathValue);
}

function normalizeWindowsPath(pathValue: string): string {
  const withoutFileUrlSlash = WINDOWS_FILE_URL_PATH.test(pathValue)
    ? pathValue.slice(1)
    : pathValue;

  return path.win32.normalize(withoutFileUrlSlash).replace(/\\/g, '/');
}

function toWin32Path(pathValue: string): string {
  return normalizeContextPath(pathValue).replace(/\//g, '\\');
}

export function normalizeContextPath(pathValue: string): string {
  if (!pathValue) {
    return pathValue;
  }

  if (isWindowsDrivePath(pathValue)) {
    return normalizeWindowsPath(pathValue);
  }

  return path.posix.normalize(pathValue.replace(/\\/g, '/'));
}

export function isAbsoluteContextPath(pathValue: string): boolean {
  const normalizedPath = normalizeContextPath(pathValue);
  return WINDOWS_DRIVE_PATH.test(normalizedPath) || path.posix.isAbsolute(normalizedPath);
}

export function resolveContextPath(pathValue: string, vaultPath?: string): string {
  if (isAbsoluteContextPath(pathValue) || !vaultPath) {
    return normalizeContextPath(pathValue);
  }

  const normalizedVaultPath = normalizeContextPath(vaultPath);
  if (WINDOWS_DRIVE_PATH.test(normalizedVaultPath)) {
    return path.win32.resolve(
      toWin32Path(normalizedVaultPath),
      pathValue.replace(/\//g, '\\'),
    ).replace(/\\/g, '/');
  }

  return path.posix.resolve(
    normalizedVaultPath,
    pathValue.replace(/\\/g, '/'),
  );
}

export function normalizeContextAttachmentPath(filePath: string, vaultPath?: string): string {
  const normalizedPath = normalizeContextPath(filePath);
  if (!vaultPath) {
    return normalizedPath;
  }

  const normalizedVaultPath = normalizeContextPath(vaultPath);
  const vaultUsesWindowsDrive = WINDOWS_DRIVE_PATH.test(normalizedVaultPath);
  const pathUsesWindowsDrive = WINDOWS_DRIVE_PATH.test(normalizedPath);

  if (vaultUsesWindowsDrive !== pathUsesWindowsDrive) {
    return normalizedPath;
  }

  const relativePath = vaultUsesWindowsDrive
    ? path.win32.relative(toWin32Path(normalizedVaultPath), toWin32Path(normalizedPath))
    : path.posix.relative(normalizedVaultPath, normalizedPath);
  const normalizedRelativePath = relativePath.replace(/\\/g, '/');

  if (
    normalizedRelativePath
    && !normalizedRelativePath.startsWith('..')
    && !isAbsoluteContextPath(normalizedRelativePath)
  ) {
    return normalizedRelativePath;
  }

  return normalizedPath;
}

export function pathToContextFileUrl(pathValue: string): string {
  const normalizedPath = normalizeContextPath(pathValue);
  const url = new URL('file:///');
  url.pathname = WINDOWS_DRIVE_PATH.test(normalizedPath)
    ? `/${normalizedPath}`
    : normalizedPath;
  return url.href;
}

export function contextPathFromFileUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    if (url.protocol !== 'file:') {
      return null;
    }

    const decodedPathname = decodeURIComponent(url.pathname);
    if (url.hostname && url.hostname !== 'localhost') {
      return normalizeContextPath(`//${url.hostname}${decodedPathname}`);
    }

    return normalizeContextPath(decodedPathname);
  } catch {
    return null;
  }
}

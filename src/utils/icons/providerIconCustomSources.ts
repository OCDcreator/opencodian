import * as fs from 'fs';
import { normalizePath, requestUrl } from 'obsidian';
import * as path from 'path';

import type { ProviderIconEntry } from '../../core/types';

export interface LoadedIconAsset {
  data: ArrayBuffer;
  mimeType: string;
}

export interface NormalizedCustomSource {
  type: 'url' | 'file';
  source: string;
  localPath?: string;
}

interface CreateCachedCustomEntryOptions {
  cacheDirectory: string;
  writeCachedAsset: (cachePath: string, data: ArrayBuffer) => Promise<void>;
}

export const ALLOWED_ICON_MIME_TYPES = new Set([
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const MAX_ICON_BYTES = 1024 * 1024;
const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function createCachedCustomEntry(
  providerId: string,
  source: NormalizedCustomSource,
  options: CreateCachedCustomEntryOptions,
): Promise<ProviderIconEntry> {
  const asset = await loadCustomSourceAsset(source);
  const timestamp = Date.now();
  const cacheFileName = buildCustomCacheFileName(providerId, asset.mimeType);
  const entry: ProviderIconEntry = {
    id: createEntryId(),
    type: source.type,
    source: source.source,
    mimeType: asset.mimeType,
    cacheFileName,
    addedAt: timestamp,
    updatedAt: timestamp,
  };

  await options.writeCachedAsset(normalizePath(`${options.cacheDirectory}/${cacheFileName}`), asset.data);
  return entry;
}

export function normalizeCustomSource(
  sourceInput: string,
  expectedType?: 'url' | 'file',
): NormalizedCustomSource {
  const source = stripEnclosingQuotes(sourceInput.trim());
  if (!source) {
    throw new Error('Please paste a non-empty local path or URL.');
  }

  if (source.length > 2048) {
    throw new Error('The icon source is too long.');
  }

  if (isAbsoluteLocalPath(source)) {
    if (expectedType && expectedType !== 'file') {
      throw new Error('Expected a URL, but received a local file path.');
    }

    return { type: 'file', source, localPath: source };
  }

  const maybeUrl = tryParseUrl(source);
  if (maybeUrl) {
    if (maybeUrl.protocol === 'http:' || maybeUrl.protocol === 'https:') {
      if (expectedType && expectedType !== 'url') {
        throw new Error('Expected a local file path, but received a URL.');
      }

      return { type: 'url', source: maybeUrl.toString() };
    }

    if (maybeUrl.protocol === 'file:') {
      if (expectedType && expectedType !== 'file') {
        throw new Error('Expected a URL, but received a local file path.');
      }

      return {
        type: 'file',
        source: maybeUrl.toString(),
        localPath: decodeURIComponent(maybeUrl.pathname.replace(/^\/([A-Za-z]:)/, '$1')),
      };
    }

    throw new Error('Only http(s) URLs and local file paths are allowed.');
  }

  if (!isAbsoluteLocalPath(source)) {
    throw new Error('Please use an absolute local file path or a full URL.');
  }

  if (expectedType && expectedType !== 'file') {
    throw new Error('Expected a URL, but received a local file path.');
  }

  return { type: 'file', source, localPath: source };
}

export function splitCustomIconSourcesInput(sourceInput: string): string[] {
  const input = sourceInput.trim();
  if (!input) {
    return [];
  }

  const lineParts = input
    .split(/\r?\n/)
    .map((part) => part.trim().replace(/,\s*$/, '').trim())
    .filter(Boolean);

  return lineParts.flatMap((part) => splitCustomIconSourceChunk(part));
}

export async function loadCustomSourceAsset(source: NormalizedCustomSource): Promise<LoadedIconAsset> {
  return source.type === 'url'
    ? loadRemoteCustomAsset(source.source)
    : loadLocalCustomAsset(source.localPath ?? source.source);
}

export async function loadRemoteImageAsset(
  url: string,
  createStatusError?: (status: number) => string,
): Promise<LoadedIconAsset> {
  const response = await requestUrl({
    url,
    method: 'GET',
    throw: false,
  });

  if (response.status >= 400) {
    throw new Error(createStatusError?.(response.status) ?? `HTTP ${response.status} while fetching preview asset.`);
  }

  const mimeType = detectIconMimeType(response.arrayBuffer, response.headers['content-type'], url);
  if (!ALLOWED_ICON_MIME_TYPES.has(mimeType)) {
    throw new Error('Preview asset did not return a supported image.');
  }

  return {
    data: response.arrayBuffer,
    mimeType,
  };
}

export function detectIconMimeType(buffer: ArrayBuffer, headerValue?: string, sourceHint?: string): string {
  const bytes = new Uint8Array(buffer);
  const fromHeader = getMimeTypeFromHeader(headerValue);
  if (fromHeader) {
    return fromHeader;
  }

  if (isSvgAsset(bytes, sourceHint)) {
    return 'image/svg+xml';
  }

  const fromSignature = getMimeTypeFromSignature(bytes);
  if (fromSignature) {
    return fromSignature;
  }

  const fromPath = getMimeTypeFromPath(sourceHint);
  if (fromPath) {
    return fromPath;
  }

  throw new Error('Only SVG, PNG, JPEG, WEBP, and GIF icon files are supported.');
}

export function getMimeTypeFromPath(sourceHint?: string): string | null {
  if (!sourceHint) {
    return null;
  }

  const extension = path.extname(sourceHint).toLowerCase();
  switch (extension) {
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return null;
  }
}

async function loadRemoteCustomAsset(source: string): Promise<LoadedIconAsset> {
  const asset = await loadRemoteImageAsset(source, (status) => `HTTP ${status} while fetching custom icon.`);
  assertByteLength(asset.data.byteLength);
  return {
    data: asset.data,
    mimeType: asset.mimeType,
  };
}

async function loadLocalCustomAsset(localPath: string): Promise<LoadedIconAsset> {
  const stats = await fs.promises.stat(localPath);
  if (!stats.isFile()) {
    throw new Error('The provided local icon path is not a file.');
  }

  assertByteLength(stats.size);
  const buffer = await fs.promises.readFile(localPath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const mimeType = detectIconMimeType(arrayBuffer, undefined, localPath);
  return {
    data: arrayBuffer,
    mimeType,
  };
}

function splitCustomIconSourceChunk(chunk: string): string[] {
  const normalizedChunk = chunk.trim();
  if (!normalizedChunk) {
    return [];
  }

  const commaParts = normalizedChunk
    .split(/\s*,\s*(?=(?:https?:\/\/|file:\/\/|[A-Za-z]:[\\/]|\/))/)
    .map((part) => part.trim())
    .filter(Boolean);

  return commaParts.flatMap((part) => splitWhitespaceSeparatedUrls(part));
}

function splitWhitespaceSeparatedUrls(chunk: string): string[] {
  const tokens = chunk
    .split(/\s+/)
    .map((part) => part.trim().replace(/,\s*$/, ''))
    .filter(Boolean);

  if (tokens.length > 1 && tokens.every((token) => isUrlLikeCustomSource(token))) {
    return tokens;
  }

  return [chunk.replace(/,\s*$/, '').trim()];
}

function isUrlLikeCustomSource(sourceInput: string): boolean {
  const source = stripEnclosingQuotes(sourceInput.trim());
  if (!source) {
    return false;
  }

  const maybeUrl = tryParseUrl(source);
  return Boolean(
    maybeUrl && (
      maybeUrl.protocol === 'http:'
      || maybeUrl.protocol === 'https:'
      || maybeUrl.protocol === 'file:'
    ),
  );
}

function tryParseUrl(source: string): URL | null {
  try {
    return new URL(source);
  } catch {
    return null;
  }
}

function isAbsoluteLocalPath(source: string): boolean {
  return path.isAbsolute(source) || /^[A-Za-z]:[\\/]/.test(source);
}

function getMimeTypeFromHeader(headerValue?: string): string | null {
  const normalizedHeader = headerValue?.split(';')[0]?.trim().toLowerCase();
  return normalizedHeader && ALLOWED_ICON_MIME_TYPES.has(normalizedHeader)
    ? normalizedHeader
    : null;
}

function isSvgAsset(bytes: Uint8Array, sourceHint?: string): boolean {
  const prefix = Buffer.from(bytes.slice(0, Math.min(bytes.length, 2048)))
    .toString('utf-8')
    .replace(/^\uFEFF/, '')
    .trimStart();

  return /<svg[\s>]/i.test(prefix) || (/^<\?xml/i.test(prefix) && /\.svg$/i.test(sourceHint ?? ''));
}

function getMimeTypeFromSignature(bytes: Uint8Array): string | null {
  if (hasPngSignature(bytes)) {
    return 'image/png';
  }

  if (hasJpegSignature(bytes)) {
    return 'image/jpeg';
  }

  if (hasGifSignature(bytes)) {
    return 'image/gif';
  }

  if (hasWebpSignature(bytes)) {
    return 'image/webp';
  }

  return null;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47;
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
}

function hasGifSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 6) {
    return false;
  }

  const signature = Buffer.from(bytes.slice(0, 6)).toString('ascii');
  return signature === 'GIF87a' || signature === 'GIF89a';
}

function hasWebpSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false;
  }

  const riff = Buffer.from(bytes.slice(0, 4)).toString('ascii');
  const webp = Buffer.from(bytes.slice(8, 12)).toString('ascii');
  return riff === 'RIFF' && webp === 'WEBP';
}

function buildCustomCacheFileName(providerId: string, mimeType: string): string {
  const extension = MIME_TYPE_TO_EXTENSION[mimeType];
  const safeProvider = providerId.replace(/[^a-z0-9_-]/gi, '-').slice(0, 48) || 'provider';
  return `${safeProvider}-${createEntryId()}.${extension}`;
}

function createEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stripEnclosingQuotes(source: string): string {
  if (source.length >= 2) {
    const firstChar = source[0];
    const lastChar = source[source.length - 1];
    if ((firstChar === '"' && lastChar === '"') || (firstChar === '\'' && lastChar === '\'')) {
      return source.slice(1, -1).trim();
    }
  }

  return source;
}

function assertByteLength(byteLength: number): void {
  if (byteLength > MAX_ICON_BYTES) {
    throw new Error('The icon file is too large. Maximum size is 1 MB.');
  }
}

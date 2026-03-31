import { pathToFileURL } from 'url';

import type {
  MessageContextAttachment,
  PromptContextItem,
  PromptContextKind,
  PromptContextLineRange,
} from '../core/types/chat';

const TEXT_MIME_BY_EXTENSION: Record<string, string> = {
  css: 'text/css',
  html: 'text/html',
  java: 'text/x-java-source',
  js: 'text/javascript',
  json: 'application/json',
  jsonc: 'application/json',
  jsx: 'text/jsx',
  md: 'text/markdown',
  mjs: 'text/javascript',
  py: 'text/x-python',
  sh: 'text/x-shellscript',
  sql: 'text/sql',
  text: 'text/plain',
  toml: 'application/toml',
  ts: 'text/typescript',
  tsx: 'text/tsx',
  txt: 'text/plain',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
};

const CONTEXT_MIME_BY_EXTENSION: Record<string, string> = {
  ...TEXT_MIME_BY_EXTENSION,
  '7z': 'application/x-7z-compressed',
  ai: 'application/postscript',
  apk: 'application/vnd.android.package-archive',
  avif: 'image/avif',
  bmp: 'image/bmp',
  c: 'text/x-c',
  cc: 'text/x-c++src',
  cpp: 'text/x-c++src',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  gif: 'image/gif',
  go: 'text/x-go',
  heic: 'image/heic',
  heif: 'image/heif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  key: 'application/vnd.apple.keynote',
  lock: 'text/plain',
  log: 'text/plain',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  php: 'text/x-php',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  psd: 'image/vnd.adobe.photoshop',
  rb: 'text/x-ruby',
  rs: 'text/x-rustsrc',
  sass: 'text/x-sass',
  scss: 'text/x-scss',
  svg: 'image/svg+xml',
  tar: 'application/x-tar',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

const OBSIDIAN_CONTEXT_PATTERN =
  /^<obsidian_context\s+kind="([^"]+)"\s+path="([^"]+)"(?:\s+lines="([^"]+)")?>([\s\S]*)<\/obsidian_context>$/;

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
}

export function getContextPathExtension(path: string): string | null {
  const normalized = path.replace(/\\/g, '/');
  const basenameValue = normalized.split('/').pop() || normalized;
  const dotIndex = basenameValue.lastIndexOf('.');

  if (dotIndex <= 0 || dotIndex === basenameValue.length - 1) {
    return null;
  }

  return basenameValue.slice(dotIndex + 1).toLowerCase();
}

export function resolveContextMimeFromPath(path: string): string {
  const extension = getContextPathExtension(path);
  if (!extension) {
    return 'application/octet-stream';
  }

  return CONTEXT_MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export function isHiddenContextPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return normalized
    .split('/')
    .filter(Boolean)
    .some((segment) => segment.startsWith('.'));
}

export function isEligibleContextFilePath(path: string): boolean {
  return !isHiddenContextPath(path) && getContextPathExtension(path) !== null;
}

export function resolveTextMimeFromPath(path: string): string {
  const mime = resolveContextMimeFromPath(path);
  return isTextLikeMime(mime) ? mime : 'text/plain';
}

export function isTextLikeMime(mime: string): boolean {
  const normalized = mime.toLowerCase();
  return normalized.startsWith('text/')
    || normalized === 'application/json'
    || normalized === 'application/xml'
    || normalized === 'application/yaml'
    || normalized === 'application/toml';
}

export function formatLineRange(range?: PromptContextLineRange): string | undefined {
  if (!range) {
    return undefined;
  }

  return range.startLine === range.endLine
    ? String(range.startLine)
    : `${range.startLine}-${range.endLine}`;
}

export function formatContextLabel(path: string, range?: PromptContextLineRange): string {
  const fileLabel = basename(path);
  const lines = formatLineRange(range);
  return lines ? `${fileLabel}:${lines}` : fileLabel;
}

export function toFileContextUrl(path: string, range?: PromptContextLineRange): string {
  const url = pathToFileURL(path);
  if (range) {
    url.searchParams.set('start', String(range.startLine));
    url.searchParams.set('end', String(range.endLine));
  }
  return url.href;
}

export function buildObsidianContextTag(item: PromptContextItem): string {
  const attrs = [
    `kind="${escapeHtmlAttribute(item.kind)}"`,
    `path="${escapeHtmlAttribute(item.path)}"`,
  ];
  const lines = formatLineRange(item.lineRange);
  if (lines) {
    attrs.push(`lines="${escapeHtmlAttribute(lines)}"`);
  }

  return `<obsidian_context ${attrs.join(' ')}>${item.textSnapshot ?? ''}</obsidian_context>`;
}

export function parseObsidianContextTag(text: string): MessageContextAttachment | null {
  const trimmed = text.trim();
  const match = trimmed.match(OBSIDIAN_CONTEXT_PATTERN);
  if (!match) {
    return null;
  }

  const kind = decodeHtmlAttribute(match[1]) as PromptContextKind;
  if (kind !== 'current_note' && kind !== 'selection' && kind !== 'file') {
    return null;
  }

  const path = decodeHtmlAttribute(match[2]);
  const lines = decodeHtmlAttribute(match[3] ?? '');
  const textSnapshot = match[4] || undefined;
  const lineRange = parseLineRange(lines);

  return {
    kind,
    path,
    label: formatContextLabel(path, lineRange ?? undefined),
    mime: resolveContextMimeFromPath(path),
    lineRange: lineRange ?? undefined,
    textSnapshot,
  };
}

export function buildContextAttachment(item: PromptContextItem): MessageContextAttachment {
  return {
    kind: item.kind,
    path: item.path,
    label: item.label,
    mime: item.mime,
    lineRange: item.lineRange,
    textSnapshot: item.kind === 'selection'
      ? item.textSnapshot
      : undefined,
  };
}

export function parseLineRangeFromFileUrl(url: string): PromptContextLineRange | null {
  try {
    const parsed = new URL(url);
    const startLine = Number(parsed.searchParams.get('start'));
    const endLine = Number(parsed.searchParams.get('end'));
    if (
      !Number.isFinite(startLine)
      || !Number.isFinite(endLine)
      || startLine < 1
      || endLine < 1
      || endLine < startLine
    ) {
      return null;
    }

    return {
      startLine,
      endLine,
    };
  } catch {
    return null;
  }
}

function parseLineRange(lines: string): PromptContextLineRange | null {
  if (!lines) {
    return null;
  }

  const match = lines.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) {
    return null;
  }

  const startLine = Number(match[1]);
  const endLine = Number(match[2] ?? match[1]);
  if (
    !Number.isFinite(startLine)
    || !Number.isFinite(endLine)
    || startLine < 1
    || endLine < startLine
  ) {
    return null;
  }

  return {
    startLine,
    endLine,
  };
}

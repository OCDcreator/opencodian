import type {
  MessageContextAttachment,
  PdfPageText,
  PdfSelectionRange,
  PromptContextItem,
  PromptContextKind,
  PromptContextLineRange,
} from '../core/types/chat';
import { pathToContextFileUrl } from './contextPath';

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
  const url = new URL(pathToContextFileUrl(path));
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

/** Cap for one persisted selection excerpt carried on message attachments. */
export const PDF_SELECTION_EXCERPT_MAX_CHARS = 200;

/**
 * Render the body injected for a PDF context item (R-C4). PDF items never
 * write `textSnapshot`, so this builds the payload from the structured page
 * text instead — deterministic across backends because every backend's
 * request parts are built from this same item shape.
 */
export function buildPdfContextBody(item: PromptContextItem): string {
  const meta = item.pdf;
  const pages = item.pdfPages ?? [];
  if (item.kind === 'pdf_selection') {
    const selection = item.pdfSelection;
    const locator = selection
      ? selection.rangeStr
        ? `p.${selection.page} selection=${selection.rangeStr}`
        : `p.${selection.page}`
      : '';
    const header = locator ? `# PDF 选区：${item.path}（${locator}）` : `# PDF 选区：${item.path}`;
    const excerpt = selection?.text ?? pages.map((page) => page.text).join('\n');
    return `${header}\n\n${excerpt}`;
  }
  const fragment = meta?.fragment;
  const scope = fragment
    ? `第 ${fragment.pageFrom}–${fragment.pageTo} 页片段`
    : `共 ${meta?.pageCount ?? pages.length} 页`;
  const header = `# PDF 附件：${item.path}（${scope}，提取 ${pages.reduce((sum, page) => sum + page.text.length, 0)} 字符）`;
  const body = pages.map((page) => `[第 ${page.page} 页]\n${page.text}`).join('\n\n');
  return `${header}\n\n${body}`;
}

/**
 * Render one attached context item as the `<obsidian_context>` text every
 * backend consumes. This is the single serialization dispatch: the OpenCode
 * part serializer and the claude/codex prompt-block seam both route through
 * here, so a given item always renders identically across backends.
 * PDF items (R-C4) carry their payload on `pdfPages`/`pdfSelection` and use
 * the PDF tag; every other kind uses the snapshot/path tag.
 */
export function buildContextItemPromptBlock(item: PromptContextItem): string {
  if (item.kind === 'pdf_document' || item.kind === 'pdf_selection') {
    return buildPdfContextTag(item);
  }
  return buildObsidianContextTag(item);
}

/**
 * Read attached context items out of a backend send-options bag. Inert for
 * bags that do not carry them; malformed entries are dropped so a legacy or
 * foreign bag can never crash a send.
 */
export function extractPromptContextItems(
  options: Record<string, unknown> | undefined | null,
): PromptContextItem[] {
  const raw = (options as { contextItems?: unknown } | undefined | null)?.contextItems;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is PromptContextItem =>
    Boolean(item)
    && typeof item === 'object'
    && typeof (item as { kind?: unknown }).kind === 'string'
    && typeof (item as { path?: unknown }).path === 'string'
  );
}

/**
 * Append attached-context blocks to a prompt content (claude/codex seam:
 * these backends expose neither request parts nor a server-side file-part
 * reader, so the per-turn context rides the message text after the user
 * turn, mirroring the OpenCode wire order `[message][context parts]` and
 * Pi's `[expanded, ...files]` order).
 *
 * Prompt-caching discipline: the per-epoch memory/tooling injections stay
 * at the very front of the message; per-turn context blocks are appended
 * strictly after them and after the user text, so the stable cached prefix
 * is never shifted by per-turn attachments.
 */
export function appendObsidianContextBlocks(
  content: string,
  options: Record<string, unknown> | undefined | null,
): string {
  const items = extractPromptContextItems(options);
  if (items.length === 0) {
    return content;
  }
  const blocks = items.map(buildContextItemPromptBlock);
  return `${content}\n\n${blocks.join('\n\n')}`;
}

/** Build the `<obsidian_context>` tag for a PDF item (R-C4). */
export function buildPdfContextTag(item: PromptContextItem): string {
  const attrs = [
    `kind="${escapeHtmlAttribute(item.kind)}"`,
    `path="${escapeHtmlAttribute(item.path)}"`,
  ];
  const selection = item.pdfSelection;
  if (selection) {
    attrs.push(`page="${selection.page}"`);
    if (selection.rangeStr) {
      attrs.push(`selection="${escapeHtmlAttribute(selection.rangeStr)}"`);
    }
  } else if (item.pdf?.fragment) {
    attrs.push(`pages="${item.pdf.fragment.pageFrom}-${item.pdf.fragment.pageTo}"`);
  }

  return `<obsidian_context ${attrs.join(' ')}>${buildPdfContextBody(item)}</obsidian_context>`;
}

/**
 * Render the body injected for a URL context item (R-E1). A failed or
 * still-pending fetch injects an explicit failure header naming the reason —
 * the entry is never silently dropped, and the model sees that the user
 * referenced this URL even when no content could be retrieved.
 */
export function buildUrlContextBody(item: PromptContextItem): string {
  const meta = item.url;
  if (!meta || meta.status !== 'ok') {
    const reason = meta?.failureReason ?? (meta?.status === 'pending' ? 'pending' : 'fetch-failed');
    return `[fetch failed: ${reason}] ${meta?.href ?? item.path}`;
  }
  const header = [
    `# ${meta.title || meta.href}`,
    meta.finalUrl && meta.finalUrl !== meta.href ? `redirected: ${meta.finalUrl}` : '',
    meta.truncated ? 'content truncated to the context budget' : '',
    `fetched: ${new Date(meta.fetchedAt ?? Date.now()).toISOString()}`,
  ].filter(Boolean).join('\n\n');
  return `${header}\n\n${item.textSnapshot ?? ''}`;
}

/** Build a `url` context item's `<obsidian_context>` tag (R-E1). */
export function buildUrlContextTag(item: PromptContextItem): string {
  const meta = item.url;
  const attrs = [
    'kind="url"',
    `href="${escapeHtmlAttribute(meta?.href ?? item.path)}"`,
  ];
  if (meta?.status && meta.status !== 'ok') {
    attrs.push(`status="${escapeHtmlAttribute(meta.status)}"`);
  }
  return `<obsidian_context ${attrs.join(' ')}>${buildUrlContextBody(item)}</obsidian_context>`;
}

/** Build a `pdf_selection` context item's attachment payload (R-C4). */
export function buildPdfSelectionRange(
  page: number,
  text: string,
  rangeStr?: string,
): PdfSelectionRange {
  const excerpt = text.length > PDF_SELECTION_EXCERPT_MAX_CHARS
    ? `${text.slice(0, PDF_SELECTION_EXCERPT_MAX_CHARS)}…`
    : text;
  return rangeStr ? { page, rangeStr, text: excerpt } : { page, text: excerpt };
}

/** Page texts for one fragment merged from the page payload (R-C4). */
export function pdfPagesFromFragment(
  pages: readonly PdfPageText[],
  pageFrom: number,
  pageTo: number,
): PdfPageText[] {
  return pages
    .filter((page) => page.page >= pageFrom && page.page <= pageTo)
    .map((page) => ({ page: page.page, text: page.text }));
}

export function parseObsidianContextTag(text: string): MessageContextAttachment | null {
  const trimmed = text.trim();
  const match = trimmed.match(OBSIDIAN_CONTEXT_PATTERN);
  if (!match) {
    return null;
  }

  const kind = decodeHtmlAttribute(match[1]) as PromptContextKind;
  if (
    kind !== 'current_note'
    && kind !== 'selection'
    && kind !== 'file'
    && kind !== 'folder'
    && kind !== 'pdf_document'
    && kind !== 'pdf_selection'
  ) {
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
    ...(item.origin ? { origin: item.origin } : {}),
    // R-C4: persist PDF display metadata and the bounded selection locator,
    // but never the full page payload (keeps stored conversations small).
    ...(item.pdf ? { pdf: item.pdf } : {}),
    ...(item.pdfSelection
      ? { pdfSelection: buildPdfSelectionRange(item.pdfSelection.page, item.pdfSelection.text, item.pdfSelection.rangeStr) }
      : {}),
    // R-E1: persist the URL fetch verdict (status/reason/size) so chips stay
    // honest across reloads; the fetched page body rides the request only.
    ...(item.url ? { url: { ...item.url } } : {}),
  };
}

export function dedupeContextAttachments(
  attachments: MessageContextAttachment[],
): MessageContextAttachment[] {
  const seen = new Set<string>();
  const deduped: MessageContextAttachment[] = [];

  for (const attachment of attachments) {
    const key = [
      attachment.kind,
      attachment.path,
      attachment.lineRange?.startLine ?? '',
      attachment.lineRange?.endLine ?? '',
    ].join(':');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(attachment);
  }

  return deduped;
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

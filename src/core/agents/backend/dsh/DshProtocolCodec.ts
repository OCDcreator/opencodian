import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DshMcpServer } from '../../../types/settings';
import { confinedComponentWalk, isWithinRoot } from '../configuration/PathConfinement';

export type DshJsonValue = null | boolean | number | string | DshJsonValue[] | { [key: string]: DshJsonValue };
export type DshJsonObject = Record<string, DshJsonValue>;

/** Harness reverse requests use string ids; outgoing plugin requests retain numeric ids. */
export function parseDshRpcId(value: unknown): number | string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 ? value : null;
}

interface DshPromptRequest {
  readonly content: string;
  readonly images?: readonly { mediaType: string; data: string }[];
  readonly options?: Record<string, unknown>;
}

/** Validate the entire declaration batch before any server can be spawned or mounted. */
export function validateDshMcpServers(value: unknown): DshMcpServer[] {
  if (!Array.isArray(value)) throw new Error('DSH MCP servers must be an array');
  const names = new Set<string>();
  const strings = (entries: unknown, header = false): Array<{ name: string; value: string }> => {
    if (!Array.isArray(entries)) throw new Error('DSH MCP environment/headers must be arrays');
    const keys = new Set<string>();
    return entries.map((entry: unknown) => {
      if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.value !== 'string'
        || !(header ? /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/ : /^[A-Za-z_][A-Za-z0-9_]*$/).test(entry.name)
        || (header ? /[\r\n\0]/ : /\0/).test(entry.value)) throw new Error('Invalid DSH MCP environment/header entry');
      const key = header ? entry.name.toLowerCase() : entry.name;
      if (keys.has(key)) throw new Error('Duplicate DSH MCP environment/header entry');
      keys.add(key);
      return { name: entry.name, value: entry.value };
    });
  };
  return value.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(entry.name))
      throw new Error('Invalid DSH MCP server name');
    if (names.has(entry.name)) throw new Error('Duplicate DSH MCP server name');
    names.add(entry.name);
    if (entry.type === 'http') {
      let url: URL;
      try { url = new URL(String(entry.url)); } catch { throw new Error('Invalid DSH MCP HTTP URL'); }
      if (!['http:', 'https:'].includes(url.protocol) || typeof entry.url !== 'string' || /[\r\n\0]/.test(entry.url))
        throw new Error('DSH MCP requires an absolute HTTP(S) URL');
      return { type: 'http', name: entry.name, url: entry.url, headers: strings(entry.headers ?? [], true) };
    }
    if (entry.type !== undefined && entry.type !== 'stdio') throw new Error('Unsupported DSH MCP transport');
    if (typeof entry.command !== 'string' || !path.isAbsolute(entry.command) || /[\r\n\0]/.test(entry.command))
      throw new Error('DSH MCP command must be an absolute executable path');
    if (!Array.isArray(entry.args) || !entry.args.every((arg) => typeof arg === 'string' && !arg.includes('\0')))
      throw new Error('DSH MCP arguments must be strings');
    return { name: entry.name, command: entry.command, args: [...entry.args] as string[], env: strings(entry.env ?? []) };
  });
}

function dshImageBlock(mediaType: unknown, data: unknown): DshJsonObject {
  if (typeof mediaType !== 'string' || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)
    || typeof data !== 'string' || !data.length || data.length > 28 * 1024 * 1024
    || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)
    || Buffer.from(data, 'base64').toString('base64') !== data)
    throw new Error('DSH images require PNG, JPEG, WebP or GIF with canonical base64 data');
  return { type: 'image', mimeType: mediaType, data };
}

export function dshContentBlockText(content: DshJsonObject | null): string {
  if (typeof content?.text === 'string') return content.text;
  if (content?.type === 'image') {
    try {
      const block = dshImageBlock(content.mimeType, content.data);
      return `\n![DeepSeek Harness image](data:${String(block.mimeType)};base64,${String(block.data)})\n`;
    } catch { return '[DeepSeek Harness returned an invalid or unsupported image]'; }
  }
  if (content?.type === 'diff' && typeof content.newText === 'string')
    return `\n\`\`\`diff\n${String(content.oldText ?? '').split('\n').map((line) => `-${line}`).join('\n')}\n${content.newText.split('\n').map((line) => `+${line}`).join('\n')}\n\`\`\`\n`;
  return '';
}

export function buildDshPromptBlocks(request: DshPromptRequest, prefix: string, suffix: string, supportsImages: boolean): DshJsonObject[] {
  const blocks: DshJsonObject[] = [];
  const coveredImages = new Map<string, number>();
  const parts = Array.isArray(request.options?.requestParts) ? request.options.requestParts : [];
  let hasContent = false;
  const appendText = (text: string, separator: string) => {
    if (!text) return;
    const last = blocks.at(-1);
    if (last?.type === 'text') last.text = `${String(last.text)}${separator}${text}`;
    else blocks.push({ type: 'text', text });
  };
  appendText(prefix, '');
  if (!parts.some((value) => { const part = asRecord(value); return part?.type === 'text' && typeof part.text === 'string' && part.text.length > 0; })) {
    appendText(request.content, '');
    hasContent = Boolean(request.content);
  }
  for (const value of parts) {
    const part = asRecord(value);
    if (part?.type === 'text' && typeof part.text === 'string') {
      appendText(part.text, hasContent ? '\n' : '');
    } else if (part?.type === 'file') {
      const block = dshAttachmentBlock(part);
      if (block.type === 'text') appendText(String(block.text), '\n\n');
      else {
        if (block.type === 'image') {
          if (!supportsImages) throw new Error('DeepSeek Harness did not advertise image prompts for this connection');
          const key = `${String(block.mimeType)}:${String(block.data)}`;
          coveredImages.set(key, (coveredImages.get(key) ?? 0) + 1);
        }
        blocks.push(block);
      }
    } else throw new Error('DSH received an unsupported structured prompt part');
    hasContent = true;
  }
  appendDshImages(blocks, request.images ?? [], coveredImages, supportsImages);
  appendText(suffix, '\n\n');
  return blocks;
}

/** Resolve explicitly attached Vault image files before synchronous wire validation. */
export async function prepareDshPromptBlocks(request: DshPromptRequest,
  options: { prefix: string; suffix: string; supportsImages: boolean; attachmentRoot: string }): Promise<DshJsonObject[]> {
  const { prefix, suffix, supportsImages, attachmentRoot } = options;
  const parts = [];
  for (const value of Array.isArray(request.options?.requestParts) ? request.options.requestParts : []) {
    const part = asRecord(value);
    if (part?.type !== 'file' || typeof part.mime !== 'string' || !part.mime.startsWith('image/')
      || typeof part.url !== 'string' || !part.url.startsWith('file:')) { parts.push(value); continue; }
    if (!supportsImages) throw new Error('DeepSeek Harness did not advertise image prompts for this connection');
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(part.mime))
      throw new Error('DSH images require PNG, JPEG, WebP or GIF');
    const root = path.resolve(attachmentRoot);
    const target = fileURLToPath(part.url);
    if (!isWithinRoot(root, target)) throw new Error('DSH image attachment is outside the Vault');
    const canonical = await confinedComponentWalk(await realpath(root), path.relative(root, target).split(path.sep).filter(Boolean));
    const handle = await open(canonical, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size <= 0 || stat.size > 20 * 1024 * 1024)
        throw new Error('DSH image attachment must be a nonempty file of at most 20 MiB');
      const data = Buffer.alloc(stat.size + 1);
      let size = 0;
      while (size < data.length) {
        const read = await handle.read(data, size, data.length - size, null);
        if (!read.bytesRead) break;
        size += read.bytesRead;
      }
      if (size !== stat.size) throw new Error('DSH image attachment changed while reading');
      parts.push({ ...part, url: `data:${part.mime};base64,${data.subarray(0, size).toString('base64')}` });
    } finally { await handle.close(); }
  }
  return buildDshPromptBlocks({ ...request, options: { ...request.options, requestParts: parts } }, prefix, suffix, supportsImages);
}

function appendDshImages(blocks: DshJsonObject[], images: NonNullable<DshPromptRequest['images']>, covered: Map<string, number>, supported: boolean): void {
  for (const image of images) {
    if (!supported) throw new Error('DeepSeek Harness did not advertise image prompts for this connection');
    const block = dshImageBlock(image.mediaType, image.data);
    const key = `${String(block.mimeType)}:${String(block.data)}`;
    const count = covered.get(key) ?? 0;
    // Deduplicate the two representations, retaining intentional repetition within either one.
    if (count > 0) covered.set(key, count - 1);
    else blocks.push(block);
  }
}

function dshAttachmentBlock(part: DshJsonObject): DshJsonObject {
  const source = asRecord(part.source);
  const selection = asRecord(source?.text);
  const label = String(source?.path ?? part.filename ?? 'file');
  const url = typeof part.url === 'string' ? part.url : '';
  if (typeof part.mime === 'string' && part.mime.startsWith('image/')) {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
    if (!match || match[1] !== part.mime) throw new Error('DSH image attachment must include its base64 payload');
    return dshImageBlock(match[1], match[2]);
  }
  let text = typeof selection?.value === 'string' ? selection.value : undefined;
  if (text === undefined && url.startsWith('data:text/')) {
    const comma = url.indexOf(',');
    if (comma < 0) throw new Error('Invalid DSH text attachment');
    text = url.slice(0, comma).endsWith(';base64')
      ? Buffer.from(url.slice(comma + 1), 'base64').toString('utf8') : decodeURIComponent(url.slice(comma + 1));
  }
  if (text !== undefined) return { type: 'text', text: `[Attached file: ${label}]\n${text}` };
  if (/^(?:file|https?):/.test(url)) return { type: 'resource_link', name: label, uri: url,
    ...(typeof part.mime === 'string' ? { mimeType: part.mime } : {}) };
  throw new Error('DSH attachment has no supported content or resource link');
}

function asRecord(value: unknown): DshJsonObject | null {
  return isRecord(value) ? value as DshJsonObject : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export const DSH_ACP_PROTOCOL_VERSION = 1;

export function validateDshHandshake(handshake: DshJsonObject): void {
  if (handshake.protocolVersion !== DSH_ACP_PROTOCOL_VERSION) {
    throw new Error(`DSH ACP protocol version mismatch: expected ${DSH_ACP_PROTOCOL_VERSION}, got ${String(handshake.protocolVersion)}`);
  }
  const agentInfo = isRecord(handshake.agentInfo) ? handshake.agentInfo : null;
  if (!agentInfo || typeof agentInfo.name !== 'string' || typeof agentInfo.version !== 'string') {
    throw new Error('DSH ACP initialize returned invalid agentInfo');
  }
  if (!isRecord(handshake.agentCapabilities) || !Array.isArray(handshake.authMethods)) {
    throw new Error('DSH ACP initialize returned invalid capabilities');
  }
}

/**
 * UrlContextFetchService — R-E1 (advantage-parity): local webpage fetch for
 * URL context chips.
 *
 * Copilot resolves URLs/YouTube/Twitter in the cloud; this implementation is
 * strictly local-first and rides the existing `<obsidian_context>` channel,
 * so every backend consumes it identically.
 *
 * SSRF discipline (the plugin itself runs local servers, so loopback matters):
 * - scheme must be http/https; hostnames that are private/loopback/reserved
 *   IP literals (or localhost/.local variants) are refused before any socket
 *   opens;
 * - the hostname is DNS-resolved up front and refused when ANY resolved
 *   address is private/loopback/reserved (first-hop DNS rebinding);
 * - redirects are followed MANUALLY through node:http(s) (Obsidian's
 *   requestUrl follows redirects opaquely), and EVERY hop re-runs the same
 *   DNS + literal guard — a redirect pointing back into 127.0.0.1 or an
 *   intranet range is rejected (`blocked-private-target`);
 * - at most 5 hops, 15s per request, and a hard response byte cap.
 *
 * Conversion is a documented zero-dependency regex downgrade (the requirement
 * explicitly allows it): script/style/noscript/template/svg/head are dropped,
 * common block/inline elements map to markdown, entities decode, and the
 * result is truncated to the shared context byte budget with `truncated`
 * marked. YouTube watch links only count as context when the converted page
 * yields real text (a watch page without a transcript does not) — otherwise
 * the item is marked failed with `youtube-transcript-unavailable`, honestly.
 */

import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';

import type { PromptContextItem } from '../../../core/types';
import type { UrlContextMeta } from '../../../core/types/chat';
import { createLogger } from '../../../shared';

const logger = createLogger('UrlContextFetchService');

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECT_HOPS = 5;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
/** Shared context byte budget (serializer remote cap), with headroom for the tag header. */
const MAX_SNAPSHOT_BYTES = 60 * 1024;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com']);
const YOUTUBE_MIN_BODY_CHARS = 300;
const USER_AGENT = 'Mozilla/5.0 (compatible; OpenCodian/1.0; Obsidian plugin)';

// ─── SSRF guards (pure, exported for tests) ───────────────────────────────

/** Private/loopback/reserved IPv4 ranges (RFC1918 + 127/8 + 0/8 + 169.254/16 + 100.64/10 + 192.0.0/24 + 198.18/15). */
export function isPrivateIpv4(address: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!match) {
    return false;
  }
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return false;
  }
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  const inCarrierNat = a === 100 && b >= 64 && b <= 127;
  const inLinkLocal = a === 169 && b === 254;
  const inPrivate172 = a === 172 && b >= 16 && b <= 31;
  const inPrivate192 = (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19));
  return inCarrierNat || inLinkLocal || inPrivate172 || inPrivate192;
}

/** Loopback / unique-local / link-local IPv6 (and IPv4-mapped private ranges). */
export function isPrivateIpv6(address: string): boolean {
  // URL.hostname keeps square brackets on IPv6 literals.
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::' || normalized === '::1') {
    return true;
  }
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (mapped) {
    return isPrivateIpv4(mapped[1]);
  }
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) {
    return true; // fc00::/7 unique local
  }
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) {
    return true; // fe80::/10 link local
  }
  return false;
}

export function isPrivateIpAddress(address: string): boolean {
  return address.includes(':') ? isPrivateIpv6(address) : isPrivateIpv4(address);
}

/** Hostnames that must never be fetched: private IP literals + localhost family. */
export function isBlockedHostnameLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) {
    return true;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return isPrivateIpAddress(host);
  }
  if (/^[0-9a-f:]+$/i.test(host) && host.includes(':')) {
    return isPrivateIpv6(host);
  }
  return false;
}

/** Parse + validate a fetch URL; returns the hostname or a rejection reason. */
export function extractFetchableHostname(rawUrl: string): { hostname: string } | { rejection: UrlContextMeta['failureReason'] | 'invalid-url' } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { rejection: 'invalid-url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { rejection: 'invalid-url' };
  }
  if (isBlockedHostnameLiteral(parsed.hostname)) {
    return { rejection: 'blocked-private-target' };
  }
  return { hostname: parsed.hostname };
}

/** DNS seam (injectable for tests). */
export type HostResolver = (hostname: string) => Promise<string[]>;

export const nodeHostResolver: HostResolver = async (hostname) => {
  const results = await dns.promises.lookup(hostname, { all: true });
  return results.map((entry) => entry.address);
};

// ─── Transport (manual redirects; injectable for tests) ───────────────────

export interface UrlFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  bodyText: string;
}

export type UrlFetchTransport = (
  startUrl: string,
  guard: (url: string) => Promise<void>,
) => Promise<UrlFetchResult>;

function fetchOnce(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; location?: string; chunks: Buffer[] }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.request(
      parsed,
      {
        method: 'GET',
        timeout: FETCH_TIMEOUT_MS,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
          'accept-encoding': 'identity',
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let received = 0;
        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_RESPONSE_BYTES) {
            request.destroy(new Error('response exceeds byte cap'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            location: typeof response.headers.location === 'string'
              ? response.headers.location
              : undefined,
            chunks,
          });
        });
        response.on('error', reject);
      },
    );
    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', reject);
    request.end();
  });
}

export const nodeUrlFetchTransport: UrlFetchTransport = async (startUrl, guard) => {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    await guard(url);
    const response = await fetchOnce(url);
    const isRedirect = response.status >= 300 && response.status < 400 && Boolean(response.location);
    if (!isRedirect) {
      return {
        finalUrl: url,
        status: response.status,
        contentType: String(response.headers['content-type'] ?? ''),
        bodyText: Buffer.concat(response.chunks).toString('utf8'),
      };
    }
    url = new URL(response.location!, url).href;
  }
  throw new Error('too many redirects');
};

// ─── HTML → markdown-lite (documented regex downgrade) ────────────────────

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201c',
  rdquo: '\u201d',
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

/** Drop every non-content region before any conversion (scripts/styles never render). */
function stripNonContentRegions(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<script\b[^>]*\/>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, ' ')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, ' ')
    .replace(/<(iframe|canvas|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
}

/**
 * Zero-dependency HTML → markdown downgrade (requirement-sanctioned).
 * Structural fidelity is best-effort: headings, lists, links, emphasis,
 * blockquotes, and code fences survive; everything else degrades to
 * paragraphs. Entities decode; whitespace collapses.
 */
export function convertHtmlToMarkdownLite(html: string): { title: string; markdown: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';

  let text = stripNonContentRegions(html);

  // Fenced code first (protect content from inline transforms).
  const codeBlocks: string[] = [];
  text = text.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_match, code: string) => {
    const cleaned = decodeHtmlEntities(code.replace(/<[^>]+>/g, '')).replace(/\s+$/g, '');
    codeBlocks.push(cleaned);
    return `\n\n@@OPENCODIAN_CODE_BLOCK_${codeBlocks.length - 1}@@\n\n`;
  });

  text = text
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_m, level: string, inner: string) => {
      const depth = '#'.repeat(Number(level));
      return `\n\n${depth} ${inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}\n\n`;
    })
    .replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, href: string, inner: string) => {
      const label = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      return label && href ? `[${label}](${href})` : label;
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_m, _tag, inner: string) => `**${inner.replace(/<[^>]+>/g, '').trim()}**`)
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_m, _tag, inner: string) => `*${inner.replace(/<[^>]+>/g, '').trim()}*`)
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote\s*>/gi, (_m, inner: string) => {
      const quoted = inner
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return `\n\n> ${quoted}\n\n`;
    })
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi, (_m, inner: string) => `\n- ${inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`)
    .replace(/<hr\b[^>]*\/?>/gi, '\n\n---\n\n')
    .replace(/<br\b[^>]*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|main|ul|ol|table|tr|figure)\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');

  text = decodeHtmlEntities(text)
    .replace(/@@OPENCODIAN_CODE_BLOCK_(\d+)@@/g, (_m, index: string) => {
      const code = codeBlocks[Number(index)] ?? '';
      return `\n\n\`\`\`\n${code}\n\`\`\`\n\n`;
    })
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, markdown: text };
}

// ─── Service ───────────────────────────────────────────────────────────────

export interface UrlContextFetchOptions {
  transport?: UrlFetchTransport;
  resolveHost?: HostResolver;
  maxSnapshotBytes?: number;
}

function isYouTubeUrl(url: string): boolean {
  try {
    return YOUTUBE_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** UTF-8 byte length with the jsdom-safe fallback (serializer convention). */
function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return Buffer.byteLength(text, 'utf8');
}

/** Truncate by UTF-8 bytes (never splits a surrogate pair mid-sequence by cutting code points). */
function truncateToBytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (utf8ByteLength(text) <= maxBytes) {
    return { text, truncated: false };
  }
  let length = text.length;
  while (length > 0 && utf8ByteLength(text.slice(0, length)) > maxBytes) {
    length -= 200;
  }
  return { text: `${text.slice(0, Math.max(0, length)).trimEnd()}…`, truncated: true };
}

export class UrlContextFetchService {
  private readonly transport: UrlFetchTransport;
  private readonly resolveHost: HostResolver;
  private readonly maxSnapshotBytes: number;

  constructor(options: UrlContextFetchOptions = {}) {
    this.transport = options.transport ?? nodeUrlFetchTransport;
    this.resolveHost = options.resolveHost ?? nodeHostResolver;
    this.maxSnapshotBytes = options.maxSnapshotBytes ?? MAX_SNAPSHOT_BYTES;
  }

  /**
   * Fetch one pending URL context item and return the item copy with the
   * honest verdict (ok with snapshot / failed with reason). Never throws —
   * every failure becomes `status: 'failed'` on the item.
   */
  async fetchItem(item: PromptContextItem): Promise<PromptContextItem> {
    const meta: UrlContextMeta = item.url ?? {
      href: item.path,
      status: 'pending',
      contentChars: 0,
      truncated: false,
    };
    const fail = (failureReason: UrlContextMeta['failureReason']): PromptContextItem => ({
      ...item,
      textSnapshot: undefined,
      url: { ...meta, status: 'failed', failureReason, fetchedAt: Date.now(), contentChars: 0, truncated: false },
    });

    const hostnameResult = extractFetchableHostname(meta.href);
    if ('rejection' in hostnameResult) {
      return fail(hostnameResult.rejection === 'invalid-url' ? 'fetch-error' : 'blocked-private-target');
    }
    try {
      const addresses = await this.resolveHost(hostnameResult.hostname);
      if (addresses.length === 0 || addresses.some((address) => isPrivateIpAddress(address))) {
        return fail('blocked-private-target');
      }
    } catch {
      return fail('fetch-error');
    }

    const guard = async (url: string): Promise<void> => {
      const hop = extractFetchableHostname(url);
      if ('rejection' in hop) {
        throw new Error(hop.rejection === 'invalid-url' ? 'invalid-url' : 'blocked-private-target');
      }
      const hopAddresses = await this.resolveHost(hop.hostname);
      if (hopAddresses.some((address) => isPrivateIpAddress(address))) {
        throw new Error('blocked-private-target');
      }
    };

    let result: UrlFetchResult;
    try {
      result = await this.transport(meta.href, guard);
    } catch (error) {
      const message = String(error);
      if (message.includes('blocked-private-target')) {
        return fail('blocked-private-target');
      }
      if (message.includes('timeout')) {
        return fail('timeout');
      }
      logger.warn('URL context fetch failed', { href: meta.href, message });
      return fail('fetch-error');
    }

    if (result.status < 200 || result.status >= 300) {
      return fail('fetch-error');
    }
    const contentType = result.contentType.toLowerCase();
    if (!contentType.includes('html') && !contentType.includes('xml') && !contentType.includes('text/plain')) {
      return fail('non-http-response');
    }

    const { title, markdown } = convertHtmlToMarkdownLite(result.bodyText);
    const bodyWithoutTitle = markdown.replace(/^#\s+.*$/m, '').trim();
    if (isYouTubeUrl(result.finalUrl) && bodyWithoutTitle.length < YOUTUBE_MIN_BODY_CHARS) {
      // Honest YouTube verdict: no transcript text on the page → no context.
      return fail('youtube-transcript-unavailable');
    }
    if (markdown.length === 0) {
      return fail('empty-content');
    }
    const capped = truncateToBytes(markdown, this.maxSnapshotBytes);
    return {
      ...item,
      textSnapshot: capped.text,
      url: {
        ...meta,
        status: 'ok',
        finalUrl: result.finalUrl,
        title,
        fetchedAt: Date.now(),
        contentChars: capped.text.length,
        truncated: capped.truncated,
      },
    };
  }

  /** Fetch every pending URL item in parallel; resolved items pass through. */
  async resolvePendingItems(items: readonly PromptContextItem[]): Promise<PromptContextItem[]> {
    const pending = items.filter((item) => item.kind === 'url' && item.url?.status !== 'ok');
    if (pending.length === 0) {
      return [...items];
    }
    const fetched = await Promise.all(pending.map((item) => this.fetchItem(item)));
    // Match by item id: several chips may legitimately share one href.
    const byId = new Map(fetched.map((item) => [item.id, item]));
    return items.map((item) => byId.get(item.id) ?? item);
  }
}

/** Pure builder for the composer paste path: a pending URL chip. */
export function buildPendingUrlContextItem(href: string): PromptContextItem {
  return {
    id: `url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'url',
    path: href,
    label: href,
    mime: 'text/html',
    origin: 'manual',
    url: {
      href,
      status: 'pending',
      contentChars: 0,
      truncated: false,
    },
  };
}

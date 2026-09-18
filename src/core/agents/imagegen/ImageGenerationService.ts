/**
 * ImageGenerationService — plugin-side text-to-image model invocation (R-C2).
 *
 * docs/requirements/flowtext-c2-design.md §3.2: a standalone lightweight HTTP
 * client, deliberately NOT routed through any agent backend session (§11.3)
 * and NOT reusing the chat vision input serialization (§11.4 — opposite
 * direction). Phase 1 wire format is OpenAI images-compatible
 * (`POST {baseURL}/images/generations`); the `apiFormat` enum in settings is
 * reserved for later formats.
 *
 * Fail-closed contract (design §3.2/§4.7):
 * - non-2xx always fails (401/402/429 → `quota`, everything else → `http`);
 * - a response without a decodable known image format fails (no b64/URL
 *   guessing: only `data[0].b64_json` is accepted);
 * - bytes over `IMAGE_GENERATION_MAX_ASSET_BYTES` fail with `size-limit`;
 * - timeout and abort fail; there is NO automatic retry (retrying is the
 *   user clicking again).
 *
 * The class itself is transport-injected and Obsidian-free so it is directly
 * unit-testable; `createRequestUrlImageGenTransport` provides the production
 * transport over Obsidian's `requestUrl` (same transport selection rationale
 * as `src/core/opencode/sdkFetch.ts`).
 */

import { requestUrl } from 'obsidian';

import type { ImageGenerationModelConfig } from '../../types/settings';

/** Hard generation deadline (ms). Design constant — calibrated against real providers later (§7). */
export const IMAGE_GENERATION_TIMEOUT_MS = 120_000;
/** Hard per-asset size cap (bytes). Oversized responses are rejected, never truncated. */
export const IMAGE_GENERATION_MAX_ASSET_BYTES = 25 * 1024 * 1024;

/** Image formats the plugin accepts for generated assets (nothing else decodes). */
export type ImageGenerationMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

/** Failure classes surfaced to the UI (design §3.2); no other kinds exist. */
export type ImageGenerationFailureKind = 'timeout' | 'quota' | 'http' | 'network' | 'size-limit';

export type ImageGenerationResult =
  | { ok: true; bytes: ArrayBuffer; mimeType: ImageGenerationMimeType }
  | { ok: false; error: string; kind: ImageGenerationFailureKind };

/** The single HTTP verb the images API needs; injectable for tests. */
export interface ImageGenTransport {
  postJson(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
  ): Promise<{ status: number; body: ArrayBuffer }>;
}

export interface BuiltImageGenerationRequest {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

/** Join the API root with the images path, tolerating trailing slashes. */
function joinImagesEndpoint(baseURL: string): string {
  return `${baseURL.replace(/\/+$/, '')}/images/generations`;
}

/**
 * Tolerant config-field read (§6.4 fail-closed): `normalizeImageGenerationModels`
 * supplies every field, but `saveSettings()` does not re-normalize, so a
 * hand-edited or programmatically written `data.json` entry can reach this
 * module with missing/non-string fields. Those read as absent — the request
 * builder must never throw; `generate` reports the normal `{ ok:false }`
 * failure shape with a clear reason instead of an unhandled TypeError.
 */
function configText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Build the OpenAI images-compatible request (pure). `response_format` is
 * intentionally NOT sent: `gpt-image-1` rejects the parameter, and the
 * decoder only accepts `b64_json` payloads anyway (fail closed over
 * URL-following, design §4.7).
 */
export function buildImageGenerationRequest(
  config: Pick<ImageGenerationModelConfig, 'baseURL' | 'apiKey' | 'model' | 'size'>,
  prompt: string,
): BuiltImageGenerationRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = configText(config.apiKey);
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }
  const body: Record<string, unknown> = { model: configText(config.model).trim(), prompt, n: 1 };
  const size = configText(config.size).trim();
  if (size) {
    body.size = size;
  }
  return { url: joinImagesEndpoint(configText(config.baseURL)), headers, body };
}

/** Minimal base64 → bytes that works in the Electron renderer and under Node tests. */
function decodeBase64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s+/g, '');
  if (typeof atob === 'function') {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(normalized, 'base64'));
}

/** One signature segment: byte values compared at a fixed byte offset. */
interface ImageSignaturePart {
  readonly offset: number;
  readonly bytes: readonly number[];
}

const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Known image signatures; a mime matches when ALL of its parts match. */
const IMAGE_MIME_SIGNATURES: ReadonlyArray<{
  readonly mimeType: ImageGenerationMimeType;
  readonly parts: readonly ImageSignaturePart[];
}> = [
  { mimeType: 'image/png', parts: [{ offset: 0, bytes: PNG_SIGNATURE }] },
  { mimeType: 'image/jpeg', parts: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] },
  {
    mimeType: 'image/webp',
    parts: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    ],
  },
];

function matchesSignaturePart(bytes: Uint8Array, part: ImageSignaturePart): boolean {
  return part.bytes.every(
    (value, index) => bytes.length > part.offset + index && bytes[part.offset + index] === value,
  );
}

/** Signature-sniff the image type; anything else is unsupported (never guessed). */
export function sniffImageMimeType(bytes: Uint8Array): ImageGenerationMimeType | null {
  for (const candidate of IMAGE_MIME_SIGNATURES) {
    if (candidate.parts.every((part) => matchesSignaturePart(bytes, part))) {
      return candidate.mimeType;
    }
  }
  return null;
}

interface ImageApiResponseShape {
  data?: Array<{ b64_json?: unknown; url?: unknown }>;
  error?: { message?: unknown } | string;
}

/** UTF-8 decode with a Buffer fallback (some test/worker envs lack TextDecoder). */
function decodeBodyText(body: ArrayBuffer): string {
  if (typeof TextDecoder === 'function') {
    return new TextDecoder().decode(body);
  }
  return Buffer.from(body).toString('utf8');
}

function parseResponseBody(body: ArrayBuffer): ImageApiResponseShape | null {
  try {
    const parsed: unknown = JSON.parse(decodeBodyText(body));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ImageApiResponseShape;
    }
    return null;
  } catch {
    return null;
  }
}

/** Extract the provider's error message when the body carries one (never echo credentials). */
function describeHttpFailure(status: number, body: ArrayBuffer): string {
  const parsed = parseResponseBody(body);
  const message = typeof parsed?.error === 'object'
    ? parsed.error.message
    : parsed?.error;
  const detail = typeof message === 'string' && message.trim() ? `: ${message.trim()}` : '';
  return `HTTP ${status}${detail}`;
}

/**
 * Decode an images-compatible response (pure). Only `data[0].b64_json` is a
 * success; a URL-only payload is an explicit failure, not a fetch trigger.
 */
export function decodeImageGenerationResponse(
  status: number,
  body: ArrayBuffer,
): ImageGenerationResult {
  if (status < 200 || status >= 300) {
    const kind: ImageGenerationFailureKind = status === 401 || status === 402 || status === 429
      ? 'quota'
      : 'http';
    return { ok: false, error: describeHttpFailure(status, body), kind };
  }
  const parsed = parseResponseBody(body);
  const payload = parsed?.data?.[0]?.b64_json;
  if (typeof payload !== 'string' || !payload.trim()) {
    return {
      ok: false,
      error: 'Response contains no b64_json image data (url-only responses are not followed)',
      kind: 'http',
    };
  }
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64ToBytes(payload);
  } catch {
    return { ok: false, error: 'Response image payload is not valid base64', kind: 'http' };
  }
  if (bytes.byteLength > IMAGE_GENERATION_MAX_ASSET_BYTES) {
    return {
      ok: false,
      error: `Generated image exceeds the ${IMAGE_GENERATION_MAX_ASSET_BYTES} byte limit`,
      kind: 'size-limit',
    };
  }
  const mimeType = sniffImageMimeType(bytes);
  if (!mimeType) {
    return { ok: false, error: 'Response image bytes are not PNG, JPEG, or WEBP', kind: 'http' };
  }
  return { ok: true, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, mimeType };
}

export class ImageGenerationService {
  constructor(private readonly transport: ImageGenTransport) {}

  async generate(
    config: ImageGenerationModelConfig,
    prompt: string,
    signal?: AbortSignal,
    timeoutMs: number = IMAGE_GENERATION_TIMEOUT_MS,
  ): Promise<ImageGenerationResult> {
    if (!configText(config.baseURL).trim() || !configText(config.model).trim()) {
      return { ok: false, error: 'Image generation model is not configured (baseURL/model missing)', kind: 'http' };
    }
    if (signal?.aborted) {
      return { ok: false, error: 'Image generation aborted', kind: 'network' };
    }
    const request = buildImageGenerationRequest(config, prompt);
    let response: { status: number; body: ArrayBuffer };
    try {
      response = await this.raceTransport(request, timeoutMs, signal);
    } catch (error) {
      if (error instanceof ImageGenerationTimeoutError) {
        return { ok: false, error: `Image generation timed out after ${timeoutMs} ms`, kind: 'timeout' };
      }
      if (error instanceof ImageGenerationAbortError) {
        return { ok: false, error: 'Image generation aborted', kind: 'network' };
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        kind: 'network',
      };
    }
    return decodeImageGenerationResponse(response.status, response.body);
  }

  /** Race the transport against the deadline and the abort signal. */
  private raceTransport(
    request: BuiltImageGenerationRequest,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: ArrayBuffer }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new ImageGenerationTimeoutError());
      }, timeoutMs);
      const onAbort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new ImageGenerationAbortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.transport.postJson(request.url, request.headers, request.body, timeoutMs)
        .then((result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          resolve(result);
        })
        .catch((error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          reject(error);
        });
    });
  }
}

/** Internal deadline marker (mapped to `kind: 'timeout'`). */
export class ImageGenerationTimeoutError extends Error {
  constructor() {
    super('image generation deadline exceeded');
    this.name = 'ImageGenerationTimeoutError';
  }
}

/** Internal abort marker (mapped to `kind: 'network'` + "aborted" message). */
export class ImageGenerationAbortError extends Error {
  constructor() {
    super('image generation aborted');
    this.name = 'ImageGenerationAbortError';
  }
}

/**
 * Production transport over Obsidian `requestUrl` (bypasses CORS, desktop +
 * mobile). `timeoutMs` is advisory here — the service's own deadline race is
 * the enforcing authority, because `requestUrl` exposes no abort handle.
 */
export function createRequestUrlImageGenTransport(): ImageGenTransport {
  return {
    async postJson(url, headers, body) {
      const response = await requestUrl({
        url,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        throw: false,
      });
      return { status: response.status, body: response.arrayBuffer };
    },
  };
}

// --- embed reference construction (shared by both entry points) --------------

/** Insertion forms (R-C2 acceptance 2): exclusive block line, or inline wrap. */
export type ImageEmbedForm = 'line' | 'inline';

/** Normalize the `|width` suffix; non-positive widths mean natural size (§5 test 3). */
export function imageEmbedWidthSuffix(width: number): string {
  if (!Number.isFinite(width) || width <= 0) {
    return '';
  }
  return `|${Math.round(width)}`;
}

/**
 * Build the `![[...]]` embed text for one generated asset.
 *
 * - `inline`: exactly the embed, inserted at the cursor (FlowText wrap form);
 * - `line`: the embed padded with a blank line before and after so it owns
 *   its own block regardless of where the anchor sat (design §3.4 step 2).
 *   The padding is deliberate feature behaviour — consumers must NOT run it
 *   through `normalizeInsertionText`, which strips blank edge lines.
 */
export function buildImageEmbedText(path: string, width: number, form: ImageEmbedForm): string {
  const embed = `![[${path}${imageEmbedWidthSuffix(width)}]]`;
  return form === 'line' ? `\n\n${embed}\n\n` : embed;
}

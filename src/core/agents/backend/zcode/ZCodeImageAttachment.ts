/**
 * ZCodeImageAttachment — local validation for image attachments and the
 * honest availability decision for the ZCode protocol surface.
 *
 * The official app-server accepts the desktop attachment input shape
 * `{kind:"image", filename, mimeType, sizeBytes, dataBase64}` and converts it
 * to a model-visible data URL before calling the native agent. Keep validation
 * and wire mapping together so an image is never silently downgraded to
 * metadata.
 */

import type { ImageAttachment, StreamChunk } from '../../../types/chat';

/** Media types accepted by the OpenCodian image flow. */
const SUPPORTED_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * Decoded-size cap below the app-server's 8 MiB NDJSON frame bound. Base64
 * expands the image by 4/3, leaving room for the enclosing request frame.
 */
export const ZCODE_IMAGE_MAX_DECODED_BYTES = 5 * 1024 * 1024;

export type ZCodeImageValidation =
  | { readonly ok: true; readonly decodedBytes: number }
  | {
      readonly ok: false;
      readonly reason: 'missing-data' | 'malformed-type' | 'malformed-base64' | 'oversized';
      readonly detail: string;
    };

/**
 * Validate one attachment locally. Any failure returns an actionable reason;
 * nothing here ever touches the network.
 */
export function validateZCodeImageAttachment(image: ImageAttachment, index: number): ZCodeImageValidation {
  const label = `Attachment #${index + 1}`;
  if (!SUPPORTED_MEDIA_TYPES.has(image.mediaType)) {
    return {
      ok: false,
      reason: 'malformed-type',
      detail: `${label}: unsupported media type "${image.mediaType}" (supported: image/png, image/jpeg, image/gif, image/webp).`,
    };
  }
  const data = (image.data ?? '').trim();
  if (data.length === 0) {
    return { ok: false, reason: 'missing-data', detail: `${label}: the image has no data (empty or unreadable).` };
  }
  const normalized = data.replace(/\s/g, '');
  if (normalized.length % 4 !== 0) {
    return { ok: false, reason: 'malformed-base64', detail: `${label}: the image data is not well-formed base64.` };
  }
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    const isAlphabet = (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57) || code === 43 || code === 47;
    if (!isAlphabet && !(code === 61 && i >= normalized.length - padding)) {
      return { ok: false, reason: 'malformed-base64', detail: `${label}: the image data is not well-formed base64.` };
    }
  }
  const decodedBytes = normalized.length / 4 * 3 - padding;
  if (decodedBytes === 0) {
    return { ok: false, reason: 'missing-data', detail: `${label}: the image data decodes to zero bytes.` };
  }
  if (decodedBytes > ZCODE_IMAGE_MAX_DECODED_BYTES) {
    return {
      ok: false,
      reason: 'oversized',
      detail: `${label}: the image is ${decodedBytes} bytes after decoding, over the ${ZCODE_IMAGE_MAX_DECODED_BYTES} byte limit.`,
    };
  }
  return { ok: true, decodedBytes };
}

/**
 * The honest availability verdict for image sends on the ZCode protocol
 * surface (verified against the official runtime — see module header).
 */
export function zCodeImageAttachmentsUnavailableDetail(): string {
  return 'The selected ZCode model does not report image input support. Choose a model with image input enabled; the user message was not sent and no partial turn was started.';
}

export interface ZCodeImageInput {
  readonly kind: 'image';
  readonly filename: string;
  readonly mimeType: ImageAttachment['mediaType'];
  readonly sizeBytes: number;
  readonly dataBase64: string;
}

/** Convert a validated OpenCodian image into the native app-server input. */
export function toZCodeImageInput(image: ImageAttachment, index: number): ZCodeImageInput {
  const validation = validateZCodeImageAttachment(image, index);
  if (!validation.ok) throw new Error(validation.detail);
  return {
    kind: 'image',
    filename: image.filename?.trim() || `attachment-${index + 1}`,
    mimeType: image.mediaType,
    sizeBytes: validation.decodedBytes,
    dataBase64: image.data.replace(/\s/g, ''),
  };
}

/** Rejection used when the live model catalog lacks image input support. */
export function zCodeImageModelUnavailableChunk(): StreamChunk {
  return { type: 'error', content: zCodeImageAttachmentsUnavailableDetail() };
}

export function hasInvalidZCodeImageAttachment(images: readonly ImageAttachment[]): boolean {
  return images.some((image, index) => !validateZCodeImageAttachment(image, index).ok);
}

/** Confirm the image-capable model after the native model-selection boundary. */
export async function verifyZCodeImageModelForSend(options: {
  readonly ensureSessionActive: () => Promise<void>;
  readonly readSession: () => Promise<Record<string, unknown>>;
  readonly captureSnapshot: (snapshot: unknown) => void;
  readonly currentModel: () => { providerId: string; modelId: string } | null;
  readonly supportsImages: () => boolean | null;
}): Promise<boolean> {
  if (options.supportsImages() !== true) return false;
  await options.ensureSessionActive();
  const snapshot = await options.readSession();
  options.captureSnapshot(snapshot);
  const settings = typeof snapshot['settings'] === 'object' && snapshot['settings'] !== null
    ? snapshot['settings'] as Record<string, unknown> : {};
  const model = typeof settings['model'] === 'object' && settings['model'] !== null
    ? settings['model'] as Record<string, unknown> : {};
  const native = typeof model['current'] === 'object' && model['current'] !== null
    ? model['current'] as Record<string, unknown> : {};
  const current = options.currentModel();
  return native['providerId'] === current?.providerId
    && native['modelId'] === current?.modelId
    && options.supportsImages() === true;
}

/**
 * The single rejection chunk for an image send: an actionable validation
 * failure for junk, the honest unavailable verdict for valid images — in both
 * cases the caller yields it and dispatches nothing (no partial turn).
 */
export function zCodeImageRejectionChunk(images: readonly ImageAttachment[]): StreamChunk {
  const failure = images
    .map((image, index) => validateZCodeImageAttachment(image, index))
    .map((result) => (result.ok ? null : result.detail))
    .find((detail) => detail !== null) ?? null;
  if (failure) {
    return { type: 'error', content: `${failure}\nThe user message was not sent; no partial turn was started.` };
  }
  return { type: 'error', content: zCodeImageAttachmentsUnavailableDetail() };
}

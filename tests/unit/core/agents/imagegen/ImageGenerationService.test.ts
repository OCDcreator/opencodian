/**
 * ImageGenerationService unit tests (R-C2, design §5 test 1).
 *
 * Pure request building, response decoding, and the fail-closed failure
 * matrix over a fake transport: b64 success, 401/402/429 → quota, timeout,
 * unknown format, size limit, abort. No Obsidian, no network.
 */

import {
  buildImageEmbedText,
  buildImageGenerationRequest,
  decodeImageGenerationResponse,
  IMAGE_GENERATION_MAX_ASSET_BYTES,
  ImageGenerationAbortError,
  ImageGenerationService,
  ImageGenerationTimeoutError,
  type ImageGenTransport,
  sniffImageMimeType,
} from '../../../../../src/core/agents/imagegen/ImageGenerationService';
import type { ImageGenerationModelConfig } from '../../../../../src/core/types';

const MODEL: ImageGenerationModelConfig = {
  id: 'm1',
  displayName: 'Test image model',
  apiFormat: 'openai-images',
  baseURL: 'https://api.example.com/v1/',
  apiKey: 'sk-test-secret',
  model: 'gpt-image-1',
  size: '1024x1024',
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];

/** Exact-size ArrayBuffer for a JSON payload (Buffer's pooled .buffer is larger). */
function jsonBuffer(value: unknown): ArrayBuffer {
  return Uint8Array.from(Buffer.from(JSON.stringify(value), 'utf8')).buffer as ArrayBuffer;
}

function pngBytes(size = 16): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_SIGNATURE);
  return bytes;
}

function b64(payload: Uint8Array): string {
  return Buffer.from(payload).toString('base64');
}

function okTransport(payload: Uint8Array): { transport: ImageGenTransport; calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    transport: {
      async postJson(url, headers, body) {
        calls.push({ url, headers, body });
        return { status: 200, body: jsonBuffer({ data: [{ b64_json: b64(payload) }] }) };
      },
    },
  };
}

describe('buildImageGenerationRequest (openai-images shape)', () => {
  it('joins the endpoint, authorizes, and sends model/prompt/n/size', () => {
    const request = buildImageGenerationRequest(MODEL, 'a lighthouse');
    expect(request.url).toBe('https://api.example.com/v1/images/generations');
    expect(request.headers['Content-Type']).toBe('application/json');
    expect(request.headers.Authorization).toBe('Bearer sk-test-secret');
    expect(request.body).toEqual({ model: 'gpt-image-1', prompt: 'a lighthouse', n: 1, size: '1024x1024' });
  });

  it('omits size and auth when absent and never sends response_format', () => {
    const request = buildImageGenerationRequest(
      { ...MODEL, apiKey: '  ', size: '' },
      'p',
    );
    expect(request.body).toEqual({ model: 'gpt-image-1', prompt: 'p', n: 1 });
    expect(request.headers.Authorization).toBeUndefined();
    expect(Object.keys(request.body)).not.toContain('response_format');
  });
});

describe('malformed config entries fail closed instead of throwing (§6.4)', () => {
  // A hand-edited / programmatically written data.json entry can bypass
  // normalizeImageGenerationModels; missing fields must read as absent.
  const malformed = (fields: Record<string, unknown>): Pick<ImageGenerationModelConfig, 'baseURL' | 'apiKey' | 'model' | 'size'> =>
    fields as unknown as Pick<ImageGenerationModelConfig, 'baseURL' | 'apiKey' | 'model' | 'size'>;

  it('treats a missing size like the empty (provider-default) size', () => {
    const request = buildImageGenerationRequest(malformed({
      baseURL: MODEL.baseURL,
      apiKey: MODEL.apiKey,
      model: MODEL.model,
    }), 'p');
    expect(request.body).toEqual({ model: 'gpt-image-1', prompt: 'p', n: 1 });
    expect(request.headers.Authorization).toBe('Bearer sk-test-secret');
  });

  it('treats missing apiKey as no auth header and tolerates non-string fields', () => {
    const request = buildImageGenerationRequest(malformed({
      baseURL: MODEL.baseURL,
      apiKey: undefined,
      model: MODEL.model,
      size: 42,
    }), 'p');
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.body).toEqual({ model: 'gpt-image-1', prompt: 'p', n: 1 });
  });

  it('generate resolves the normal http failure for an entry without baseURL/model fields', async () => {
    let called = 0;
    const service = new ImageGenerationService({
      async postJson() { called += 1; return { status: 200, body: new ArrayBuffer(0) }; },
    });
    const result = await service.generate(
      malformed({ baseURL: MODEL.baseURL, apiKey: MODEL.apiKey }),
      'p',
    );
    expect(result).toMatchObject({
      ok: false,
      kind: 'http',
      error: expect.stringContaining('not configured'),
    });
    expect(called).toBe(0);
  });

  it('generate proceeds (provider-default size) when only size is missing', async () => {
    const { transport, calls } = okTransport(pngBytes());
    const service = new ImageGenerationService(transport);
    const result = await service.generate(
      malformed({
        baseURL: MODEL.baseURL,
        apiKey: MODEL.apiKey,
        model: MODEL.model,
      }),
      'p',
      undefined,
      5_000,
    );
    expect(result).toMatchObject({ ok: true, mimeType: 'image/png' });
    expect(calls[0]).toMatchObject({ url: 'https://api.example.com/v1/images/generations' });
    expect((calls[0] as { body: Record<string, unknown> }).body).not.toHaveProperty('size');
  });
});

describe('decodeImageGenerationResponse', () => {
  it('decodes b64_json and sniffs the mime type', () => {
    const result = decodeImageGenerationResponse(200, jsonBuffer({ data: [{ b64_json: b64(pngBytes()) }] }));
    const bytes = result.ok ? result.bytes : null;
    expect(result).toMatchObject({ ok: true, mimeType: 'image/png' });
    expect(bytes && new Uint8Array(bytes)[0]).toBe(0x89);
  });

  it('maps 401/402/429 to quota and carries the provider error message', () => {
    for (const status of [401, 402, 429]) {
      const result = decodeImageGenerationResponse(status, jsonBuffer({ error: { message: 'insufficient quota' } }));
      expect(result).toMatchObject({
        ok: false,
        kind: 'quota',
        error: expect.stringContaining('insufficient quota'),
      });
    }
  });

  it('maps other non-2xx to http', () => {
    const result = decodeImageGenerationResponse(500, new ArrayBuffer(0));
    expect(result).toMatchObject({ ok: false, kind: 'http', error: 'HTTP 500' });
  });

  it('rejects a response without b64_json (url-only is not followed)', () => {
    const result = decodeImageGenerationResponse(200, jsonBuffer({ data: [{ url: 'https://cdn.example.com/x.png' }] }));
    expect(result).toMatchObject({ ok: false, kind: 'http' });
  });

  it('rejects undecodable JSON and invalid base64', () => {
    expect(decodeImageGenerationResponse(200, new ArrayBuffer(0))).toMatchObject({ ok: false, kind: 'http' });
    const result = decodeImageGenerationResponse(200, jsonBuffer({ data: [{ b64_json: '!!!not-base64!!!' }] }));
    expect(result).toMatchObject({ ok: false, kind: 'http' });
  });

  it('rejects unknown image formats instead of guessing', () => {
    const result = decodeImageGenerationResponse(200, jsonBuffer({ data: [{ b64_json: b64(Buffer.from('plain text', 'utf8')) }] }));
    expect(result).toMatchObject({ ok: false, kind: 'http' });
  });

  it('rejects bytes over the size limit without truncating', () => {
    const big = new Uint8Array(IMAGE_GENERATION_MAX_ASSET_BYTES + 1);
    big.set(PNG_SIGNATURE);
    const result = decodeImageGenerationResponse(200, jsonBuffer({ data: [{ b64_json: b64(big) }] }));
    expect(result).toMatchObject({ ok: false, kind: 'size-limit' });
  });
});

describe('sniffImageMimeType', () => {
  it('recognizes png/jpeg/webp and nothing else', () => {
    expect(sniffImageMimeType(pngBytes())).toBe('image/png');
    expect(sniffImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImageMimeType(webp)).toBe('image/webp');
    expect(sniffImageMimeType(Buffer.from('nope'))).toBeNull();
  });
});

describe('ImageGenerationService.generate (failure matrix over a fake transport)', () => {
  it('returns decoded bytes on success and passes the built request through', async () => {
    const { transport, calls } = okTransport(pngBytes());
    const service = new ImageGenerationService(transport);
    const result = await service.generate(MODEL, 'a lighthouse', undefined, 5_000);
    expect(result.ok).toBe(true);
    expect(calls[0]).toMatchObject({ url: 'https://api.example.com/v1/images/generations' });
  });

  it('pre-validates the config (no baseURL/model → http failure, no request)', async () => {
    let called = 0;
    const service = new ImageGenerationService({
      async postJson() { called += 1; return { status: 200, body: new ArrayBuffer(0) }; },
    });
    const result = await service.generate({ ...MODEL, baseURL: '' }, 'p');
    expect(result).toMatchObject({ ok: false, kind: 'http' });
    expect(called).toBe(0);
  });

  it('maps transport throws to network', async () => {
    const service = new ImageGenerationService({
      async postJson() { throw new Error('ECONNREFUSED'); },
    });
    const result = await service.generate(MODEL, 'p', undefined, 1_000);
    expect(result).toMatchObject({ ok: false, kind: 'network', error: 'ECONNREFUSED' });
  });

  it('maps the deadline to timeout', async () => {
    const service = new ImageGenerationService({
      postJson: () => new Promise(() => undefined),
    });
    const result = await service.generate(MODEL, 'p', undefined, 10);
    expect(result).toMatchObject({ ok: false, kind: 'timeout' });
  });

  it('maps an abort to a network failure with an aborted message', async () => {
    const controller = new AbortController();
    const service = new ImageGenerationService({
      postJson: () => new Promise(() => undefined),
    });
    const promise = service.generate(MODEL, 'p', controller.signal, 60_000);
    controller.abort();
    const result = await promise;
    expect(result).toMatchObject({
      ok: false,
      kind: 'network',
      error: expect.stringContaining('aborted'),
    });
  });

  it('resolves the failure kind markers used by the UI labels', () => {
    expect(new ImageGenerationTimeoutError()).toBeInstanceOf(Error);
    expect(new ImageGenerationAbortError()).toBeInstanceOf(Error);
  });
});

describe('buildImageEmbedText', () => {
  it('pads the exclusive-line form with blank lines (feature behaviour)', () => {
    expect(buildImageEmbedText('附件/a.png', 600, 'line')).toBe('\n\n![[附件/a.png|600]]\n\n');
  });

  it('keeps the inline form exact and drops non-positive widths', () => {
    expect(buildImageEmbedText('附件/a.png', 600, 'inline')).toBe('![[附件/a.png|600]]');
    expect(buildImageEmbedText('附件/a.png', 0, 'inline')).toBe('![[附件/a.png]]');
    expect(buildImageEmbedText('附件/a.png', -5, 'line')).toBe('\n\n![[附件/a.png]]\n\n');
    expect(buildImageEmbedText('附件/a.png', 480.6, 'inline')).toBe('![[附件/a.png|481]]');
  });
});

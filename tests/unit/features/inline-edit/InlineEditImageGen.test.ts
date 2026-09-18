/**
 * InlineEditImageGen flow tests (R-C2, design §5 tests 3/4/6).
 *
 * Covers the shared two-step write contract and its failure matrix over
 * injected doubles: generate failure → nothing anywhere; save failure →
 * no document change and no registration; abort racing the save → the asset
 * is trashed; success → generate → save → register → embed text, in order;
 * preview-rejected assets follow `imageGenerationAssetCleanup` with a notice.
 */

import type { ImageGenerationResult } from '../../../../src/core/agents/imagegen/ImageGenerationService';
import type { ImageGenerationModelConfig } from '../../../../src/core/types';
import {
  cleanupRejectedImageAsset,
  type InlineEditImageGenDeps,
  runInlineEditImageGeneration,
} from '../../../../src/features/inline-edit/InlineEditImageGen';

const MODEL: ImageGenerationModelConfig = {
  id: 'm1',
  displayName: 'Test',
  apiFormat: 'openai-images',
  baseURL: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-image-1',
  size: '',
};

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;

interface Harness {
  deps: InlineEditImageGenDeps;
  calls: string[];
  notices: string[];
  failGenerate: (result: ImageGenerationResult) => void;
  failSave: (error: Error) => void;
  trashResult: (value: boolean) => void;
  abort: AbortController;
}

function createHarness(overrides: Partial<Pick<InlineEditImageGenDeps, 'cleanup' | 'maxWidth'>> = {}): Harness {
  const calls: string[] = [];
  const notices: string[] = [];
  let generateResult: ImageGenerationResult = { ok: true, bytes: PNG_BYTES, mimeType: 'image/png' };
  let saveError: Error | null = null;
  let trashValue = true;
  const abort = new AbortController();
  const deps: InlineEditImageGenDeps = {
    models: [MODEL],
    maxWidth: overrides.maxWidth ?? 600,
    cleanup: overrides.cleanup ?? 'trash',
    async generate(model, prompt, signal) {
      calls.push(`generate:${model.id}:${prompt}:${signal?.aborted ? 'aborted' : 'live'}`);
      return generateResult;
    },
    async saveAsset(bytes, mimeType, baseName) {
      calls.push(`save:${mimeType}:${baseName.slice(0, 8)}:${bytes.byteLength}`);
      if (saveError) throw saveError;
      calls.push('saved:attachments/x.png');
      return { path: 'attachments/x.png' };
    },
    async trashAsset(path) {
      calls.push(`trash:${path}`);
      return trashValue;
    },
    registerAsset(assetPath, notePath) {
      calls.push(`register:${assetPath}:${notePath}`);
    },
    noteReferenceWrite(notePath) {
      calls.push(`noteRef:${notePath}`);
    },
    endAssetCapture() {
      calls.push('endAsset');
    },
    notify(message) {
      notices.push(message);
    },
  };
  return {
    deps,
    calls,
    notices,
    failGenerate(result) { generateResult = result; },
    failSave(error) { saveError = error; },
    trashResult(value) { trashValue = value; },
    abort,
  };
}

describe('runInlineEditImageGeneration — two-step write contract', () => {
  it('fails fast with no models (nothing generated, nothing saved)', async () => {
    const harness = createHarness();
    harness.deps.models = [];
    const plan = await runInlineEditImageGeneration(harness.deps, {
      prompt: 'a castle',
      form: 'line',
      notePath: 'notes/a.md',
    });
    expect(plan.ok).toBe(false);
    expect(harness.calls).toEqual([]);
  });

  it('generation failure → no save, no registration, no document change', async () => {
    const harness = createHarness();
    harness.failGenerate({ ok: false, error: 'HTTP 429', kind: 'quota' });
    const plan = await runInlineEditImageGeneration(harness.deps, {
      prompt: 'a castle',
      form: 'inline',
      notePath: 'notes/a.md',
    });
    expect(plan).toMatchObject({
      ok: false,
      error: expect.stringContaining('quota'),
    });
    expect(harness.calls).toEqual(['generate:m1:a castle:live']);
    expect(harness.notices).toEqual([]);
  });

  it('save failure (W-asset) → failure returned, registration never attempted', async () => {
    const harness = createHarness();
    harness.failSave(new Error('disk full'));
    const plan = await runInlineEditImageGeneration(harness.deps, {
      prompt: 'a castle',
      form: 'line',
      notePath: 'notes/a.md',
    });
    expect(plan).toMatchObject({
      ok: false,
      error: expect.stringContaining('disk full'),
    });
    expect(harness.calls).toEqual([
      'generate:m1:a castle:live',
      'save:image/png:a castle:8',
    ]);
  });

  it('abort racing a completed save → the asset is trashed, not orphaned', async () => {
    const harness = createHarness();
    harness.abort.abort();
    const plan = await runInlineEditImageGeneration(harness.deps, {
      prompt: 'a castle',
      form: 'inline',
      notePath: 'notes/a.md',
      signal: harness.abort.signal,
    });
    expect(plan.ok).toBe(false);
    expect(harness.calls).toEqual([
      'generate:m1:a castle:aborted',
      'save:image/png:a castle:8',
      'saved:attachments/x.png',
      'trash:attachments/x.png',
    ]);
    expect(harness.calls.some((entry) => entry.startsWith('register:'))).toBe(false);
  });

  it('success → generate → save → register → embed text (order asserted)', async () => {
    const harness = createHarness();
    const plan = await runInlineEditImageGeneration(harness.deps, {
      prompt: 'a castle',
      form: 'line',
      notePath: 'notes/a.md',
    });
    expect(plan).toEqual({
      ok: true,
      path: 'attachments/x.png',
      embedText: '\n\n![[attachments/x.png|600]]\n\n',
    });
    expect(harness.calls).toEqual([
      'generate:m1:a castle:live',
      'save:image/png:a castle:8',
      'saved:attachments/x.png',
      'register:attachments/x.png:notes/a.md',
    ]);
  });
});

describe('cleanupRejectedImageAsset — §4.6 asset policy', () => {
  it('trash policy: closes the asset round, trashes and reports the path', async () => {
    const harness = createHarness();
    await cleanupRejectedImageAsset(harness.deps, 'attachments/x.png');
    expect(harness.calls).toEqual(['endAsset', 'trash:attachments/x.png']);
    expect(harness.notices[0]).toContain('attachments/x.png');
  });

  it('keep policy: closes the asset round, keeps the file and still tells the user where it is', async () => {
    const harness = createHarness({ cleanup: 'keep' });
    await cleanupRejectedImageAsset(harness.deps, 'attachments/x.png');
    expect(harness.calls).toEqual(['endAsset']);
    expect(harness.notices[0]).toContain('attachments/x.png');
  });

  it('a failed trash is reported, never silent', async () => {
    const harness = createHarness();
    harness.trashResult(false);
    await cleanupRejectedImageAsset(harness.deps, 'attachments/x.png');
    expect(harness.notices[0]).toContain('attachments/x.png');
  });
});

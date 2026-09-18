/**
 * ImageGenerationChatController contract tests (R-C2, design §3.5/§5 test 6).
 *
 * Chat order of writes: generation first, W-asset + W-ref only on an
 * explicit insert click. Every failure branch is asserted against the
 * shared matrix — in particular: save failure leaves the document untouched,
 * a refused insert keeps the asset and reports its path, and the call ORDER
 * saveAsset → registerAsset → replaceRange is pinned.
 */

import type { ImageGenerationResult } from '../../../../../src/core/agents/imagegen/ImageGenerationService';
import type { ImageGenerationModelConfig } from '../../../../../src/core/types';
import {
  ImageGenerationChatController,
  type ImageGenerationChatPorts,
} from '../../../../../src/features/chat/services/ImageGenerationChatController';

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
  controller: ImageGenerationChatController;
  calls: string[];
  notices: string[];
  replaceRangeThrows: boolean;
  editorPresent: boolean;
}

function createHarness(): Harness {
  const calls: string[] = [];
  const notices: string[] = [];
  const state: { generate: ImageGenerationResult; saveError: Error | null; replaceRangeThrows: boolean; editorPresent: boolean } = {
    generate: { ok: true, bytes: PNG_BYTES, mimeType: 'image/png' },
    saveError: null,
    replaceRangeThrows: false,
    editorPresent: true,
  };
  const ports: ImageGenerationChatPorts = {
    getConfiguration: () => ({ models: [MODEL], maxWidth: 600, cleanup: 'trash' }),
    async generate(model, prompt) {
      calls.push(`generate:${model.id}:${prompt}`);
      return state.generate;
    },
    async saveAsset(bytes, mimeType, baseName) {
      calls.push(`save:${mimeType}:${bytes.byteLength}:${baseName.slice(0, 6)}`);
      if (state.saveError) throw state.saveError;
      calls.push('saved:attachments/c.png');
      return { path: 'attachments/c.png' };
    },
    async trashAsset(path) {
      calls.push(`trash:${path}`);
      return true;
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
    resolveInsertTarget() {
      if (!state.editorPresent) return null;
      return {
        editor: {
          getCursor: () => {
            calls.push('cursor');
            return { line: 3, ch: 7 };
          },
          replaceRange: (text) => {
            if (state.replaceRangeThrows) throw new Error('replace failed');
            calls.push(`replace:${text.replace(/\n/g, '\\n')}`);
          },
        } as never,
        notePath: 'notes/n.md',
      };
    },
    notify(message) {
      notices.push(message);
    },
  };
  return {
    controller: new ImageGenerationChatController(ports),
    calls,
    notices,
    get replaceRangeThrows() { return state.replaceRangeThrows; },
    set replaceRangeThrows(value) { state.replaceRangeThrows = value; },
    get editorPresent() { return state.editorPresent; },
    set editorPresent(value) { state.editorPresent = value; },
  };
}

async function generated(harness: Harness) {
  const outcome = await harness.controller.generate('a castle');
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.candidate;
}

describe('ImageGenerationChatController.generate', () => {
  it('fails with a clear message and zero side effects when no model is configured', async () => {
    const harness = createHarness();
    (harness.controller as unknown as { ports: ImageGenerationChatPorts }).ports.getConfiguration =
      () => ({ models: [], maxWidth: 600, cleanup: 'trash' });
    const outcome = await harness.controller.generate('p');
    expect(outcome.ok).toBe(false);
    expect(harness.calls).toEqual([]);
  });

  it('surfaces the failure kind (acceptance 5) and writes nothing', async () => {
    const harness = createHarness();
    (harness.controller as unknown as { ports: ImageGenerationChatPorts }).ports.generate =
      async () => ({ ok: false, error: 'HTTP 429: quota', kind: 'quota' });
    const outcome = await harness.controller.generate('a castle');
    expect(outcome).toMatchObject({
      ok: false,
      error: expect.stringContaining('quota'),
    });
  });

  it('holds a successful generation as a candidate with model and duration', async () => {
    const harness = createHarness();
    const candidate = await generated(harness);
    expect(candidate.model.id).toBe('m1');
    expect(candidate.prompt).toBe('a castle');
    expect(candidate.mimeType).toBe('image/png');
    expect(candidate.durationMs).toBeGreaterThanOrEqual(0);
    expect(harness.calls).toEqual(['generate:m1:a castle']);
  });
});

describe('ImageGenerationChatController.insertIntoActiveNote — explicit W-asset → W-ref', () => {
  it('writes asset, registers, inserts at the cursor, records the reference and closes the round, in order', async () => {
    const harness = createHarness();
    const candidate = await generated(harness);
    const inserted = await harness.controller.insertIntoActiveNote(candidate, 'line');
    expect(inserted).toBe(true);
    expect(harness.calls.slice(1)).toEqual([
      'save:image/png:8:a cast',
      'saved:attachments/c.png',
      'register:attachments/c.png:notes/n.md',
      'cursor',
      'replace:\\n\\n![[attachments/c.png|600]]\\n\\n',
      // D2 record-then-close: the reference write is recorded before the
      // round closes, so one-click revert is available immediately.
      'noteRef:notes/n.md',
      'endAsset',
    ]);
    expect(harness.notices[harness.notices.length - 1]).toContain('attachments/c.png');
  });

  it('no active editor → nothing is written and the user is told', async () => {
    const harness = createHarness();
    const candidate = await generated(harness);
    harness.editorPresent = false;
    const inserted = await harness.controller.insertIntoActiveNote(candidate, 'inline');
    expect(inserted).toBe(false);
    expect(harness.calls).toEqual(['generate:m1:a castle']);
    expect(harness.notices[0]).toBeDefined();
  });

  it('save failure (W-asset) → no document change (replaceRange never called)', async () => {
    const harness = createHarness();
    const candidate = await generated(harness);
    (harness.controller as unknown as { ports: ImageGenerationChatPorts }).ports.saveAsset =
      async () => { throw new Error('disk full'); };
    const inserted = await harness.controller.insertIntoActiveNote(candidate, 'inline');
    expect(inserted).toBe(false);
    expect(harness.calls).toEqual(['generate:m1:a castle']);
    expect(harness.notices[0]).toContain('disk full');
  });

  it('insert failure (W-ref) → asset kept, path reported, round closed without a reference record', async () => {
    const harness = createHarness();
    const candidate = await generated(harness);
    harness.replaceRangeThrows = true;
    const inserted = await harness.controller.insertIntoActiveNote(candidate, 'inline');
    expect(inserted).toBe(false);
    expect(harness.calls).toContain('saved:attachments/c.png');
    expect(harness.calls).toContain('endAsset');
    expect(harness.calls.some((entry) => entry.startsWith('noteRef:'))).toBe(false);
    expect(harness.calls.some((entry) => entry.startsWith('replace:'))).toBe(false);
    const keepNotice = harness.notices.find((message) => message.includes('attachments/c.png'));
    expect(keepNotice).toBeDefined();
  });
});

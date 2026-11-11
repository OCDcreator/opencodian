import { readFileSync } from 'node:fs';
import path from 'node:path';

import { t } from '../../../../src/i18n';
import { ToolCallRenderer } from '../../../../src/utils/streaming/ToolCallRenderer';

describe('ToolCallRenderer image generation cards', () => {
  function renderImageCard(result: string | undefined, input: Record<string, unknown> = {}) {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();
    renderer.render(parentEl, {
      id: 'tool-img-1',
      name: 'image_generation',
      kind: 'image',
      input,
      status: result === undefined ? 'running' : 'completed',
      result,
    });
    return parentEl;
  }

  it('summarizes the revised prompt when present', () => {
    const parentEl = renderImageCard('data:image/png;base64,AAAA', { revisedPrompt: 'a lighthouse at dusk' });
    expect(parentEl.querySelector('.streaming-tool-summary')?.textContent).toBe('a lighthouse at dusk');
  });

  it('shows a generating status label while running without a revised prompt', () => {
    const parentEl = renderImageCard(undefined, { status: 'in_progress' });
    expect(parentEl.querySelector('.streaming-tool-summary')?.textContent).toBe('Generating image…');
  });

  it('renders a data-URL result as an image with the revised prompt below', () => {
    const parentEl = renderImageCard('data:image/png;base64,AAAA', { revisedPrompt: 'prompt v2' });
    const img = parentEl.querySelector<HTMLImageElement>('.streaming-tool-image');
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    const promptEl = parentEl.querySelector('.streaming-tool-image-revised-prompt');
    expect(promptEl?.textContent).toContain('Revised prompt');
    expect(promptEl?.textContent).toContain('prompt v2');
  });

  it('renders a file-path result as text', () => {
    const parentEl = renderImageCard('/tmp/out/image.png');
    expect(parentEl.querySelector('.streaming-tool-image')).toBeNull();
    expect(parentEl.querySelector('.streaming-tool-image-path')?.textContent).toBe('/tmp/out/image.png');
  });

  it('renders an errored card through the default text path', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();
    renderer.render(parentEl, {
      id: 'tool-img-2',
      name: 'image_generation',
      kind: 'image',
      input: {},
      status: 'error',
      result: 'Image generation failed: usage limit exceeded.',
    });
    expect(parentEl.querySelector('.streaming-tool-image')).toBeNull();
    expect(parentEl.querySelector('.streaming-tool-lines')?.textContent)
      .toContain('usage limit exceeded');
  });
});

describe('ToolCallRenderer restored tool-result images', () => {
  const pngBase64 = readFileSync(path.resolve(__dirname, '../../../../tests/fixtures/dsh-history-image.png')).toString('base64');
  const pngUri = `data:image/png;base64,${pngBase64}`;
  const notImageBase64 = Buffer.from('hello, this is definitely not an image payload!').toString('base64');
  const notImageUri = `data:image/png;base64,${notImageBase64}`;

  function renderResultCard(result: string | undefined, kind: 'bash' | 'image' = 'bash') {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();
    renderer.render(parentEl, { id: 'tool-restore', name: kind === 'image' ? 'image_generation' : 'bash', kind, input: {},
      status: result === undefined ? 'running' : 'completed', result });
    return parentEl;
  }

  it('renders a bare store-restored image in a non-image-kind tool card', () => {
    const parentEl = renderResultCard(pngUri);
    const img = parentEl.querySelector<HTMLImageElement>('.streaming-tool-image');
    expect(img?.getAttribute('src')).toBe(pngUri);
    expect(parentEl.textContent).not.toContain(pngBase64.slice(0, 48));
  });

  it('interleaves mixed text and image without dumping raw base64 as text', () => {
    const parentEl = renderResultCard(`Prefix line\n${pngUri}\nSuffix line`);
    expect(parentEl.querySelectorAll('.streaming-tool-image')).toHaveLength(1);
    expect(parentEl.textContent).toContain('Prefix line');
    expect(parentEl.textContent).toContain('Suffix line');
    expect(parentEl.textContent).not.toContain(pngBase64.slice(0, 48));
  });

  it('renders the same URI repeated without dedup loss', () => {
    const parentEl = renderResultCard(`${pngUri}\n${pngUri}`);
    const images = parentEl.querySelectorAll('.streaming-tool-image');
    expect(images).toHaveLength(2);
    expect([...images].every((img) => img.getAttribute('src') === pngUri)).toBe(true);
  });

  it('caps rendered images and marks the overflow instead of dumping base64', () => {
    const parentEl = renderResultCard([pngUri, pngUri, pngUri, pngUri, pngUri, pngUri].join('\n'));
    expect(parentEl.querySelectorAll('.streaming-tool-image')).toHaveLength(4);
    expect(parentEl.textContent).toContain(t('chat.toolCard.image.notRendered', { number: 5 }));
    expect(parentEl.textContent).toContain(t('chat.toolCard.image.notRendered', { number: 6 }));
    expect(parentEl.textContent).not.toContain(pngBase64.slice(0, 48));
  });

  it('keeps unsupported or fake payloads as literal text', () => {
    const parentEl = renderResultCard(`see ${notImageUri} and file:///tmp/out.png and data:image/svg+xml;base64,PHN2Zz4=`);
    expect(parentEl.querySelector('.streaming-tool-image')).toBeNull();
    expect(parentEl.textContent).toContain(notImageUri);
    expect(parentEl.textContent).toContain('file:///tmp/out.png');
    expect(parentEl.textContent).toContain('data:image/svg+xml;base64,PHN2Zz4=');
  });

  it('preserves the plain text contract for results without images', () => {
    const parentEl = renderResultCard('alpha\nbeta');
    expect(parentEl.querySelector('.streaming-tool-image')).toBeNull();
    const lines = parentEl.querySelectorAll('.streaming-tool-line');
    expect([...lines].map((line) => line.textContent)).toEqual(['alpha', 'beta']);
  });

  it('renders mixed image-kind results through the interleaved branch', () => {
    const parentEl = renderResultCard(`Saved to /tmp/x.png\n${pngUri}`, 'image');
    expect(parentEl.querySelectorAll('.streaming-tool-image')).toHaveLength(1);
    expect(parentEl.textContent).toContain('Saved to /tmp/x.png');
    expect(parentEl.querySelector('.streaming-tool-image-path')).toBeNull();
  });
});

describe('ToolCallRenderer restored tool-result image boundaries', () => {
  const fixturesDir = path.resolve(__dirname, '../../../../tests/fixtures');
  function renderResultCard(result: string | undefined, kind: 'bash' | 'image' = 'bash') {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();
    renderer.render(parentEl, { id: 'tool-boundary', name: kind === 'image' ? 'image_generation' : 'bash', kind, input: {},
      status: result === undefined ? 'running' : 'completed', result });
    return parentEl;
  }
  const pngBase64 = readFileSync(path.join(fixturesDir, 'dsh-history-image.png')).toString('base64');
  const jpegBase64 = readFileSync(path.join(fixturesDir, 'dsh-history-image.jpeg')).toString('base64');
  const gifBase64 = readFileSync(path.join(fixturesDir, 'dsh-history-image.gif')).toString('base64');
  // Known-minimal 1x1 VP8L WebP (sips has no webp encoder on this host).
  const webpUri = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
  const pngUri = `data:image/png;base64,${pngBase64}`;

  it('recognizes real jpeg, gif and webp payloads whose declared type matches their magic', () => {
    const parentEl = renderResultCard([`data:image/jpeg;base64,${jpegBase64}`, `data:image/gif;base64,${gifBase64}`, webpUri].join('\n'));
    expect(parentEl.querySelectorAll('.streaming-tool-image')).toHaveLength(3);
    expect(parentEl.textContent).not.toContain(jpegBase64.slice(0, 48));
    expect(parentEl.textContent).not.toContain(gifBase64.slice(0, 48));
  });

  it('rejects payloads whose declared type disagrees with their actual magic', () => {
    const mismatched = `data:image/jpeg;base64,${pngBase64}`;
    const parentEl = renderResultCard(`mismatched ${mismatched}`);
    expect(parentEl.querySelector('.streaming-tool-image')).toBeNull();
    expect(parentEl.textContent).toContain(mismatched);
  });

  it('keeps single-image-plus-text image-kind results out of one img src', () => {
    const parentEl = renderResultCard(`${pngUri}\nSaved to /tmp/x.png`, 'image');
    expect(parentEl.querySelectorAll('.streaming-tool-image')).toHaveLength(1);
    expect(parentEl.querySelector('.streaming-tool-image')?.getAttribute('src')).toBe(pngUri);
    expect(parentEl.textContent).toContain('Saved to /tmp/x.png');
  });

  it('caps multi-image image-kind results with the localized overflow markers', () => {
    const parentEl = renderResultCard([pngUri, pngUri, pngUri, pngUri, pngUri].join('\n'), 'image');
    expect(parentEl.querySelectorAll('.streaming-tool-image')).toHaveLength(4);
    expect(parentEl.textContent).toContain(t('chat.toolCard.image.notRendered', { number: 5 }));
    expect(parentEl.textContent).not.toContain(pngBase64.slice(0, 48));
  });

  it('preserves the legacy contract for a proven single bare data URI', () => {
    const parentEl = renderResultCard(pngUri, 'image');
    expect(parentEl.querySelector('.streaming-tool-image')?.getAttribute('src')).toBe(pngUri);
    expect(parentEl.textContent).not.toContain(pngBase64.slice(0, 48));
  });
});

describe('ToolCallRenderer canonical base64 admission', () => {
  const pngBase64 = readFileSync(path.resolve(__dirname, '../../../../tests/fixtures/dsh-history-image.png')).toString('base64');

  function renderResultCard(result: string | undefined) {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();
    renderer.render(parentEl, { id: 'tool-canonical', name: 'bash', kind: 'bash', input: {},
      status: result === undefined ? 'running' : 'completed', result });
    return parentEl;
  }

  it('rejects non-canonical padding tails that decode to the same bytes', () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const idx = pngBase64.length - 3;               // last data sextet right before '=='
    let value = alphabet.indexOf(pngBase64[idx]);
    for (const bit of [8, 4, 2, 1]) if (!(value & bit)) { value |= bit; break; }
    const nonCanonical = `data:image/png;base64,${pngBase64.slice(0, idx)}${alphabet[value]}==`;
    const parentEl = renderResultCard(`tail ${nonCanonical}`);
    expect(parentEl.querySelector('.streaming-tool-image')).toBeNull();
    expect(parentEl.textContent).toContain(nonCanonical);
  });
});

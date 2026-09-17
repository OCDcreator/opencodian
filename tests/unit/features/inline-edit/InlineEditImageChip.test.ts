import { describe, expect, it } from '@jest/globals';

import {
  filterInlineEditImageFiles,
  INLINE_EDIT_IMAGE_MAX_BYTES,
  readInlineEditImage,
  validateInlineEditImage,
} from '../../../../src/features/inline-edit/InlineEditImageChip';

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function makeFile(bytes: number[], type: string, name = 'image.png'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('validateInlineEditImage', () => {
  it('accepts a whitelisted type within the size cap', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(validateInlineEditImage({ type, size: 1024 }, false)).toEqual({ ok: true });
    }
  });

  it('rejects unsupported media types', () => {
    const result = validateInlineEditImage({ type: 'image/svg+xml', size: 100 }, false);
    expect(result).toEqual({ ok: false, reason: 'inlineEdit.error.imageTypeUnsupported' });
  });

  it('rejects non-image files', () => {
    const result = validateInlineEditImage({ type: 'application/pdf', size: 100 }, false);
    expect(result.ok).toBe(false);
  });

  it('rejects images over the 4MB cap', () => {
    const result = validateInlineEditImage({ type: 'image/png', size: INLINE_EDIT_IMAGE_MAX_BYTES + 1 }, false);
    expect(result).toEqual({ ok: false, reason: 'inlineEdit.error.imageTooLarge' });
  });

  it('accepts an image exactly at the cap', () => {
    expect(validateInlineEditImage({ type: 'image/png', size: INLINE_EDIT_IMAGE_MAX_BYTES }, false)).toEqual({ ok: true });
  });

  it('rejects a second image while one is attached', () => {
    const result = validateInlineEditImage({ type: 'image/png', size: 100 }, true);
    expect(result).toEqual({ ok: false, reason: 'inlineEdit.error.imageLimit' });
  });
});

describe('readInlineEditImage', () => {
  it('returns base64 without a data-URL prefix', async () => {
    const file = makeFile(PNG_BYTES, 'image/png');
    const result = await readInlineEditImage(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment.mediaType).toBe('image/png');
    expect(result.attachment.data).not.toContain('data:');
    expect(Buffer.from(result.attachment.data, 'base64').length).toBe(PNG_BYTES.length);
  });

  it('round-trips the payload bytes', async () => {
    const bytes = Array.from({ length: 256 }, (_, i) => i);
    const result = await readInlineEditImage(makeFile(bytes, 'image/webp', 'a.webp'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Buffer.from(result.attachment.data, 'base64')).toEqual(Buffer.from(bytes));
  });

  it('rejects oversized files before reading', async () => {
    const big = makeFile([0], 'image/png');
    Object.defineProperty(big, 'size', { value: INLINE_EDIT_IMAGE_MAX_BYTES + 1 });
    const result = await readInlineEditImage(big);
    expect(result).toEqual({ ok: false, reason: 'inlineEdit.error.imageTooLarge' });
  });
});

describe('filterInlineEditImageFiles', () => {
  it('keeps only whitelisted image files', () => {
    const files = [
      makeFile(PNG_BYTES, 'image/png'),
      makeFile([0x25, 0x50, 0x44, 0x46], 'application/pdf', 'doc.pdf'),
      makeFile([0xff, 0xd8, 0xff], 'image/jpeg', 'photo.jpg'),
      makeFile([0], 'text/plain', 'note.txt'),
      makeFile([0x52, 0x49], 'image/gif', 'anim.gif'),
    ];
    const kept = filterInlineEditImageFiles(files).map((file) => file.name);
    expect(kept).toEqual(['image.png', 'photo.jpg', 'anim.gif']);
  });
});

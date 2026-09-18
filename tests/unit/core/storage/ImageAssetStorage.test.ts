/**
 * ImageAssetStorage unit tests (R-C2, design §5 test 2): conflict numbering
 * never overwrites, write failures propagate, base names sanitize, and the
 * out-of-vault attachment-folder boundary fails closed BEFORE any byte is
 * written (design §7).
 */

import type { ImageGenerationMimeType } from '../../../../src/core/agents/imagegen/ImageGenerationService';
import {
  ImageAssetStorage,
  type ImageAssetVault,
  isSafeVaultRelativeAssetPath,
  sanitizeImageAssetBaseName,
} from '../../../../src/core/storage/ImageAssetStorage';

const PNG: ImageGenerationMimeType = 'image/png';

class FakeAttachmentVault implements ImageAssetVault {
  /** Paths reported to exist (Occupied set). */
  readonly occupied = new Set<string>();
  /** What a real vault's getAvailablePathForAttachments returns verbatim. */
  resolvedPaths = new Map<string, string>();
  /** Force the resolver to throw (out-of-vault attachment folder case). */
  resolverError: string | null = null;
  readonly writeLog: Array<{ path: string; bytes: number }> = [];
  readonly trashLog: string[] = [];
  writeFails = false;

  async getAvailablePathForAttachments(fileName: string): Promise<string> {
    if (this.resolverError) {
      throw new Error(this.resolverError);
    }
    const preset = this.resolvedPaths.get(fileName);
    if (preset) return preset;
    // Mirror Obsidian's numbering: when the plain name exists, suffix -1 upward.
    const dot = fileName.lastIndexOf('.');
    const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : '';
    let candidate = fileName;
    let index = 1;
    while (this.occupied.has(candidate)) {
      candidate = `${stem} ${index}${ext}`;
      index += 1;
    }
    return candidate;
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    if (this.writeFails) {
      throw new Error('disk full');
    }
    this.writeLog.push({ path, bytes: data.byteLength });
    this.occupied.add(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.occupied.has(path);
  }

  async trash(path: string): Promise<boolean> {
    if (!this.occupied.has(path)) return false;
    this.occupied.delete(path);
    this.trashLog.push(path);
    return true;
  }
}

function storage(vault: FakeAttachmentVault): ImageAssetStorage {
  return new ImageAssetStorage(vault);
}

describe('sanitizeImageAssetBaseName', () => {
  it('strips illegal characters and wiki syntax', () => {
    expect(sanitizeImageAssetBaseName('a/b:c*d?"<>|')).toBe('a b c d');
    expect(sanitizeImageAssetBaseName('  [[wiki]] 城堡  ')).toBe('wiki 城堡');
  });

  it('caps length and falls back when nothing survives', () => {
    expect(sanitizeImageAssetBaseName('x'.repeat(200)).length).toBeLessThanOrEqual(60);
    expect(sanitizeImageAssetBaseName('///')).toBe('image');
    expect(sanitizeImageAssetBaseName('')).toBe('image');
  });
});

describe('isSafeVaultRelativeAssetPath', () => {
  it('accepts plain relative paths', () => {
    expect(isSafeVaultRelativeAssetPath('附件/a.png')).toBe(true);
    expect(isSafeVaultRelativeAssetPath('a/b/c.png')).toBe(true);
  });

  it('rejects absolute paths, drive letters, and traversal', () => {
    expect(isSafeVaultRelativeAssetPath('/etc/passwd')).toBe(false);
    expect(isSafeVaultRelativeAssetPath('C:/vault/a.png')).toBe(false);
    expect(isSafeVaultRelativeAssetPath('a/../b.png')).toBe(false);
    expect(isSafeVaultRelativeAssetPath('a/./b.png')).toBe(false);
    expect(isSafeVaultRelativeAssetPath('')).toBe(false);
  });
});

describe('ImageAssetStorage.save (W-asset)', () => {
  it('writes to the vault-provided attachment path and never overwrites', async () => {
    const vault = new FakeAttachmentVault();
    vault.resolvedPaths.set('lighthouse.png', '附件/lighthouse.png');
    vault.occupied.add('附件/lighthouse.png');
    const result = await storage(vault).save(new ArrayBuffer(8), PNG, 'lighthouse');
    expect(result.path).toBe('附件/lighthouse-2.png');
    expect(vault.writeLog).toEqual([{ path: '附件/lighthouse-2.png', bytes: 8 }]);
  });

  it('writes the free path the vault resolved without suffixing it', async () => {
    const vault = new FakeAttachmentVault();
    const result = await storage(vault).save(new ArrayBuffer(8), PNG, 'lighthouse');
    expect(result.path).toBe('lighthouse.png');
    expect(vault.writeLog).toEqual([{ path: 'lighthouse.png', bytes: 8 }]);
  });

  it('propagates a writeBinary failure (caller must treat it as no document change)', async () => {
    const vault = new FakeAttachmentVault();
    vault.writeFails = true;
    await expect(storage(vault).save(new ArrayBuffer(8), PNG, 'a')).rejects.toThrow('disk full');
    expect(vault.writeLog).toEqual([]);
  });

  it('fails closed when attachment resolution throws (out-of-vault folder)', async () => {
    const vault = new FakeAttachmentVault();
    vault.resolverError = 'invalid attachment folder';
    await expect(storage(vault).save(new ArrayBuffer(8), PNG, 'a')).rejects.toThrow('invalid attachment folder');
    expect(vault.writeLog).toEqual([]);
  });

  it('fails closed when the resolved path leaves the vault', async () => {
    const vault = new FakeAttachmentVault();
    vault.resolvedPaths.set('a.png', '/outside-vault/a.png');
    await expect(storage(vault).save(new ArrayBuffer(8), PNG, 'a')).rejects.toThrow('outside the vault');
    expect(vault.writeLog).toEqual([]);

    const windowsVault = new FakeAttachmentVault();
    windowsVault.resolvedPaths.set('a.png', 'D:\\attachments\\a.png');
    await expect(storage(windowsVault).save(new ArrayBuffer(8), PNG, 'a')).rejects.toThrow('outside the vault');
    expect(windowsVault.writeLog).toEqual([]);
  });

  it('rejects unsupported mime types before touching the vault', async () => {
    const vault = new FakeAttachmentVault();
    await expect(
      storage(vault).save(new ArrayBuffer(8), 'image/svg+xml' as ImageGenerationMimeType, 'a'),
    ).rejects.toThrow('Unsupported');
    expect(vault.writeLog).toEqual([]);
  });
});

describe('ImageAssetStorage.trash', () => {
  it('resolves true on success and false when nothing was trashed', async () => {
    const vault = new FakeAttachmentVault();
    vault.occupied.add('附件/a.png');
    expect(await storage(vault).trash('附件/a.png')).toBe(true);
    expect(await storage(vault).trash('附件/a.png')).toBe(false);
  });
});

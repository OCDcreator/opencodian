import type { App } from 'obsidian';
import { normalizePath } from 'obsidian';
import * as path from 'path';

const THEME_BACKGROUNDS_DIR = '.opencodian/theme-backgrounds';
const MAX_THEME_BACKGROUND_BYTES = 64 * 1024 * 1024;
const THEME_BACKGROUND_MIME_TO_EXTENSION: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface StoredThemeBackgroundAsset {
  path: string;
  mimeType: string;
  displayName: string;
}

export class ThemeBackgroundStorage {
  constructor(private readonly adapter: App['vault']['adapter']) {}

  async initialize(): Promise<void> {
    await this.ensureDir(THEME_BACKGROUNDS_DIR);
  }

  async saveAsset(
    data: ArrayBuffer,
    sourceName: string,
    hintedMimeType?: string,
  ): Promise<StoredThemeBackgroundAsset> {
    this.assertByteLength(data.byteLength);
    const mimeType = this.detectMimeType(data, hintedMimeType, sourceName);
    const extension = THEME_BACKGROUND_MIME_TO_EXTENSION[mimeType];
    if (!extension) {
      throw new Error('Only SVG, PNG, JPEG, WEBP, and GIF background images are supported.');
    }

    await this.ensureDir(THEME_BACKGROUNDS_DIR);

    const fileName = `theme-bg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const storedPath = normalizePath(`${THEME_BACKGROUNDS_DIR}/${fileName}`);
    const writeBinary = this.adapter.writeBinary?.bind(this.adapter) as
      | undefined
      | ((filePath: string, fileData: ArrayBuffer) => Promise<void>);
    if (!writeBinary) {
      throw new Error('Vault adapter does not support writing theme background images.');
    }

    await writeBinary(storedPath, data);

    return {
      path: storedPath,
      mimeType,
      displayName: path.basename(sourceName.trim() || fileName),
    };
  }

  async remove(storedPath: string | null | undefined): Promise<void> {
    if (!storedPath?.trim()) {
      return;
    }

    try {
      await this.adapter.remove(normalizePath(storedPath));
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async readDataUrl(storedPath: string, hintedMimeType?: string): Promise<string | null> {
    const normalizedStoredPath = normalizePath(storedPath);
    const exists = await this.adapter.exists(normalizedStoredPath);
    if (!exists) {
      return null;
    }

    const readBinary = this.adapter.readBinary?.bind(this.adapter) as
      | undefined
      | ((filePath: string) => Promise<ArrayBuffer>);
    if (!readBinary) {
      return null;
    }

    const data = await readBinary(normalizedStoredPath);
    const mimeType = this.detectMimeType(data, hintedMimeType, normalizedStoredPath);
    const base64 = Buffer.from(data).toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }

  private async ensureDir(dir: string): Promise<void> {
    const normalizedDir = normalizePath(dir);
    const exists = await this.adapter.exists(normalizedDir);
    if (!exists) {
      await this.adapter.mkdir(normalizedDir);
    }
  }

  private assertByteLength(byteLength: number): void {
    if (byteLength > MAX_THEME_BACKGROUND_BYTES) {
      throw new Error('The background image is too large. Maximum size is 64 MB.');
    }
  }

  private detectMimeType(
    data: ArrayBuffer,
    hintedMimeType?: string,
    sourceHint?: string,
  ): string {
    const bytes = new Uint8Array(data);
    return (
      this.normalizeMimeHint(hintedMimeType)
      ?? this.detectSvgMimeType(bytes, sourceHint)
      ?? this.detectBinaryMimeType(bytes)
      ?? this.detectMimeTypeFromExtension(sourceHint)
      ?? this.throwUnsupportedMimeType()
    );
  }

  private normalizeMimeHint(hintedMimeType?: string): string | null {
    const normalizedHint = hintedMimeType?.split(';')[0]?.trim().toLowerCase();
    if (normalizedHint && Object.prototype.hasOwnProperty.call(THEME_BACKGROUND_MIME_TO_EXTENSION, normalizedHint)) {
      return normalizedHint;
    }
    return null;
  }

  private detectSvgMimeType(bytes: Uint8Array, sourceHint?: string): string | null {
    const textPrefix = Buffer.from(bytes.slice(0, Math.min(bytes.length, 2048)))
      .toString('utf-8')
      .replace(/^\uFEFF/, '')
      .trimStart();
    if (/<svg[\s>]/i.test(textPrefix) || (/^<\?xml/i.test(textPrefix) && /\.svg$/i.test(sourceHint ?? ''))) {
      return 'image/svg+xml';
    }
    return null;
  }

  private detectBinaryMimeType(bytes: Uint8Array): string | null {
    if (this.matchesSignature(bytes, [0x89, 0x50, 0x4e, 0x47])) {
      return 'image/png';
    }

    if (this.matchesSignature(bytes, [0xff, 0xd8, 0xff])) {
      return 'image/jpeg';
    }

    if (bytes.length >= 6) {
      const signature = Buffer.from(bytes.slice(0, 6)).toString('ascii');
      if (signature === 'GIF87a' || signature === 'GIF89a') {
        return 'image/gif';
      }
    }

    if (bytes.length >= 12) {
      const riff = Buffer.from(bytes.slice(0, 4)).toString('ascii');
      const webp = Buffer.from(bytes.slice(8, 12)).toString('ascii');
      if (riff === 'RIFF' && webp === 'WEBP') {
        return 'image/webp';
      }
    }

    return null;
  }

  private matchesSignature(bytes: Uint8Array, signature: number[]): boolean {
    return signature.every((value, index) => bytes.length > index && bytes[index] === value);
  }

  private detectMimeTypeFromExtension(sourceHint?: string): string | null {
    const extension = path.extname(sourceHint ?? '').toLowerCase();
    switch (extension) {
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      default:
        return null;
    }
  }

  private throwUnsupportedMimeType(): never {
    throw new Error('Only SVG, PNG, JPEG, WEBP, and GIF background images are supported.');
  }
}

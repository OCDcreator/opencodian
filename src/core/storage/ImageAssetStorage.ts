/**
 * ImageAssetStorage — the plugin's first binary write path into the user's
 * content area (R-C2, write step W-asset).
 *
 * docs/requirements/flowtext-c2-design.md §3.2/§3.3: generated images land in
 * the vault's attachment folder (resolved by Obsidian's own
 * `getAvailablePathForAttachments`, which honours the `attachmentFolderPath`
 * setting and Obsidian's conflict-numbering convention). The class NEVER
 * overwrites an existing file: the vault-provided path is double-checked and,
 * should a host not number conflicts, a `-2`/`-3`… suffix is probed instead.
 *
 * Fail-closed boundary cases (design §7): a resolution that throws, or that
 * resolves outside the vault (absolute path / `..` segment — the user
 * configured an out-of-vault attachment folder), is rejected before any byte
 * is written, so a failed W-asset can never produce a document change (the
 * reference step W-ref is never attempted).
 *
 * Precedent for vault binary writes in this repo: `ThemeBackgroundStorage`
 * (same owner, plugin-private directory). This class differs by writing into
 * the user content area and therefore treats the vault API — not the raw
 * adapter — as the authority for placement.
 */

import {
  isSafeVaultRelativePath,
  sanitizeVaultFileBaseName,
} from '../../shared/vault';
import type { ImageGenerationMimeType } from '../agents/imagegen/ImageGenerationService';

// Re-exported under their historical names: callers (and tests) import the
// sanitizers from this module; the implementations moved to shared/vault.ts
// so settings normalization (core.types) can reuse the same boundary rules.
export { isSafeVaultRelativePath as isSafeVaultRelativeAssetPath };
export function sanitizeImageAssetBaseName(raw: string): string {
  return sanitizeVaultFileBaseName(raw, 'image');
}

/** The slice of the Obsidian vault this storage needs (injectable for tests). */
export interface ImageAssetVault {
  /** Obsidian's attachment-folder resolution + conflict numbering. */
  getAvailablePathForAttachments(fileName: string): Promise<string>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  trash(path: string): Promise<boolean>;
}

const MIME_TO_EXTENSION: Record<ImageGenerationMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Upper bound for the manual suffix probe (never reached with real Obsidian). */
const MAX_MANUAL_SUFFIX_PROBES = 100;

export class ImageAssetStorage {
  constructor(private readonly vault: ImageAssetVault) {}

  /**
   * W-asset: write one generated image into the attachment folder. Resolves
   * with the vault-relative path of the NEW file; never overwrites. Throws
   * (fail closed) when the attachment path cannot be resolved safely or the
   * binary write fails — callers must treat a throw as "no document change".
   */
  async save(
    data: ArrayBuffer,
    mimeType: ImageGenerationMimeType,
    baseName: string,
  ): Promise<{ path: string }> {
    const extension = MIME_TO_EXTENSION[mimeType];
    if (!extension) {
      throw new Error(`Unsupported generated image type: ${mimeType}`);
    }
    const fileName = `${sanitizeImageAssetBaseName(baseName)}.${extension}`;
    let resolved: string;
    try {
      resolved = await this.vault.getAvailablePathForAttachments(fileName);
    } catch (error) {
      throw new Error(
        `Could not resolve the attachment folder path for "${fileName}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const normalized = resolved.replace(/^\.\//, '');
    if (!isSafeVaultRelativePath(normalized)) {
      // Out-of-vault attachment folder (absolute path) or malformed result:
      // fail closed instead of writing outside the user's content area.
      throw new Error(
        `The resolved attachment path "${normalized}" is outside the vault. Check Obsidian's attachment folder setting.`,
      );
    }
    if (await this.vault.exists(normalized)) {
      // Obsidian normally numbers conflicts itself; this probe is the
      // never-overwrite backstop for hosts that return an occupied path.
      const dotIndex = normalized.lastIndexOf('.');
      const stem = dotIndex > 0 ? normalized.slice(0, dotIndex) : normalized;
      const ext = dotIndex > 0 ? normalized.slice(dotIndex) : '';
      let candidate: string | null = null;
      for (let suffix = 2; suffix < 2 + MAX_MANUAL_SUFFIX_PROBES; suffix += 1) {
        const next = `${stem}-${suffix}${ext}`;
        if (!(await this.vault.exists(next))) {
          candidate = next;
          break;
        }
      }
      if (!candidate) {
        throw new Error(`Could not find a free attachment path for "${fileName}"`);
      }
      await this.vault.writeBinary(candidate, data);
      return { path: candidate };
    }
    await this.vault.writeBinary(normalized, data);
    return { path: normalized };
  }

  /** Best-effort orphan cleanup (R-C2 §4.6); resolves false when nothing was trashed. */
  async trash(path: string): Promise<boolean> {
    try {
      return await this.vault.trash(path);
    } catch {
      return false;
    }
  }
}

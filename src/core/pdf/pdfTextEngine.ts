/**
 * PDF text engine contract and lazy loader (R-C4 phase 1,
 * flowtext-c4-design §3.1/D3).
 *
 * The heavy pdf.js dependency is bundled as a SECOND esbuild artifact
 * (`pdf-engine.js`) that is `require`d only on first use — plugin startup
 * never parses it, and `main.js` carries only this small loader. Loading is
 * fail-closed: a missing or broken engine file produces a typed error the
 * caller renders as an honest notice, never a silent empty context.
 *
 * Loading contract: the artifact is a CommonJS module exporting
 * `{ extractPages }` satisfying `PdfTextEngine`. The host resolves the
 * plugin directory at runtime (`manifest.dir`), so the loader itself stays
 * Obsidian-free and unit-testable.
 *
 * Path reality (live-acceptance fix): Obsidian's `manifest.dir` is a
 * VAULT-RELATIVE path (`.obsidian/plugins/opencodian`), but Node's
 * `createRequire` rejects relative paths. The host therefore also supplies
 * the absolute vault base path and the loader joins the two; an
 * already-absolute dir passes through unchanged, and a relative dir with no
 * base path available fails closed as `engine-missing` instead of throwing
 * a raw `createRequire` TypeError.
 */

import { createRequire } from 'node:module';

import * as path from 'path';

import type { PdfPageText } from '../types';

/** Implemented inside the lazily loaded `pdf-engine.js` artifact. */
export interface PdfTextEngine {
  extractPages(
    data: ArrayBuffer,
    opts: { maxPages: number },
  ): Promise<{
    pageCount: number;
    pages: PdfPageText[];
  }>;
}

/** Typed loader failures (fail-closed, design §4 row 4). */
export type PdfEngineLoadError =
  | { kind: 'engine-missing'; detail: string }
  | { kind: 'engine-broken'; detail: string }
  | { kind: 'encrypted' }
  | { kind: 'extraction-failed'; detail: string };

export class PdfEngineError extends Error {
  constructor(readonly failure: PdfEngineLoadError) {
    super(`PdfEngine ${failure.kind}: ${'detail' in failure ? failure.detail : 'encrypted pdf'}`);
    this.name = 'PdfEngineError';
  }
}

/**
 * True when an extraction error is pdf.js's PasswordException (an encrypted
 * PDF). Kept host-side so the engine artifact stays a pure extractor.
 */
export function isPasswordFailure(error: unknown): boolean {
  const name = (error as { name?: unknown })?.name;
  if (typeof name === 'string' && name.toLowerCase().includes('password')) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /password/iu.test(message);
}

export interface PdfEngineLoaderHost {
  /**
   * Plugin directory (`manifest.dir`); undefined before load — fail closed.
   * May be vault-relative (that is what Obsidian actually provides).
   */
  getPluginDir(): string | undefined;
  /**
   * Absolute vault base path (the `FileSystemAdapter` basePath), used to
   * resolve a vault-relative `getPluginDir()`. Required so no construction
   * site can "forget" it — the D3 class of bug (production wiring passing a
   * relative dir while tests inject absolute ones) must fail at typecheck.
   * Return null when no absolute base exists (e.g. mobile) — the loader
   * then fails closed for relative dirs with an honest `engine-missing`.
   */
  getVaultBasePath(): string | null | undefined;
}

interface PdfEngineModule {
  extractPages?: unknown;
}

export class PdfEngineLoader {
  private engine: PdfTextEngine | null = null;
  private loadPromise: Promise<PdfTextEngine> | null = null;

  constructor(private readonly host: PdfEngineLoaderHost) {}

  /**
   * Resolve the engine on first use and cache it. Consecutive calls share
   * one load promise; a failed load is retried on the next call (a user
   * might fix a broken deployment without restarting).
   */
  async load(): Promise<PdfTextEngine> {
    if (this.engine) {
      return this.engine;
    }
    if (!this.loadPromise) {
      this.loadPromise = this.requireEngine().catch((error) => {
        this.loadPromise = null;
        throw error;
      });
    }
    return this.loadPromise;
  }

  /** True once an engine is resident (tests/debug surfaces only). */
  isLoaded(): boolean {
    return this.engine !== null;
  }

  private async requireEngine(): Promise<PdfTextEngine> {
    const pluginDir = this.resolvePluginDir();
    let mod: PdfEngineModule;
    try {
      // `resolvePluginDir` guarantees an absolute path, so `createRequire`
      // accepts it and resolves `pdf-engine.js` next to `main.js`. The
      // specifier is computed at runtime — the bundler never tries to
      // inline it, and nothing is loaded until the first PDF attach/index.
      const requireFromPlugin = createRequire(path.join(pluginDir, 'main.js'));
      mod = requireFromPlugin('./pdf-engine.js') as PdfEngineModule;
    } catch (error) {
      throw new PdfEngineError({
        kind: 'engine-missing',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    if (!mod || typeof mod.extractPages !== 'function') {
      throw new PdfEngineError({
        kind: 'engine-broken',
        detail: 'pdf-engine.js does not export extractPages()',
      });
    }
    this.engine = mod as unknown as PdfTextEngine;
    return this.engine;
  }

  /**
   * Produce an absolute plugin directory for `createRequire`. An
   * already-absolute dir passes through unchanged; a vault-relative dir
   * (the production `manifest.dir` shape) is joined onto the host's vault
   * base path. Without any way to obtain an absolute path the loader fails
   * closed with the honest typed error — never a raw createRequire throw.
   */
  private resolvePluginDir(): string {
    const pluginDir = this.host.getPluginDir();
    if (!pluginDir) {
      throw new PdfEngineError({ kind: 'engine-missing', detail: 'plugin directory unavailable' });
    }
    if (path.isAbsolute(pluginDir)) {
      return pluginDir;
    }
    const vaultBasePath = this.host.getVaultBasePath() ?? null;
    if (!vaultBasePath) {
      throw new PdfEngineError({
        kind: 'engine-missing',
        detail: `plugin directory '${pluginDir}' is vault-relative and no absolute vault base path is available`,
      });
    }
    return path.join(vaultBasePath, pluginDir);
  }
}

export type { PdfPageText };

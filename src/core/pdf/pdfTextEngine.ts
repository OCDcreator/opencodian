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
  /** Plugin directory (`manifest.dir`); undefined before load — fail closed. */
  getPluginDir(): string | undefined;
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
    const pluginDir = this.host.getPluginDir();
    if (!pluginDir) {
      throw new PdfEngineError({ kind: 'engine-missing', detail: 'plugin directory unavailable' });
    }
    let mod: PdfEngineModule;
    try {
      // The plugin loads from the plugin directory (`manifest.dir`), so a
      // require anchored there resolves `pdf-engine.js` next to `main.js`.
      // The specifier is computed at runtime — the bundler never tries to
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
}

export type { PdfPageText };

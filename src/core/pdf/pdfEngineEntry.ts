/**
 * Second esbuild entry point → `pdf-engine.js` (R-C4 phase 1, design §3.1/D3).
 *
 * This module is NOT part of `main.js`: it bundles pdf.js (pdfjs-dist) and is
 * `require`d on first PDF attach/index through `PdfEngineLoader`. Plugin
 * startup therefore never parses the MB-sized engine.
 *
 * Worker strategy: pdf.js runs its extraction on the main thread via the
 * documented `globalThis.pdfjsWorker` hook — bundling the worker module and
 * registering its `WorkerMessageHandler` means no `Worker` and no runtime
 * script fetch is attempted (both unreliable inside Obsidian). Page
 * extraction yields between pages (`await`), so the UI stays responsive.
 *
 * Exports (CJS via esbuild): `{ extractPages }` satisfying `PdfTextEngine`.
 * Errors propagate raw; the host side classifies encrypted documents via
 * `isPasswordFailure` (kept out of this artifact so `main.js` never imports
 * anything from it).
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

import type { PdfPageText } from '../types';
import { pageTextFromLines, rebuildPageLines } from './pdfTextLayout';

// Main-thread worker hook (see header). pdf.js reads this lazily when a
// document is opened; assigning it here keeps everything inside the artifact.
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

interface TextItemLike {
  str?: string;
  transform?: number[];
}

export async function extractPages(
  data: ArrayBuffer,
  opts: { maxPages: number },
): Promise<{ pageCount: number; pages: PdfPageText[] }> {
  const task = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    // Text extraction only: no rendering, no font fetching.
    useSystemFonts: false,
    disableAutoFetch: true,
    disableStream: true,
  });
  const doc = await task.promise;

  try {
    const pageCount = doc.numPages;
    const boundedCount = Math.min(pageCount, Math.max(0, opts.maxPages));
    const pages: PdfPageText[] = [];
    for (let pageNumber = 1; pageNumber <= boundedCount; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const items = (content.items as unknown as TextItemLike[]).map((item) => ({
          str: typeof item.str === 'string' ? item.str : '',
          transform: Array.isArray(item.transform) ? item.transform : [],
        }));
        pages.push({ page: pageNumber, text: pageTextFromLines(rebuildPageLines(items)) });
      } finally {
        page.cleanup();
      }
      // Yield between pages so a long document cannot wedge the UI thread.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return { pageCount, pages };
  } finally {
    // Destroying the loading task tears down the worker transport/document.
    await task.destroy().catch(() => undefined);
  }
}

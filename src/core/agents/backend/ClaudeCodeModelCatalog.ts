/**
 * ClaudeCodeModelCatalog — deprecated compatibility re-export.
 *
 * The actual backend-neutral model catalog implementation now lives in
 * `BackendModelCatalog.ts`. This module exists solely to preserve the
 * established import contract for the 4+ existing callers (including the
 * guarded `OpenCodianView.ts`). New code should import from
 * `BackendModelCatalog` directly.
 *
 * This file MUST NOT contain any implementation — it only re-exports.
 */
export * from './BackendModelCatalog';

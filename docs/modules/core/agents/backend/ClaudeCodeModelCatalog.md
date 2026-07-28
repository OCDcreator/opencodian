# ClaudeCodeModelCatalog (deprecated compatibility re-export)

> **Source**: `src/core/agents/backend/ClaudeCodeModelCatalog.ts`
> **Status**: [DEPRECATED]

## Overview

Deprecated compatibility re-export module. All implementation moved to `BackendModelCatalog.ts`. This file exists solely to preserve the established import contract for the 4+ existing callers (including the guarded `OpenCodianView.ts`). New code must import from `BackendModelCatalog` directly.

## Notes

- This file contains NO implementation — only `export * from './BackendModelCatalog'`.
- The `ClaudeCodeModelCatalogEntry` type is legitimately Claude-specific and lives in `BackendModelCatalog.ts`.

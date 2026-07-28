# BackendModelCatalog

> **Source**: `src/core/agents/backend/BackendModelCatalog.ts`
> **Status**: [ACTIVE]

## Overview

Backend-neutral model catalog helpers for Claude Code and Codex composer model selectors. Owns all model selector provider types, constants, builder functions, and backend-neutral resolution helpers.

The deprecated `ClaudeCodeModelCatalog.ts` re-exports everything from this module to preserve the established import contract for existing callers (including the guarded `OpenCodianView.ts`).

## Key exports

| Export | Description |
|--------|-------------|
| `BackendModelSelectorProvider` | Backend-neutral provider type |
| `buildClaudeCodeModelSelectorProviders(models)` | Build Claude Code providers |
| `buildCodexModelSelectorProviders(models)` | Build Codex providers (single group, not switchable) |
| `CODEX_PROVIDER_ID`, `CODEX_CUSTOM_MODEL_SENTINEL` | Codex constants |
| `resolveBackendModelCatalog(...)`, `resolveBackendDefaultModel(...)`, etc. | Backend-neutral resolution helpers |

## Notes

- Codex constants (`CODEX_PROVIDER_ID`, `CODEX_CUSTOM_MODEL_SENTINEL`, `CODEX_EFFORT_VARIANTS`) and `buildCodexModelSelectorProviders` live here, NOT in a Claude-named module.
- The `ClaudeCodeModelCatalogEntry` type is legitimately Claude-specific (input shape for Claude Code aliases).

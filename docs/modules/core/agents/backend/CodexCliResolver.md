# CodexCliResolver

> **源码**: `src/core/agents/backend/CodexCliResolver.ts`
> **状态**: [STABLE]

## Purpose

Resolves the executable for a user-installed local Codex CLI. It never reads a
plugin-private `node_modules` runtime.

## Resolution order

1. A non-empty `backendSettings.codex.executablePath` is authoritative. An
   invalid configured path reports `configured-path-not-found` and does not
   silently fall back.
2. An empty setting searches the GUI-visible PATH plus common user install
   locations.
3. On Windows it prefers a native `codex.exe`; when npm supplies only
   `codex.cmd`, it verifies the sibling `@openai/codex/package.json` and
   resolves the matching `@openai/codex-win32-*` native `codex.exe` instead of
   spawning the `.cmd` shim.
4. A missing CLI returns `cli-not-on-path` with an actionable install message.

The resolver is pure apart from its injectable `existsSync` seam, so platform,
PATH, and Windows npm layouts have deterministic unit coverage.

# CodexGlobalConfigSummaryReader

> **源码**: `src/core/agents/backend/CodexGlobalConfigSummaryReader.ts`
> **状态**: [ACTIVE]
> **Updated**: 2026-07-28 — malformed URL fail-closed: strips userinfo heuristically, returns null when @ cannot be safely removed.

## 概述

Safe read-only summary reader for `~/.codex/config.toml` (or `$CODEX_HOME/config.toml`). Isolates the high-risk TOML reading + secret redaction boundary. This is the ONLY chokepoint for reading global Codex config into the plugin UI.

## 安全契约

- Reads the file ONCE per call. No watching, polling, streaming, or caching.
- Parses TOML and extracts ONLY an explicit allowlist of safe display fields.
- Sanitizes every URL by stripping user-info, query, and fragment.
- NEVER exposes env_key, http_headers, env_http_headers, auth.*, query_params, retry/timeout values, unknown keys, raw TOML, or parse-error content.
- NEVER writes, creates, deletes, formats, restores, or opens an editor for ~/.codex/config.toml or ~/.codex/auth.json.
- Only reports configuration DECLARATION; never claims app-server runtime provider (see upstream #23417).

## 核心导出

| 导出 | 说明 |
|------|------|
| `resolveGlobalCodexConfigPath()` | Resolve `$CODEX_HOME/config.toml` or `~/.codex/config.toml` |
| `sanitizeConfigUrl(raw)` | Strip user-info, query, fragment from a URL |
| `readGlobalCodexConfigSummary(options?)` | Read + parse + redact; returns typed summary |
| `hashGlobalCodexConfigSummary(summary)` | Stable content hash for change detection |
| `GlobalCodexConfigSummary` / `GlobalCodexConfigProviderSummary` / `GlobalCodexConfigFileState` | Public types |

## 注意事项

- Consumed by `SettingsCodexAccountSurface` for the "Global Codex configuration summary" card.
- Parse failures and read failures NEVER include raw content, partial TOML, or error strings.
- Tests cover: missing file, valid TOML, bad TOML, permission denied, URL sanitization, env_key/headers/auth/query_params redaction, CODEX_HOME resolution, no-write verification.

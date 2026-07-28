# SettingsCodexProjectConfigSection

> **源码**: `src/features/settings/SettingsCodexProjectConfigSection.ts`
> **状态**: [ACTIVE]
> **Updated**: 2026-07-28 — added listHistory() and restoreEntry() with CAS protection; advanced TOML save returns focused diagnostics; additional_directories form save fails closed on complex formatting.

## 概述

Vault-level `.codex/config.toml` editor. Manages exactly `<vault-root>/.codex/config.toml`. Defaults inherit global per field; absence means inherit. Reuses `ProjectResourceSecureWrite` + `ConfigurationArchiveService` for CAS, archive-before-mutation, conflict detection, and no force-overwrite.

## 职责

- Resolve the vault-root `.codex/config.toml` path.
- Build a narrow explicit vault-root allowlist for this one target.
- Read the project config safely via `readAllowlistedFileSnapshot`.
- Save form values via surgical TOML editing + `safeWriteFile` (CAS + archive).
- Save raw advanced TOML via `safeWriteFile` after allowlist validation.
- Handle conflicts, invalid content, and write failures with typed results.

## 核心导出

| 导出 | 说明 |
|------|------|
| `SettingsCodexProjectConfigSection` | Class; `read()`, `save()`, `saveAdvancedToml()` |
| `ProjectConfigReadResult` | Typed read result |

## 安全边界

- Uses descriptor-bound snapshot + FileRevision CAS for optimistic concurrency.
- Archive-before-mutation; no force-overwrite.
- External directories outside the vault require explicit confirmation (handled in the settings UI caller).
- Never writes `~/.codex/config.toml` or `~/.codex/auth.json`.

## 注意事项

- Instantiated by `SettingsCodexSection` and rendered from `renderProjectConfigGroup()` inside the **Project configuration** secondary tab.
- The form uses `CodexProjectConfigFormModel` for validation and surgical TOML editing.
- The advanced TOML editor validates against the same allowlist before save.
- Project config UI shows persistence/application/runtime truth honestly: filesystem persistence can be verified; runtime/provider application must remain pending/unavailable unless actually read back.

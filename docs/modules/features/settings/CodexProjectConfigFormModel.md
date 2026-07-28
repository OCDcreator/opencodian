# CodexProjectConfigFormModel

> **源码**: `src/features/settings/CodexProjectConfigFormModel.ts`
> **状态**: [ACTIVE]
> **Updated**: 2026-07-28 — strict value-shape validation (invalid-shape diagnostics for wrong types/enums/nested tables); surgical scalar edits preserve trailing inline comments; additional_directories fail-closed on multiline/commented formatting.
> **Updated**: 2026-07-28 — adds network_access and web_search boolean keys to allowed set, strict shape validation, parse/build, and UI.

## 概述

Form model, allowlist validation, and surgical TOML editing for the vault-level `<vault-root>/.codex/config.toml`. Defines exactly which project-level keys are safe, validates TOML against that allowlist, and applies surgical edits that preserve comments and formatting.

## 安全契约

- Project-level config can ONLY override safe behavior parameters: `model`, `model_reasoning_effort`, `sandbox_mode`, `approval_policy`, `additional_directories`.
- Forbidden keys (model_provider, openai_base_url, [model_providers], auth, notification, telemetry, env_key, headers, query_params, retry/timeout) are blocked with focused diagnostics.
- Unknown keys are also blocked. Never strips or silently preserves forbidden/unknown input.
- Form saves use surgical TOML text editing to preserve comments, key order, and formatting. If a safe edit cannot be located, save is blocked (no canonical rewrite).
- Absence of a key means "inherit global"; the form never writes `inherit`.

## 核心导出

| 导出 | 说明 |
|------|------|
| `CODEX_PROJECT_ALLOWED_KEYS` | ReadonlySet of safe project-level keys |
| `CODEX_PROJECT_FORBIDDEN_KEY_PATTERNS` | Forbidden key patterns with labels |
| `validateCodexProjectTomlKeys(parsed)` | Validate parsed TOML against allowlist |
| `validateCodexProjectTomlContent(content)` | Parse + validate raw TOML string |
| `applyTomlScalarEdits(content, edits)` | Surgical TOML editing preserving comments |
| `parseProjectConfigFormValues(content)` | Parse TOML into form values |
| `buildProjectConfigEdits(values)` | Build scalar edits from form values |
| `CodexProjectConfigFormValues` / `TomlScalarEdit` / `CodexProjectConfigValidationResult` | Public types |

## 注意事项

- Consumed by `SettingsCodexProjectConfigSection`.
- `applyTomlScalarEdits` returns null when a key exists as an unclosed multi-line array (cannot safely edit in-place). The caller blocks save and guides the user to advanced mode.
- Tests cover: allowlist, forbidden keys, unknown keys, surgical editing (update/insert/remove), comment preservation, key order, escaping, multi-line array blocking, form values parsing.

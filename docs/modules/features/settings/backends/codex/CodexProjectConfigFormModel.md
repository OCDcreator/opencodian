# CodexProjectConfigFormModel

> **源码**: `src/features/settings/backends/codex/CodexProjectConfigFormModel.ts`
> **状态**: [ACTIVE]
> **Updated**: 2026-07-28 — strict value-shape validation (invalid-shape diagnostics for wrong types/enums/nested tables); surgical scalar edits preserve trailing inline comments; additional_directories fail-closed on multiline/commented formatting.
> **Updated**: 2026-07-28 — adds network_access and web_search boolean keys to allowed set, strict shape validation, parse/build, and UI.

> **2026-11-08 approval_policy 修复**: 导出 `CODEX_PROJECT_APPROVAL_POLICY_SUPPORTED`（guided 面仅 `never`/`on-request`）与 `isGuidedCodexProjectApprovalPolicy` / `isCliRetiredCodexProjectApprovalPolicy`。高级编辑器校验枚举为 `never`/`on-request`/`on-failure`（on-failure 仍是 CLI 合法值，仅不在插件引导面）；`untrusted`（Codex CLI 0.15x 已移除，配置加载硬失败）触发专用诊断 `settings.codex.projectConfig.diagnostic.retiredApprovalPolicy`。`buildProjectConfigEdits` 跳过非 guided 的 approval_policy 编辑：无关表单保存不再悄悄回写/清除该行，修复仅在用户显式选择受支持值（或 inherit）时发生，外部文件字节保持不动。

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
- 2026-09-08：项目 `model_reasoning_effort` 白名单新增 Codex SDK 0.153.4 的 `max`、`ultra`、`persistent`；未识别值仍阻止保存。

## 目录定位（2026-10-23）

- 源码位置：`src/features/settings/backends/codex/CodexProjectConfigFormModel.ts`。
- 原位置：`src/features/settings/CodexProjectConfigFormModel.ts`；文件名、导出接口与业务职责保持不变。

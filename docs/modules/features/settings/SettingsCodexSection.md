# SettingsCodexSection

**File:** `src/features/settings/SettingsCodexSection.ts`
**Status:** ACTIVE

## Purpose

Minimal settings panel for the Codex backend adapter. Renders the connection/authentication settings surface with only fields that are genuinely wired through to the Codex SDK adapter.

## Exports

| Export | Kind | Notes |
|--------|------|-------|
| `SettingsCodexSection` | Class | Obsidian settings section for Codex backend |
| `SettingsCodexSectionOptions` | Interface | Constructor options |

## Settings Surface

| Field | Type | Wired | Status | Notes |
|-------|------|-------|--------|-------|
| `apiKey` | `string` | Yes | Reviewed surface | Visible in the ordinary settings UI; runtime auth effect is not re-proven by checkpoint 5A itself |
| `model` | `string` | Yes | Reviewed surface | Visible in the ordinary settings UI; empty = SDK default; deep runtime effect is proven elsewhere only at next-thread/writeback boundaries |
| `sandboxMode` | `string` (dropdown) | Yes | **Productized** (Checkpoint 14A) | Dropdown in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateSandboxMode()` for next-thread boundary |
| `modelReasoningEffort` | `string` (dropdown) | Yes | **Productized** (Checkpoint 14B) | Dropdown in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateModelReasoningEffort()` for next-thread boundary |
| `additionalDirectories` | `string` (newline-separated) | Yes | **Productized** (Checkpoint 10A) | Textarea in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateAdditionalDirectories()` for next-thread boundary |
| `networkAccessEnabled` | `boolean` | Yes | **Productized** (Checkpoint 10A) | Toggle in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateNetworkAccessEnabled()` for next-thread boundary |
| Authentication info | — | — | Passive | Disabled notice describing auth sources |
| Session browser launcher | — | Yes | **Productized** (Checkpoint 13E) | Button opening `BackendSessionBrowserModal` with `forcedBackendKind: 'codex'` and `supportsResume: true`; resume is limited to in-memory sessions |
| Account info readback | — | Yes | **Readback** (Checkpoint 15A) | Button-triggered `codex doctor --json` diagnostic readback; sanitized JSON with secret redaction; `data-codex-account-info-readback` |
| Model catalog readback | — | Yes | **Readback** (Checkpoint 15B) | Button-triggered `codex debug models` diagnostic readback; filters `visibility !== 'hide'` and `supported_in_api === true`; `data-codex-model-list-readback` |
| Permission profile readback | — | Yes | **Readback** (Checkpoint 15C) | Button-triggered `permissionProfile/list` app-server diagnostic readback; returns `id` + optional `description`; `data-codex-permission-profiles-readback` |
| Account rate limits readback | — | Yes | **Readback** (Checkpoint 15D) | Button-triggered `account/rateLimits/read` app-server diagnostic readback; returns `rateLimits` + optional `rateLimitsByLimitId`; `data-codex-rate-limits-readback` |

### Hidden from ordinary settings surface (still in types/wiring)

| Field | Why hidden |
|-------|-----------|
| `webSearchMode` | Mode differentiation (`disabled`/`cached`/`live`) not yet runtime-proven; remains `readback` |
| Account usage readback | Checkpoint 15E showed the currently bundled `codex-cli 0.137.0` app-server protocol omits `account/usage/read`, so the ordinary settings control was removed rather than leaving a dead button in the public surface |

## Architecture

- Instantiated by `SettingsTabbedRenderer.renderCodexContent()`
- Reads/writes `plugin.settings.backendSettings.codex`
- Registered as tab `codex` with `backendRequired: 'codex'` in `settingsLayoutRegistry`
- Follows the same `attach()` / `attachTabbed()` pattern as `SettingsClaudeCodeSection`

## Boundaries

- Only exposes settings that are genuinely wired through to `CodexAdapter`
- Checkpoint 5A contracted the ordinary settings surface to `apiKey + model + connection info` only, and Checkpoint 10A re-promoted `additionalDirectories` plus `networkAccessEnabled` after focused settings-surface review
- `modelReasoningEffort` is now exposed in ordinary settings and also remains accessible via the per-conversation session settings modal
- `sandboxMode`, `modelReasoningEffort`, `additionalDirectories`, and `networkAccessEnabled` are honest next-thread boundaries: the settings UI updates adapter options for future thread creation/resume, not the currently running turn
- `webSearchMode` remains outside the ordinary settings surface until `disabled` / `cached` / `live` mode differentiation has stronger runtime proof
- account usage stays outside the ordinary settings surface after Checkpoint 15E: the exploratory `CodexAppServerClient.getAccountUsage()` code path remains in the repo, but the public settings control is hidden because the current bundled runtime does not expose a usable `account/usage/read` route
- Settings-side session browser supports resume for in-memory Codex sessions via `supportsResume: true`; the UI copy explicitly states that resume is limited to live adapter memory and does not discover persisted/external threads
- Underlying types and adapter wiring for all 7 `CodexBackendSettings` fields are preserved; the ordinary UI still intentionally leaves part of that surface hidden/readback

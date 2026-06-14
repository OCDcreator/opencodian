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

## Dependencies

| Module | Relationship |
|--------|--------------|
| `SettingsCodexReadbackControls` | Delegates the remaining diagnostic readbacks (model catalog, permission profiles, MCP servers, loaded threads) and the session-browser launcher |
| `SettingsCodexAccountSurface` | Delegates the four account/capability product cards (identity, usage, rate limits, provider capabilities) |

## Settings Surface

| Field | Type | Wired | Status | Notes |
|-------|------|-------|--------|-------|
| `apiKey` | `string` | Yes | Reviewed surface | Visible in the ordinary settings UI; runtime auth effect is not re-proven by checkpoint 5A itself |
| `model` | `string` (dropdown + custom) | Yes | **Productized selector UI** (Round 2) | Async dropdown populated from app-server `model/list` with CLI `codex debug models` fallback, plus "Custom..." fallback text input; the underlying `CodexBackendSettings.model` → `adapter.updateModel()` write path was already accepted before Round 2; live adapter update via `updateModel()` for next-thread boundary |
| `sandboxMode` | `string` (dropdown) | Yes | **Productized** (Checkpoint 14A) | Dropdown in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateSandboxMode()` for next-thread boundary |
| `modelReasoningEffort` | `string` (dropdown) | Yes | **Productized** (Checkpoint 14B) | Dropdown in ordinary settings; persisted to `CodexBackendSettings`; live adapter writeback via `updateModelReasoningEffort()` for next-thread boundary |
| `additionalDirectories` | `string` (newline-separated) | Yes | **Productized** (Checkpoint 10A) | Textarea in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateAdditionalDirectories()` for next-thread boundary |
| `networkAccessEnabled` | `boolean` | Yes | **Productized** (Checkpoint 10A) | Toggle in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateNetworkAccessEnabled()` for next-thread boundary |
| `webSearchMode` | `string` (dropdown) | Yes | **Settings-only** (Checkpoint 15F) | Dropdown in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateWebSearchMode()` for next-thread boundary. Settings description honestly states distinct runtime behavior between modes is not yet proven. |
| Authentication info | — | — | **Settings-only** (Round 3) | Disabled row showing dynamic auth source description: "API key from plugin settings" when configured, "OPENAI_API_KEY env or ChatGPT login" when not. No write control. |
| Session browser launcher | — | Yes | **Productized** (Checkpoint 13E) | Button opening `BackendSessionBrowserModal` with `forcedBackendKind: 'codex'` and `supportsResume: true`; resume is limited to in-memory sessions. Rendered by `SettingsCodexReadbackControls`. |
| Model catalog readback | — | Yes | **Readback** (Checkpoint 15B) | Button-triggered `codex debug models` diagnostic readback; filters `visibility !== 'hide'` and `supported_in_api === true`; `data-codex-model-list-readback`. Rendered by `SettingsCodexReadbackControls`. |
| Permission profile readback | — | Yes | **Readback** (Checkpoint 15C) | Button-triggered `permissionProfile/list` app-server diagnostic readback; returns `id` + optional `description`; `data-codex-permission-profiles-readback`. Rendered by `SettingsCodexReadbackControls`. |
| MCP server status readback | — | Yes | **Readback** (Checkpoint 15N) | Button-triggered `mcpServerStatus/list` app-server diagnostic readback; opens `CodexMcpServerDetailModal`; includes a reload button that calls `config/mcpServer/reload`. Rendered by `SettingsCodexReadbackControls`. |
| Loaded threads readback | — | Yes | **Readback** | Button-triggered `thread/loaded/list` diagnostic readback. Rendered by `SettingsCodexReadbackControls`. |
| Account & capability surface | — | Yes | **Readback (product-grade cards)** (Round 13) | Four auto-loading product cards rendered by `SettingsCodexAccountSurface`: account identity (`account/read`), token usage (`account/usage/read`), rate limits (`account/rateLimits/read`), provider capabilities (`modelProvider/capabilities/read`). UI elevated from JSON-dump buttons to product cards; truth bucket stays `readback` (read-only info displays). See `SettingsCodexAccountSurface.md`. |

> **Note on the account/capability surfaces (Round 13/14)**: the four `account/read`, `account/usage/read`, `account/rateLimits/read`, and `modelProvider/capabilities/read` surfaces previously lived here as individual "Inspect …" buttons + `<pre>` JSON dumps (and account usage was briefly hidden in Checkpoint 15E under the 0.137.0 runtime). Round 13 moved all four into `SettingsCodexAccountSurface` as product-grade cards (badges, stat tiles, chips, honest auth-required states) and they are no longer rendered by `SettingsCodexSection` or `SettingsCodexReadbackControls` directly. Their truth bucket is `readback` — the UI was productized but the capability remains read-only. Account usage is no longer hidden; it is a visible product card.

## Architecture

- Instantiated by `SettingsTabbedRenderer.renderCodexContent()`
- Reads/writes `plugin.settings.backendSettings.codex`
- Registered as tab `codex` with `backendRequired: 'codex'` in `settingsLayoutRegistry`
- Follows the same `attach()` / `attachTabbed()` pattern as `SettingsClaudeCodeSection`
- Owns the wired settings controls (`apiKey`, `model`, `sandboxMode`, `modelReasoningEffort`, `additionalDirectories`, `networkAccessEnabled`, `webSearchMode`) and applies live adapter updates via `applyCodexRuntimeUpdates()`
- Delegates the remaining diagnostic readbacks to `SettingsCodexReadbackControls` and the four account/capability product cards to `SettingsCodexAccountSurface`

## Boundaries

- Only exposes settings that are genuinely wired through to `CodexAdapter`
- Checkpoint 5A contracted the ordinary settings surface to `apiKey + model + connection info` only, and Checkpoint 10A re-promoted `additionalDirectories` plus `networkAccessEnabled` after focused settings-surface review
- `modelReasoningEffort` is now exposed in ordinary settings and also remains accessible via the per-conversation session settings modal
- `sandboxMode`, `model`, `modelReasoningEffort`, `additionalDirectories`, `networkAccessEnabled`, and `webSearchMode` are honest next-thread boundaries: the settings UI updates adapter options for future thread creation/resume, not the currently running turn
- `webSearchMode` is productized in ordinary settings as **settings-only** (Checkpoint 15F): dropdown with `disabled`/`cached`/`live` options; persisted to `CodexBackendSettings`; live adapter update via `updateWebSearchMode()`. Settings persistence and adapter wiring verified; distinct runtime web-search behavior between modes is not yet end-to-end proven.
- Settings-side session browser supports resume for in-memory Codex sessions via `supportsResume: true`; the UI copy explicitly states that resume is limited to live adapter memory and does not discover persisted/external threads
- Underlying types and adapter wiring for all 7 `CodexBackendSettings` fields are preserved; all 7 fields are now exposed in the ordinary settings UI

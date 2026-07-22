# SettingsCodexSection

**File:** `src/features/settings/SettingsCodexSection.ts`
**Status:** ACTIVE

## Purpose

Codex backend settings panel. Uses three secondary tabs under the Codex primary tab to avoid piling unrelated settings into a single flat card stack:

1. **Connection** — genuinely wired SDK options (`apiKey`, `model`, `sandboxMode`, `modelReasoningEffort`, `additionalDirectories`, `networkAccessEnabled`, `webSearchMode`) plus a lightweight connection-source summary.
2. **Resume & inspect** — the backend session browser and live runtime readbacks (model catalog, permission profiles, MCP servers, loaded threads).
3. **Account** — live read-only account/capability cards rendered by `SettingsCodexAccountSurface`.

The old disabled "Authentication" setting is replaced by the connection-source summary and an auth-source row inside the Account surface, so the UI never presents a disabled input as a status indicator.

## Context availability

The Context Ring is not configured from Account usage. It becomes available only after the local Codex app-server accepts the experimental API negotiation and can publish `thread/tokenUsage/updated`; otherwise the settings copy explains that upgrading Codex enables real session-context usage while SDK chat remains available.

## Cost estimates

The Account tab also exposes the shared cost-estimate entry. It uses the app-server's authoritative session tokens but not account usage. By default the returned model ID matches models.dev automatically; custom Codex providers only need the optional pricing Provider ID / Base URL when their gateway price differs or the model ID is ambiguous. These fields identify prices only and never write `~/.codex/config.toml`, `model_provider`, or `openai_base_url`.

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
| `apiKey` | `string` | Yes | Connection tab | Visible in the ordinary settings UI; runtime auth effect is not re-proven by checkpoint 5A itself |
| `model` | `string` (dropdown + custom) | Yes | Connection tab | Async dropdown populated from app-server `model/list` with CLI `codex debug models` fallback, plus a "Loading models..." placeholder and "Custom..." fallback text input; the underlying `CodexBackendSettings.model` → `adapter.updateModel()` write path was already accepted before Round 2; live adapter update via `updateModel()` for next-thread boundary |
| `sandboxMode` | `string` (dropdown) | Yes | Connection tab | Dropdown in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateSandboxMode()` for next-thread boundary |
| `modelReasoningEffort` | `string` (dropdown) | Yes | Connection tab | Dropdown in ordinary settings; persisted to `CodexBackendSettings`; live adapter writeback via `updateModelReasoningEffort()` for next-thread boundary |
| `additionalDirectories` | `string` (newline-separated) | Yes | Connection tab | Textarea in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateAdditionalDirectories()` for next-thread boundary |
| `networkAccessEnabled` | `boolean` | Yes | Connection tab | Toggle in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateNetworkAccessEnabled()` for next-thread boundary |
| `webSearchMode` | `string` (dropdown) | Yes | Connection tab | Dropdown in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateWebSearchMode()` for next-thread boundary. Settings description honestly states distinct runtime behavior between modes is not yet proven. |
| Connection source summary | — | — | Connection tab | Lightweight read-only strip showing dynamic auth source description: "API key from plugin settings" when configured, "OPENAI_API_KEY env or ChatGPT login" when not. No write control. |
| Session browser launcher | — | Yes | Resume & inspect tab | Button opening `BackendSessionBrowserModal` with `forcedBackendKind: 'codex'` and `supportsResume: true`; resume is limited to in-memory sessions. Rendered by `SettingsCodexReadbackControls`. |
| Model catalog readback | — | Yes | Resume & inspect tab | Button-triggered live model catalog from `codex debug models`; opens `CodexReadbackModal`. Rendered by `SettingsCodexReadbackControls`. |
| Permission profile readback | — | Yes | Resume & inspect tab | Button-triggered live permission profile list from `permissionProfile/list`; opens `CodexReadbackModal`. Rendered by `SettingsCodexReadbackControls`. |
| MCP server status readback | — | Yes | Resume & inspect tab | Button-triggered live MCP server status from `mcpServerStatus/list`; opens `CodexMcpServerDetailModal`; includes a reload button that calls `config/mcpServer/reload`. Rendered by `SettingsCodexReadbackControls`. |
| Loaded threads readback | — | Yes | Resume & inspect tab | Button-triggered live loaded-thread list from `thread/loaded/list`; opens `CodexReadbackModal`. Rendered by `SettingsCodexReadbackControls`. |
| Account & capability surface | — | Yes | Account tab | Four auto-loading product cards rendered by `SettingsCodexAccountSurface`: account identity (`account/read`), token usage (`account/usage/read`), rate limits (`account/rateLimits/read`), provider capabilities (`modelProvider/capabilities/read`). UI elevated from JSON-dump buttons to product cards; truth bucket stays `readback` (read-only info displays). See `SettingsCodexAccountSurface.md`. |

> **Note on the account/capability surfaces (Round 13/14)**: the four `account/read`, `account/usage/read`, `account/rateLimits/read`, and `modelProvider/capabilities/read` surfaces previously lived here as individual "Inspect …" buttons + `<pre>` JSON dumps (and account usage was briefly hidden in Checkpoint 15E under the 0.137.0 runtime). Round 13 moved all four into `SettingsCodexAccountSurface` as product-grade cards (badges, stat tiles, chips, honest auth-required states) and they are no longer rendered by `SettingsCodexSection` or `SettingsCodexReadbackControls` directly. Their truth bucket is `readback` — the UI was productized but the capability remains read-only. Account usage is no longer hidden; it is a visible product card.

## Architecture

- Instantiated by `SettingsTabbedRenderer.renderCodexContent()`
- Reads/writes `plugin.settings.backendSettings.codex`
- Registered as primary tab `codex` with `backendRequired: 'codex'` in `settingsLayoutRegistry`; secondary tabs are `connection` (default), `resume-inspect`, and `account`
- Follows the same `attach()` / `attachTabbed()` pattern as `SettingsClaudeCodeSection`
- Owns the wired settings controls (`apiKey`, `model`, `sandboxMode`, `modelReasoningEffort`, `additionalDirectories`, `networkAccessEnabled`, `webSearchMode`) inside the **Connection** tab and applies live adapter updates via `applyCodexRuntimeUpdates()`
- Renders a lightweight connection-source summary instead of a disabled "Authentication" setting
- Delegates the remaining live runtime readbacks to `SettingsCodexReadbackControls` inside the **Resume & inspect** tab
- Mounts the four account/capability product cards via `SettingsCodexAccountSurface` inside the **Account** tab, passing the inferred `authSource` derived from the plugin `apiKey` field

## Boundaries

- Only exposes settings that are genuinely wired through to `CodexAdapter`
- The disabled "Authentication" setting was removed in favor of a connection-source summary row and the auth-source row inside `SettingsCodexAccountSurface`
- `modelReasoningEffort` is now exposed in ordinary settings and also remains accessible via the per-conversation session settings modal
- `sandboxMode`, `model`, `modelReasoningEffort`, `additionalDirectories`, `networkAccessEnabled`, and `webSearchMode` are honest next-thread boundaries: the settings UI updates adapter options for future thread creation/resume, not the currently running turn
- `webSearchMode` is productized in ordinary settings as **settings-only** (Checkpoint 15F): dropdown with `disabled`/`cached`/`live` options; persisted to `CodexBackendSettings`; live adapter update via `updateWebSearchMode()`. Settings persistence and adapter wiring verified; distinct runtime web-search behavior between modes is not yet end-to-end proven.
- Settings-side session browser supports resume for in-memory Codex sessions via `supportsResume: true`; the UI copy explicitly states that resume is limited to live adapter memory and does not discover persisted/external threads
- Underlying types and adapter wiring for all 7 `CodexBackendSettings` fields are preserved; all 7 fields are now exposed in the ordinary settings UI

## Visual Rhythm

All three Codex secondary tabs share a single spacing system documented in `DESIGN.md` under **Codex Settings Cards** and implemented in `src/style/components/settings-codex-account.css`.

- Each group renders its title + description, then a `.opencodian-settings-codex-group-controls.opencodian-settings-codex-group-stack` container.
- The stack provides `12px` vertical gaps between cards or Setting rows.
- The group's controls container is `16px` below the description.
- Account cards, session-browser info notices, and the connection summary share the same card base (`14px 16px` padding, `10px` radius, `var(--background-secondary)` background, `1px` border). Readback outputs have moved into dedicated modals and are no longer inline cards in the settings panel.
- No per-element ad-hoc margins are used for the main rhythm; spacing comes from the stack gap and tokenized header/body gaps.
- Setting rows inside Codex stacks have their default padding/border removed so the stack gap is the only spacing signal.

## 2026-06-16 Modal-first readbacks

The model catalog, permission profile, and loaded threads readbacks in the Resume & Inspect tab no longer append inline cards to the settings panel. Each now opens a dedicated `CodexReadbackModal` with purpose text, read-only/refresh notes, a status bar, and loading / unavailable / failed / empty / success states. The session-browser info/in-memory notices remain as inline cards.

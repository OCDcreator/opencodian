# SettingsCodexReadbackControls

**File:** `src/features/settings/SettingsCodexReadbackControls.ts`
**Status:** ACTIVE

## Purpose

Diagnostic readback rendering helper for the Codex backend settings panel. Owns the remaining button-triggered diagnostic readbacks and the settings-side backend session browser launcher so that `SettingsCodexSection` can stay focused on user-writable settings controls.

> The four account/capability surfaces (`account/read`, `account/usage/read`, `account/rateLimits/read`, `modelProvider/capabilities/read`) were elevated to product-grade cards in `SettingsCodexAccountSurface` and are no longer rendered here.

## Exports

| Export | Kind | Notes |
|--------|------|-------|
| `SettingsCodexReadbackControls` | Class | Renders the remaining readback buttons and the session browser launcher |
| `SettingsCodexReadbackControlsOptions` | Interface | Constructor options |

## Rendered Surfaces

| Surface | Source | DOM markers | Notes |
|---------|--------|-------------|-------|
| Backend session browser launcher | `BackendSessionBrowserModal` | `data-codex-session-browser-info`, `data-codex-session-browser-in-memory` | Opens the browser modal restricted to `forcedBackendKind: 'codex'`; resume limited to in-memory sessions |
| Model catalog readback | `CodexAdapter.getModelList()` → app-server `model/list` or CLI `codex debug models` | `data-codex-model-list-readback`, `data-proof-state="readback"`, per-entry `data-model-slug` | Also the data source for the ordinary `model` selector and session `model` override |
| Permission profile readback | `CodexAdapter.getPermissionProfiles()` → app-server `permissionProfile/list` | `data-codex-permission-profiles-readback`, `data-proof-state="readback"`, per-entry `data-profile-id` | Diagnostic-only; the three profiles alias existing `sandboxMode` values |
| MCP server status readback | `CodexAdapter.getMcpServerStatus()` → app-server `mcpServerStatus/list`; `CodexAdapter.reloadMcpServers()` → `config/mcpServer/reload` | `data-codex-mcp-servers-readback`, `data-proof-state="readback"`, per-entry `data-mcp-server-name` | Diagnostic-only; opens the structured `CodexMcpServerDetailModal` for inspection and reload |
| Loaded threads readback | `CodexAdapter.listLoadedThreads()` → app-server `thread/loaded/list` | `data-codex-loaded-threads-readback`, `data-proof-state="readback"` | Diagnostic-only internal state indicator |

## Architecture

- Instantiated by `SettingsCodexSection` and called from `renderConnectionTab()`
- Each readback uses a lazy-created output element so the DOM stays empty until the user clicks "Inspect"
- Account identity / usage / rate limits / provider capabilities rendering moved to `SettingsCodexAccountSurface` (product cards); this module no longer sanitizes secret keys because the only readbacks that handled sensitive data were the account ones, which have migrated

## Boundaries

- Readbacks are read-only diagnostic surfaces, not settings controls
- No settings persistence happens here; all writes stay in `SettingsCodexSection`

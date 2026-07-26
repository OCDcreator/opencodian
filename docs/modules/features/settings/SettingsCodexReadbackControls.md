# SettingsCodexReadbackControls

**File:** `src/features/settings/SettingsCodexReadbackControls.ts`
**Status:** ACTIVE

## Purpose

Diagnostic readback rendering helper for the Codex backend settings panel. Owns the button-triggered diagnostic readbacks and the settings-side backend session browser launcher so that `SettingsCodexSection` can stay focused on user-writable settings controls.

> The four account/capability surfaces (`account/read`, `account/usage/read`, `account/rateLimits/read`, `modelProvider/capabilities/read`) were elevated to product-grade cards in `SettingsCodexAccountSurface` and are no longer rendered here.

## Exports

| Export | Kind | Notes |
|--------|------|-------|
| `SettingsCodexReadbackControls` | Class | Renders the readback buttons and the session browser launcher |
| `SettingsCodexReadbackControlsOptions` | Interface | Constructor options |
| `SettingsCodexHooksReadbackModal` | Class | Structured hooks/list readback modal with five-state status handling |
| `SettingsCodexHooksReadbackModalOptions` | Interface | Modal app and read-only adapter options |

## Rendered Surfaces

| Surface | Source | Opens | Notes |
|---------|--------|-------|-------|
| Backend session browser launcher | `BackendSessionBrowserModal` | `BackendSessionBrowserModal` | Restricted to `forcedBackendKind: 'codex'`; resume limited to in-memory sessions. Info and in-memory notices are still inline cards. |
| Model catalog readback | `CodexAdapter.getModelList()` → CLI `codex debug models` | `CodexReadbackModal` | Also the data source for the ordinary `model` selector and session `model` override |
| Permission profile readback | `CodexAdapter.getPermissionProfiles()` → app-server `permissionProfile/list` | `CodexReadbackModal` | Diagnostic-only; the profiles alias existing `sandboxMode` values |
| MCP server status readback | `CodexAdapter.getMcpServerStatus()` → app-server `mcpServerStatus/list`; `CodexAdapter.reloadMcpServers()` → `config/mcpServer/reload` | `CodexMcpServerDetailModal` | Diagnostic-only; structured inspection, reload, OAuth, and resource viewer |
| Loaded threads readback | `CodexAdapter.listLoadedThreads()` → app-server `thread/loaded/list` | `CodexReadbackModal` | Diagnostic-only internal state indicator |
| Hooks readback | `CodexAdapter.getHooksReadback()` → app-server `hooks/list` | `SettingsCodexHooksReadbackModal` | Structured cwd groups, hook metadata, warnings, and errors; read-only with no scope/edit/delete/enable controls |

## Behavior

Each of the three readback buttons (model catalog, permission profiles, loaded threads) opens a dedicated `CodexReadbackModal` instead of appending an inline card to the settings panel. The settings page no longer creates `data-codex-model-list-readback`, `data-codex-permission-profiles-readback`, or `data-codex-loaded-threads-readback` elements.

The modal carries:
- a purpose intro,
- a compact summary meta strip (status badge, read-only note, refresh note),
- loading / unavailable / failed / empty / success states, and
- on success, a structured inspection list.

The hooks readback is a dedicated structured modal in the same Resume & Inspect area. It keeps the backend's five honest outcomes (`available`, `empty`, `unavailable`, `failed`, and `malformed`) distinct, ignores `errorReason` in the main UI, and renders each group cwd plus hook fields such as event, handler, source, source path, enabled state, matcher, command, timeout, trust, and hash. Warning and error diagnostics are rendered as labelled text. Paths retain selectable text and a `title` attribute so long values remain verifiable even when a host theme truncates them. The modal intentionally renders no raw JSON or mutation controls.

Model-catalog rows show the display name, slug, description, and side badges for visibility, reasoning level, and API support. Permission-profile rows show the profile id, description, and a "profile" badge. Loaded-thread rows show the thread id with a toggle to reveal the raw JSON record.

## Architecture

- Instantiated by `SettingsCodexSection` and called from `renderResumeAndInspectGroup()`.
- Each readback surface builds a `CodexReadbackModal` configuration and opens it on button click.
- Data fetching and item rendering are injected into the modal so the modal stays generic.
- Account identity / usage / rate limits / provider capabilities rendering moved to `SettingsCodexAccountSurface` (product cards); this module no longer sanitizes secret keys because the only readbacks that handled sensitive data were the account ones, which have migrated.

## Boundaries

- Readbacks are read-only diagnostic surfaces, not settings controls.
- No settings persistence happens here; all writes stay in `SettingsCodexSection`.
- MCP reload remains a settings-page action that shows a `Notice`; it does not open a modal.

## Related modules

- `CodexReadbackModal` — generic modal used by model, permission profile, and loaded threads readbacks.
- `CodexMcpServerDetailModal` — dedicated structured modal for MCP server inspection.
- `BackendSessionBrowserModal` — session browser launched from the settings panel.

## 2026-06-16 Modal-first readbacks

The model catalog, permission profile, and loaded threads readbacks moved from inline cards to `CodexReadbackModal`. The settings panel now only keeps inline info notices for the session browser launcher.

## 2026-06-16 Inspection panel rows

Model, permission-profile, and loaded-thread readbacks now render as `.opencodian-inspection-row` rows inside `CodexReadbackModal` instead of stacked paragraphs. Proof markers (`data-model-slug`, `data-profile-id`, `data-proof-state`) and the raw JSON code block for threads are preserved.

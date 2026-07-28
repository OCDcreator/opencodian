> **Updated**: 2026-07-28 — adds Project configuration secondary tab (project-config) delegated to SettingsCodexProjectConfigSection.
> **Updated**: 2026-07-28 — canonical path.relative containment check for external dirs; advanced TOML external dir confirmation; focused diagnostics rendering; protected history/restore modal; bodyEl.empty() refresh on save.
# SettingsCodexSection

**File:** `src/features/settings/SettingsCodexSection.ts`
**Status:** ACTIVE

> **更新**: 新增 `resources` 二级 tab，委托给 `SettingsCodexResourcesSection` 渲染 Codex 项目/全局 skills 与 agents 管理（当前 P0 UI 项目可编辑、全局只读；P1 通过共享 `allowlisted-root` 契约开放全局 CRUD）。
> **更新**: 2026-07-26 G9 Codex credential hardening — native Provider configuration is external-managed/read-only; legacy plugin credentials are masked and confirmation-gated for clearing.
> **更新**: 2026-07-28 — Connection tab adds a persisted user CLI executable path and explicit plugin-reload action. Saving never touches an active session; reload warns that it terminates active Codex turns.

## Purpose

Codex backend settings panel. Uses five secondary tabs under the Codex primary tab to avoid piling unrelated settings into a single flat card stack, grouped by *what* a setting controls (Source Grouping, see `CONTEXT.md`):

1. **Connection** — user-installed CLI executable path (empty = automatic discovery), explicit `Reload OpenCodian` action, genuinely wired SDK options (`model`, `modelReasoningEffort`, `webSearchMode`), a lightweight connection-source summary, and masked legacy-credential status. No Codex secret input is rendered.
2. **Permissions** — approval/sandbox boundary: `approvalPolicy` (`CodexApprovalPolicy`), `sandboxMode`, `networkAccessEnabled`, `additionalDirectories`. `approvalPolicy` default `inherit` omits the override; `untrusted`/`on-request` fail closed in `CodexAdapter` without the app-server + bridge; `never` may use the SDK fallback.
3. **Resume & inspect** — the backend session browser and live runtime readbacks (model catalog, permission profiles, MCP servers, loaded threads, and read-only hooks metadata).
4. **Account** — live read-only account/capability cards rendered by `SettingsCodexAccountSurface`.
5. **Resources** — delegated to `SettingsCodexResourcesSection` (project skills/agents; global resources are read-only in P0, with CRUD deferred to P1's allowlisted-root contract).

The old disabled "Authentication" setting is replaced by the connection-source summary and an auth-source row inside the Account surface, so the UI never presents a disabled input as a status indicator.

## Context availability

The Context Ring is not configured from Account usage. It becomes available only after the local Codex app-server accepts the experimental API negotiation and can publish `thread/tokenUsage/updated`; otherwise the settings copy explains that upgrading Codex enables real session-context usage while SDK chat remains available.

## Cost estimates

The Account tab also exposes the shared cost-estimate entry as its own sub-group (`data-codex-group="cost-estimate"`, headed by `settings.cost.group.title`) below the read-only account cards, so writable pricing fields are visually separated from the readback surface. It uses the app-server's authoritative session tokens but not account usage. By default the returned model ID matches models.dev automatically; custom Codex providers only need the optional pricing Provider ID / Base URL when their gateway price differs or the model ID is ambiguous. These fields identify prices only and never write `~/.codex/config.toml`, `model_provider`, or `openai_base_url`.

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
| `SettingsCodexLegacyCredentialControl` | Owns masked legacy-credential status, confirmation-gated persistence transaction/rollback, localized failure state, and the post-success auth/runtime callback |

## Settings Surface

| Field | Type | Wired | Status | Notes |
|-------|------|-------|--------|-------|
| `apiKey` | `string` | Runtime compatibility only | Connection tab | Existing values remain untouched but are never rendered; the UI shows only a masked legacy-credential status and a confirmation-gated clear action |
| `model` | `string` (dropdown + custom) | Yes | Connection tab | Async dropdown populated from app-server `model/list` with CLI `codex debug models` fallback, plus a "Loading models..." placeholder and "Custom..." fallback text input; the underlying `CodexBackendSettings.model` → `adapter.updateModel()` write path was already accepted before Round 2; live adapter update via `updateModel()` for next-thread boundary |
| `sandboxMode` | `string` (dropdown) | Yes | Permissions tab | Dropdown in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateSandboxMode()` for next-thread boundary |
| `modelReasoningEffort` | `string` (dropdown) | Yes | Connection tab | Dropdown in ordinary settings; persisted to `CodexBackendSettings`; live adapter writeback via `updateModelReasoningEffort()` for next-thread boundary |
| `additionalDirectories` | `string` (newline-separated) | Yes | Permissions tab | Textarea in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateAdditionalDirectories()` for next-thread boundary |
| `networkAccessEnabled` | `boolean` | Yes | Permissions tab | Toggle in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateNetworkAccessEnabled()` for next-thread boundary |
| `approvalPolicy` | `string` (dropdown) | Yes | Permissions tab | `CodexApprovalPolicy` dropdown (inherit/untrusted/on-request/never); persisted to `CodexBackendSettings` (default `inherit`); live adapter update via `updateApprovalPolicy()`. `inherit` omits the override; `untrusted`/`on-request` require the app-server + approval bridge and fail closed in the adapter; `never` may use the SDK fallback. |
| `webSearchMode` | `string` (dropdown) | Yes | Connection tab | Dropdown in ordinary settings; persisted to `CodexBackendSettings`; live adapter update via `updateWebSearchMode()` for next-thread boundary. Settings description honestly states distinct runtime behavior between modes is not yet proven. |
| Legacy credential status | — | Save + clear | Connection tab | Shows only "configured (value hidden)" or login/environment guidance. Clear requires explicit confirmation; no create/edit/value input is exposed. |
| Connection source summary | — | — | Connection tab | Lightweight read-only strip showing dynamic auth source description: legacy plugin credential (masked) when configured, Codex login/environment when not. |
| Session browser launcher | — | Yes | Resume & inspect tab | Button opening `BackendSessionBrowserModal` with `forcedBackendKind: 'codex'` and `supportsResume: true`; resume is limited to in-memory sessions. Rendered by `SettingsCodexReadbackControls`. |
| Model catalog readback | — | Yes | Resume & inspect tab | Button-triggered live model catalog from `codex debug models`; opens `CodexReadbackModal`. Rendered by `SettingsCodexReadbackControls`. |
| Permission profile readback | — | Yes | Resume & inspect tab | Button-triggered live permission profile list from `permissionProfile/list`; opens `CodexReadbackModal`. Rendered by `SettingsCodexReadbackControls`. |
| MCP server status readback | — | Yes | Resume & inspect tab | Button-triggered live MCP server status from `mcpServerStatus/list`; opens `CodexMcpServerDetailModal`; includes a reload button that calls `config/mcpServer/reload`. Rendered by `SettingsCodexReadbackControls`. |
| Loaded threads readback | — | Yes | Resume & inspect tab | Button-triggered live loaded-thread list from `thread/loaded/list`; opens `CodexReadbackModal`. Rendered by `SettingsCodexReadbackControls`. |
| Hooks readback | — | Yes | Resume & inspect tab | Button-triggered `hooks/list` metadata readback; opens a structured five-state modal with cwd groups, hook fields, warnings, and errors. It exposes no raw JSON, scope pseudo-field, or mutation action. Rendered by `SettingsCodexReadbackControls`. |
| Account & capability surface | — | Yes | Account tab | Four auto-loading product cards rendered by `SettingsCodexAccountSurface`: account identity (`account/read`), token usage (`account/usage/read`), rate limits (`account/rateLimits/read`), provider capabilities (`modelProvider/capabilities/read`). UI elevated from JSON-dump buttons to product cards; truth bucket stays `readback` (read-only info displays). See `SettingsCodexAccountSurface.md`. |

> **Note on the account/capability surfaces (Round 13/14)**: the four `account/read`, `account/usage/read`, `account/rateLimits/read`, and `modelProvider/capabilities/read` surfaces previously lived here as individual "Inspect …" buttons + `<pre>` JSON dumps (and account usage was briefly hidden in Checkpoint 15E under the 0.137.0 runtime). Round 13 moved all four into `SettingsCodexAccountSurface` as product-grade cards (badges, stat tiles, chips, honest auth-required states) and they are no longer rendered by `SettingsCodexSection` or `SettingsCodexReadbackControls` directly. Their truth bucket is `readback` — the UI was productized but the capability remains read-only. Account usage is no longer hidden; it is a visible product card.

## Architecture

- Instantiated by `SettingsTabbedRenderer.renderCodexContent()`
- Reads/writes `plugin.settings.backendSettings.codex`
- Registered as primary tab `codex` with `backendRequired: 'codex'` in `settingsLayoutRegistry`; secondary tabs are `connection` (default), `permissions`, `resume-inspect`, `account`, and `resources` (5 tabs)
- Follows the same `attach()` / `attachTabbed()` pattern as `SettingsClaudeCodeSection`
- Owns the wired settings controls grouped by Source Grouping (see `CONTEXT.md`): **Connection** tab owns `model`, `modelReasoningEffort`, `webSearchMode`, plus a masked/backward-compatible `apiKey` status; **Permissions** tab owns `approvalPolicy`, `sandboxMode`, `additionalDirectories`, `networkAccessEnabled`. Both tabs apply live adapter updates via `applyCodexRuntimeUpdates()`. `SettingsCodexLegacyCredentialControl` handles the legacy credential transaction: confirmation, temporary in-memory clear, awaited `saveSettings()`, rollback on rejection, localized failure, and the success-only callback that updates auth summary/account/runtime state.
- Dropdown controls for approval policy and sandbox mode expose their setting names as explicit `aria-label` values in addition to the visible descriptions, preserving an accessible name when the Obsidian `Setting` wrapper is rendered or tested independently.
- Renders a lightweight connection-source summary instead of a disabled "Authentication" setting
- Delegates the remaining live runtime readbacks to `SettingsCodexReadbackControls` inside the **Resume & inspect** tab, including the read-only hooks/list inspection
- Mounts the provider-configuration status strip and four account/capability product cards via `SettingsCodexAccountSurface` inside the **Account** tab, passing the inferred `authSource` derived from the plugin `apiKey` field; native Provider configuration is explicitly external-managed/read-only. The section disposes the account surface during settings re-render so its Codex connection subscription cannot outlive the visible tab.
- The Account group header is a flex row (`.opencodian-settings-codex-group-header`): title + one-line description on the left, a ghost "Refresh all" button (`.opencodian-codex-account-refresh-all` → `SettingsCodexAccountSurface.refreshAllNow()`) on the right

## Boundaries

- Only exposes settings that are genuinely wired through to `CodexAdapter`
- The disabled "Authentication" setting and editable API-key input were removed in favor of a connection-source summary, masked legacy-credential status, and the auth-source/provider-status rows inside `SettingsCodexAccountSurface`
- A non-empty legacy `apiKey` remains for runtime/backward compatibility but never enters DOM text, input values, attributes, notices, or logs; an empty value points users to Codex login/environment auth. The native Provider has no local CRUD surface.
- Legacy credential persistence is transactional from the settings surface's perspective: a rejected `saveSettings()` restores the prior in-memory secret and leaves the configured UI, auth source, and adapter runtime untouched; only a successful save clears the masked state and applies the callback.
- `modelReasoningEffort` is now exposed in ordinary settings and also remains accessible via the per-conversation session settings modal
- `sandboxMode`, `model`, `modelReasoningEffort`, `additionalDirectories`, `networkAccessEnabled`, and `webSearchMode` are honest next-thread boundaries: the settings UI updates adapter options for future thread creation/resume, not the currently running turn
- `webSearchMode` is productized in ordinary settings as **settings-only** (Checkpoint 15F): dropdown with `disabled`/`cached`/`live` options; persisted to `CodexBackendSettings`; live adapter update via `updateWebSearchMode()`. Settings persistence and adapter wiring verified; distinct runtime web-search behavior between modes is not yet end-to-end proven.
- Settings-side session browser supports resume for in-memory Codex sessions via `supportsResume: true`; the UI copy explicitly states that resume is limited to live adapter memory and does not discover persisted/external threads
- Underlying types and adapter wiring for all 8 `CodexBackendSettings` fields are preserved; all 8 fields are now exposed across the Connection and Permissions tabs

## Visual Rhythm

All five Codex secondary tabs share a single spacing system documented in `DESIGN.md` under **Codex Settings Cards** and implemented in `src/style/components/settings-codex-account.css`.

- Each group renders its title + description, then a `.opencodian-settings-codex-group-controls.opencodian-settings-codex-group-stack` container. The Account group wraps title + description + the group-level "Refresh all" action in a `.opencodian-settings-codex-group-header` flex row.
- The stack provides `12px` vertical gaps between cards or Setting rows.
- The group's controls container is `16px` below the description.
- Account cards, session-browser info notices, and the connection summary share the same card base (`14px 16px` padding, `10px` radius, `var(--background-secondary)` background, `1px` border). Readback outputs have moved into dedicated modals and are no longer inline cards in the settings panel.
- Card interiors stay flat: usage stats are borderless value-over-label pairs, capability entries are hairline-separated rows with a status badge, and the usage chart uses solid accent bars with a dedicated label row. No nested card surfaces inside a card.
- No per-element ad-hoc margins are used for the main rhythm; spacing comes from the stack gap and tokenized header/body gaps.
- Setting rows inside Codex stacks have their default padding/border removed so the stack gap is the only spacing signal.

## 2026-06-16 Modal-first readbacks

The model catalog, permission profile, and loaded threads readbacks in the Resume & Inspect tab no longer append inline cards to the settings panel. Each now opens a dedicated `CodexReadbackModal` with purpose text, read-only/refresh notes, a status bar, and loading / unavailable / failed / empty / success states. The session-browser info/in-memory notices remain as inline cards.

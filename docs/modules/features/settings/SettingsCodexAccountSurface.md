> **Updated**: 2026-07-28 — adds read-only Global Codex configuration summary card (reads ~/.codex/config.toml safely via CodexGlobalConfigSummaryReader) and provider posture B #23417 upstream link.
# SettingsCodexAccountSurface

**File:** `src/features/settings/SettingsCodexAccountSurface.ts`
**Status:** ACTIVE

> **更新**: 2026-07-26 G9 — adds an explicit external-managed/read-only Provider configuration status strip, masked auth-source copy, and generation-fenced Refresh All reads.

## Purpose

Product-grade Codex account & capability surface for the Codex backend settings panel. Owns the four official app-server surfaces that have a genuine product fit and renders them as real settings cards (badges, stat tiles, chips, honest auth-required states) — NOT as button-triggered JSON dumps. This is the productized successor to the four account/capability readbacks that previously lived in `SettingsCodexReadbackControls`.

## Exports

| Export | Kind | Notes |
|--------|------|-------|
| `SettingsCodexAccountSurface` | Class | Mounts and refreshes the four product cards |
| `SettingsCodexAccountSurfaceOptions` | Interface | Constructor options (`{ plugin }`) |
| `CodexAuthSource` | Type | `'plugin-api-key' \| 'env-or-chatgpt'` — inferred once by the caller from the plugin apiKey field |

## Rendered Surfaces

| Card | Source route | DOM markers | Truth bucket |
|------|-------------|-------------|--------------|
| Account identity | `CodexAdapter.getAccountInfo()` → app-server `account/read` (primary) or `codex doctor --json` (fallback) | `data-codex-account-card="identity"`, body `data-codex-identity-readback`, `data-proof-state="readback"`, `data-auth-mode`, `data-auth-source` | `readback` (product-grade readback surface; works in all auth modes) |
| Token usage | `CodexAdapter.getAccountUsage()` → app-server `account/usage/read` | `data-codex-account-card="usage"`, body `data-codex-usage-readback`, `data-proof-state="readback"`, `data-usage-state` | `readback` (product-grade readback surface; env-dependent — real stat tiles under ChatGPT auth, honest auth-required card under API-key auth) |
| Rate limits | `CodexAdapter.getAccountRateLimits()` → app-server `account/rateLimits/read` | `data-codex-account-card="rate-limits"`, body `data-codex-rate-limits-readback`, `data-proof-state="readback"`, `data-rate-limits-state` | `readback` (product-grade readback surface; env-dependent — same dual-state pattern as usage) |
| Provider capabilities | `CodexAdapter.getModelProviderCapabilities()` → app-server `modelProvider/capabilities/read` | `data-codex-account-card="capabilities"`, body `data-codex-capabilities-readback`, `data-proof-state="readback"`, per-chip `data-capability-{key}` | `readback` (product-grade readback surface; works in all auth modes) |
| Provider configuration status | Native Codex login/environment/native config (diagnostic only) | `data-codex-provider-configuration-status`, `data-provider-config-state="external-managed"`, `data-codex-auth-source` | `readback` (external-managed; no native Provider CRUD controls) |

> **Truth-bucket note (Round 14 acceptance fix)**: all four cards are `readback`, NOT `已 pass`. They are read-only information displays — the product-card UI replaces the old JSON-dump buttons, but that is a presentation improvement, not a capability/product-feature upgrade. `已 pass` denotes product features with proven end-to-end runtime behavior (chat path, writable sandbox/model selectors, persisted resume, etc.); a read-only account/usage/rate-limit/capability display does not meet that bar. The code marks each card body `data-proof-state="readback"`, which is the honest marker.

## Architecture

- Instantiated by `SettingsCodexSection` and mounted from `renderAccountAndStatusGroup()` inside the Account secondary tab.
- `attach(containerEl, authSource)` mounts the external-managed Provider status strip plus four product cards and kicks off a best-effort auto-load of all four. It also subscribes to the Codex adapter's `connected` transition so a page opened before app-server startup automatically re-reads all four cards. `dispose()` removes that subscription when the settings surface re-renders. Each card header carries its own ghost "Refresh" button rendered as a native `<button>` (class `opencodian-codex-account-card-refresh`, with `title`/`aria-label` from `refreshTooltip`) that re-runs only that card's read. The button is not wrapped in an Obsidian `Setting` row, so it adds no extra `.setting-item` background box. The public `refreshAllNow()` backs the group-level "Refresh all" action rendered by `SettingsCodexSection` in the account group header; a monotonic generation fence prevents stale callbacks from replacing newer readback.
- Identity is normalized from EITHER the app-server `account/read` shape (`{ account: { type, email?, planType? }, requiresOpenaiAuth }`) OR the CLI doctor fallback (`{ 'stored auth mode', ... }`) into a single `NormalizedAccountIdentity` so the card renders consistently regardless of source. The rendered identity card is a compact "authentication summary block": a primary badge + title row (`opencodian-codex-account-identity-primary`), a muted credential-source detail line (`opencodian-codex-account-identity-detail`), and optional email/plan meta chips (`opencodian-codex-account-identity-meta`). It no longer uses a horizontal key/value table, no longer shows a "ChatGPT auth required: Yes" field, and still renders the yellow `codex login` notice when `requiresOpenaiAuth` is true.
- Usage renders five flat stat pairs (lifetime tokens, peak daily, longest turn, current streak, longest streak) formatted for humans (K/M, duration, day count) — value-over-label, no nested tile cards — plus a daily-bucket bar chart. The chart uses solid accent bars (no gradient) with a separate label row under the bars and a `title` tooltip (`date · tokens`) per bar; the bar max is normalized over the displayed recent window. No raw JSON is ever shown.
- Rate limits render humanized key/value rows (snake_case → Title Case, numbers locale-formatted) plus an optional "By tier" group breakdown.
- Capabilities render three flat rows (Web search, Image generation, Namespace tools), each with an explanatory description and an Available/Not-available status badge; rows are separated by hairlines, not nested cards.

## Honesty Boundaries

- The surface is read-only. It never authenticates, never saves credentials, and never calls `account/login/start`, `account/login/cancel`, `account/logout`, or mutates `~/.codex/auth.json`. Auth-source inference is purely from the plugin `apiKey` settings field.
- Native Provider configuration is explicitly external-managed: users manage it through Codex login, environment variables, or native config outside this surface. A legacy plugin credential is represented only as a masked status in Connection and may be cleared after explicit confirmation; its value is never rendered.
- Capabilities distinguish `data`, `unavailable`, and `failed` states. Refresh All and per-card refreshes use the same generation fence so a delayed older response cannot overwrite newer readback.
- When the active account uses API-key auth, the usage and rate-limit cards render a compact one-line "ChatGPT sign-in required" notice (`is-compact`: title + `codex login` code hint) — never a raw error string and never silent. The identity card carries the single authoritative long-form info note explaining why those two cards are unavailable, so the full amber explanation appears only once per tab.
- Usage/rate-limit rich-data rendering is built from the protocol-verified shapes captured in Checkpoint 15Q (`account/usage/read` summary/dailyUsageBuckets under ChatGPT auth). Under the current API-key Test Vault environment only the auth-required path is runtime-observable; the rich-data path is verified by unit tests against the known shape.

## Boundaries

- All settings persistence stays in `SettingsCodexSection`; this module only reads.
- The remaining diagnostic readbacks (model catalog, permission profiles, MCP servers, loaded threads, backend session browser) continue to live in `SettingsCodexReadbackControls`.

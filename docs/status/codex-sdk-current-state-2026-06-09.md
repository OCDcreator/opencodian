# Codex SDK Capability Truth Audit — 2026-06-09

> **Audit scope**: Checkpoint 0–15G (capability matrix → SDK smoke → adapter skeleton → hidden/runtime surfaces → ordinary transcript/product seams → structured output schema fix → runtime settings truth split → `webSearchMode` cached-vs-live runtime audit → SDK/CLI semantics audit → image input seam audit → image input composer/adapter slice → backend session browser truth audit → persisted conversation resume audit → image paste/drag-drop polish → `webSearchMode` truth resolution → global sandboxMode settings productization → global modelReasoningEffort settings productization → approval-policy truth split → app-server feasibility audit → local app-server surface audit → local app-server protocol/shape audit → app-server surface mapping audit → app-server session discovery / transcript readback integration → Codex active-backend settings readback seams for account info / model list / permission profiles / rate limits / account usage → global webSearchMode settings productization → session-level webSearchMode override)
> **Last updated**: 2026-06-12 (Checkpoint 15G: session-level `webSearchMode` override productized — **settings-only**. Dropdown with `disabled`/`cached`/`live`/inherit options in `ConversationSessionSettingsModal` for Codex conversations; persisted to `ConversationSessionSettings.codexWebSearchMode`; adapter runtime update via `applyCodexRuntimeOverrides` → `updateWebSearchMode()`. Full chain: type → normalization → coordinator resolved → modal render/save → host defaults/runtime forwarding → locale strings. **Honesty note**: same as 15F — settings persistence and adapter option wiring verified, distinct runtime behavior between modes not end-to-end proven. 5 new targeted tests pass, full suite 497 suites / 4688 tests, BUILD_ID `feature-codex-sdk-capability.202606120028`, `dev:errors` clean. Contracted session-overrideable Codex surface: `sandboxMode + modelReasoningEffort + modelOverride + additionalDirectories + networkAccessEnabled + webSearchMode`.)
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`

## 1. Executive Summary

Codex (`'codex'` backend) is publicly exposed in ordinary chat and settings, with a mixed truth state across individual seams.

### 1.1 Current Truth Snapshot

- **Adapter/runtime**: `CodexAdapter` is public and streams real Codex conversations in ordinary chat.
- **Settings surface**: active-backend Codex settings are exposed; contracted stable settings surface is now `apiKey + model + sandboxMode + modelReasoningEffort + additionalDirectories + networkAccessEnabled + webSearchMode`, with explicit next-thread lifecycle copy. `webSearchMode` is `settings-only`: the dropdown is wired and persisted, but distinct runtime behavior between `disabled`/`cached`/`live` is not yet end-to-end proven. Account info is `readback` via CLI diagnostic `codex doctor --json` (Checkpoint 15A: button-triggered, sanitized JSON readback, not a settings write-control). Model list is `readback` via CLI diagnostic `codex debug models` (Checkpoint 15B: button-triggered, filtered model entries, not a model selector). Permission profiles and account rate limits are app-server diagnostic `readback` seams (15C / 15D). Account usage is **hidden** from the ordinary settings surface after 15E final truth sync: the currently bundled `codex-cli 0.137.0` runtime does not advertise a usable `account/usage/read` route, so the dead control was removed instead of being left visible.
- **Session/chat controls proven**:
  - ordinary Codex chat path
  - toolbar `sandbox`
  - toolbar `effort`
  - session modal Codex overrides for sandbox / reasoning / model
- **Ordinary transcript seams proven**:
  - visible `web_search`
  - visible `mcp_tool_call`
  - visible `todo_list`/ordinary todo product surface via existing `todowrite` path
- **Ordinary image-input seam proven**:
  - composer image attach button + image chip
  - clipboard paste image attachment
  - drag-and-drop image attachment
  - send-pipeline passthrough into `AgentChatSendRequest.images`
  - Codex `local_image` translation
  - optimistic / persisted user-message image rendering
  - **Session/thread entry seam audited**:
    - history dropdown `Browse backend sessions` entry is visible under active backend = codex
    - browser resume works for sessions still held in the live adapter
    - **Checkpoint 14H**: persisted session discovery and preview/detail transcript readback wired via Codex app-server adjunct client (`CodexAppServerClient`). `CodexAdapter.listSessions()` merges app-server threads with in-memory sessions; `CodexAdapter.getSessionMessages()` reads thread turns via app-server and normalizes for `BackendSessionBrowserModal` consumption. App-server is best-effort: initialization failure falls back gracefully to in-memory sessions only.
    - **Checkpoint 14I**: Layer 1 persisted session discovery/list row promoted to `已 pass`. Runtime proof captured in the settings-side backend session browser modal with active backend = `codex`: 50 real persisted Codex thread rows rendered, DOM `data-session-id` contains real Codex thread UUIDs (e.g., `019eaa88-a3b5-7e23-9305-978c60b573e1`). Required two runtime fixes: (1) scan both stdout and stderr for the app-server listening URL because Codex CLI emits it on stderr; (2) load Node `ws` from the plugin directory because Obsidian's renderer `WebSocket` is blocked for localhost connections.
    - **Checkpoint 14K (已 pass)**: the pure settings-side UI path is now proven end-to-end. User path `settings-side Resume -> chat view -> real composer follow-up` succeeded on persisted thread `019ea81d-7b52-7ff0-8d38-175ac7caab9b`, and the stable assistant reply `Hi.` returned on the same `backendSessionId` with no interruption.
  - Approval UX is larger-scope and model/account/profile readback remains secondary
- **Reload/continuity seam proven**:
  - persisted Codex conversations keep `backendSessionId` through storage + hydration
  - first post-reload follow-up can call `resumeThread(real_thread_id)`
  - live runtime proof confirmed backend context continuity by recalling a remembered token after reload
  - provisional-only Codex conversations now show a persistent warning notice, and that warning is automatically removed once a real backend thread id is established
  - **Latest accepted build in this round**:
  - `BUILD_ID feature-codex-sdk-capability.202606120028` (latest audited 15G build. Session-level `webSearchMode` override dropdown visible in Codex session settings modal with inherit/disabled/cached/live options; DOM probe confirms `data-setting="codex-web-search-mode"` with `value='live'` persisted and round-tripping; label `网页搜索`, honest description stating runtime proof boundary. Classified `settings-only`, not `已 pass`.)
  - `BUILD_ID feature-codex-sdk-capability.202606120007` (latest audited 15F correction build. `webSearchMode` dropdown visible in ordinary Codex settings with `disabled`/`cached`/`live` options; DOM probe confirms `webSearchSelect.value='cached'` and `parentSettingName='网页搜索'`; toggle to `live` and back to `cached` both work; settings description honestly states runtime behavior not yet proven; `dev:errors` stays clean. Classified `settings-only`, not `已 pass`.)
  - `BUILD_ID feature-codex-sdk-capability.202606112222` (latest audited 15E hidden-state build. Ordinary Codex settings no longer expose the account usage control; DOM probe confirms `accountUsageLabels=0`, `hasInspectButton=false`, `hasReadbackNode=false`.)
  - `BUILD_ID feature-codex-sdk-capability.202606111730` (historical 15E blocked-state build. Visible account usage control still returned unavailable + `JSON-RPC error -32600: Invalid request` before the ordinary settings surface was re-contracted.)
  - `BUILD_ID feature-codex-sdk-capability.202606110250` (accepted 15B repaired runtime proof build. Codex model list CLI-diagnostic readback is visible in active-backend settings with 5 real models, filtered `codex-auto-review`, and explicit DOM evidence.)
  - `BUILD_ID feature-codex-sdk-capability.202606110233` (accepted 15A repaired runtime proof build. Codex account info CLI-diagnostic readback visible in active-backend settings surface with real auth data, sanitized secrets, and explicit DOM evidence.)
  - `BUILD_ID feature-codex-sdk-capability.202606110125` (accepted 14K runtime proof build. Pure settings-side UI path reached chat and returned stable assistant reply on the same persisted `backendSessionId`.)
- **Latest runtime proof**:
  - Codex settings surface screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-10a-codex-settings-surface.png`
  - `webSearchMode=cached` final-state screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-cached-complete.png`
  - `webSearchMode=live` final-state screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-live-complete.png`
  - composer image chip screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11b-03-image-chip-visible.png`
  - optimistic user-message image screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11b-04-optimistic-message.png`
  - paste chip screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-03-paste-chip-visible.png`
  - drop chip screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-04-drop-chip-visible.png`
  - paste/drop send-path screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-05-optimistic-message.png`
  - final 11C screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-06-final-state.png`
  - backend session browser history entry screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12a-history-entry.png`
  - backend session browser empty-on-reload screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12a-browser-empty-after-reload.png`
  - backend session browser single in-memory row screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12a-browser-in-memory-row.png`
  - persisted-resume success screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12b-live-resume-success.png`
  - provisional-warning screenshot captured in `/tmp/opencodian-12c-provisional.png`
  - real-thread negative-proof screenshot captured in `/tmp/opencodian-warning-absent-obsidian.png`
  - settings-side Codex session browser launcher row screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/screenshots/13a-settings-codex.png`
  - settings-side Codex session browser modal screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/screenshots/13a-modal-codex.png`
  - settings-side Codex browse-only notice screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/screenshots/13a-settings-codex-notice.png`
  - per-conversation additionalDirectories session settings modal screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13b-09-session-settings-open.png`
  - probe conversation with additionalDirectories filled screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13b-11-probe-session-settings.png`
  - live chat token-match proof screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13b-12-message-sent.png`
  - global inheritance JSON artifact (no conversation override) captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13b-r2-global-inherit-artifact.json`
  - global inheritance live chat token-match proof screenshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13b-r1-03-global-inherit-result.png`
  - per-conversation networkAccessEnabled enabled state screenshot (control in viewport) captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13c-08-network-access-enabled-true-visible.png`
  - per-conversation networkAccessEnabled disabled state screenshot (control in viewport) captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13c-07-network-access-disabled-visible.png`
  - settings-side Codex session browser launcher with in-memory-only copy captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13e-01-settings-codex.png`
  - settings-side Codex backend session browser modal showing in-memory session row captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13e-02-modal-in-memory-row.png`
  - settings-side Codex backend session browser modal with Resume button visible captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13e-02b-modal-resume-visible.png`
  - chat view after settings-side resume captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13e-04-chat-loaded.png`
  - follow-up success in resumed Codex conversation: strongest evidence is the persisted session JSON at `/Volumes/SDD2T/obsidian-vault-write/testvault/.opencodian/sessions/conv-1781078635600-aa5akbx2m.json` (`backend: "codex"`, real `backendSessionId`, user + assistant messages); runtime screenshot also at `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13e-05-followup-success.png`
  - Codex settings page showing the new reasoning-effort control captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14b-01-codex-reasoning-visible.png`
  - Codex settings reasoning-effort dropdown expanded with all five options captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14b-02-codex-reasoning-dropdown-open.png`
  - Codex settings reasoning-effort switched to `极高` / `xhigh` and persisted in UI captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14b-03-codex-reasoning-xhigh-selected.png`
  - persisted Codex session rows visible in the settings-side backend session browser modal (active backend = `codex`, 50 persisted rows rendered) captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14i-03-browser-with-rows.png`; DOM evidence includes `data-session-id` with real Codex thread UUIDs (e.g., `019eaa88-a3b5-7e23-9305-978c60b573e1`)
  - persisted Codex session preview panel showing a live 1300+ transcript snapshot (user + assistant text extracted from app-server turns) captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14j-08-final-preview.png`
  - persisted Codex session detail view showing metadata (session ID, backend, title, timestamps) plus a live 1300+ full transcript snapshot captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14j-09-final-detail.png`
  - **Checkpoint 14K Round 2** — settings-side backend session browser modal with persisted rows captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14k-r1-05-modal-open.png`
  - chat view after clean resume from persisted session captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14k-r2-01-chat-after-clean-resume.png`
  - chat view after real composer follow-up sent captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14k-r2-02-after-clean-send.png`
  - **Checkpoint 14K — older supporting evidence, retained as history only**: one earlier resumed conversation file at `/Volumes/SDD2T/obsidian-vault-write/testvault/.opencodian/sessions/conv-1781078635600-aa5akbx2m.json` shows `Say hi briefly` -> `Hi.` on persisted thread `019eb092-13d3-7c00-8227-ddd4d969551f`. It is no longer the primary proof, because the accepted primary proof is now the later pure settings-side UI rerun below.
    - modal opened: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14k-ui-01-modal-opened.png`
    - chat loaded after resume: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14k-ui-02-chat-loaded.png`
    - chat view ready: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14k-ui-03-chat-view.png`
    - follow-up sent: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14k-ui-04-followup-complete.png`
    - final state: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14k-ui-05-final-state.png`
  - **Checkpoint 15A — Codex account info readback**: settings-side "Inspect account" button triggers `codex doctor --json` → extracts `auth.credentials.details` → sanitized read-only JSON readback visible in the active-backend Codex settings panel. DOM evidence: `data-codex-account-info-readback="true"`, `data-proof-state="readback"` plus saved proof artifact `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15a-r1-dom-evidence.json`. Real data includes auth file path (`/Users/dht/.codex/auth.json`), storage mode (`File`), auth mode (`chatgpt`); sensitive fields (`stored API key`, `stored ChatGPT tokens`) are `[redacted]`. Screenshots: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15a-r1-01-codex-settings-visible.png`, `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15a-r1-02-scrolled-to-account-info-button.png`, `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15a-r1-03-readback-result-visible.png`. Build: `feature-codex-sdk-capability.202606110233`.
  - **Checkpoint 15B — Codex model list readback (repair-only closure)**: settings-side "Model catalog" / "Inspect models" button triggers `codex debug models` → `CodexAdapter.getModelList()` filters `visibility !== 'hide'` and `supported_in_api === true` → returns 5 models (gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.3-codex, gpt-5.2) with `codex-auto-review` correctly excluded. DOM evidence: `data-codex-model-list-readback="true"`, `data-proof-state="readback"`, per-entry `data-model-slug` attributes. Saved proof artifact: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15b-r2-dom-evidence.json`. Screenshots: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15b-r2-01-model-catalog-control.png`, `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15b-r2-02-readback-result.png`, `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15b-r2-03-full-view-control-plus-readback.png`. Build: `feature-codex-sdk-capability.202606110250`.
  - **Checkpoint 15E — Codex account usage truth closure**: the first-layer request-shape repair was real (`CodexAppServerClient.getAccountUsage()` no longer sends empty `params`), and targeted tests pass (`CodexAppServerClient.accountUsage` 5/5; `CodexAppServerClient.rateLimits` regression 3/3). But the decisive evidence now comes from the exact Test Vault bundled binary: generating app-server bindings from `codex-cli 0.137.0` proves the request union does **not** include `account/usage/read`. The earlier visible control therefore represented a dead public surface. The ordinary active-backend settings control has been removed on `feature-codex-sdk-capability.202606112222`; DOM probe now shows `accountUsageLabels=0`, `hasInspectButton=false`, `hasReadbackNode=false`, and screenshot `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15e-r3-01-account-usage-hidden.png` captures the hidden state. Historical blocked-state evidence is preserved in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15e-r2-01-account-usage-control-visible.png`, `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15e-r2-02-account-usage-result-unavailable.png`, and `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15e-r2-dom-evidence.json`. Final truth: **underlying capability `blocked`, ordinary surface `hidden`**.
  - **Checkpoint 15F — Codex webSearchMode settings surface productization**: `webSearchMode` settings surface productized from `readback` to **settings-only**. All infrastructure pre-existed (type `CodexWebSearchMode`, default `'cached'`, normalization, `AgentAdapterWiring` → `CodexAdapter` passthrough, locale strings in en/zh). This checkpoint added: (1) `CodexAdapter.updateWebSearchMode()` method for live runtime update, (2) dropdown Setting in `SettingsCodexSection` between `networkAccessEnabled` and auth info, (3) `applyCodexRuntimeUpdates()` call to `updateWebSearchMode()`. DOM probe on `BUILD_ID feature-codex-sdk-capability.202606120007`: `webSearchSelect.value='cached'`, `parentSettingName='网页搜索'`, options `disabled`/`cached`/`live`. Toggle to `live` confirmed. Screenshots: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15f-r3-01-websearch-settings-visible.png`, `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15f-02-websearch-live-selected.png`. Tests: `CodexAdapter.updateWebSearchMode` 2/2, `SettingsCodexSection.webSearchMode` 4/4 (render + persistence + adapter call + exact-count regression). Full verify green (496 suites, 4683 tests). **Honest truth**: settings persistence and adapter option wiring are verified. Distinct runtime web-search behavior between `disabled`/`cached`/`live` has **not** been end-to-end proven. The capability is classified `settings-only`. Contracted stable surface now `apiKey + model + sandboxMode + modelReasoningEffort + additionalDirectories + networkAccessEnabled + webSearchMode`.
  - **Checkpoint 15G — Codex session-level webSearchMode override**: session-level `webSearchMode` override productized as **settings-only**. Full chain added: (1) `codexWebSearchMode` field on `ConversationSessionSettings`, (2) normalization in `normalizeConversationSessionSettings` (refactored with shared helpers to reduce complexity), (3) dropdown in `ConversationSessionSettingsModal` with inherit/disabled/cached/live options, (4) `codexWebSearchMode` in `ResolvedConversationSessionSettings`, (5) `webSearchMode` in coordinator defaults/resolve/apply, (6) `webSearchMode` in `getCodexGlobalDefaults` and `applyCodexRuntimeOverrides` → `updateWebSearchMode()`, (7) locale strings. DOM probe on `BUILD_ID feature-codex-sdk-capability.202606120028`: `data-setting="codex-web-search-mode"` present, options 继承/禁用/缓存/实时, label `网页搜索`, honest description, persisted `codexWebSearchMode: "live"` round-trips correctly. Screenshots: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15g-02-session-settings-modal-open.png`, `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15g-03-websearch-live-persisted.png`. DOM evidence: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15g-dom-evidence.json`. Tests: 5 new in `ConversationSessionSettingsModal.codex.webSearch`. Full suite 497 suites, 4688 tests. **Honest truth**: same as 15F — settings persistence and adapter option wiring verified, distinct runtime behavior not proven. Contracted session-overrideable Codex surface: `sandboxMode + modelReasoningEffort + modelOverride + additionalDirectories + networkAccessEnabled + webSearchMode`.

### 1.2 Honest Status Buckets

- **已 pass**
  - ordinary Codex chat path
  - toolbar `sandbox`
  - toolbar `effort`
  - session modal overrides: sandbox / reasoning / model
  - **session modal per-conversation `additionalDirectories`** (Checkpoint 13B: UI + persistence + adapter writeback + runtime proof; next-thread boundary)
  - **session modal per-conversation `networkAccessEnabled` UI + persistence + adapter plumbing** (Checkpoint 13C: three-state dropdown, coordinator resolve/save/apply, host forwards to adapter; runtime divergence pending API key)
  - **global ordinary settings surface `sandboxMode`** (Checkpoint 14A: dropdown in ordinary active-backend settings; persisted to `CodexBackendSettings`; live adapter writeback via `updateSandboxMode()`; honest next-thread boundary copy)
  - **global ordinary settings surface `modelReasoningEffort`** (Checkpoint 14B: dropdown in ordinary active-backend settings; persisted to `CodexBackendSettings`; live adapter writeback via `updateModelReasoningEffort()`; honest next-thread boundary copy)
  - contracted ordinary settings surface: `apiKey + model + sandboxMode + modelReasoningEffort + additionalDirectories + networkAccessEnabled + webSearchMode`
  - visible `web_search` transcript path
  - visible `mcp_tool_call` transcript path
  - visible `todo_list` ordinary transcript/product path
  - ordinary Codex image input seam (`file picker / paste / drag-drop → send pipeline → Codex adapter → user message render`)
  - history dropdown `Browse backend sessions` entry
  - backend session browser resume flow for in-memory Codex sessions only
  - persisted Codex conversation resume across plugin reload (when `backendSessionId` is a real thread id)
  - explicit user-facing warning for provisional-only Codex conversations that would otherwise start a fresh backend thread after reload
  - settings-side backend session browser launcher (`forcedBackendKind: 'codex'`)
  - **settings-side backend session browser resume for in-memory Codex sessions** (Checkpoint 13E: `supportsResume: true` from settings; modal shows Resume for live-adapter sessions; clicking Resume creates/loads a Codex conversation and follow-up succeeds)
  - **Checkpoint 14I — Layer 1: persisted Codex backend session discovery / list row** (runtime proof: active backend = `codex`, real persisted threads from `~/.codex/sessions` rendered as rows in `BackendSessionBrowserModal`; 50 rows visible, DOM `data-session-id` contains real Codex thread UUIDs)
  - **Checkpoint 14J — Layer 2: persisted session preview / detail transcript readback** (runtime proof: selecting a real persisted Codex row in the settings-side `BackendSessionBrowserModal` renders a live 1300+ preview/detail transcript snapshot in the right panel, with real metadata including thread UUID; required fixing `normalizeTurnsToPreviewMessages` to handle actual app-server item types `userMessage`/`agentMessage` instead of the incorrect `message` type assumption)
  - **Checkpoint 14K — Layer 3: persisted session resume into chat** (accepted on BUILD_ID `feature-codex-sdk-capability.202606110125`: pure settings-side UI path succeeded, and the resumed persisted thread returned a stable assistant reply on the same `backendSessionId`.)
- **settings-only**
  - **global ordinary settings surface `webSearchMode`** (Checkpoint 15F: dropdown with `disabled`/`cached`/`live` in ordinary active-backend settings; persisted to `CodexBackendSettings`; live adapter writeback via `updateWebSearchMode()`; honest next-thread boundary copy; settings description explicitly states that distinct runtime behavior between modes is not yet proven. **Honest classification**: settings persistence + adapter option wiring verified, but no end-to-end proof that `disabled` vs `cached` vs `live` produces distinct web-search behavior at runtime.)
  - **session modal per-conversation `webSearchMode`** (Checkpoint 15G: four-option dropdown inherit/disabled/cached/live in `ConversationSessionSettingsModal`; persisted to `ConversationSessionSettings.codexWebSearchMode`; coordinator resolve/save/apply forwards to `updateWebSearchMode()`. **Honest classification**: settings persistence + adapter option wiring verified, but no end-to-end proof that `disabled` vs `cached` vs `live` produces distinct web-search behavior at runtime.)
- **readback**
  - broader ThreadOptions wiring beyond the now-contracted stable surface
  - session modal per-conversation `networkAccessEnabled` runtime divergence proof (UI/persistence/plumbing proven in 13C, but authenticated thread behavior not verified due to missing API key)
  - **Codex account info readback in active-backend settings** (Checkpoint 15A: `SettingsCodexSection` renders an "Inspect account" button that calls `CodexAdapter.getAccountInfo()` → `codex doctor --json` → extracts `auth.credentials.details`; returns read-only sanitized JSON readback; repaired acceptance proof on BUILD_ID `feature-codex-sdk-capability.202606110233`: real auth file path, storage mode, auth mode visible; `stored API key` / `stored ChatGPT tokens` redacted via key-name pattern; DOM has `data-proof-state="readback"` and saved proof artifact `15a-r1-dom-evidence.json`; adapter-level parsing edges are covered by `tests/unit/core/agents/backend/CodexAdapter.getAccountInfo.test.ts`; this is a CLI diagnostic surface, NOT an SDK API; truth bucket remains `readback` because it is a button-triggered JSON dump, not a stable first-class settings control)
  - **Codex model list readback in active-backend settings** (Checkpoint 15B: `SettingsCodexSection` renders a "Model catalog" / "Inspect models" button that calls `CodexAdapter.getModelList()` → `codex debug models` → filters `visibility !== 'hide'` and `supported_in_api === true` → returns `CodexModelSummary[]` with `slug`, `display_name`, `visibility`, `supported_in_api`, `default_reasoning_level`, `description` per model; accepted runtime proof on BUILD_ID `feature-codex-sdk-capability.202606110250`: 5 models visible (gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.3-codex, gpt-5.2), `codex-auto-review` correctly filtered out; DOM has `data-codex-model-list-readback="true"`, `data-proof-state="readback"`, per-entry `data-model-slug` attributes; saved proof artifacts `15b-dom-evidence.json` and `15b-r2-dom-evidence.json`; adapter-level tests in `tests/unit/core/agents/backend/CodexAdapter.getModelList.test.ts` (7 cases); UI-level tests in `tests/unit/features/settings/SettingsCodexSection.modelList.test.ts` (7 cases); this is a CLI diagnostic surface, NOT a model selector; truth bucket remains `readback`. **Note**: `npm run verify` fails on `check:owner-guard` due to **pre-existing** lane-level changes in `OpenCodianView.ts`/`main.ts` from earlier checkpoints (14A/14B), not from 15B itself.)
  - **Codex permission profile readback in active-backend settings** (Checkpoint 15C: `SettingsCodexSection` renders a "Permission profiles" / "Inspect profiles" button that calls `CodexAdapter.getPermissionProfiles()` → `CodexAppServerClient.listPermissionProfiles()` → app-server `permissionProfile/list` route → returns `AppServerPermissionProfile[]` with `id` and optional `description` per profile; DOM has `data-codex-permission-profiles-readback="true"`, `data-proof-state="readback"`, per-entry `data-profile-id` attributes; adapter-level tests in `tests/unit/core/agents/backend/CodexAdapter.getPermissionProfiles.test.ts` (5 cases); UI-level tests in `tests/unit/features/settings/SettingsCodexSection.permissionProfiles.test.ts` (7 cases); app-server client tests in `tests/unit/core/agents/backend/CodexAppServerClient.permissionProfiles.test.ts` (3 cases); this is an app-server diagnostic surface, NOT a profile selector or writeback control; truth bucket remains `readback`. **Note**: `npm run verify` still fails only on the same pre-existing `check:owner-guard` issue.)
  - **Codex account rate limits readback in active-backend settings** (Checkpoint 15D: `SettingsCodexSection` renders an "Account rate limits" / "Inspect rate limits" button that calls `CodexAdapter.getAccountRateLimits()` → `CodexAppServerClient.getAccountRateLimits()` → app-server `account/rateLimits/read` route → returns `AppServerRateLimits` with `rateLimits` and optional `rateLimitsByLimitId`; DOM has `data-codex-rate-limits-readback="true"`, `data-proof-state="readback"`; adapter-level tests in `tests/unit/core/agents/backend/CodexAdapter.getAccountRateLimits.test.ts` (4 cases); UI-level tests in `tests/unit/features/settings/SettingsCodexSection.rateLimits.test.ts` (6 cases); app-server client tests in `tests/unit/core/agents/backend/CodexAppServerClient.rateLimits.test.ts` (3 cases); this is an app-server diagnostic surface, NOT a rate limit control or enforcement surface; truth bucket remains `readback`.)
- **hidden**
  - **Codex account usage readback in active-backend settings** (Checkpoint 15E final truth: the public settings control has been removed from the ordinary surface because the exact bundled `codex-cli 0.137.0` Test Vault binary does not advertise `account/usage/read` in its generated app-server request union. Historical exploratory client code remains in the repo, but the user-facing button is intentionally hidden until a shipped runtime proves the route exists and returns real payloads.)
- **已 pass** (Checkpoint 9E)
  - structured output (`/json`): Schema fixed to comply with OpenAI Structured Outputs strict mode (`additionalProperties: false`, all properties in `required`). Ordinary Codex chat and `/json` both succeed under empty-model loaded runtime. Structured output badge renders with valid JSON.
- **blocked**
  - `approvalPolicy` / interactive approval productization on the current TypeScript SDK integration path
  - **Codex account usage app-server surface on current bundled runtime** (Checkpoint 15E: the exact Test Vault bundled `codex-cli 0.137.0` runtime still does not expose a usable `account/usage/read` route; historical visible-control proof on `feature-codex-sdk-capability.202606111730` ended in `Codex 应用服务器不可用或账号使用量回读不受支持。` plus `JSON-RPC error -32600: Invalid request`.)
- **未接入**
  - Codex app-server approval/history integration (official richer approval surfaces exist, but this plugin does not integrate that route)
  - full MCP capability / MCP settings surface / Codex-as-MCP-server integration
  - model catalog integration (CLI diagnostic model list is `readback` per Checkpoint 15B; full model catalog writeback/selector remains unintegrated)
  - image-input polish beyond the accepted core seam (reorder/edit flows, size limits, validation)

### 1.2.1 App-Server Mapping Result (14G)

- **Smallest plausible future seam**: persisted backend session discovery / history preview in the existing `BackendSessionBrowserModal`
- **Why this is smallest**: the shared chat/settings launchers and backend-scoped modal already exist; local app-server protocol types (`ThreadList*`, `ThreadRead*`, `ThreadResume*`) align directly with the same row / preview / detail / resume workflow that OpenCode and Claude Code already expose
- **Secondary seam**: active-backend Codex settings readback for `account info` (Checkpoint 15A), `model list` (Checkpoint 15B), `permission profiles` (Checkpoint 15C), and `account rate limits` (Checkpoint 15D) are implemented as diagnostic readbacks. `account usage` (Checkpoint 15E) was explored, but the currently bundled runtime does not advertise `account/usage/read`, so the ordinary settings control has been retracted and the seam is not part of the accepted readback set.
- **Largest seam**: approval request / review UX remains blocked on the current TypeScript SDK path and still unintegrated on the app-server path; protocol evidence exists, but productization would require a substantially larger live event + review-response bridge

### 1.3 Historical Note

Many deeper sections below preserve earlier checkpoint-by-checkpoint audit history. When those sections disagree with the summary above, treat this executive snapshot as the current source of truth.

## 2. Official Codex SDK Baseline (2026-06-09)

Verified by Codex against the current OpenAI Codex manual:

| # | Fact | Implication for Plugin |
|---|------|----------------------|
| 1 | TypeScript SDK thread path: `new Codex()` → `startThread()` / `resumeThread()` → `thread.run()` for buffered turns, or `thread.runStreamed()` for streaming turns | Adapter must use the thread-based API; a `runStreamed()`-based streaming integration is officially supported. |
| 2 | TypeScript SDK requires Node.js 18+ | Potentially viable for Obsidian Electron, but the actual plugin runtime still needs local verification. |
| 3 | `codex exec` is non-interactive/automation surface (CI, scripts, JSONL, schema output, resume) | Should NOT be the plugin's main path. Only useful as diagnostic or fallback candidate. |
| 4 | Codex can serve as MCP server exposing tools `codex` and `codex-reply` | Key parameters: `prompt`, `approval-policy`, `cwd`, `include-plan-tool`, `model`, `profile`, `sandbox`. This is an alternative integration path worth evaluating. |
| 5 | Approval policies are exposed via `approval-policy` parameter | Checkpoint 1 verified the installed SDK enum values; the remaining work is mapping them correctly into OpenCodian behavior. |
| 6 | Codex app-server is the official rich-client integration surface with authentication, conversation history, approvals, and streamed agent events | Some seams that are missing from the current TypeScript SDK integration path are not upstream-blocked on official Codex overall; they would require an app-server integration choice. |
| 7 | Local installed Codex CLI exposes `app-server`, `remote-control`, and a top-level `--remote` client flag | The richer app-server route is not just theoretical docs surface; it is present in the currently installed local toolchain, though still unintegrated in OpenCodian. |
| 8 | Local app-server protocol generation exposes thread/history/approval/account/model-related schema and TS bindings | The richer route is not only a top-level CLI stub; the installed toolchain can generate concrete protocol artifacts that map to persisted history / approval / account / model surfaces. |

## 3. What Exists in the Codebase

### 3.1 Type Enumeration

| Location | Content | Status |
|----------|---------|--------|
| `src/core/types/chat.ts:379` | `AgentBackendKind = '...' \| 'codex' \| '...'` | **placeholder** — union member exists, no runtime consumers for `'codex'` |
| `src/core/agents/AgentCapability.ts` | Generic capability system | **infrastructure** — works for any backend, but no Codex adapter to declare capabilities |
| `src/core/agents/backend/AgentService.ts` | `AgentService` interface + capability interfaces | **infrastructure** — Codex adapter would implement these |
| `src/core/agents/backend/AgentServiceRegistry.ts` | Registry that manages adapters | **infrastructure** — has no Codex adapter to manage |

### 3.2 Settings Surface

| Location | Content | Status |
|----------|---------|--------|
| `src/features/settings/SettingsBackendSection.ts:15` | `{ id: 'codex', labelKey: 'settings.agent.name.codex', descriptionKey: 'settings.agent.codex.desc' }` | **hidden/placeholder** — filtered out by `IMPLEMENTED_AGENT_BACKENDS` (line 20–23) which only includes `['opencode', 'claude-code']` |
| `src/i18n/locales/en.ts:2242,2247` | `'Codex'`, `'OpenAI Codex CLI — Coming Soon'` | **label only** — visible nowhere in UI because filtered out |
| `src/i18n/locales/zh.ts:2242,2247` | `'Codex'`, `'OpenAI Codex CLI — 即将推出'` | **label only** — same |
| `src/i18n/locales/en.ts:2825` | `'settings.acp.preset.codex': 'Codex'` | **ACP preset label** — ACP section is its own separate feature |
| `src/features/settings/SettingsAcpSection.ts:29` | `{ name: 'Codex', command: 'codex', args: ['acp'] }` | **ACP preset definition** — only meaningful if ACP mode is active and Codex CLI is installed |

### 3.3 Icon / Visual Metadata

| Location | Content | Status |
|----------|---------|--------|
| `src/features/settings/AgentSwitcherFloatingIcons.ts:22` | `codex: { fallbackIcon: 'code-2', iconId: 'codex', variant: 'color' }` | **icon mapping** — never rendered because no Codex backend is active |
| `src/utils/icons/lobehubIconManifest.ts` | Codex icon entries (LobeHub provider icons) | **model/provider icon** — used for model display, not backend adapter |
| `src/shared/toolIdentity.ts:12` | `source?: '...' \| 'codex' \| '...'` | **type union member** — `'codex'` source value exists but has zero runtime consumers |

### 3.4 Design Documentation

| Location | Content | Status |
|----------|---------|--------|
| `docs/requirements/multi-agent-foundation/05-codex-adapter.md` | Draft adapter design (2026-05-18) | **outdated** — over-focuses on a `runStreamed()`-only story, has wrong approval policy values, and describes the session model inaccurately. Needs truth-fix. |
| `docs/requirements/multi-agent-foundation/02-architecture.md` | Multi-agent architecture (references Codex in diagrams/tables) | **architectural intent** — Codex appears as a planned adapter slot |
| `docs/requirements/multi-agent-foundation/09-chat-surface-migration.md` | Chat UI migration (references Codex in capability tables) | **architectural intent** — Codex appears as a future backend column |

### 3.5 Infrastructure That Supports Codex (Indirectly)

| Layer | What Works | Codex Gap |
|-------|-----------|-----------|
| `AgentServiceRegistry` | Register/unregister/enable/disable/route adapters | No `CodexAdapter` to register |
| `AgentService` interface | Full capability interface system | No Codex implementation |
| `OpenCodeAdapter` | Reference implementation showing how to wrap a service | No Codex equivalent |
| `ClaudeCodeAdapter` | Second adapter (live, proven) showing multi-backend works | Codex would be the third |
| `BackendCapabilities` / `hasCapability()` | UI capability gating works for any backend | No Codex capability declaration |
| `StreamChunk` | Transport-agnostic stream type, adapters translate into it | No Codex → StreamChunk translation |
| `Conversation.backend` | Field exists, old data defaults to `'opencode'` | No Codex conversations to store |
| Settings backend section | Backend picker, enable/disable, active switching | Codex filtered out by `IMPLEMENTED_AGENT_BACKENDS` gate |

## 4. Capability Matrix (Checkpoint 0 Baseline)

> **Note**: This is the **checkpoint 0 baseline** matrix. Statuses here reflect the state BEFORE any implementation. For the current (latest) classification, use **§1 Executive Summary** plus the reviewed checkpoint artifacts such as `checkpoint-7b-codex-todo-completion-refresh.md`.

Each row is a capability family. Status classification:

- **未接入 (not integrated)**: Only type enumeration / label / icon exists. No adapter, no SDK, no runtime path.
- **placeholder**: Structurally present (e.g., union type member) but zero runtime behavior.
- **readback**: Some wiring exists that could passively confirm an option reaches a boundary, but no real user path.
- **已 pass**: Fully working with runtime proof.
- **blocked**: Blocked by upstream/official surface limitation.
- **hidden**: Intentionally not exposed to users.
- **infrastructure**: General multi-agent infrastructure that would support Codex if an adapter existed.

### 4.1 Core Runtime Capabilities

| # | Capability Family | Status | Current User Surface | Evidence / Boundary | Next Step |
|---|-------------------|--------|---------------------|---------------------|-----------|
| C1 | Backend registration | **placeholder** | hidden | `'codex'` ∈ `AgentBackendKind` union but `∉ IMPLEMENTED_AGENT_BACKENDS`. No `CodexAdapter` class exists. No `register()` call for Codex. | Create `CodexAdapter.ts` implementing `AgentService`. Add to `IMPLEMENTED_AGENT_BACKENDS` only after smoke pass. |
| C2 | Backend enablement / active routing | **placeholder** | hidden | `SettingsBackendSection` has Codex in `ALL_BACKEND_OPTIONS` but filtered out. Registry has no Codex adapter to enable/route. | Depends on C1. After adapter exists, add `'codex'` to `IMPLEMENTED_AGENT_BACKENDS`. |
| C3 | Backend adapter existence | **未接入** | hidden | No `CodexAdapter.ts` file. SDK dependency + standalone smoke harness now exist, but there is still no plugin runtime integration. | Create adapter. |
| C4 | Adapter ownership boundary | **未接入** | hidden | `AgentService` interface is defined but no Codex implementation to have a boundary. | Define which `AgentService` methods Codex supports vs rejects. |
| C5 | Thread start (`startThread()`) | **未接入** | hidden | Old doc references `runStreamed()` which is wrong per official baseline. Standalone smoke now confirms `startThread()` exists, but no plugin adapter code calls it yet. | Implement thread creation in adapter with the installed SDK. |
| C6 | Thread resume (`resumeThread()`) | **未接入** | hidden | No adapter code yet. Standalone smoke confirms the API exists, but not product-path resume behavior. | Implement in adapter and verify real resume semantics. |
| C7 | Thread continue semantics | **未接入** | hidden | No code. | Map to adapter's session continuation model. |
| C8 | Streaming output path | **未接入** | hidden | `StreamChunk` is the target type. No Codex → StreamChunk translation exists. | Implement event normalizer (`CodexStreamNormalizer` or equivalent). |
| C9 | Session identity / persistence | **未接入** | hidden | `Conversation.backendSessionId` field exists. No Codex session management. | Map Codex thread IDs to `backendSessionId`. |
| C10 | Session resume continuity | **未接入** | hidden | No code. | Map `resumeThread()` to adapter's session resume. |
| C11 | Approval policy | **未接入** | hidden | Old doc maps `full-auto→yolo, auto-edit→auto, suggest→normal`. Standalone smoke now confirms the SDK enum values, but plugin mapping is still unimplemented. | Implement and verify mapping to `AgentPermissionConfig`. |
| C12 | Sandbox | **未接入** | hidden | Standalone smoke confirms the SDK exposes sandbox-related fields, but no plugin adapter/settings wiring exists. | Map to settings surface if adapter exposes sandbox control. |
| C13 | Profile | **未接入** | hidden | Official baseline mentions `profile` on the MCP-server path. No plugin wiring or Codex runtime management exists yet. | Decide whether profile selection belongs in the first adapter slice. |
| C14 | CWD / working directory | **未接入** | hidden | Standalone smoke confirms `workingDirectory`, but no plugin adapter passes vault/worktree paths into Codex yet. | Wire vault path to the SDK thread options. |
| C15 | Model / config surface | **未接入** | hidden | Standalone smoke confirms model/config-shaped fields, but no plugin model surface or resolved config path exists yet. | Map to `AgentModelCapability` if Codex exposes enough model/config surface. |
| C16 | MCP server (`codex` / `codex-reply`) | **未接入** | hidden | Official baseline says Codex can serve as MCP server. No plugin code starts or manages a Codex MCP server yet. | Evaluate MCP-server integration as alternative or complement to the TypeScript SDK path. |
| C17 | `codex exec` diagnostic role | **未接入** | hidden | Official baseline: non-interactive CLI for automation. No plugin diagnostic surface exists yet. | Evaluate as diagnostic/fallback surface only — NOT main integration path. |
| C18 | Chat entry / user path | **未接入** | hidden | Send pipeline routes through `AgentServiceRegistry.getActive()`. No Codex adapter means no Codex chat path. | Depends on C1+C8. After adapter + stream normalizer exist, chat path is automatic via registry routing. |

### 4.2 Settings & UI Capabilities

| # | Capability Family | Status | Current User Surface | Evidence / Boundary | Next Step |
|---|-------------------|--------|---------------------|---------------------|-----------|
| S1 | Settings entry (backend picker) | **placeholder** | hidden | Codex entry exists in `ALL_BACKEND_OPTIONS` but filtered by `IMPLEMENTED_AGENT_BACKENDS`. Label says "Coming Soon". | Change label when adapter exists. Add to `IMPLEMENTED_AGENT_BACKENDS`. |
| S2 | Settings writeback | **未接入** | hidden | No `backendSettings.codex` in settings types. No Codex-specific settings normalization. | Define Codex settings type + normalization. |
| S3 | Capability Lab matrix row | **未接入** | hidden | Capability Lab only shows Claude Code adapter rows. No Codex rows. | Add Codex capability rows after adapter skeleton exists. |
| S4 | Agent switcher icon | **placeholder** | hidden | `AgentSwitcherFloatingIcons.ts` has Codex icon mapping. Never rendered. | Renders automatically when Codex backend is enabled. |
| S5 | Tool identity source | **placeholder** | hidden | `toolIdentity.ts` has `'codex'` in source union. Zero runtime consumers. | Use when Codex adapter produces tool events. |

### 4.3 Infrastructure Capabilities (Work for Any Backend Including Codex)

| # | Capability Family | Status | Note |
|---|-------------------|--------|------|
| I1 | `AgentService` interface | **已 pass** | Fully defined with 10+ capability interfaces |
| I2 | `AgentServiceRegistry` | **已 pass** | Register/unregister/enable/disable/active routing all working |
| I3 | `BackendCapabilities` / `hasCapability()` | **已 pass** | UI gating via capability checks working for OpenCode and Claude Code |
| I4 | `StreamChunk` transport-agnostic type | **已 pass** | Used by both existing adapters |
| I5 | `Conversation.backend` field | **已 pass** | Backend ownership tracking works |
| I6 | `Conversation.backendSessionId` | **已 pass** | Session identity tracking works |
| I7 | Send pipeline registry routing | **已 pass** | Routes through `AgentServiceRegistry.getActive()` |
| I8 | Settings backend section infrastructure | **已 pass** | Backend picker, enable/disable, active switching all working |
| I9 | Chat surface capability gating | **已 pass** | `hasCapability()` hides/shows UI elements per backend |
| I10 | Multi-backend conversation isolation | **已 pass** | Each conversation bound to its creating backend |

## 5. Old Design Doc Audit

### 5.1 `05-codex-adapter.md` — Outdated Assumptions

| Section | Old Assumption | Official Baseline Reality | Verdict |
|---------|---------------|--------------------------|---------|
| §1 npm package | `@openai/codex-sdk` v0.130.x | Package name may be correct but the pinned version is stale and release cadence is high | Re-verify version |
| §1 communication mode | "SDK wraps codex CLI binary; JSONL over stdin/stdout" | Partially correct for CLI, but TypeScript SDK (`new Codex()` → `thread.run()`) is the primary app integration path | **Must update**: main path is TypeScript SDK, not JSONL wrapping |
| §3 method mapping | `createSession()` → `runStreamed()` | **Incomplete**: session creation is thread-based (`startThread()` / `resumeThread()`), while `runStreamed()` is only the streaming turn API | **Must fix** |
| §3 method mapping | `sendMessage()` → `runStreamed()` | **Partially right but incomplete**: `runStreamed()` is valid for streaming, and `run()` is valid for buffered turns | **Must fix** |
| §4.1 session model | `runStreamed({ prompt, thread })` | Thread model exists, but the API shape is `startThread()` / `resumeThread()` followed by `thread.run()` or `thread.runStreamed()` | **Must fix** |
| §4.2 approval policy | `full-auto → yolo, auto-edit → auto, suggest → normal` | Exact values need re-verification against current SDK types; parameter is `approval-policy` | **Must re-verify** |
| §4.3 event normalization | `message.text → text`, etc. | Event shape needs verification against current TypeScript SDK output types | **Must re-verify** |
| §5 CLI install | `npm install -g @openai/codex` | CLI install is correct but TypeScript SDK is the primary path, not CLI | **Must update**: SDK is primary, CLI is secondary |
| §2 capabilities | Lists `'mcp'` as capability | Codex can be MCP server — valid but the capability shape differs from what's listed | **Must re-verify** |

### 5.2 What Can Be Reused from Old Doc

| Element | Reusable? | Notes |
|---------|-----------|-------|
| Overall adapter architecture (implement `AgentService`) | ✅ Yes | Matches current `AgentService` interface |
| Capability set concept | ⚠️ Partially | Set members need re-verification against actual SDK |
| Risk table | ✅ Partially | CLI install risk still valid; "only OpenAI models" still valid |
| Acceptance criteria | ✅ Yes | Generic enough to apply |
| Error normalization approach | ✅ Yes | `AgentError` with backend tag is correct |

## 6. Integration Path Options

Based on the official baseline, there are three potential integration paths:

### Path A: TypeScript SDK (Recommended for main path)

- Use `new Codex()` → `startThread()` / `resumeThread()` → `thread.run()`
- Requires Node.js 18+ (still needs local verification in Obsidian Electron)
- Thread-based session management
- Implement `AgentService` interface wrapping the SDK
- Events translated to `StreamChunk` in a `CodexStreamNormalizer`

### Path B: MCP Server Mode

- Start Codex as MCP server (`codex mcp-server`)
- Exposes tools `codex` and `codex-reply`
- Parameters: `prompt`, `approval-policy`, `cwd`, `include-plan-tool`, `model`, `profile`, `sandbox`
- Would integrate through the existing MCP infrastructure
- Lower integration effort but less control over session management

### Path C: `codex exec` CLI (Diagnostic / Fallback only)

- Non-interactive automation surface
- JSONL output, schema output, resume support
- NOT suitable as main plugin path per official baseline
- Could serve as a diagnostic/health-check tool

## 7. Gaps and Blockers

### Blockers (Cannot Resolve Without Upstream/External Action)

| Blocker | Detail |
|---------|--------|
| SDK API shape in plugin runtime | Standalone Node smoke verified the installed SDK shape, but no adapter code has exercised it inside the plugin runtime yet. |
| Approval policy semantic mapping | SDK enum values are now known, but their final mapping into OpenCodian permission modes is still a design/runtime question. |
| Event lifecycle with real authenticated turns | Item/event types are now known, but real authenticated streaming behavior and final `Turn` contents remain unverified. |
| Electron compatibility unknown | TypeScript SDK requires Node 18+. Obsidian Electron version must be verified. |

### Gaps (Can Resolve Internally)

| Gap | Detail |
|-----|--------|
| No adapter skeleton | `CodexAdapter.ts` does not exist |
| SDK not wired into plugin runtime | `@openai/codex-sdk` is installed, but only the standalone smoke harness imports it today |
| No stream normalizer | No Codex event → `StreamChunk` translation |
| No settings type | No `backendSettings.codex` in settings types |
| No CLI binary resolution | No Codex CLI detection or path resolution |
| No session model mapping | Thread ID → `backendSessionId` mapping undefined |
| Old design doc outdated | `05-codex-adapter.md` references wrong API shapes |
| No adapter-focused tests | No Codex adapter or stream normalizer tests yet; only the standalone smoke harness exists |

## 8. Next Checkpoint Suggestions

### Checkpoint 1: SDK Smoke Verification (Smallest Meaningful Step)

**Goal**: Prove `@openai/codex-sdk` works in Obsidian Electron environment.

1. Add `@openai/codex-sdk` as dependency
2. Write a standalone smoke script (outside adapter) that:
   - Creates `new Codex()` instance
   - Calls `startThread()` → `thread.run()` with a trivial prompt
   - Receives streaming response
   - Verifies event types match documentation
3. Run smoke in Test Vault Obsidian environment
4. Document exact SDK API shape, event types, approval policy values

**Acceptance**: Script produces a successful response and documents exact API shape.

**No adapter code yet. No settings. No UI changes.**

### Checkpoint 2: Adapter Skeleton + Capability Declaration

**Goal**: Create minimal `CodexAdapter` that registers but may not be fully functional.

1. Create `CodexAdapter.ts` implementing `AgentService`
2. Declare initial capability set based on smoke findings
3. Wire into `main.ts` registration
4. Add to `IMPLEMENTED_AGENT_BACKENDS` (gated behind capability flag)
5. Create settings type with minimal fields (API key, model)

**Acceptance**: Codex appears in settings backend picker (still disabled by default). Adapter can be instantiated without crash.

### Checkpoint 3: Chat Path (send + stream)

**Goal**: First real user path — send a message, receive streaming response.

1. Implement `AgentChatCapability.sendMessage()` using `thread.run()`
2. Implement `CodexStreamNormalizer` translating SDK events to `StreamChunk`
3. Implement `AgentSessionCapability.createSession()` mapping to `startThread()`
4. Wire through send pipeline routing

**Acceptance**: User can select Codex backend, create a conversation, send a message, and receive a streaming response in the chat view.

### Checkpoint 4: Session Resume + Settings Surface

**Goal**: Resume existing threads and expose Codex-specific settings.

1. Implement `resumeThread()` → session resume
2. Implement approval policy settings
3. Implement model selection if SDK exposes model listing
4. Add Capability Lab rows for Codex

### Checkpoint 5: Advanced Features

**Goal**: MCP server mode, sandbox, profile, cwd.

1. Evaluate MCP server integration path
2. Expose sandbox/profile/cwd settings if applicable
3. Add diagnostic probes

## 9. Verification Status

| Verification | Ran? | Result | Notes |
|-------------|------|--------|-------|
| `npm run verify` | **Not run** | N/A | No runtime source code was changed. This audit only reads and writes documentation files. |
| `npm run build` | **Not run** | N/A | No source code changes. |
| `npm run test` | **Not run** | N/A | No test changes. |
| Test Vault deploy | **Not run** | N/A | No deploy-relevant changes. |
| Grep/AST search for codex references | **Run** | 41 matches in `src/`, 253 in `docs/` | All verified as type/label/icon metadata. |
| File existence check for `CodexAdapter*` | **Run** | No files found | Confirms zero adapter code exists. |
| `@openai/codex-sdk` import search | **Run** | No matches | Confirms SDK is not a dependency. |

## 10. Files Changed

### Checkpoint 0

| File | Action | Description |
|------|--------|-------------|
| `docs/status/codex-sdk-current-state-2026-06-09.md` | **Created** | Truth audit output (this document) |
| `docs/requirements/multi-agent-foundation/05-codex-adapter.md` | **Truth-fix** | Corrected outdated API assumptions |

### Checkpoint 1

| File | Action | Description |
|------|--------|-------------|
| `package.json` | **Modified** | Added `@openai/codex-sdk@0.137.0` dependency |
| `package-lock.json` | **Modified** | Lock file updated with SDK + CLI + platform binary |
| `scripts/codex-sdk-smoke.mjs` | **Created** | SDK smoke harness (47 structural checks) |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | **Updated** | Added §12 with smoke results, real API shape, event mapping proposal |

## 11. Summary Statistics

| Metric | Value |
|--------|-------|
| Total capability families audited | 28 (18 core + 5 settings + 5 infrastructure) |
| Status: 已 pass (pass) | 10 (all infrastructure — general multi-agent, not Codex-specific) |
| Status: 未接入 (not integrated) | 16 (all Codex-specific capabilities) |
| Status: placeholder | 5 (type/label/icon entries with zero runtime behavior) |
| Status: readback | 0 |
| Status: blocked | 0 (no upstream blocks yet — SDK not attempted) |
| Codex adapter files existing | 0 |
| Codex SDK imports in codebase | 0 |
| Codex tests | 0 |

---

## 12. Checkpoint 1: SDK Smoke Verification Results

> **Date**: 2026-06-09
> **SDK installed**: `@openai/codex-sdk@0.137.0`
> **CLI binary**: `@openai/codex@0.137.0` (via optional dep `@openai/codex-darwin-arm64`)
> **Node environment**: v24.14.0 (local macOS arm64)
> **Smoke script**: `scripts/codex-sdk-smoke.mjs`
> **Smoke result**: 47/47 structural checks passed, 0 failed

### 12.1 Verified SDK API Shape (from installed package + smoke)

#### Main Class: `Codex`

```typescript
// NEW Codex(options?: CodexOptions)
//   .startThread(options?: ThreadOptions): Thread
//   .resumeThread(id: string, options?: ThreadOptions): Thread

type CodexOptions = {
  codexPathOverride?: string;  // Override CLI binary path
  baseUrl?: string;            // API base URL
  apiKey?: string;             // OpenAI API key
  config?: CodexConfigObject;  // --config key=value overrides (flattened)
  env?: Record<string, string>; // Environment for CLI process (replaces process.env)
};
```

**Smoke evidence**: `new Codex()` and `new Codex(all options)` both instantiate successfully. `startThread()` and `resumeThread()` both return Thread objects.

#### Thread Class

```typescript
// Thread
//   .id: string | null  (null before first turn, thread_id after thread.started event)
//   .run(input: Input, turnOptions?: TurnOptions): Promise<Turn>
//   .runStreamed(input: Input, turnOptions?: TurnOptions): Promise<StreamedTurn>

type Input = string | UserInput[];
type UserInput = { type: "text"; text: string } | { type: "local_image"; path: string };

type TurnOptions = {
  outputSchema?: unknown;   // JSON schema for structured output
  signal?: AbortSignal;     // Cancellation
};

type Turn = {
  items: ThreadItem[];
  finalResponse: string;
  usage: Usage | null;
};

type StreamedTurn = {
  events: AsyncGenerator<ThreadEvent>;  // Async iterable of events
};
```

**Smoke evidence**: `thread.id` is `null` before first turn. `thread.run()` and `thread.runStreamed()` both exist with correct signatures. `runStreamed()` returns `{ events: AsyncGenerator<ThreadEvent> }` — confirmed `[Symbol.asyncIterator]` is true.

**First real event captured**: `thread.runStreamed()` with fake API key emitted `{"type":"thread.started","thread_id":"019ea836-38d6-74e0-a666-54d4445f5362"}` — this proves the CLI subprocess spawns and the event stream pipeline works structurally.

#### ThreadOptions

```typescript
type ThreadOptions = {
  model?: string;
  sandboxMode?: SandboxMode;
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  modelReasoningEffort?: ModelReasoningEffort;
  networkAccessEnabled?: boolean;
  webSearchMode?: WebSearchMode;
  webSearchEnabled?: boolean;
  approvalPolicy?: ApprovalMode;
  additionalDirectories?: string[];
};
```

**Smoke evidence**: `startThread()` accepted all ThreadOptions fields without error.

#### Enum Types (VERIFIED from installed .d.ts — DIFFERENT from old doc)

| Type | Actual Values | Old Doc Values | Delta |
|------|--------------|----------------|-------|
| `ApprovalMode` | `"never" \| "on-request" \| "on-failure" \| "untrusted"` | `full-auto \| auto-edit \| suggest` | **COMPLETELY DIFFERENT** |
| `SandboxMode` | `"read-only" \| "workspace-write" \| "danger-full-access"` | N/A (not in old doc) | **NEW** |
| `ModelReasoningEffort` | `"minimal" \| "low" \| "medium" \| "high" \| "xhigh"` | N/A | **NEW** |
| `WebSearchMode` | `"disabled" \| "cached" \| "live"` | N/A | **NEW** |

#### ThreadItem Union (event payload types)

```typescript
type ThreadItem =
  | AgentMessageItem       // { id, type: "agent_message", text: string }
  | ReasoningItem          // { id, type: "reasoning", text: string }
  | CommandExecutionItem   // { id, type: "command_execution", command, aggregated_output, exit_code?, status }
  | FileChangeItem         // { id, type: "file_change", changes: FileUpdateChange[], status }
  | McpToolCallItem        // { id, type: "mcp_tool_call", server, tool, arguments, result?, error?, status }
  | WebSearchItem          // { id, type: "web_search", query: string }
  | TodoListItem           // { id, type: "todo_list", items: TodoItem[] }
  | ErrorItem;             // { id, type: "error", message: string }
```

#### ThreadEvent Union (stream events)

```typescript
type ThreadEvent =
  | ThreadStartedEvent     // { type: "thread.started", thread_id: string }
  | TurnStartedEvent       // { type: "turn.started" }
  | TurnCompletedEvent     // { type: "turn.completed", usage: Usage }
  | TurnFailedEvent        // { type: "turn.failed", error: ThreadError }
  | ItemStartedEvent       // { type: "item.started", item: ThreadItem }
  | ItemUpdatedEvent       // { type: "item.updated", item: ThreadItem }
  | ItemCompletedEvent     // { type: "item.completed", item: ThreadItem }
  | ThreadErrorEvent;      // { type: "error", message: string }
```

#### Usage

```typescript
type Usage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
};
```

### 12.2 CLI Binary Verification

| Property | Value |
|----------|-------|
| Platform package | `@openai/codex-darwin-arm64@0.137.0` |
| Binary path | `node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex` |
| Binary size | **191.6 MB** |
| Executable | Yes |
| Wrapper script | `node_modules/@openai/codex/bin/codex.js` exists |
| CLI spawns from SDK | Yes — confirmed by `thread.started` event with fake key |

### 12.3 Live API Call Status

| Call | Result | Detail |
|------|--------|--------|
| `thread.run("Say hello")` | **TIMEOUT** (15s) | CLI subprocess spawned but hung waiting for auth |
| `thread.runStreamed("Say hello")` | **First event received** | `thread.started` event with valid `thread_id` emitted |
| Further events | **Not captured** | Without valid API key, stream stalls after thread.started |

**Conclusion**: SDK → CLI → subprocess path is structurally working. Full streaming requires a valid OpenAI API key.

### 12.4 Evidence Gained From Checkpoint 1

> Historical checkpoint snapshot only. The rows below capture what Checkpoint 1 proved at that time. Current accepted state after later checkpoints is summarized in §14.

| # | Capability Family | Current Overall Status | Checkpoint 1 Evidence Gain | Evidence |
|---|-------------------|------------------------|----------------------------|----------|
| C1 | Backend registration | placeholder | none | No adapter code created yet |
| C3 | Backend adapter existence | 未接入 | none | No `CodexAdapter.ts` |
| C5 | Thread start (`startThread()`) | 未接入 | standalone SDK shape verified | Smoke: `startThread()` returns Thread, `thread.id` is `null` pre-turn |
| C6 | Thread resume (`resumeThread()`) | 未接入 | standalone SDK shape verified | Smoke: `resumeThread("id")` returns Thread with `thread.id = "id"` |
| C7 | Thread.run() | 未接入 | standalone CLI path partially exercised | Smoke: timeout after 15s; CLI subprocess launched |
| C8 | Streaming (runStreamed) | 未接入 | standalone first event captured | Smoke: `thread.started` event with valid `thread_id` |
| C11 | Approval policy | 未接入 | SDK enum values verified | `.d.ts` confirms `ApprovalMode = "never" \| "on-request" \| "on-failure" \| "untrusted"` |
| C12 | Sandbox | 未接入 | SDK enum values verified | `SandboxMode = "read-only" \| "workspace-write" \| "danger-full-access"` |
| C13 | Model reasoning effort | 未接入 | SDK enum values verified | `ModelReasoningEffort = "minimal" \| "low" \| "medium" \| "high" \| "xhigh"` |
| C14 | CWD / working directory | 未接入 | SDK option field verified | `ThreadOptions.workingDirectory: string` |
| C15 | Model / config surface | 未接入 | SDK option field verified | `ThreadOptions.model: string` |
| C16 | TodoListItem (SDK-native todos) | 已 pass | SDK item shape verified + ordinary chat runtime proof | `TodoListItem` type exists in ThreadItem union; latest accepted runtime proof shows visible `Todos 3/3 ...` transcript summary on BUILD_ID `feature-codex-sdk-capability.202606092115` |
| C17 | Web search | 未接入 | SDK item/enum shape verified | `WebSearchItem` type + `WebSearchMode` enum |
| C18 | Structured output | **已 pass** (9E) | SDK option field verified + adapter wired + normalizer emits `structured_output` backend_event + composer hint visible. **Checkpoint 9E fixed schema** (`additionalProperties: false`, all properties required) to comply with OpenAI strict-mode. Runtime proof confirms empty-model ordinary chat + `/json` both succeed; structured badge renders with valid JSON. | `TurnOptions.outputSchema: unknown` |
| C19 | Abort/cancel | 未接入 | SDK option field verified | `TurnOptions.signal: AbortSignal` |
| C20 | File changes | 未接入 | SDK item shape verified | `FileChangeItem` type with path/kind/status |
| C21 | MCP tool calls | 未接入 | SDK item shape verified | `McpToolCallItem` type with server/tool/arguments/result |
| C22 | Command execution | 未接入 | SDK item shape verified | `CommandExecutionItem` type with command/output/exit_code |
| C23 | Reasoning (thinking) | 未接入 | SDK item shape verified | `ReasoningItem` type with text |
| C24 | Additional directories | 未接入 | SDK option field verified | `ThreadOptions.additionalDirectories: string[]` |
| C25 | Network access control | 未接入 | SDK option field verified | `ThreadOptions.networkAccessEnabled: boolean` |
| — | Full streaming with real model | 未接入 | none | Requires valid OpenAI API key |
| — | Obsidian Electron compatibility | 未接入 | none | Only tested on local Node.js v24.14.0 |

### 12.5 ThreadEvent → StreamChunk Mapping (Proposed)

Based on the verified SDK event types, here is the proposed mapping for the adapter's `CodexStreamNormalizer`:

| Codex ThreadEvent | Target StreamChunk | Notes |
|-------------------|-------------------|-------|
| `thread.started` | `{ type: 'message_metadata', sessionId }` | Maps `thread_id` → `sessionId` |
| `turn.started` | `{ type: 'message_start' }` | |
| `turn.completed` | `{ type: 'usage', ...usage }` | Maps `usage.input_tokens/output_tokens` |
| `turn.failed` | `{ type: 'error', content }` | Maps `error.message` |
| `item.started` (agent_message) | `{ type: 'text', content }` | Maps `item.text` |
| `item.started` (reasoning) | `{ type: 'thinking', content }` | Maps `item.text` |
| `item.started` (command_execution) | `{ type: 'tool_use', name: 'Bash', input }` | Maps `item.command` → tool input |
| `item.started` (file_change) | `{ type: 'tool_use', name: 'FileEdit', input }` | Maps `item.changes` |
| `item.started` (mcp_tool_call) | `{ type: 'tool_use', name, input, kind: 'mcp' }` | Maps `item.tool`, `item.arguments` |
| `item.started` (todo_list) | `{ type: 'tool_use', name: 'todowrite' }` | Current accepted mapping; ordinary todo product path |
| `item.started` (web_search) | `{ type: 'tool_use', name: 'web_search' }` | Current accepted mapping; visible ordinary transcript seam |
| `item.updated` | Accumulate into current item | Same mapping as item.started |
| `item.completed` (command_execution) | `{ type: 'tool_result', toolUseId, content }` | Maps `item.aggregated_output` |
| `item.completed` (mcp_tool_call) | `{ type: 'tool_result', toolUseId, content }` | Maps `item.result` or `item.error` |
| `item.completed` (agent_message) | Final text block | |
| `error` | `{ type: 'error', content }` | Maps `message` |

### 12.6 Proposed ApprovalMode Mapping (Needs Adapter Validation)

These are proposed OpenCodian-side mappings derived from the verified SDK enum values. They are not runtime proof that the product behavior is correct yet.

| Codex ApprovalMode | AgentPermissionConfig.mode | Notes |
|--------------------|--------------------------|-------|
| `"never"` | `yolo` | Never ask for approval — equivalent to full auto |
| `"on-request"` | `normal` | Ask for every action |
| `"on-failure"` | `auto` | Auto-approve on success, ask on failure |
| `"untrusted"` | `plan` | Only allow in sandbox; ask for everything else |

### 12.7 Compatibility Notes

| Environment | Verified? | Detail |
|-------------|-----------|--------|
| Node.js v24.14.0 (local macOS arm64) | ✅ Yes | SDK imports, instantiates, CLI spawns |
| Obsidian Electron (Test Vault) | ❌ Not verified | No Test Vault test this round |
| ESM compatibility | ✅ Yes | SDK is `type: "module"`, works with `import` syntax |
| CJS compatibility | ❌ Not supported | SDK exports only ESM (`"import"` condition) |

**CJS/ESM implication for plugin**: The OpenCodian plugin uses esbuild for bundling. esbuild supports ESM imports and can bundle them into CJS output. This should work, but needs explicit verification during adapter implementation.

### 12.8 Smoke Script

- **Location**: `scripts/codex-sdk-smoke.mjs`
- **Run**: `node scripts/codex-sdk-smoke.mjs`
- **Runtime**: ~30s (includes 15s timeout for fake-key API call + 10s for streamed attempt)
- **No API key required** for structural verification
- **API key needed** for full streaming verification (not tested this round)

---

## 13. Checkpoint 2: Adapter Skeleton (2026-06-09)

### 13.1 Deliverables

| File | Role | Tests | Status |
|------|------|-------|--------|
| `src/core/agents/backend/CodexStreamNormalizer.ts` | ThreadEvent → StreamChunk translation | 38 tests | ✅ Pass |
| `src/core/agents/backend/CodexAdapter.ts` | AgentService + AgentChatCapability + AgentSessionCapability | 22 tests | ✅ Pass |
| `src/core/agents/backend/index.ts` | Barrel exports added | — | ✅ Updated |
| `tests/unit/core/agents/backend/CodexStreamNormalizer.test.ts` | All 8 event types × 8 item types | 38 tests | ✅ Pass |
| `tests/unit/core/agents/backend/CodexAdapter.test.ts` | Identity, capabilities, lifecycle, DI, sessions | 22 tests | ✅ Pass |
| `docs/modules/core/agents/backend/CodexAdapter.md` | Module doc | — | ✅ Created |
| `docs/modules/core/agents/backend/CodexStreamNormalizer.md` | Module doc | — | ✅ Created |

**Total**: 60 new tests, all passing. `npm run verify` green (0 errors / 0 warnings). Build succeeds.

### 13.2 CodexStreamNormalizer — Event Mapping

| ThreadEvent | StreamChunk output | Notes |
|-------------|--------------------|-------|
| `thread.started` | `message_metadata` | thread_id → sessionId |
| `turn.started` | `message_start` | — |
| `turn.completed` | `usage` + `message_stop` | reasoning_output_tokens included in outputTokens |
| `turn.failed` | `error` | — |
| `item.started(agent_message)` | `text` | Delta via textLengths tracking |
| `item.updated(agent_message)` | `text` | Only new suffix emitted |
| `item.completed(agent_message)` | *(nothing)* | Text already emitted |
| `item.started(reasoning)` | `thinking` | partId = item.id |
| `item.started(command_execution)` | `tool_use` | kind=builtin |
| `item.completed(command_execution)` | `tool_result` | isError when status=failed |
| `item.updated(command_execution)` | `backend_event` | tool_progress |
| `item.started(file_change)` | `file_edited`×N + `tool_use` | Per-file + aggregate |
| `item.completed(file_change)` | `tool_result` | Patch completed/failed |
| `item.started(mcp_tool_call)` | `tool_use` | kind=mcp, toolMetadata.server |
| `item.completed(mcp_tool_call)` | `tool_result` | JSON content or error message |
| `item.updated(mcp_tool_call)` | `backend_event` | tool_progress |
| `item.started(web_search)` | `tool_use` | visible ordinary transcript seam |
| `item.started(todo_list)` | `tool_use` | mapped to `todowrite` snapshot input for ordinary todo surfaces |
| `item.started(error)` | `error` | — |
| `error` (ThreadErrorEvent) | `error` | Top-level stream error |

### 13.3 CodexAdapter — Declared Capabilities

| Capability | Evidence | Notes |
|------------|----------|-------|
| `Chat` | `thread.runStreamed()` + normalizer pipeline | AsyncGenerator<StreamChunk> |
| `Sessions` | `codex.startThread()` / `resumeThread()` | Provisional ID + thread ID aliasing |
| `Thinking` | `reasoning` ThreadItem normalized to `thinking` chunks | Via normalizer |
| `FileOps` | `file_change` ThreadItem normalized | file_edited + tool_use/tool_result |
| `Shell` | `command_execution` ThreadItem normalized | tool_use/tool_result lifecycle |
| `Todos` | `todo_list` ThreadItem normalized | ordinary `todowrite` snapshot path; latest accepted runtime proof on BUILD_ID `feature-codex-sdk-capability.202606092115` |
| `Permissions` | sandbox-mode product surface | active toolbar/session override surface proven |

**Still NOT declared / not proven as full product capabilities**: Mcp, Models, Branching, Fork, Questions, Config, Tools, Auth, Providers, Compaction, CostTracking, Hooks, Sharing, Export.

### 13.4 Design Decisions

1. **DI seam**: `CodexAdapterOptions.createCodex` factory allows test injection of mock SDK instances
2. **Provisional session ID**: `createSession()` returns `codex-local-<UUID>`, aliased to real `thread.id` after first `thread.started` event
3. **Error boundary**: `resolveOrCreateThread()` errors are caught and yielded as error chunks, not thrown
4. **Dynamic import**: Runtime SDK loading via `import('@openai/codex-sdk')` (ESM-only), type-only imports for compile-time
5. **Historical note**: at this checkpoint snapshot, `'codex'` had not yet been added to `IMPLEMENTED_AGENT_BACKENDS`; that limitation was removed later during public exposure.

### 13.5 Remaining Gaps (Future Checkpoints)

- Full streaming verification (needs OpenAI API key)
- Obsidian Electron compatibility test
- esbuild ESM→CJS bundling verification
- MCP capability implementation
- Model catalog / permission host integration
- ~~`'codex'` → `IMPLEMENTED_AGENT_BACKENDS` addition~~ completed later in the public-exposure checkpoints
- Product-path session resume is still unverified in plugin runtime despite the skeleton-level `resumeThread` fallback logic

### 13.6 Repair Round (2026-06-09)

Three issues identified in code review; all fixed with focused tests.

| # | Issue | Fix | Tests |
|---|-------|-----|-------|
| F1 | `web_search`/`todo_list` mapped as `structured_output` → would collide with `StreamChunkRouter` handler | Historical repair step: first downgraded to diagnostic `tool_progress`; later checkpoints promoted both seams to visible ordinary transcript `tool_use` / `tool_result` paths | +2 normalizer tests (one per item type) verified the initial collision fix |
| F2 | Unknown sessionId silently starts new thread → breaks resume after adapter restart | `resolveOrCreateThread` now distinguishes provisional IDs (`codex-local-` prefix → `startThread`) from real thread IDs (→ `resumeThread`) | +3 adapter tests: provisional alias, real thread ID resume, provisional-looking unknown ID → start |
| F3 | Missing API key gives no clear error | ~~`assertApiKeyAvailable()`~~ removed in auth-repair round — see §13.7 | — |

**Post-repair**: 68/68 Codex tests pass. `npm run verify` green.

### 13.7 Auth Repair Round (2026-06-09)

The F3 fix (§13.6) introduced an API-key-only gate (`assertApiKeyAvailable()`). Code review identified that this over-constrains auth:

**Evidence**:
1. `node_modules/@openai/codex/README.md` documents "Sign in with ChatGPT" as a supported auth path
2. `node_modules/@openai/codex-sdk/dist/index.js:244-245`: `if (args.apiKey) env.CODEX_API_KEY = args.apiKey` — apiKey is optional, not required
3. Local `~/.codex/auth.json` exists with `"auth_mode": "chatgpt"` — active ChatGPT login session
4. SDK constructor (`new Codex()`) succeeds without apiKey — auth is resolved at CLI subprocess level

**Fix**: Removed `assertApiKeyAvailable()` entirely. The adapter no longer pre-checks for API keys. Auth failures surface naturally at `thread.runStreamed()` runtime, which is the honest failure point.

**Design principle**: The adapter skeleton must not over-constrain auth to API-key-only. Supported auth sources include (but are not limited to):
- Explicit `CodexAdapterOptions.apiKey`
- `OPENAI_API_KEY` / `CODEX_API_KEY` environment variables
- `~/.codex/auth.json` ChatGPT login (CLI-managed)

**Not claimed as pass**: ChatGPT login path has NOT been verified in the Obsidian plugin runtime. It works at CLI/SDK level, but Electron subprocess compatibility is still unproven.

**Tests**: 3 auth-boundary tests replace the old F3 tests (68 total → 69 Codex tests).

### 13.8 Checkpoint 3: Hidden Runtime Integration (2026-06-09)

Checkpoint 3 wires CodexAdapter into the plugin's `AgentServiceRegistry` as a **hidden** backend — registered but never enabled, never surfaced in UI/settings.

#### Deliverables

| # | File | Change |
|---|------|--------|
| 1 | `src/core/agents/backend/AgentAdapterWiring.ts` | New — extracted adapter wiring helper from `main.ts` (owner-guard compliance) |
| 2 | `src/core/agents/backend/index.ts` | Added `wireHiddenAdapters` + `AgentAdapterWiring` exports |
| 3 | `src/main.ts` | Replaced inline `register()` calls with `wireHiddenAdapters()` (minimal diff; guarded-file touch requires `OWNER_GUARD_APPROVED`) |
| 4 | `tests/unit/core/agents/backend/CodexHiddenWiring.test.ts` | New — 18 tests covering hidden registration contract, wiring helper, and routing safety |
| 5 | `docs/modules/core/agents/backend/AgentAdapterWiring.md` | New — module docs for the wiring helper |
| 6 | `docs/modules/entry-point/main.md` | Updated — step 12a for adapter wiring extraction |
| 7 | `docs/status/codex-sdk-current-state-2026-06-09.md` | This section |

#### Test Results

- **Unit**: 86 Codex tests (68 adapter + 18 wiring) — all pass
- **Full suite**: raw `npm run verify` still fails owner-guard without explicit approval because `src/main.ts` is a guarded hotspot; with `OWNER_GUARD_APPROVED` the full suite passes
- **Build**: `feature-codex-sdk-capability.202606090217` — production build succeeds

#### Obsidian Runtime Proof

Deployed to Test Vault and verified via `obsidian eval`:

| Proof | Query | Result |
|-------|-------|--------|
| A | Hidden registration exists | **PASS** — `registry.get('codex')` returns adapter with `kind='codex', displayName='Codex'` |
| B | Codex not in enabled, but in all | **PASS** — `listEnabled()` returns 2 (opencode, claude-code); `listAll()` returns 3 (includes codex) |
| C | Capabilities and status | **PASS** — status=`disconnected`, capabilities=`chat,sessions,thinking,file-ops,shell` |
| D | Regression — existing backends | **PASS** — opencode=true (connected), claude-code=true (connected), active=claude-code |
| E | adapter.start() lifecycle | **DIAGNOSED** — initial diagnosis recorded here was later corrected in §13.9 |
| F | adapter.stop() recovery | **PASS** — `stop()` returns status=`disconnected`, clean lifecycle |

#### Known Limitation: ESM Import in Electron

> **CORRECTED in §13.9**: The initial diagnosis "ESM-only SDK import fails in Electron CJS context" was wrong. The real blocker was missing runtime packages + broken `require.resolve` chain. After repair, `adapter.start()` succeeds and returns `connected`. This section is preserved for audit trail.

`CodexAdapter.start()` uses `await import('@openai/codex-sdk')` which fails in Obsidian's Electron (CJS) environment. The adapter correctly catches this and sets `status='error'`. This is expected for the current checkpoint — the hidden wiring proof shows:
- ✅ Registration works
- ✅ Lifecycle is clean (start → error → stop → disconnected)
- ❌ SDK instantiation in Electron is blocked by ESM/CJS boundary

This will require either:
1. esbuild bundling of the ESM SDK into the CJS `main.js` output
2. A separate loader that uses `require()` after pre-compilation
3. Bundling the SDK with proper ESM shims

#### Invariant Verification

| Invariant | Status |
|-----------|--------|
| `'codex'` NOT in `IMPLEMENTED_AGENT_BACKENDS` | **PASS** — still `['opencode', 'claude-code']` |
| UI backend selector does NOT show codex | **PASS** — listEnabled() excludes codex |
| Settings page does NOT show codex options | **PASS** — IMPLEMENTED_AGENT_BACKENDS filters settings |
| No new standalone settings panel | **PASS** — no settings changes |
| OpenCode backend still works | **PASS** — status=connected |
| Claude Code backend still works | **PASS** — status=connected |

### 13.9 Checkpoint 3 Repair Round (2026-06-09)

The initial checkpoint 3 (§13.8) documented `adapter.start()` as failing with `error` status and attributed this to an "ESM/CJS boundary in Electron". That diagnosis was wrong.

#### Corrected Diagnosis

The real blocker was two issues:

1. **Missing Codex runtime packages in dist/Test Vault**. The build pipeline copied Claude Code's `@anthropic-ai/claude-agent-sdk-<platform>` but had no equivalent step for Codex. The SDK's `findCodexPath()` uses `require.resolve('@openai/codex/package.json')` which needs the actual `node_modules` directory tree present at runtime.

2. **Obsidian plugin `__filename` does not point to plugin directory**. Even after copying the runtime packages, `findCodexPath()` failed because `createRequire(import.meta.url)` in the bundled code resolves from `__OPENCODIAN_IMPORT_META_URL__` which equals `require("url").pathToFileURL(__filename)`. In Obsidian's plugin loader, `__filename` points to Electron's renderer init script, not the plugin's `main.js`. This makes `require.resolve()` search from the wrong base directory. Claude Code avoids this because `main.ts` passes `pathToClaudeCodeExecutable` explicitly, bypassing `require.resolve` entirely.

#### Fixes Applied

| # | File | Change |
|---|------|--------|
| 1 | `scripts/codex-sdk-dist.mjs` | New — Codex runtime packaging script (modeled after `claude-sdk-dist.mjs`) |
| 2 | `scripts/build.mjs` | Added `copyCodexRuntime()` call after Claude SDK copy |
| 3 | `src/core/agents/backend/CodexAdapter.ts` | Added `codexPathOverride` option, `cwd` option, `skipGitRepoCheck: true` in `buildThreadOptions()` |
| 4 | `src/core/agents/backend/AgentAdapterWiring.ts` | Added `resolveCodexBinaryPath()` helper, passes `codexPathOverride` to CodexAdapter |
| 5 | `src/main.ts` | Passes `pluginDir` to `wireHiddenAdapters()` |
| 6 | `tests/unit/core/agents/backend/CodexHiddenWiring.test.ts` | Updated for `pluginDir` param |

#### Runtime Proof (Post-Repair)

| Proof | Query | Result |
|-------|-------|--------|
| A | adapter.start() | **PASS** — status=`connected`, `startError=null` |
| B | createSession() | **PASS** — returns `codex-local-<UUID>` |
| C | sendMessage() streaming | **PASS** — hidden runtime smoke returned `message_metadata` → `message_start` → `usage` → `message_stop` |
| D | Regression (OC + CC) | **PASS** — hidden adapter registration leaves user-enabled backends untouched |
| E | Invariants | **PASS** — codex hidden, not enabled, not in UI |

#### dist/ Runtime Files

```
dist/node_modules/@openai/codex/                     (package.json + bin/codex.js)
dist/node_modules/@openai/codex-darwin-arm64/        (vendor/aarch64-apple-darwin/bin/codex — 191MB)
```

#### Key Design Decisions

- `codexPathOverride` follows the same pattern as Claude Code's `pathToClaudeCodeExecutable`: resolve the absolute binary path from `pluginDir` at wiring time, pass it to the SDK constructor. This bypasses the broken `require.resolve` chain entirely.
- `skipGitRepoCheck: true` is set unconditionally in `buildThreadOptions()` because Obsidian vaults are not typically Git repositories. The CLI's git-trust check would reject non-Git vaults.
- `resolveCodexBinaryPath()` maps `process.platform` + `process.arch` to the target triple and platform package name, mirroring the SDK's own mapping.

#### Verification Gate

- Raw `npm run verify` fails only on `RULE_1_HOTSPOT_CLASS_B` because `src/main.ts` is guarded.
- `OWNER_GUARD_APPROVED="Codex hidden runtime registration in src/main.ts for checkpoint 3 runtime proof" npm run verify` passes fully with:
  - `474` suites
  - `4395` tests
  - build `BUILD_ID: feature-codex-sdk-capability.202606090248`

#### Remaining Blockers (Minimal)

- **Auth depth**: hidden runtime smoke reached a valid completed turn, but the captured chunk sequence did not yet prove ordinary assistant text rendering or broader auth portability across environments. The adapter still relies on whichever Codex CLI auth source is available at runtime.
- **Binary size**: The Codex CLI binary is 191MB (darwin-arm64). This is significant for plugin distribution.
- **Not exposed to users**: `'codex'` is still not in `IMPLEMENTED_AGENT_BACKENDS`. The adapter is hidden and only programmatically accessible.

### 13.10 Checkpoint 3 Repair Round 2: Final-Text Normalization (2026-06-09)

#### Problem

The §13.9 hidden runtime smoke produced this chunk sequence:
```
message_metadata → message_start → tool_use → tool_result → usage → message_stop
```

No `text` chunk appeared. The Codex CLI ran successfully and returned agent output, but `CodexStreamNormalizer` dropped the final text.

#### Root Cause

`onAgentMessage()` and `onReasoning()` returned `[]` unconditionally for `phase === 'completed'`:

```ts
if (phase === 'completed') {
  return []; // text already emitted via started/updated deltas
}
```

This assumed text always arrives incrementally via `item.started` + `item.updated`. In the real Obsidian runtime, Codex only emits `item.completed(agent_message)` with the full text — no `started` or `updated` events. The normalizer ate the final text entirely.

#### Fix

Changed `onAgentMessage()` and `onReasoning()` to always compute the delta via `takeSuffix()`, then emit it on `completed` only if there's new text (i.e., text that wasn't already emitted during started/updated):

```ts
// Before (broken):
if (phase === 'completed') { return []; }
const content = takeSuffix(...)

// After (fixed):
const content = takeSuffix(...)
if (phase === 'completed' && !content) { return []; } // already fully emitted
return content ? [{ type: 'text', content }] : [];
```

This handles both paths:
1. **Streaming**: started emits partial → updated emits delta → completed has no new text → `[]`
2. **Completed-only**: no started/updated → `takeSuffix` returns full text → emit it

#### Tests Added (6 new)

| # | Test | Validates |
|---|------|-----------|
| 1 | `emits final text on completed with no prior started/updated` | Completed-only agent_message emits full text |
| 2 | `emits delta on completed when completed text extends beyond updated` | Partial streaming + completed suffix |
| 3 | `emits final thinking on completed with no prior started/updated` | Completed-only reasoning emits full thinking |
| 4 | `emits thinking delta on completed when text extends beyond updated` | Partial streaming + completed suffix |
| 5 | `processes completed-only turn (no streaming)` | Full pipeline with only completed events |
| 6 | `processes completed-only turn with reasoning` | Reasoning + agent_message both completed-only |

Total normalizer tests: 34 → 40.

#### Post-Fix Runtime Smoke

```
message_metadata → message_start → tool_use → tool_result → text → usage → message_stop
```

- **`text` chunk present**: ✅ content `"Hello there friend"`
- Second test: `text` content `"4"` (answer to "What is 2+2?")
- `dev:errors`: no fresh errors
- Regression: opencode=connected, claude-code=connected, codex=connected

#### Remaining Blockers (Minimal)

- **Auth depth**: Hidden runtime smoke reached valid completed turns with real text. Auth works via ChatGPT login in current test environment. Portability across environments without local auth is unverified.
- **Binary size**: 191MB darwin-arm64 CLI binary. Significant for plugin distribution.
- **Historical note**: At the end of this hidden-runtime checkpoint, `'codex'` was still not in `IMPLEMENTED_AGENT_BACKENDS`. That limitation was removed later in §14 during public exposure.

---

## 14. Checkpoint 4 Baseline: Public Exposure + Broad Config Surface WIP (2026-06-09)

### 14.1 Public Exposure

Added `'codex'` to `IMPLEMENTED_AGENT_BACKENDS` in `SettingsBackendSection.ts`. Codex is now visible in the backend picker, can be enabled/disabled, and can be set as the active backend.

### 14.2 Settings Surface — 7 Fields Wired (Current Code, Review Synced)

> **Reviewer note (current truth)**: the broad `SettingsCodexSection` surface
> is now partially productized. The accepted ordinary stable surface is
> `apiKey + model + sandboxMode + modelReasoningEffort + additionalDirectories + networkAccessEnabled + webSearchMode`.
> `webSearchMode` is **settings-only** (Checkpoint 15F): dropdown wired and
> persisted, but distinct runtime behavior between modes is not yet
> end-to-end proven.

| # | Field | Settings Control | ThreadOptions Key | CLI Arg | Default | Status |
|---|-------|-----------------|-------------------|---------|---------|--------|
| 1 | `apiKey` | Text input (masked) | `CodexOptions.apiKey` | env `CODEX_API_KEY` | none | **已 pass** (contracted stable surface) |
| 2 | `model` | Text input | `ThreadOptions.model` | `--model` | none (SDK default) | **已 pass** (contracted stable surface) |
| 3 | `sandboxMode` | Dropdown (`read-only`/`workspace-write`/`danger-full-access`) | `ThreadOptions.sandboxMode` | `--sandbox` | `workspace-write` | **已 pass** (ordinary settings surface; next-thread boundary) |
| 4 | `modelReasoningEffort` | Dropdown (`minimal`/`low`/`medium`/`high`/`xhigh`) + boundary hint | `ThreadOptions.modelReasoningEffort` | `--config model_reasoning_effort=` | `medium` | **已 pass** (ordinary settings surface; next-thread boundary) |
| 5 | `additionalDirectories` | Textarea (newline-separated → `string[]`) | `ThreadOptions.additionalDirectories` | `--add-dir` per path | none | **已 pass** (ordinary settings surface; next-thread boundary) |
| 6 | `networkAccessEnabled` | Toggle (boolean) | `ThreadOptions.networkAccessEnabled` | `--config sandbox_workspace_write.network_access=` | `false` | **已 pass** (ordinary settings surface; next-thread boundary) |
| 7 | `webSearchMode` | Dropdown (`disabled`/`cached`/`live`) | `ThreadOptions.webSearchMode` | `--config web_search=` | `cached` | **settings-only** (15F) |

### 14.3 Decisions on Non-Productized Fields

| Field | Decision | Rationale |
|-------|----------|-----------|
| `approvalPolicy` | **BLOCKED** | On the current TypeScript SDK integration path, the SDK closes stdin immediately after spawning CLI and does not expose a bidirectional approval event channel through `ThreadItem` / `ThreadEvent`. This blocks stable productization on this route. Official Codex overall still has approval surfaces on CLI/config and app-server; they are simply not the route integrated here. |
| `webSearchEnabled` | **HIDDEN** | Legacy boolean alias for `webSearchMode`. SDK documentation recommends `webSearchMode` instead. Kept as hidden passthrough to avoid user confusion. |
| `workingDirectory` | **WIRED (not in settings)** | Always set to vault path by `AgentAdapterWiring`. Not a user-facing setting. |
| `skipGitRepoCheck` | **WIRED (not in settings)** | Always `true` because Obsidian vaults are not typically Git repositories. |

### 14.4 Startup / Switch-State Lifecycle Fix

- **`main.ts`**: Auto-starts active adapter after `setActive()` call — idempotent for OpenCode (ServerManager returns if already running).
- **`SettingsBackendSection`**: Generic start/stop lifecycle for ALL backends (not just opencode). Active-backend switch stops old adapter before starting new one.

### 14.5 Message Identity Fix

Replaced SDK's `item.id` (per-turn counter, resets to `item_0`) with `crypto.randomUUID()` for globally unique messageId across restarts/resumes. The SDK `item.id` is still used internally for `takeSuffix()` text-length tracking within normalizer instance scope.

### 14.6 Key Files Changed (Checkpoint 4)

| File | Change |
|------|--------|
| `src/core/types/settings.ts` | `CodexBackendSettings` (7 fields), `CodexSandboxMode`, `CodexReasoningEffort`, `CodexWebSearchMode` types |
| `src/core/agents/backend/CodexAdapter.ts` | `CodexAdapterOptions` + `buildThreadOptions()` passthrough for all fields |
| `src/core/agents/backend/CodexStreamNormalizer.ts` | `crypto.randomUUID()` for messageId, `turnMetadataEmitted` guard |
| `src/core/agents/backend/AgentAdapterWiring.ts` | Passes all settings fields to adapter |
| `src/features/settings/SettingsCodexSection.ts` | 7 settings controls |
| `src/features/settings/SettingsBackendSection.ts` | Generic start/stop + active switch lifecycle |
| `src/main.ts` | Auto-starts active adapter after `setActive()` |
| `src/i18n/locales/en.ts` + `zh.ts` | ~25 Codex locale keys |

### 14.7 Test Coverage

| Test File | Tests | Key Coverage |
|-----------|-------|-------------|
| `CodexAdapter.test.ts` | 48 | model, sandbox, effort, dirs, network, webSearch passthrough |
| `CodexStreamNormalizer.test.ts` | 46 | Event mapping, delta tracking, completed-only turns, persisted-thread resume uniqueness |
| `SettingsBackendSection.test.ts` | 7 | Enable/disable/switch lifecycle |

### 14.8 Remaining Gaps (Future Checkpoints)

| Gap | Status | Blocker |
|-----|--------|---------|
| `approvalPolicy` | BLOCKED | Current TypeScript SDK route lacks the bidirectional approval channel needed for productization; official Codex overall still exposes approval surfaces via CLI/config and app-server |
| Broad Codex settings panel (`SettingsCodexSection`) | mixed | `apiKey + model + sandboxMode + modelReasoningEffort + additionalDirectories + networkAccessEnabled` are accepted as stable ordinary surface with next-thread lifecycle copy; `webSearchMode` is **settings-only** (Checkpoint 15F: dropdown wired and persisted, distinct runtime behavior between modes not yet proven) |
| MCP capability | 未接入 | No implementation |
| Model catalog integration | 未接入 | Codex has no `listModels()` API |
| Structured output (`outputSchema`) | **已 pass** (9E) | Schema fixed to include `additionalProperties: false` and all properties in `required` per OpenAI strict-mode requirements. Runtime proof: empty-model Codex ordinary chat succeeds; `/json` produces valid JSON response with structured badge rendering. No schema validation errors. |
| Image input (`local_image`) | **已 pass** (11B) | Core ordinary-chat seam is proven: composer image UI, send-pipeline passthrough, Codex adapter handling, and optimistic/persisted user-message rendering all work. Paste / drag-and-drop / reorder remain out of scope. |
| Cross-environment auth portability | 未验证 | ChatGPT login works locally, Electron/other envs untested |
| Binary size (191MB) | Known | Platform binary packaging limitation |

## 15. Checkpoint 2 (Codex SDK Capability): Effort Selector Productization (2026-06-09)

### 15.1 What Changed

Productized `modelReasoningEffort` into the ordinary chat toolbar effort selector when Codex is the active backend:

- Added `CODEX_EFFORT_VARIANTS` constant (`minimal`/`low`/`medium`/`high`/`xhigh`) in `ClaudeCodeModelCatalog.ts`
- Added `updateModelReasoningEffort()` to `CodexAdapter` for runtime effort update without adapter recreation
- Updated `OpenCodianView.mountEffortSelector` to detect Codex backend and show Codex-specific effort variants
- Updated `normalizeEffortVariantForCurrentBackend` to handle Codex effort normalization
- Added `isCodexConversationActive()` helper (parallel to `isClaudeCodeConversationActive()`)
- Updated `updateEffortSelectorDisplay` to handle Codex backend path
- `onVariantChange` for Codex writes back to `plugin.settings.backendSettings.codex.modelReasoningEffort` and calls `updateCodexAdapterEffort()`

### 15.2 Behavioral Semantics

- Codex effort selector appears in the same shared toolbar surface used by other backends
- The selector shows Codex-supported levels only (no `max`, includes `minimal`)
- No "disabled/default" option — Codex always requires an effort level
- Changing the selector updates the persisted setting AND the live adapter's `buildThreadOptions()`
- **Honest boundary**: the update only affects threads created/resumed after the change. Existing running threads are not affected mid-stream. This boundary is made visible to the user via a boundary hint ("Applies to next turn" / "下次对话生效") rendered between the effort label and the variant dropdown, plus a hover `title` tooltip on the group element.

### 15.3 Test Coverage

| Test File | New Tests | Key Coverage |
|-----------|-----------|-------------|
| `CodexAdapter.test.ts` | 3 | `updateModelReasoningEffort` — updates subsequent thread, clears with undefined |
| `ClaudeCodeModelCatalog.test.ts` | 3 | `CODEX_EFFORT_VARIANTS` — content, no max, has minimal |

### 15.4 Key Files Changed (Checkpoint 2)

| File | Change |
|------|--------|
| `src/core/agents/backend/ClaudeCodeModelCatalog.ts` | Added `CODEX_EFFORT_VARIANTS` constant |
| `src/core/agents/backend/CodexAdapter.ts` | Mutable options + `updateModelReasoningEffort()` method |
| `src/core/agents/backend/index.ts` | Export `CODEX_EFFORT_VARIANTS` |
| `src/features/chat/OpenCodianView.ts` | Codex effort in `mountEffortSelector`, `updateEffortSelectorDisplay`, `normalizeEffortVariantForCurrentBackend`, `isCodexConversationActive`, `updateCodexAdapterEffort` |

## 16. Checkpoint 2A (Codex SDK Capability): Effort Selector Boundary Honesty (2026-06-09)

### 16.1 What Changed

Added a visible boundary hint to the effort selector when the Codex backend is active, honestly indicating that effort changes only apply to the next conversation turn (thread creation/resume), not the currently running thread.

- Added `getBoundaryHint` optional callback to `EffortSelectorCallbacks` interface
- `EffortSelector.render()` now renders a `.opencodian-effort-boundary-hint` span with the hint text
- `EffortSelector.updateDisplay()` refreshes the hint text on each display update
- The group element's `title` attribute is set to the hint for hover tooltip
- `OpenCodianView` wires `getBoundaryHint` to return `t('chat.effort.boundaryHint.codex')` when Codex is active
- Added locale strings: `chat.effort.boundaryHint.codex` → "Applies to next turn" (en) / "下次对话生效" (zh)
- Added CSS for `.opencodian-effort-boundary-hint` in `effort-selector.css`

### 16.2 Behavioral Semantics

- When Codex is the active backend, the effort selector shows a small hint text ("Applies to next turn") between the label and the variant dropdown
- The hint is always visible (not just on hover), making the boundary clear at a glance
- The group element also has a `title` attribute matching the hint for hover tooltip
- Non-Codex backends do not show the hint (no `getBoundaryHint` callback provided)
- The hint updates correctly when the display is refreshed

### 16.3 Test Coverage

| Test File | New Tests | Key Coverage |
|-----------|-----------|-------------|
| `effortSelectorBoundaryHint.test.ts` | 6 | Hint rendering, absence when undefined/empty, title attribute, dynamic update on `updateDisplay()` |

### 16.4 Key Files Changed (Checkpoint 2A)

| File | Change |
|------|--------|
| `src/features/chat/ui/EffortSelector.ts` | Added `getBoundaryHint` callback, hint rendering in `render()` and `updateDisplay()` |
| `src/features/chat/OpenCodianView.ts` | Wired `getBoundaryHint` for Codex backend |
| `src/i18n/locales/en.ts` | Added `chat.effort.boundaryHint.codex` |
| `src/i18n/locales/zh.ts` | Added `chat.effort.boundaryHint.codex` |
| `src/style/components/effort-selector.css` | Added `.opencodian-effort-boundary-hint` style |
| `docs/modules/features/chat/ui/EffortSelector.md` | Updated with boundary hint documentation |

## 17. Checkpoint 4B: Per-Conversation Codex Model Override (2026-06-09)

Extends the existing session settings modal with a Codex-specific **model text override** field. This is a per-conversation override — not a model catalog/dropdown.

This checkpoint builds on the already reviewed session-modal Codex override seam
from checkpoint 4A: `codexSandboxMode` + `codexModelReasoningEffort` in the
ordinary conversation session settings modal.

#### Changed Files

| File | Change |
|------|--------|
| `src/core/types/chat.ts` | Added `codexModelOverride?: string \| null` to `ConversationSessionSettings` + normalization |
| `src/core/agents/backend/CodexAdapter.ts` | Added `updateModel(model?: string)` setter for next-thread model override |
| `src/features/chat/services/ConversationSessionSettingsCoordinator.ts` | Extended `getCodexGlobalDefaults`/`applyCodexRuntimeOverrides` to include `model` field; resolve/save/apply for `codexModelOverride` |
| `src/features/chat/ui/ConversationSessionSettingsModal.ts` | Added `createTextField` method, `codexModelOverrideInputEl`, model override input in Codex section |
| `src/features/chat/OpenCodianView.ts` | Host passes `model` from global Codex settings; `applyCodexRuntimeOverrides` calls `updateModel` |
| `src/i18n/locales/en.ts` | Added `codexModelOverride` / `codexModelOverrideDesc` / `codexModelOverrideEmpty` |
| `src/i18n/locales/zh.ts` | Same keys in Chinese |
| `src/style/modals/config-editor-modal.css` | Added `.opencodian-session-settings-text-input` style |
| `tests/unit/core/types/chat.test.ts` | +3 tests for `codexModelOverride` normalization |
| `tests/unit/core/agents/backend/CodexAdapter.test.ts` | +4 tests for `updateModel` (set, clear, trim, blank) |
| `tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts` | +5 tests for model override modal rendering, initialization, save, clear |
| `tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts` | +8 tests for model override resolve, fallback, apply, persist, modal defaults |
| `docs/modules/style/modals/config-editor-modal.md` | Added `文本输入` to key class list |
| `graphify-out/` | Refreshed via `npm run graphify:update:src` |

#### Test Results

- **478 suites, 4501 tests** — all pass
- **New tests**: 20 (3 normalization + 4 adapter + 5 modal + 8 coordinator)
- **Owner guard**: `OWNER_GUARD_APPROVED=codex-sdk-checkpoint4b`
- **Build**: `feature-codex-sdk-capability.202606091631`
- **Lint follow-up**: initial review found 2 `max-lines-per-function` warnings in the new Codex test files; a narrow test-only remediation round cleared them before final acceptance

#### Runtime Evidence

- Built JS contains: `codexModelOverride` (24 refs), `codex-model-override` (1 ref), `updateModel` (41 refs), `opencodian-session-settings-text-input` (1 ref + CSS)
- Deployed to Test Vault; BUILD_ID verified (3 matches in both dist and vault)
- Plugin reloaded without errors
- Console shows only pre-existing `ERR_CONNECTION_REFUSED` (OpenCode server not running) — no new errors
- Reviewer manually re-opened the Codex conversation session settings modal in Obsidian Test Vault and confirmed the new `模型覆盖` input appears inside the existing Codex section with the next-thread boundary copy intact
- Negative non-Codex proof remains weaker than the positive Codex proof in this final review pass; rely on the implementation-round DOM proof plus unit coverage for the non-Codex absence assertion

#### Honest Boundary

- This is a **next-thread / subsequent-thread** setting, not live mutation of an already-running turn
- Model override is stored as `Conversation.sessionSettings.codexModelOverride` and pushed to the adapter's `updateModel()` on save/activate
- The adapter applies the new model when creating or resuming threads after the override is set
- Empty/inherit clears the override and falls back to the global Codex model setting (`backendSettings.codex.model`)
- If the global Codex model is empty, the inherited default honestly shows "(none)" — no fake model name is invented
- Actual model effect at runtime is proven as **writeback-to-adapter / next-thread seam** only

### 14.6 Checkpoint 5A: Settings Surface Contraction (2026-06-09)

Contracted the ordinary `SettingsCodexSection` UI from 7 controls + connection info down to 2 reviewed-stable controls + connection info.

> Historical note: this section records the truth immediately after Checkpoint 5A. It was later partially superseded by Checkpoint 10A, which re-promoted `additionalDirectories` and `networkAccessEnabled` into the ordinary active-backend settings surface while leaving `webSearchMode` at `readback`.

#### Surface Before

| Control | Present |
|---------|---------|
| `apiKey` | Yes |
| `model` | Yes |
| `sandboxMode` | Yes |
| `modelReasoningEffort` | Yes |
| `additionalDirectories` | Yes |
| `networkAccessEnabled` | Yes |
| `webSearchMode` | Yes |
| Authentication info (disabled) | Yes |

#### Surface After

| Control | Present | Notes |
|---------|---------|-------|
| `apiKey` | Yes | Reviewed stable ordinary settings exposure; auth behavior itself is not re-proven by checkpoint 5A |
| `model` | Yes | Reviewed stable ordinary settings exposure; deeper runtime effect remains proven only through the writeback/next-thread seams |
| Authentication info (disabled) | Yes | Passive notice |

#### Removed From Ordinary UI (Types/Wiring Preserved)

| Control | Where Still Accessible |
|---------|----------------------|
| `sandboxMode` | Per-conversation session settings modal + chat toolbar selector |
| `modelReasoningEffort` | Per-conversation session settings modal + chat toolbar effort selector |
| `additionalDirectories` | Historical 5A state: types only; later re-promoted by Checkpoint 10A into ordinary active-backend settings |
| `networkAccessEnabled` | Historical 5A state: types only; later re-promoted by Checkpoint 10A into ordinary active-backend settings |
| `webSearchMode` | Types only; no user surface |

#### Changed Files

| File | Change |
|------|--------|
| `src/features/settings/SettingsCodexSection.ts` | Removed 5 control renderings from `renderConnectionTab()` |
| `tests/unit/features/settings/SettingsCodexSection.test.ts` | New — 8 tests for contracted surface |
| `docs/modules/features/settings/SettingsCodexSection.md` | Updated surface table and boundaries |
| `devlog.md` | Added checkpoint-5A entry |
| `graphify-out/` | Refreshed |

#### Verify

- 479 suites, 4509 tests, **0 errors / 0 warnings**
- Owner guard: `OWNER_GUARD_APPROVED=codex-sdk-checkpoint5a`
- Build: `feature-codex-sdk-capability.202606091647`
- Test Vault: deployed, BUILD_ID verified, plugin reloads cleanly
- DOM proof: `[data-codex-section="connection"]` contains exactly 3 `.setting-item` elements: "OpenAI API 密钥", "模型", "认证方式"

#### Honest Boundary

- Underlying `CodexBackendSettings` type still has all 7 fields; adapter wiring unchanged
- `sandboxMode` and `modelReasoningEffort` remain user-accessible through per-conversation session settings modal and chat toolbar selectors
- At the end of Checkpoint 5A, `additionalDirectories`, `networkAccessEnabled`, and `webSearchMode` had no ordinary settings surface. Later checkpoint history changed that: Checkpoint 10A promoted the first two, while `webSearchMode` stayed `readback`.

## 18. Checkpoint 5B: `webSearchMode` Viability Audit (2026-06-09)

Diagnostics-only audit. No code changes were made.

### Verdict

- **Truth bucket now**: `hidden`
- **Reason**: `webSearchMode` has passthrough plumbing, but no ordinary chat product-path evidence across `disabled`, `cached`, or `live`.
- **Stable settings exposure**: **not approved**

### Evidence Summary

| Mode | Product-path evidence | Readback / plumbing evidence | Verdict |
|------|-----------------------|------------------------------|---------|
| `disabled` | none | adapter/type passthrough only | hidden |
| `cached` | none | default value + passthrough only | hidden |
| `live` | none | adapter/unit-test passthrough only | hidden |

### Key Findings

1. `CodexAdapter.buildThreadOptions()` still forwards `webSearchMode` into `ThreadOptions`, so the wiring exists.
2. `CodexStreamNormalizer` currently downgrades Codex `web_search` items into diagnostic-style `backend_event(tool_progress)` chunks instead of visible tool-use chunks.
3. The chat rendering path discards those `backend_event` chunks for ordinary transcript rendering, so even if the CLI emits `web_search`, the user currently does not get a stable visible product surface for it.
4. No Test Vault ordinary chat run has yet produced convincing visible differentiation between `disabled`, `cached`, and `live`.

### Blocker

- The next blocker is not settings UI. It is transcript/rendering visibility plus proof. Until a future rendering-unblock checkpoint proves that Codex ordinary chat can surface `web_search` behavior in a user-visible way, `webSearchMode` should remain hidden.

### Recommended Next Smallest Checkpoint

- **Checkpoint 5C**: web-search rendering unblock audit/prototype.
  - Goal: determine whether real Codex `web_search` items are emitted in ordinary chat and, if so, make them visible in the transcript before reconsidering any stable settings exposure.

## 19. Checkpoint 5C: `web_search` Transcript Visibility Unblock (2026-06-09)

Minimal product-path unblock. This checkpoint did **not** add any settings UI.
It only changed ordinary transcript visibility for Codex `web_search` items.

### Changed Files

| File | Change |
|------|--------|
| `src/core/agents/backend/CodexStreamNormalizer.ts` | Promoted `web_search` from diagnostic-only `backend_event(tool_progress)` to visible `tool_use` / `tool_result` lifecycle |
| `tests/unit/core/agents/backend/CodexStreamNormalizer.test.ts` | Updated `web_search` lifecycle expectations |

### Runtime Evidence

- Test Vault ordinary Codex chat produced **7 visible `WebSearch` tool blocks** for a web-search-likely news prompt.
- The visible blocks appeared in the same ordinary chat transcript as the user prompt and assistant answer.
- Independent reviewer check in Obsidian confirmed the rendered `WebSearch` buttons are visible in the current transcript under BUILD_ID `feature-codex-sdk-capability.202606091731`.
- Worktree `dist/main.js` and Test Vault `main.js` both report BUILD_ID `feature-codex-sdk-capability.202606091731`.

### Truth Update

- `web_search` as an ordinary transcript-visible Codex tool path is now **product-path proven**.
- `webSearchMode` itself is upgraded only to **`readback`**, not `已 pass`.

### Why Only `readback`

1. The checkpoint proves that Codex ordinary chat can emit and render visible `web_search` tool items.
2. It does **not** yet prove that `webSearchMode = disabled / cached / live` produces stable, distinguishable behavior differences in OpenCodian ordinary chat.
3. Therefore the tool visibility path is proven, while the mode selector semantics remain only partially established.

### Remaining Blockers

- Mode differentiation for `disabled` vs `cached` vs `live` remains unverified.
- Tool summary polish is incomplete: the rendered `WebSearch` blocks are visible, but the summary/result copy is still minimal (`Web search completed`).

### Recommended Next Smallest Checkpoint

- **Checkpoint 5D**: `webSearchMode` mode-differentiation audit.
  - Goal: verify whether `disabled`, `cached`, and `live` create observable differences in ordinary Codex chat before reconsidering any stable settings exposure.

## 20. Checkpoint 5D: `webSearchMode` Mode Differentiation Audit (2026-06-09)

Diagnostics-only follow-up. No product code changed.

### Verdict

- **Truth bucket remains**: `readback`
- **Reason**: Checkpoint 5C already proved the ordinary transcript-visible `web_search` tool path, but this audit did **not** prove stable visible differentiation for `disabled` vs `cached` vs `live`.
- **Promotion**: none

### Evidence Summary

| Mode | Strongest current evidence | Verdict |
|------|----------------------------|---------|
| `disabled` | SDK/adapter plumbing only; no runtime proof that `web_search` blocks are suppressed | unproven |
| `cached` | Current Test Vault setting + prior 5C visible `WebSearch` blocks | readback |
| `live` | SDK/CLI config path exists, but no runtime proof of visible difference vs `cached` | unproven |

### Honest Boundary

1. This audit did **not** execute fresh mode-varied Test Vault chat runs, so it cannot promote `webSearchMode` beyond `readback`.
2. The current Codex CLI public help clearly documents `--search` for live web search, but does not give user-visible semantics for `cached`.
3. Because `web_search` transcript visibility is already proven from 5C, the correct post-5D state is **not** `hidden`; it remains **`readback`** until runtime differentiation is proven.

### Remaining Blockers

- No runtime proof yet that `disabled` suppresses `web_search` tool emission in ordinary Codex chat
- No stable ordinary-chat evidence that `cached` and `live` produce distinguishable visible behavior
- No stable UI surface that exposes the active `webSearchMode` value to the user

### Recommended Next Smallest Checkpoint

- **Checkpoint 5E**: runtime smoke for `disabled`
  - Goal: switch Test Vault `webSearchMode` to `disabled`, run one web-search-likely ordinary Codex chat prompt, and verify whether visible `WebSearch` blocks disappear. If they do not, keep the seam at `readback`.

### Delegation Health Note

- During the 2026-06-09 continuation, the desired OpenCode MCP workflow path was only partially healthy:
  - `opencode_ask` failed with `500 Unexpected server error` from `POST /session/{id}/message`
  - an `opencode_run` MCP probe created a session but persisted only the user message and no assistant reply
- The same machine and model pairing still worked through OpenCode CLI:
  - `~/.opencode/bin/opencode run --model kimi-for-coding/k2p6 ...` succeeded in the codex-sdk-capability worktree
- Operationally, the honest state for this continuation is:
  - **OpenCode remains the implementer**
  - **MCP workflow tools are currently unreliable for fresh prompt delivery / result retrieval**
  - **CLI fallback is the viable delegation path until MCP transport behavior is repaired**

## 21. Checkpoint 5E: `webSearchMode=disabled` Runtime Smoke (2026-06-09)

Diagnostics-only runtime follow-up. No repo product code changed.

### Verdict

- **Truth bucket remains**: `readback`
- **Reason**: this checkpoint added runtime evidence for the `disabled` suppression branch, but it still did not prove the full `disabled / cached / live` seam or create a stable user-facing surface
- **Promotion**: none

### Runtime Evidence

Test Vault setup:
- Active backend: `codex`
- Temporary config switch: `webSearchMode` changed from `cached` to `disabled`
- Plugin reload completed cleanly on BUILD_ID `feature-codex-sdk-capability.202606091731`
- Prompt: `What happened in the news today June 9 2026? Please search the web for the latest headlines.`

Observed behavior under `disabled`:
- zero visible `WebSearch` buttons in the ordinary chat DOM
- zero `WebSearch` text hits in `document.body.innerText`
- no `web_search` / `WebSearch` markers in captured console output
- the assistant instead emitted alternate tool paths such as `command_execution` and later `js Connect in-app browser`
- `obsidian dev:errors` remained empty

Captured runtime artifact:
- `.obsidian-debug/checkpoint-5e-disabled-runtime.png`

### Honest Boundary

1. This checkpoint is strong evidence that `disabled` suppresses the ordinary transcript-visible `web_search` path for the tested prompt shape.
2. It does **not** prove `cached` vs `live` visible differentiation.
3. It does **not** turn `webSearchMode` into `已 pass`, because the setting still lacks a reviewed stable user-facing product surface and the three-mode seam remains incomplete.

### Remaining Blockers

- `cached` vs `live` remains unverified in ordinary chat
- no stable ordinary settings/chat UI exposes `webSearchMode`
- current OpenCode MCP workflow tools remain unreliable; this checkpoint used OpenCode CLI fallback for the config-prep step

### Recommended Next Smallest Checkpoint

- Stop for review.
- If approved, the next smallest follow-up is a narrow `cached` vs `live` runtime comparison, with the expectation that the honest final state may still be “not visibly distinguishable”.

## 22. Checkpoint 6A: Codex `mcp_tool_call` Transcript Runtime Proof (2026-06-09)

Diagnostics-only runtime follow-up. No repo product code changed.

### Verdict

- **Transcript seam promoted**: ordinary Codex chat can visibly render a real `mcp_tool_call`
- **Broader MCP capability state**: unchanged

### Runtime Evidence

Test Vault setup:
- Active backend: `codex`
- Enabled backends included `codex`
- Prompt in a fresh conversation: `Use the node_repl MCP tool to evaluate: Math.sqrt(1764)`
- User Codex config already had an explicit `mcp_servers.node_repl` entry in `~/.codex/config.toml`

Observed ordinary chat behavior:
- visible initial assistant text acknowledging use of the `node_repl` MCP tool
- one visible `command_execution` tool block for the workflow check
- one separate visible `js Evaluate square root` tool block
- final assistant text: ``Math.sqrt(1764) evaluates to 42.``
- `document.body.innerText` probes confirmed:
  - `hasEvaluateSquareRoot: true`
  - `has42: true`
  - `hasNodeRepl: true`
- `obsidian dev:errors` remained empty

Captured runtime artifact:
- `.obsidian-debug/checkpoint-6a-mcp-tool-call-runtime.png`

### Honest Boundary

1. This checkpoint proves the **ordinary transcript-visible `mcp_tool_call` render path** for Codex.
2. It does **not** prove that full Codex MCP capability is productized.
3. It does **not** prove Codex-as-MCP-server integration (`codex` / `codex-reply`) inside OpenCodian.
4. It does **not** prove a stable Codex MCP settings surface or capability chrome.

### Truth Update

- `mcp_tool_call` transcript seam: **已 pass**
- full MCP capability / MCP server mode / MCP settings surface: remains **未接入** or otherwise unproven

### Remaining Blockers

- `CodexAdapter` still does not declare `AgentCapability.Mcp`
- no stable reviewed user-facing MCP settings/config surface exists for Codex inside OpenCodian
- current OpenCode MCP workflow tools remain unreliable; this checkpoint used OpenCode CLI fallback for the audit guidance while the live proof itself came from Codex runtime in Test Vault

### Recommended Next Smallest Checkpoint

- Stop for review.
- If approved, decide whether to:
  - keep MCP at "transcript-only proven" and move to a different seam
  - or do a narrow follow-up that decides whether Codex should expose an MCP capability/product surface beyond the transcript blocks

## 23. Checkpoint 8C: Codex MCP Transcript Seam Truth Productization (2026-06-09)

Narrow docs/comment-only truth-sync follow-up to Checkpoint 6A. No adapter behavior changed.

### Verdict

- **Transcript seam remains 已 pass** — no regression
- **Broader MCP capability remains 未接入** — explicitly documented boundary
- **No `AgentCapability.Mcp` declared** — honest gap preserved

### Files Changed

| File | Action |
|------|--------|
| `src/core/agents/backend/CodexAdapter.ts` | Added MCP transcript seam boundary note in `CODEX_CAPABILITIES` JSDoc |
| `docs/status/checkpoint-8c-mcp-transcript-seam-truth-productization.md` | Created (this checkpoint artifact) |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Added this §23 |

### What Was Productized

1. **Explicit boundary documentation**: The `CODEX_CAPABILITIES` comment now clearly states why `AgentCapability.Mcp` is absent despite the runtime-proven `mcp_tool_call` translation path.
2. **Truth-sync in docs/status**: Created dedicated checkpoint artifact separating "transcript-visible mcp_tool_call" from "full MCP capability".

### What Remains Unchanged

- `CodexStreamNormalizer.ts`: `mcp_tool_call` → `tool_use` (kind='mcp') mapping unchanged
- `CodexAdapter.ts`: capability set unchanged — still no `AgentCapability.Mcp`
- No new MCP settings UI, no MCP server management, no `codex mcp-server` integration

### Honest Status Buckets (Post-8C)

- **已 pass**
  - ordinary Codex chat path
  - toolbar `sandbox`
  - toolbar `effort`
  - session modal overrides: sandbox / reasoning / model
  - contracted ordinary settings surface: `apiKey + model + additionalDirectories + networkAccessEnabled`
  - visible `web_search` transcript path
  - visible `mcp_tool_call` transcript path (transcript seam only)
  - visible `todo_list` ordinary transcript/product path
- **readback**
  - `webSearchMode`
  - broader ThreadOptions wiring beyond the contracted stable surface
- **blocked**
  - `approvalPolicy`
- **未接入**
  - full MCP capability (`AgentCapability.Mcp` management contract)
  - Codex MCP settings surface / MCP server management UI
  - Codex-as-MCP-server integration (`codex mcp-server`, `codex-reply`)
  - model catalog integration
  - structured output authoring/UI
  - image input UI

### Runtime Proof

- Active backend: `codex`
- Prompt: `Use the node_repl MCP tool to evaluate: Math.sqrt(1764)`
- Evidence: `.obsidian-debug/checkpoint-8c-mcp-transcript-seam-runtime.png`
- Latest `BUILD_ID` matches loaded runtime: verified
- `dev:errors`: clean

### Recommended Next Smallest Checkpoint

- Stop for review.
- Options:
  1. Move to a different seam (model surface, settings convergence, structured output)
  2. Keep MCP at "transcript-only proven" — no further MCP work needed until broader contract is implementable

## 24. Checkpoint 10A: Codex Runtime Settings Truth Split (2026-06-10)

Narrow settings-surface productization. Promoted the two strongest already-wired Codex runtime settings into the ordinary active-backend settings UI while keeping `webSearchMode` honestly at `readback`.

### Verdict

- `additionalDirectories` → **已 pass** (ordinary settings surface + adapter writeback; next-thread boundary)
- `networkAccessEnabled` → **已 pass** (ordinary settings surface + adapter writeback; next-thread boundary)
- `webSearchMode` → remains **`readback`**; no stable user-facing control added

### Evidence

- `SettingsCodexSection` DOM shows exactly 5 items: API Key, Model, Additional Directories, Network Access, Authentication notice
- Both new controls include explicit lifecycle copy: "Applies on the next thread or after adapter restart."
- `CodexAdapter` exposes `updateAdditionalDirectories()` and `updateNetworkAccessEnabled()`; settings onChange pushes values to the live adapter
- Focused TDD tests: +5 adapter tests, +4 adjusted/added settings section tests

### Full artifact

See `docs/status/checkpoint-10a-codex-runtime-settings-truth-split.md`.

## 25. Checkpoint 10B: `webSearchMode=cached` vs `live` Runtime Audit (2026-06-10)

Runtime-only truth audit. No repo product code changed.

### Verdict

- `webSearchMode` remains **`readback`**
- `cached` vs `live` produced **no stable ordinary-chat-visible difference**
- No user-facing three-mode settings surface is justified by current evidence

### Evidence

- Same BUILD and same active backend (`codex`) used for both runs
- Same prompt used for both runs: `What are the latest headlines in tech news today? Please search the web.`
- Both modes produced visible `WebSearch` transcript blocks
- Both modes used the same ordinary transcript surface shape (same visible tool-call structure)
- Differences in search count and completion quality were not strong enough to attribute to the mode itself:
  - cached run: more searches plus 502 noise
  - live run: fewer searches and full completion
- Post-audit reviewer check confirmed Test Vault was restored to `webSearchMode = "cached"`

### Honest Boundary

- This audit does **not** prove the SDK ignores `webSearchMode`
- It only proves that the current ordinary chat surface does not expose a stable, user-meaningful `cached` vs `live` distinction
- Checkpoint 5E's `disabled` suppression evidence still stands and is not contradicted

### Recommended Next Smallest Checkpoint

- Stop for review
- If continuing, prefer a deeper SDK/CLI argument-semantics audit over more ordinary-chat A/B runs

### Full artifact

See `docs/status/checkpoint-10b-websearchmode-cached-vs-live-audit.md`.

---

## 26. Checkpoint 10C: `webSearchMode` SDK / CLI Semantics Audit (2026-06-10)

Read-only audit of official documentation, installed SDK, and adapter wiring. No repo product code changed.

### Verdict

- **`cached` vs `live` semantic distinction is REAL and CONFIRMED** by official docs + SDK types + CLI config path
- **Plugin adapter wiring is CORRECT** — values pass through cleanly from settings → SDK → CLI
- **The lack of visible difference in 10B was EXPECTED**, not a wiring failure
- `webSearchMode` remains **`readback`** because the distinction is below current ordinary-chat visibility

### Strongest Evidence

1. **Official OpenAI docs** (Config Reference): `cached` = "uses an OpenAI-maintained index and does not fetch live pages"; `live` = "fetch the most recent data from the web"
2. **SDK type definition**: `type WebSearchMode = "disabled" | "cached" | "live"`
3. **SDK implementation**: forwards value verbatim as `--config web_search="<value>"`
4. **Plugin wiring**: `settings.ts` → `AgentAdapterWiring.ts` → `CodexAdapterOptions` → `buildThreadOptions()` → `ThreadOptions.webSearchMode` — no leaks or overrides

### Why 10B Found No Visible Difference

The official docs explain this perfectly: both modes **enable the `web_search` tool**. The semantic difference is in **data freshness/source** (cached index vs live fetch), not in **tool invocation pattern**. Both modes produce identical visible `WebSearch` transcript blocks. The distinction is genuinely below the ordinary chat surface.

### Honest Boundary

- The distinction is real but not user-visibly exposeable in current ordinary chat
- Do NOT add a three-mode settings selector without a way to honestly surface the distinction
- If future Codex CLI adds transcript-level indicators (e.g., "fetched live" badges), revisit

### Full artifact

See `docs/status/checkpoint-10c-websearchmode-sdk-cli-semantics-audit.md`.

---

## 27. Checkpoint 11A: Codex Image Input Seam Audit (2026-06-10)

Audit-only checkpoint. No repo product code changed.

### Verdict

- Codex image input remains **`未接入`**
- Official / installed SDK support for `local_image` is real
- The current OpenCodian gap is a multi-owner seam break, not a one-file omission

### Strongest Evidence

1. **Installed SDK support exists**: `thread.run([... { type: "local_image", path } ...])` is documented and typed
2. **Current repo model support exists**: `ImageAttachment` and `ChatMessage.images` are already defined
3. **Current backend-neutral send contract drops images**: `AgentChatSendRequest` only carries `sessionId`, `content`, and `options`
4. **Current Codex adapter drops images**: `thread.runStreamed(request.content, ...)` still passes only string input
5. **Current ordinary user-message rendering drops images**: `UserMessageContentRenderer` never reads `message.images`

### Why This Is Still `未接入`

The problem spans at least 6 breakpoints across 4 runtime owners:

- composer image attachment entry
- message send preparation
- send pipeline execution
- backend-neutral adapter contract
- Codex adapter translation to `local_image`
- optimistic / ordinary user-message image rendering

So the seam is not blocked by official Codex surface limits; it is simply not yet integrated into the product path.

### Honest Boundary

- Supporting facts like SDK `local_image` support and existing repo image types are **not** product `已 pass`
- They are only enabling evidence for a future implementation batch
- End-to-end Codex image input remains `未接入` until a real ordinary-chat path exists

### Recommended Next Smallest Checkpoint

- `11B`: Codex image input composer + adapter slice
- Keep it focused: composer picker, `AgentChatSendRequest.images`, send-pipeline passthrough, Codex temp-file translation, optimistic user-message image rendering

### Full artifact

See `docs/status/checkpoint-11a-codex-image-input-seam-audit.md`.

---

## 28. Checkpoint 11B: Codex Image Input Composer + Adapter Slice (2026-06-10)

Smallest honest end-to-end productization of Codex image input in the ordinary chat surface.

### Verdict

- Codex ordinary-chat image input is now **`已 pass`**
- This acceptance covers the narrow core seam only:
  - composer attach button and image chip
  - backend-neutral `AgentChatSendRequest.images`
  - send-pipeline passthrough
  - Codex `local_image` translation
  - optimistic / persisted user-message image rendering
- This does **not** promote adjacent polish seams such as paste, drag-and-drop, or multi-image reordering

### Strongest Evidence

1. **Real runtime send in Test Vault**: active backend `codex`; last user message contains `images[0]` with `filename="test-red-square.png"` and `mediaType="image/png"`
2. **Visible ordinary-chat composer surface**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11b-03-image-chip-visible.png` shows the attach button path ending in a real composer chip before send
3. **Visible ordinary user-message surface**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11b-04-optimistic-message.png` shows the sent user message with image thumbnail plus a correct assistant description
4. **Runtime cleanliness**: deployed and loaded `BUILD_ID` matches `feature-codex-sdk-capability.202606100247`; `obsidian dev:errors` remained clean
5. **Focused code seam evidence**: `AgentService.ts`, `SendPipelineTypes.ts`, `SendPipelineRuntime.ts`, `MessageSendPreparationService.ts`, `ComposerInputShellCoordinator.ts`, `UserMessageContentRenderer.ts`, and `CodexAdapter.ts` now all carry the image path instead of dropping it at intermediate seams

### Honest Boundary

- `已 pass` here means the ordinary chat path is productized and runtime-proven for a real attached image
- It does **not** mean every image-adjacent affordance is productized
- Keep these outside `已 pass` until separately implemented and re-proven:
  - clipboard paste
  - drag-and-drop
  - multi-image ordering/editing

### Full artifact

See `docs/status/checkpoint-11b-codex-image-input-composer-adapter-slice.md`.

---

## 29. Checkpoint 12A: Codex Backend Session Browser Truth Audit (2026-06-10)

Audit-only checkpoint. No product code changed.

### Verdict

- The Codex backend session browser seam is **partial**, not a full stable backend-session product surface
- Stable sub-seams:
  - history dropdown `Browse backend sessions` entry
  - resume into chat for sessions still held in the live adapter
- Non-stable / limited sub-seams:
  - list loading is limited to the adapter's in-memory session map
  - preview transcript is unimplemented
  - detail metadata is minimal readback only
- Current TypeScript SDK route boundary:
  - full persisted thread discovery/history is not available on the currently integrated TypeScript SDK route
- Broader official surface:
  - official Codex app-server exposes richer history/thread surfaces, but this plugin does not integrate that route

### Strongest Evidence

1. **Visible ordinary chat entry**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12a-history-entry.png` shows `浏览后端会话` under active backend = codex
2. **Empty after plugin reload**: after `obsidian plugin:reload`, `codex.listSessions()` returned `[]` and `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12a-browser-empty-after-reload.png` showed no backend sessions
3. **Adapter-memory-only row**: after creating a new Codex conversation in the same adapter lifetime, `codex.listSessions()` returned one row and `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12a-browser-in-memory-row.png` showed a single `未命名会话`
4. **Current-route blocker**: installed `@openai/codex-sdk@0.137.0` exposes no `listThreads()` / `listSessions()` discovery API and no `getThreadMessages()` / history API on the current TypeScript SDK path. This does not rule out richer official history surfaces on Codex app-server.

### Honest Boundary

- Do **not** promote this seam as a full `Backend Session Browser` equivalent to OpenCode / Claude Code
- The current browser can resume only sessions already known to the live Codex adapter
- It cannot honestly claim persisted backend-thread discovery, transcript preview, or rich backend metadata

### Full artifact

See `docs/status/checkpoint-12a-codex-backend-session-browser-audit.md`.

---

## 30. Checkpoint 12B: Codex Persisted Conversation Resume Audit (2026-06-10)

Audit-first checkpoint, later upgraded with live runtime proof. No product code changed.

### Verdict

- Persisted Codex conversation resume across plugin reload is **`已 pass`**
- Proven seams:
  - `backendSessionId` survives storage + hydration
  - loading the persisted conversation rebinds the correct backend identity
  - first post-reload follow-up routes through `resumeThread(real_thread_id)`
  - live backend continuity is user-visibly preserved
- Important boundary:
  - if the conversation never progressed beyond a provisional `codex-local-*` id, the next send after reload correctly starts a fresh thread because there is no real backend thread to resume

### Strongest Evidence

1. **Real persisted thread id**: first live turn promoted `backendSessionId` from `codex-local-a4c6e6bd-38c0-46b3-994c-67c2ac0cd626` to real thread id `019eae06-1bbc-7a71-856d-f48c4ee8a9b5`
2. **Reload hydration proof**: after `obsidian plugin:reload`, loading conversation `conv-1781036073692-dvsfbk0gq` restored `backend="codex"` and the same real `backendSessionId`
3. **Runtime route proof**: a live probe wrapped the SDK instance and captured `resumeThread("019eae06-1bbc-7a71-856d-f48c4ee8a9b5", ...)` on the post-reload follow-up send
4. **Context continuity proof**: after reload, the assistant correctly answered `RESUME-PROOF-1781036095394` when asked for the exact token from the earlier turn
5. **UI/runtime cleanliness**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12b-live-resume-success.png` shows the resumed conversation; `obsidian dev:errors` stayed clean

### Honest Boundary

- This checkpoint proves the stable ordinary-chat resume seam for conversations that have already persisted a real Codex thread id
- It does **not** upgrade provisional-only conversations to the same guarantee
- It also does **not** remove the 12A blocker on full backend session-browser discovery/history

### Full artifact

See `docs/status/checkpoint-12b-codex-persisted-conversation-resume-audit.md`.

---

## 31. Checkpoint 11C: Codex Image Input Paste + Drag-and-Drop (2026-06-10)

Focused productization batch extending the accepted 11B image seam. No new backend contract beyond the existing `ImageAttachment[]` path.

### Verdict

- Codex ordinary-chat image input remains **`已 pass`**, now with three stable composer entry paths:
  - file picker button (`11B`)
  - clipboard paste (`11C`)
  - drag-and-drop (`11C`)
- All three entry paths reuse the same capability gate, chip model, send pipeline, adapter translation, and user-message rendering path

### Strongest Evidence

1. **Paste path runtime proof**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-03-paste-chip-visible.png` shows a pasted image chip in the composer
2. **Drop path runtime proof**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-04-drop-chip-visible.png` shows a dropped image chip in the composer
3. **Shared send path proof**: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-05-optimistic-message.png` and `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/11c-06-final-state.png` show the image-bearing user turn reaching the ordinary message surface
4. **Reviewer-independent real-image proof**: real `image/png` bytes were injected through both paste and drop; composer chip thumbs rendered with `naturalWidth=1`, and a real dropped PNG sent through the live Codex runtime returned a color answer
5. **Runtime cleanliness**: build `feature-codex-sdk-capability.202606100435` deployed and loaded; `obsidian dev:errors` stayed clean during OpenCode's 11C runtime loop

### Honest Boundary

- `11C` productizes two more ordinary composer entry paths; it does **not** add reordering, editing, file-size validation, or settings surfaces
- No dedicated stable visual styling for drag-over was claimed in acceptance; the accepted surface is the successful attach path itself

### Full artifact

See `docs/status/checkpoint-11c-codex-image-input-paste-dragdrop.md`.

---

## 32. Checkpoint 12C: Codex Provisional Backend Session Warning (2026-06-10)

Productized a truthful persistent notice warning for Codex conversations that still have only a provisional `codex-local-*` backend session id.

### Verdict

- Provisional-only warning is **`productized`**
- Warning appears only for Codex backend + provisional-only session IDs
- Warning does not appear for real Codex thread IDs or non-Codex backends
- Duplicate warnings are prevented via `hasMatchingPersistentNotice`
- Warning persists across plugin reload as a saved conversation message

### Strongest Evidence

1. **Unit test coverage**: 6 new tests in `ConversationLoadRecoveryCoordinator.test.ts` cover provisional detection, real-thread exclusion, non-Codex exclusion, duplicate prevention, and both `loadConversation` + `activateTab` trigger paths
2. **Runtime positive proof**: `/tmp/opencodian-warning-shown.png` shows the persistent notice card with title "后端连续性尚未建立" in a Codex conversation with `codex-local-*` session ID
3. **Runtime negative proof**: Reviewer-captured screenshot `/tmp/opencodian-warning-absent-obsidian.png` shows a real resumed Codex conversation in Test Vault without the provisional warning notice
4. **Console cleanliness**: `obsidian dev:errors` clean after reload; no new runtime errors

### Honest Boundary

- This checkpoint only adds the warning notice; it does not add session browser launcher, app-server migration, approvalPolicy UI, or image validation
- The warning is a normal chat surface notice, not diagnostic-only

### Full artifact

See `docs/status/checkpoint-12c-codex-provisional-warning.md`.

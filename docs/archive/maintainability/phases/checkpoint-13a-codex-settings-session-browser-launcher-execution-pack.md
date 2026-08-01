# Checkpoint 13A: Codex Settings Session Browser Launcher — Execution Pack

## 1. Intent

This file is the repo-local execution pack for the next *possible* checkpoint after 12C.

It is intentionally **not executed yet**. It exists so the next approved round can resume from the worktree itself instead of depending on prior chat context.

Target checkpoint:

- `13A`: Codex settings-side backend session browser launcher

## 2. Non-Negotiable Constraints

- Work only in:
  - `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability`
- Do not touch the main workspace
- Use OpenCode with:
  - `providerID="kimi-for-coding"`
  - `modelID="k2p6"`
- Run `opencode_setup` first
- Keep scope narrow
- Stop after this checkpoint
- Respect the multi-backend product rule:
  - multiple backends may be enabled
  - only the active backend starts/connects by default
  - settings shows backend-specific settings only for the active backend
  - users switch backend before configuring another backend

## 3. Why 13A Exists

Checkpoint 12A established an honest Codex session-browser truth:

- chat history dropdown entry `Browse backend sessions` is `已 pass`
- in-memory-only browser resume is `已 pass`
- browser list/detail richness remains shallow and limited to live adapter memory
- settings-side launcher for Codex is still missing

The best next small seam is **not** deeper backend discovery or app-server migration. It is simply giving Codex the same *settings-side browse-only launcher pattern* that Claude Code already has.

This is attractive because:

1. it matches an already-stable product surface
2. it does not invent a new capability
3. it keeps the truth boundary honest by exposing only browse/inspect, not resume-any-session or persisted history discovery

## 4. Truth Sources To Read First

- `/Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `docs/status/checkpoint-12a-codex-backend-session-browser-audit.md`
- `docs/status/checkpoint-12c-codex-provisional-warning.md`
- `src/features/settings/SettingsClaudeCodeSection.ts`
- `src/features/settings/SettingsCodexSection.ts`
- `src/features/chat/ui/BackendSessionBrowserModal.ts`
- `tests/unit/features/settings/SettingsClaudeCodeSection.test.ts`
- `tests/unit/features/settings/SettingsCodexSection.test.ts`

## 5. Current Accepted Truth

### Already proven

- Codex chat-side history dropdown can open `BackendSessionBrowserModal`
- active-backend scoping is correct
- `BackendSessionBrowserModal` supports `forcedBackendKind`
- Claude Code already has a settings-side launcher that opens the browser in `browse-only` mode
- Codex browser currently only reflects live adapter memory; it does **not** discover persisted or external threads

### Not proven

- settings-side Codex launcher
- any persisted session discovery for Codex
- full transcript preview for Codex browser
- browse-side resume from settings for Codex

## 6. Checkpoint Goal

Add a **browse-only settings-side launcher** for Codex that mirrors the Claude Code pattern without overstating Codex capabilities.

Success means:

1. active backend = codex settings surface shows a session-browser launcher
2. clicking it opens `BackendSessionBrowserModal` scoped to `forcedBackendKind: 'codex'`
3. the modal is browse-only from settings:
   - `supportsResume: false`
   - no resume button
4. copy clearly indicates browse/inspect only
5. no new claims are made about persisted discovery, transcript preview, or official rich history support

## 7. In Scope

- `SettingsCodexSection.ts` UI addition only
- codex-specific locale strings for launcher label/description/browse-only notice
- unit tests for `SettingsCodexSection`
- narrow truth-doc updates for this checkpoint
- build/deploy/runtime proof because this is user-visible

## 8. Explicitly Out Of Scope

- no app-server migration
- no approval-policy UI
- no resume button from settings
- no upgrade of Codex browser list/detail truth bucket
- no persisted discovery / transcript preview work
- no changes to chat-side browser entry
- no image-input or warning-dismiss side quests
- no broad session-browser refactor

## 9. Preferred Implementation Shape

Mirror the existing Claude Code launcher pattern as closely as possible:

1. inline info notice
2. button row launching `BackendSessionBrowserModal`
3. `supportsResume: false`
4. `forcedBackendKind: 'codex'`
5. browse-only explanatory notice under the button

This checkpoint should avoid new abstractions unless a tiny shared helper is clearly unavoidable.

## 10. Files Likely To Change

### Product code

- `src/features/settings/SettingsCodexSection.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`

### Tests

- `tests/unit/features/settings/SettingsCodexSection.test.ts`

### Status docs

- `docs/status/checkpoint-13a-codex-settings-session-browser-launcher.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`

## 11. Test-First Requirements

Before implementation, add focused failing tests covering:

1. launcher setting row appears in Codex settings surface
2. clicking launcher opens the modal with `forcedBackendKind: 'codex'`
3. settings-side modal host is browse-only (`supportsResume: false`)
4. browse-only explanatory notice is rendered

Do not broaden tests into browser-detail/resume semantics beyond this checkpoint.

## 12. Verification Requirements

### Automated

1. targeted tests during development
2. `npm run verify`
   - if `check:owner-guard` still fails because of pre-existing dirty guarded files elsewhere in the worktree, report that exact blocker honestly and do not fake a pass
3. `npm run build`

### Deployment

After build, deploy to:

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`

Then confirm the new `BUILD_ID` in deployed `main.js`.

### Runtime proof

Use fresh Obsidian validation and collect evidence for:

1. active backend switched to `codex`
2. settings shows the new launcher row
3. clicking the launcher opens the browser modal
4. modal is Codex-scoped
5. modal is browse-only from settings
   - no visible resume button
6. no new console/errors/hydration regressions after reload

Good screenshot set:

- settings row visible
- browser modal opened from settings
- footer or modal state proving browse-only

## 13. Honest Output Requirements

Final report must explicitly separate:

- what was newly productized by 13A
- what remains readback
- what remains unintegrated
- what is still blocked or out of scope

Specifically, do **not** promote any of the following because of this launcher:

- persisted Codex session discovery
- transcript preview
- settings-side resume
- official app-server history integration

## 14. Desired Final Artifact

- `docs/status/checkpoint-13a-codex-settings-session-browser-launcher.md`

Update `docs/status/codex-sdk-current-state-2026-06-09.md` only to the minimum extent needed for the accepted 13A truth.

## 15. Required Final Report Shape

- files changed
- what was productized/diagnosed
- strongest evidence
- remaining gaps
- blockers
- next smallest suggestion
- verify/build/deploy results
- `BUILD_ID`
- Obsidian runtime evidence paths
- explicit truth-bucket conclusion for the launcher seam

## 16. Stop Rule

After the settings-side launcher truth is recorded, stop.

Do not automatically open the next checkpoint.

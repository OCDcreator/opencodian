# Checkpoint 13E: Codex Settings-Side Session Browser Resume — Execution Pack

## 1. Intent

This file is the repo-local execution pack for the next *possible* checkpoint after 13D.

It is intentionally **not executed yet**. It exists so the next approved round can resume from the worktree itself instead of depending on prior chat context.

Target checkpoint:

- `13E`: Codex settings-side backend session browser resume for **in-memory sessions only**

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

## 3. Why 13E Exists

Current accepted truth is:

- chat-side backend session browser resume works for Codex **in-memory sessions**
- settings-side Codex launcher exists, but is browse-only (`supportsResume: false`)

So the next product question is:

> Can the settings-side Codex session browser honestly expose the **same limited in-memory resume seam** that chat-side already proves?

This is larger than 13A/13B/13C because it crosses from settings UI into chat-view loading/runtime ownership. But it is still potentially bounded if kept to **in-memory sessions only**.

## 4. Truth Sources To Read First

- `/Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `docs/status/checkpoint-12a-codex-backend-session-browser-audit.md`
- `docs/status/checkpoint-12b-codex-persisted-conversation-resume-audit.md`
- `docs/status/checkpoint-13a-codex-settings-session-browser-launcher.md`
- `src/features/chat/ui/BackendSessionBrowserModal.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/settings/SettingsCodexSection.ts`
- `src/main.ts`
- `tests/unit/features/settings/SettingsCodexSection.test.ts`

## 5. Current Accepted Truth

### Already proven

- settings-side Codex launcher opens `BackendSessionBrowserModal`
- chat-side resume flow works for in-memory Codex sessions
- `createConversationFromSession()` persists the resumed `backendSessionId`
- `loadConversation()` can continue the resumed conversation when called from chat runtime

### Not proven

- settings-side resume host wiring
- settings-side ability to activate/reveal the chat view and load the resumed conversation
- settings-side end-to-end resume of an in-memory Codex session

## 6. Checkpoint Goal

Add **settings-side resume** for Codex backend sessions, but only within the already-proven honest boundary:

1. only for sessions still visible in the live adapter memory
2. no new claim about persisted discovery
3. no new claim about transcript preview
4. no new claim about external / CLI-created thread enumeration

Success means:

1. settings-side Codex launcher opens the same browser modal
2. the modal now shows Resume when the selected session is actually resumable in the current live adapter
3. clicking Resume creates or opens a Codex conversation and loads it into the chat view
4. a follow-up message in that resumed conversation continues successfully
5. the UI copy remains explicit about the in-memory-only boundary

## 7. In Scope

- `SettingsCodexSection.ts` host upgrade from browse-only to resume-capable
- the minimum plugin/view bridge needed to create a resumed conversation and load it into chat
- targeted tests
- narrow truth-doc updates
- build/deploy/runtime proof because this is user-visible

## 8. Explicitly Out Of Scope

- no persisted session discovery
- no app-server migration
- no transcript preview implementation
- no richer backend metadata
- no approval-policy UI
- no generic settings-side resume framework for every backend
- no broad refactor of `OpenCodianView` / `main.ts` unless a tiny public bridge is truly unavoidable

## 9. Design Risk

This checkpoint likely requires crossing a boundary that previous smaller checkpoints avoided:

- settings surface currently does **not** own `loadConversation()`
- chat-side modal host does

So if implementation proceeds, prefer the smallest possible bridge such as:

- a narrow public plugin method that:
  1. ensures a chat view exists (`activateView()`)
  2. creates the conversation from session
  3. asks the active chat view to load it

Avoid directly copying large chunks of `OpenCodianView` host logic into settings.

## 10. Files Likely To Change

### Product code

- `src/features/settings/SettingsCodexSection.ts`
- likely one of:
  - `src/main.ts`
  - or another tiny adjacent owner if one already exists

### Tests

- `tests/unit/features/settings/SettingsCodexSection.test.ts`
- maybe one narrow test around the new plugin bridge if added

### Status docs

- `docs/status/checkpoint-13e-codex-settings-resume.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`

## 11. Test-First Requirements

Before implementation, add focused failing tests covering:

1. settings-side Codex browser host exposes `supportsResume: true` only when the chosen design intends resume
2. resume host can create a conversation from backend session
3. resume host can request loading that conversation into the chat view
4. UI copy no longer says browse-only if resume is enabled

Do not broaden tests into persisted discovery or preview transcript semantics.

## 12. Verification Requirements

### Automated

- targeted tests
- bare `npm run verify`
- `npm run check:module-docs`
- if needed, `OWNER_GUARD_APPROVED='...' npm run verify`
- `npm run build`

### Deployment

- deploy to Test Vault
- verify BUILD_ID

## 13. Runtime Proof Bar

Minimum runtime proof:

1. active backend = codex
2. settings-side launcher opens modal
3. modal shows Resume for an in-memory Codex session
4. clicking Resume opens/loads a Codex conversation in the chat view
5. sending a follow-up in that conversation succeeds

If you cannot prove the full settings-side resume path end to end, do **not** promote this seam to `已 pass`.

## 14. Honest Output Requirements

Final report must explicitly separate:

- what was newly productized by 13E
- what remains readback
- what remains unintegrated
- whether the resume seam is still **in-memory only**

Specifically, do **not** promote any of the following because of this checkpoint:

- persisted backend session discovery
- transcript preview
- external CLI thread enumeration
- full backend session browser parity with OpenCode

## 15. Desired Final Artifact

- `docs/status/checkpoint-13e-codex-settings-resume.md`

Update `docs/status/codex-sdk-current-state-2026-06-09.md` only to the minimum extent needed for the accepted 13E truth.

## 16. Required Final Report Shape

- files changed
- what was productized / diagnosed
- strongest evidence
- remaining gaps
- blockers
- next smallest suggestion
- verify/build/deploy results
- `BUILD_ID`
- Obsidian runtime evidence paths
- explicit truth-bucket conclusion for settings-side resume

## 17. Stop Rule

After the settings-side resume truth is recorded, stop.

Do not automatically open the next checkpoint.

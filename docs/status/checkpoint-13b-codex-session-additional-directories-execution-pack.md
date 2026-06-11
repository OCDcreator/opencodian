# Checkpoint 13B: Codex Session Additional Directories — Execution Pack

## 1. Intent

This file is the repo-local execution pack for the next *possible* checkpoint after 13A.

It is intentionally **not executed yet**. It exists so the next approved round can resume from the worktree itself instead of depending on prior chat context.

Target checkpoint:

- `13B`: Codex per-conversation `additionalDirectories` override in the ordinary conversation session settings modal

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

## 3. Why 13B Exists

Checkpoint 10A already promoted **global** Codex `additionalDirectories` into the ordinary active-backend settings surface, but only at the global settings layer.

Checkpoint 4B / current session-modal truth already established that Codex has an ordinary per-conversation settings seam for:

- sandbox mode
- reasoning effort
- model override

The next smallest, most product-aligned Codex seam is therefore **not** session-browser resume, approvals, or app-server migration. It is extending the existing Codex session settings modal with a per-conversation `additionalDirectories` override that maps to the already-supported SDK `ThreadOptions.additionalDirectories`.

This seam is attractive because:

1. it matches an already-stable ordinary chat surface
2. it uses a real official Codex SDK field, not a plugin invention
3. it is more honest and lower-risk than `networkAccessEnabled`, whose runtime proof still requires heavier sandbox/network validation
4. it gives Codex a useful per-thread scope control that mirrors how OpenCode / Claude Code expose conversation-scoped runtime knobs

## 4. Truth Sources To Read First

- `/Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `docs/status/checkpoint-10a-codex-runtime-settings-truth-split.md`
- `docs/status/checkpoint-12b-codex-persisted-conversation-resume-audit.md`
- `src/core/types/chat.ts`
- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `src/features/settings/SettingsCodexSection.ts`
- `src/core/agents/backend/CodexAdapter.ts`
- `tests/unit/core/types/chat.test.ts`
- `tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts`
- `tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts`

## 5. Current Accepted Truth

### Already proven

- Codex ordinary chat path is `已 pass`
- Codex ordinary session settings modal already exposes:
  - sandbox mode
  - reasoning effort
  - model override
- Global Codex settings already expose `additionalDirectories`
- The Codex adapter already supports `updateAdditionalDirectories()` and forwards `additionalDirectories` into `ThreadOptions.additionalDirectories`
- Official SDK surface supports `ThreadOptions.additionalDirectories`

### Not proven

- session-modal per-conversation `additionalDirectories` control
- per-conversation persistence for that control
- conversation-specific runtime application path for that control
- real user-visible runtime evidence that a session-scoped extra directory affects Codex file access

## 6. Checkpoint Goal

Add a **Codex-only per-conversation `additionalDirectories` override** to the existing conversation session settings modal, with honest next-thread lifecycle copy and real runtime proof.

Success means:

1. a Codex conversation session settings modal shows an `additionalDirectories` control
2. the control is clearly marked as a next-thread boundary, not a current-turn mutation
3. saved overrides persist on the conversation, not in global settings
4. the active Codex runtime host pushes the conversation-scoped override into the adapter via the existing `updateAdditionalDirectories()` seam
5. runtime proof shows a Codex conversation can access a file in an extra directory outside the vault **when the session override is set before the first send**
6. no claim is made that this mutates an already-running live thread object

## 7. In Scope

- `ConversationSessionSettings` type extension for Codex session-scoped `additionalDirectories`
- Codex session settings modal UI for that field
- coordinator resolve / save / apply logic
- `OpenCodianView` host plumbing into the live Codex adapter
- locale strings
- targeted tests
- narrow truth-doc updates for this checkpoint
- build/deploy/runtime proof because this is user-visible

## 8. Explicitly Out Of Scope

- no `networkAccessEnabled` in this batch
- no app-server migration
- no approval-policy UI
- no session-browser changes
- no chat toolbar changes
- no model catalog work
- no `webSearchMode` changes
- no Codex MCP management UI
- no claim that already-running live thread objects are reconfigured in place
- no broad session-settings refactor unless a tiny helper is clearly unavoidable

## 9. Why `networkAccessEnabled` Is Deferred

Do **not** combine `networkAccessEnabled` into this checkpoint.

Reasons:

1. it has a heavier proof burden than `additionalDirectories`
2. it depends on sandbox semantics, real outbound access, and safe negative/positive probes
3. mixing both seams makes the checkpoint harder to audit honestly
4. `additionalDirectories` can be proven with a tight local file-access scenario, which is much more deterministic

Treat `networkAccessEnabled` as the candidate follow-up `13C`, not part of `13B`.

## 10. Preferred Implementation Shape

Mirror the current Codex session-settings shape as closely as possible:

1. keep the override inside the existing Codex section in `ConversationSessionSettingsModal`
2. use explicit lifecycle copy matching the next-thread boundary
3. prefer a multiline textarea-style control because the setting is newline-separated absolute paths
4. keep the conversation-stored shape simple and explicit
5. reuse the existing adapter setter rather than introducing a new adapter abstraction

If a control-style choice is needed:

- prefer **newline-separated absolute paths**
- avoid a heavy file picker or path-management subflow in this checkpoint

## 11. Files Likely To Change

### Product code

- `src/core/types/chat.ts`
- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `src/style/modals/config-editor-modal.css` only if the modal needs a dedicated textarea class

### Tests

- `tests/unit/core/types/chat.test.ts`
- `tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts`
- `tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts`

### Status docs

- `docs/status/checkpoint-13b-codex-session-additional-directories.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`

## 12. Test-First Requirements

Before implementation, add focused failing tests covering:

1. modal renders the Codex `additionalDirectories` control only when `showCodexControls` is true
2. modal initializes from conversation overrides
3. modal save output includes the session-scoped `additionalDirectories` override
4. inherit / clear path behaves honestly
5. coordinator resolves inherited defaults vs conversation overrides correctly
6. coordinator persists the override on the conversation
7. coordinator pushes the effective directories into the adapter host apply seam

Do not broaden tests into `networkAccessEnabled`, app-server, or browser/session work.

## 13. Verification Requirements

### Automated

1. targeted tests during development
2. `npm run verify`
   - if `check:owner-guard` or `check:module-docs` still fails because of pre-existing dirty-file state elsewhere in the worktree, report that exact blocker honestly and do not fake a pass
3. `npm run build`

### Deployment

After build, deploy to:

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`

Then confirm the new `BUILD_ID` in deployed `main.js`.

### Runtime proof

Use fresh Obsidian validation and collect evidence for:

1. active backend switched to `codex`
2. a new/fresh Codex conversation opens session settings before first send
3. the session modal shows the new `additionalDirectories` control
4. the override is saved for that conversation
5. a probe file in a directory **outside the vault** becomes accessible to Codex when that conversation starts its first thread with the override
6. the same scenario without the override is either denied or materially weaker
7. no new console/errors/hydration regressions after reload

## 14. Strongly Preferred Runtime Probe Shape

Use a deterministic local-file probe instead of vague behavioral inference.

Recommended shape:

1. create a temporary directory outside the Test Vault
2. create a small probe file in that directory with a unique token
3. open a fresh Codex conversation
4. before first send, set session-scoped `additionalDirectories` to that temp directory
5. prompt Codex to read the exact file and return only the token
6. confirm the returned token matches exactly

If a negative control is feasible in the same round, run the same prompt in a fresh Codex conversation **without** the session override and compare behavior honestly.

Do not overclaim if the negative control is noisy. The positive proof is the minimum requirement.

## 15. Honest Output Requirements

Final report must explicitly separate:

- what was newly productized by 13B
- what remains readback
- what remains unintegrated
- what remains only global-settings pass, not per-conversation pass
- what is still blocked or out of scope

Specifically, do **not** promote any of the following because of this checkpoint:

- `networkAccessEnabled` per-conversation override
- live-thread in-place mutation of `additionalDirectories`
- approval-policy productization
- app-server history / approvals
- `webSearchMode`
- MCP management UI

## 16. Desired Final Artifact

- `docs/status/checkpoint-13b-codex-session-additional-directories.md`

Update `docs/status/codex-sdk-current-state-2026-06-09.md` only to the minimum extent needed for the accepted 13B truth.

## 17. Required Final Report Shape

- files changed
- what was productized/diagnosed
- strongest evidence
- remaining gaps
- blockers
- next smallest suggestion
- verify/build/deploy results
- `BUILD_ID`
- Obsidian runtime evidence paths
- explicit truth-bucket conclusion for:
  - per-conversation `additionalDirectories`
  - `networkAccessEnabled` (unchanged)

## 18. Stop Rule

After the per-conversation `additionalDirectories` truth is recorded, stop.

Do not automatically open `13C`.

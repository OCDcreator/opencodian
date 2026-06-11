# Checkpoint 13C: Codex Session Network Access — Execution Pack

## 1. Intent

This file is the repo-local execution pack for the next *possible* checkpoint after 13B.

It is intentionally **not executed yet**. It exists so the next approved round can resume from the worktree itself instead of depending on prior chat context.

Target checkpoint:

- `13C`: Codex per-conversation `networkAccessEnabled` override in the ordinary conversation session settings modal

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

## 3. Why 13C Exists

Checkpoint 10A already promoted **global** Codex `networkAccessEnabled` into the ordinary active-backend settings surface, but only at the global settings layer.

Checkpoint 13B established the ordinary session-settings pattern for a Codex thread option that:

- already exists in the official SDK surface
- already exists in global settings
- already has adapter writeback plumbing
- still needs a conversation-scoped stable surface

The next smallest Codex seam is therefore **not** a broader history/app-server jump. It is extending the same session settings modal with a per-conversation `networkAccessEnabled` override that maps to the already-supported SDK `ThreadOptions.networkAccessEnabled`.

This seam is attractive because:

1. it matches the accepted 13B pattern exactly
2. it uses a real official Codex SDK field, not a plugin invention
3. it belongs naturally in the current Codex session settings group
4. it closes the next most obvious conversation-scoped gap after `additionalDirectories`

It is also higher risk than 13B because the proof bar is heavier:

- it only matters under `workspace-write`
- it depends on real outbound network behavior
- a “success-only” proof is too weak to separate enabled from disabled

## 4. Truth Sources To Read First

- `/Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `docs/status/checkpoint-10a-codex-runtime-settings-truth-split.md`
- `docs/status/checkpoint-13b-codex-session-additional-directories.md`
- `src/core/types/chat.ts`
- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/settings/SettingsCodexSection.ts`
- `src/core/agents/backend/CodexAdapter.ts`
- `node_modules/@openai/codex-sdk/dist/index.d.ts`
- `/var/folders/kr/gbgh00qn3m70ff_fjsh7d55h0000gn/T/openai-docs-cache/codex-manual.md`
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
  - `additionalDirectories`
- Global Codex settings already expose `networkAccessEnabled`
- The Codex adapter already supports `updateNetworkAccessEnabled()` and forwards `networkAccessEnabled` into `ThreadOptions.networkAccessEnabled`
- Official SDK surface supports `ThreadOptions.networkAccessEnabled`
- Official manual documents that agent internet access is off by default and can be enabled per environment

### Not proven

- session-modal per-conversation `networkAccessEnabled` control
- per-conversation persistence for that control
- conversation-specific runtime application path for that control
- real user-visible proof that enabled and disabled states diverge in ordinary Codex chat

## 6. Checkpoint Goal

Add a **Codex-only per-conversation `networkAccessEnabled` override** to the existing conversation session settings modal, with honest next-thread lifecycle copy and real runtime proof that separates enabled from disabled behavior.

Success means:

1. a Codex conversation session settings modal shows a `networkAccessEnabled` control
2. the control is clearly marked as a next-thread boundary, not a current-turn mutation
3. saved overrides persist on the conversation, not in global settings
4. empty / inherit semantics fall back to the global Codex network-access default, not to an accidental hardcoded value
5. the active Codex runtime host pushes the conversation-scoped effective value into the adapter via the existing `updateNetworkAccessEnabled()` seam
6. runtime proof shows a visible difference between:
  - a fresh Codex thread with network enabled
  - a comparable fresh Codex thread with network disabled
7. no claim is made that this mutates an already-running live thread object

## 7. In Scope

- `ConversationSessionSettings` type extension for Codex session-scoped `networkAccessEnabled`
- Codex session settings modal UI for that field
- coordinator resolve / save / apply logic
- `OpenCodianView` host plumbing into the live Codex adapter
- locale strings
- targeted tests
- narrow truth-doc updates for this checkpoint
- build/deploy/runtime proof because this is user-visible

## 8. Explicitly Out Of Scope

- no app-server migration
- no approval-policy UI
- no session-browser changes
- no chat toolbar redesign
- no `webSearchMode` changes
- no model catalog work
- no Codex MCP management UI
- no claim that already-running live thread objects are reconfigured in place
- no broader sandbox policy editor
- no domain allowlist authoring UI
- no follow-up batch beyond this single checkpoint

## 9. Preferred Product Shape

Because this control needs **inherit / enabled / disabled** semantics, prefer a **three-state dropdown** inside the existing Codex section:

1. `Inherit`
2. `Enabled`
3. `Disabled`

Why not a plain toggle:

- the current session-settings modal has no inherit-aware toggle helper
- a two-state toggle does not honestly represent “follow global default”
- a dropdown matches the existing per-conversation pattern already used for inherit-aware Codex controls

Also keep the copy explicit:

- only meaningful with effective sandbox = `workspace-write`
- applies on the next thread

## 10. Files Likely To Change

### Product code

- `src/core/types/chat.ts`
- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`

### Tests

- `tests/unit/core/types/chat.test.ts`
- `tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts`
- `tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts`

### Status docs

- `docs/status/checkpoint-13c-codex-session-network-access.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`

## 11. Test-First Requirements

Before implementation, add focused failing tests covering:

1. modal renders the Codex `networkAccessEnabled` control only when `showCodexControls` is true
2. modal initializes from conversation overrides
3. modal save output includes `true`, `false`, and `null` / inherit cases honestly
4. coordinator resolves inherited defaults vs conversation overrides correctly
5. coordinator persists the override on the conversation
6. coordinator pushes the effective network-access value into the adapter host apply seam
7. global default inheritance path is covered, just as 13B now does for `additionalDirectories`

Do not broaden tests into app-server, MCP management, or history/session work.

## 12. Verification Requirements

### Automated

1. targeted tests during development
2. bare `npm run verify`
   - report the real result honestly; today this worktree still fails early at `owner-guard`
3. `npm run check:module-docs`
   - report the real result honestly; today this worktree still has unrelated pre-existing dirty-file failures
4. if needed, `OWNER_GUARD_APPROVED='...' npm run verify`
   - clearly label it as approval-assisted verify, not bare verify
5. `npm run build`

### Deployment

After build, deploy to:

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`

Then confirm the new `BUILD_ID` in deployed `main.js`.

## 13. Runtime Proof Bar

This checkpoint should be promoted to `已 pass` **only if enabled and disabled are meaningfully distinguished in runtime evidence**.

### Minimum acceptable proof

Run two comparable **fresh** Codex conversations:

1. **Enabled case**
   - effective sandbox must be `workspace-write`
   - effective network access must be enabled
   - ask Codex to fetch a simple trusted public resource and return a deterministic fact
2. **Disabled case**
   - effective sandbox must still be `workspace-write`
   - effective network access must be disabled
   - run the same or equivalent fetch task
   - capture the failure / refusal / blocked behavior honestly

### If you cannot obtain that divergence

- do **not** promote this seam to `已 pass`
- downgrade the result to `readback` / `partial` in the checkpoint doc and explain why
- do not fake a “pass” from adapter writeback alone

## 14. Strongly Preferred Runtime Probe Shape

Use a small trusted GET-only target, not a noisy web-search task.

Recommended shape:

1. effective sandbox = `workspace-write`
2. target a stable public page such as `https://example.com`
3. enabled case prompt:
   - ask Codex to fetch the page and return only a deterministic token such as the status line or page title
4. disabled case prompt:
   - same goal, but with network disabled
5. capture both outcomes in screenshots plus any machine artifact needed to prove the session settings values

Avoid targets that introduce avoidable prompt-injection or auth noise.

## 15. Honest Output Requirements

Final report must explicitly separate:

- what was newly productized by 13C
- what remains readback
- what remains unintegrated
- what remains only global-settings pass, not per-conversation pass
- whether runtime evidence truly distinguished enabled from disabled

Specifically, do **not** promote any of the following because of this checkpoint:

- domain allowlist support
- broader sandbox policy editing
- approval-policy productization
- app-server history / approvals
- `webSearchMode`
- MCP management UI

## 16. Desired Final Artifact

- `docs/status/checkpoint-13c-codex-session-network-access.md`

Update `docs/status/codex-sdk-current-state-2026-06-09.md` only to the minimum extent needed for the accepted 13C truth.

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
  - per-conversation `networkAccessEnabled`
  - `webSearchMode` (unchanged)

## 18. Stop Rule

After the per-conversation `networkAccessEnabled` truth is recorded, stop.

Do not automatically open `13D`.

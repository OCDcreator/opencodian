# Checkpoint 14I: Codex Persisted Session Row Runtime Proof

## 1. Intent

This file is the repo-local execution pack for the next possible checkpoint after 14H.

It is intentionally **not executed yet**. It exists so the next approved round can resume from the worktree itself instead of depending on prior chat context.

Target checkpoint:

- `14I`: runtime verification of **Layer 1 only** for the persisted Codex backend session browser seam

## 2. Non-Negotiable Constraints

- Work only in:
  - `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability`
- Do not touch the main workspace
- Use OpenCode with:
  - `providerID="kimi-for-coding"`
  - `modelID="k2p6"`
- Run `opencode_setup` first when using MCP tooling
- Keep scope narrow
- Stop after this checkpoint
- Respect the multi-backend product rule:
  - multiple backends may be enabled
  - only the active backend starts/connects by default
  - settings shows backend-specific settings only for the active backend
  - users switch backend before configuring another backend

## 3. Why 14I Exists

Checkpoint 14H closed the truth boundary honestly:

- persisted Codex backend session browser seam is split into three layers
- Layer 1 persisted discovery/list row is `readback`
- Layer 2 preview/detail transcript readback is `readback`
- Layer 3 persisted resume into chat is `readback`
- user-visible settings copy is now aligned with that truth

The next smallest, safest move is **not** preview/detail, resume, approval UX, or settings readback.

It is only:

1. prove whether persisted Codex threads actually appear as rows in the existing backend session browser UI
2. collect runtime evidence
3. promote Layer 1 only if the evidence is real

## 4. Truth Sources To Read First

- `/Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `docs/status/checkpoint-14h-codex-persisted-session-browser-truth-closure.md`
- `docs/status/checkpoint-14h-codex-app-server-session-discovery.md`
- `src/core/agents/backend/CodexAdapter.ts`
- `src/core/agents/backend/CodexAppServerClient.ts`
- `src/core/agents/backend/AgentBackendRouting.ts`
- `src/features/chat/ui/BackendSessionBrowserModal.ts`
- `src/features/settings/SettingsCodexSection.ts`

## 5. Current Accepted Truth

### Already proven

- persisted session discovery code path is wired:
  - `CodexAdapter.start()` best-effort starts `CodexAppServerClient`
  - `CodexAdapter.listSessions()` merges app-server threads with in-memory sessions
  - `AgentBackendRouting.listBackendSessions()` normalizes rows
  - browser UI can render normalized rows
- settings-side Codex launcher copy now says:
  - in-memory sessions are always available
  - persisted threads are discovered when the app-server is available
- focused tests and broader Codex tests pass
- build / deploy / reload / console/error checks are already proven for the copy-fix round

### Not proven

- any real persisted Codex thread row actually appearing in the browser UI at runtime
- whether app-server spawn succeeds inside the real Obsidian runtime for this flow
- transcript preview/detail for a real persisted row
- resume of a real persisted row

## 6. Checkpoint Goal

Prove or disprove **Layer 1 only**:

- a real persisted Codex backend session appears as a row in the backend session browser UI

Success means:

1. active backend is `codex`
2. a persisted Codex thread exists outside current adapter memory
3. opening the backend session browser shows that persisted thread as a row
4. screenshot and/or DOM evidence clearly captures that row
5. if proven, Layer 1 can move from `readback` to `已 pass`
6. Layer 2 and Layer 3 remain unchanged unless separately proven in a future batch

## 7. In Scope

- runtime verification for Layer 1 only
- tiny test/doc updates only if the truth changes
- build/deploy/reload/evidence collection if any user-visible or runtime-facing adjustments are needed

## 8. Explicitly Out Of Scope

- no Layer 2 preview/detail promotion
- no Layer 3 resume promotion
- no approval UX
- no account/model/profile readback
- no app-server migration of the main chat path
- no new settings surfaces
- no broad refactors

## 9. Preferred Verification Shape

Use the smallest realistic runtime path:

1. ensure the Codex app-server route can actually spawn in the plugin runtime
2. create or locate a persisted Codex thread that is not merely in current adapter memory
3. open the existing browser entry
4. capture the row
5. stop

If the app-server still cannot spawn in the runtime, the checkpoint should end as:

- Layer 1 remains `readback`
- blocker documented with specific evidence

## 10. Files Likely To Change

### Status docs

- `docs/status/checkpoint-14i-codex-persisted-session-row-runtime-proof.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`

### Possibly touched only if needed

- test files directly tied to any truth wording change
- no broader product code unless required to expose evidence already implied by current code

## 11. Verification Requirements

### Automated

At minimum:

1. any directly affected focused tests
2. `npm run verify`
   - if owner-guard still fails because of pre-existing guarded-file changes elsewhere in the worktree, report that exact blocker honestly
3. `npm run build`

### Deployment

Deploy to:

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`

Then confirm the latest `BUILD_ID` in deployed `main.js`.

### Runtime proof

Collect evidence for:

1. active backend = `codex`
2. browser opened from existing entry
3. persisted row visible
4. console/errors remain clean enough to trust the result

Preferred artifacts:

- screenshot showing the persisted row
- DOM/text capture if possible
- console/error output
- exact blocker evidence if row does not appear

## 12. Honest Output Requirements

Final report must explicitly separate:

- whether Layer 1 is now `已 pass` or remains `readback`
- strongest runtime evidence
- strongest blocker if still unproven
- unchanged status for Layer 2 and Layer 3

Do **not** promote:

- transcript preview/detail
- resume
- approval UX
- settings readback

## 13. Desired Final Artifact

- `docs/status/checkpoint-14i-codex-persisted-session-row-runtime-proof.md`

Update `docs/status/codex-sdk-current-state-2026-06-09.md` only to the minimum extent needed for accepted 14I truth.

## 14. Stop Rule

After Layer 1 is either proven or honestly left at `readback`, stop.

Do not continue into Layer 2, Layer 3, or any other seam automatically.

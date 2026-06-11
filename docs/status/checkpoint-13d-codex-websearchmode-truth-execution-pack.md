# Checkpoint 13D: Codex `webSearchMode` Truth Resolution — Execution Pack

## 1. Intent

This file is the repo-local execution pack for the next *possible* checkpoint after 13C.

It is intentionally **not executed yet**. It exists so the next approved round can resume from the worktree itself instead of depending on prior chat context.

Target checkpoint:

- `13D`: Codex `webSearchMode` truth resolution for ordinary chat/settings surfaces

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

## 3. Why 13D Exists

`webSearchMode` is still the most prominent Codex thread option that:

1. exists in the official SDK surface
2. is already wired through the adapter
3. already has partial runtime evidence
4. still does **not** have an accepted stable ordinary chat/settings surface

Prior checkpoints already established:

- `disabled` suppression evidence exists
- `cached` vs `live` semantic distinction is real in official docs and SDK types
- current ordinary chat surface does **not** show a stable visible `cached` vs `live` distinction

So the next honest question is not “add another dropdown by default”. It is:

> Does `webSearchMode` now justify **any** stable ordinary surface, or should it remain `readback` / `hidden`?

This checkpoint is therefore a **truth-resolution checkpoint first**. Code changes are allowed only if a minimal, honest surface emerges from the evidence.

## 4. Truth Sources To Read First

- `/Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `docs/status/checkpoint-10a-codex-runtime-settings-truth-split.md`
- `docs/status/checkpoint-10b-websearchmode-cached-vs-live-audit.md`
- `docs/status/checkpoint-10c-websearchmode-sdk-cli-semantics-audit.md`
- `docs/status/checkpoint-13c-codex-session-network-access.md`
- `src/core/agents/backend/CodexAdapter.ts`
- `src/features/settings/SettingsCodexSection.ts`
- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `node_modules/@openai/codex-sdk/dist/index.d.ts`
- `/var/folders/kr/gbgh00qn3m70ff_fjsh7d55h0000gn/T/openai-docs-cache/codex-manual.md`

## 5. Current Accepted Truth

### Already proven

- SDK and adapter wiring for `webSearchMode` is real
- `disabled` suppresses the visible ordinary `web_search` transcript path for the tested prompt shape
- `cached` and `live` are both accepted SDK values and semantically distinct in official docs
- current ordinary transcript surface shows `web_search` tool blocks

### Not proven

- a stable user-meaningful `cached` vs `live` distinction in ordinary chat
- a stable ordinary settings surface that honestly communicates the mode semantics
- a stable per-conversation surface that is more honest than keeping the seam at `readback`

## 6. Checkpoint Goal

Resolve one of these two outcomes, and document it honestly:

### Outcome A — Minimal stable surface is justified

If fresh evidence proves there is an honest minimal surface, implement **only that**.

Examples of acceptable minimal outcomes:

- a binary `Inherit / Disabled` session or settings control, if that is the only user-meaningful distinction currently visible
- another equally narrow surface that does not misrepresent `cached` vs `live`

### Outcome B — No stable surface is justified

If fresh evidence still shows no honest product surface, keep `webSearchMode` at `readback` / `hidden`, make **no product code change**, and update truth docs only.

Success for this checkpoint is therefore **truth resolution**, not “UI must be added”.

## 7. In Scope

- fresh truth audit and runtime evidence for `webSearchMode`
- official-surface recheck
- narrow product code only if the evidence supports a truthful minimal surface
- tests/docs/build/deploy only if product code changes
- docs/status truth-sync in all cases

## 8. Explicitly Out Of Scope

- no approval-policy UI
- no app-server migration
- no session browser work
- no MCP management UI
- no “three-mode dropdown” unless evidence now honestly supports it
- no new diagnostic-only control passed off as stable UI
- no broader search tool redesign

## 9. Preferred Decision Order

1. Reconfirm official docs + installed SDK type shape
2. Reconfirm current adapter wiring
3. Re-run the most relevant runtime probes
4. Decide whether any stable user-facing distinction exists
5. Only then decide whether code changes are justified

## 10. Files Likely To Change

### If no product code change is justified

- `docs/status/checkpoint-13d-codex-websearchmode-truth.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `devlog.md`

### If a minimal product surface is justified

- likely one or more of:
  - `src/features/settings/SettingsCodexSection.ts`
  - `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
  - `src/features/chat/ui/ConversationSessionSettingsModal.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
  - targeted tests for whichever surface is touched

## 11. Evidence Requirements

At minimum, re-ground the current seam with fresh evidence for:

1. `disabled` branch
2. `cached` branch
3. `live` branch
4. whether ordinary transcript output differs in a user-meaningful way

Do not rely only on prior docs. Re-check current behavior.

## 12. Verification Requirements

### If product code changes

- targeted tests
- bare `npm run verify`
- `npm run check:module-docs`
- if needed, `OWNER_GUARD_APPROVED='...' npm run verify`
- `npm run build`
- Test Vault deploy
- BUILD_ID verification

### If docs-only / audit-only

- no build required unless runtime/deploy evidence needs a fresh binary
- still provide the exact runtime evidence paths used for the truth decision

## 13. Runtime Probe Bar

Use comparable prompts and capture:

- whether `web_search` blocks appear
- whether transcript copy differs
- whether result freshness/source is visibly distinguishable

If `cached` and `live` still look the same in ordinary chat, do **not** expose them as separate stable user choices.

## 14. Honest Output Requirements

Final report must explicitly answer:

1. Does `webSearchMode` now justify any stable ordinary surface?
2. If yes, exactly which minimal surface and why?
3. If no, why does it remain `readback` / `hidden`?
4. What code changed, if any?

Specifically, do **not** promote any of the following without proof:

- a three-mode stable surface
- user-visible `cached` vs `live` meaning
- full search settings parity with other backends

## 15. Desired Final Artifact

- `docs/status/checkpoint-13d-codex-websearchmode-truth.md`

Update `docs/status/codex-sdk-current-state-2026-06-09.md` only to the minimum extent needed for the accepted 13D truth.

## 16. Required Final Report Shape

- files changed
- what was diagnosed / productized
- strongest evidence
- remaining gaps
- blockers
- next smallest suggestion
- verify/build/deploy results when applicable
- `BUILD_ID` when applicable
- explicit truth-bucket conclusion for `webSearchMode`

## 17. Stop Rule

After the `webSearchMode` truth is recorded, stop.

Do not automatically open the next checkpoint.

# Checkpoint 10C: `webSearchMode` SDK / CLI Semantics Audit — Execution Pack

## 1. Intent

This file is the repo-local execution pack for the next *possible* checkpoint after 10B.

It is intentionally **not executed yet**. It exists so the next approved round can resume from the worktree itself instead of depending on prior chat context.

Target checkpoint:

- `10C`: Codex `webSearchMode` SDK / CLI semantics audit

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

## 3. Why 10C Exists

Checkpoint 10B established an honest runtime truth:

- `webSearchMode=disabled` has usable runtime evidence from earlier work
- `webSearchMode=cached` and `webSearchMode=live` are **not visibly distinguishable** in ordinary Codex chat under the current Test Vault build
- therefore `webSearchMode` remains `readback`, not `已 pass`

What 10B did **not** answer is whether:

1. the SDK really passes different values through to the Codex CLI
2. the CLI / app-server semantics for `cached` vs `live` differ only below the current ordinary chat surface
3. the lack of visible difference is expected product truth rather than a wiring failure

10C exists to answer those narrower semantics questions without prematurely productizing a three-mode settings surface.

## 4. Truth Sources To Read First

- `/Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `docs/status/checkpoint-5e-disabled-runtime-audit.md`
- `docs/status/checkpoint-10b-websearchmode-cached-vs-live-audit.md`
- `src/core/agents/backend/CodexAdapter.ts`
- `node_modules/@openai/codex-sdk/README.md`
- `node_modules/@openai/codex-sdk/dist/index.d.ts`

## 5. Current Accepted Truth

### Already proven

- visible `web_search` transcript seam is `已 pass`
- `disabled` suppression branch has runtime evidence
- `cached` vs `live` produced no stable, user-meaningful ordinary-chat-visible difference in Checkpoint 10B
- `webSearchMode` therefore remains `readback`

### Not proven

- whether the SDK / CLI receives distinct semantics that are simply invisible in current ordinary chat
- whether `cached` vs `live` should ever be exposed as separate stable product controls in this plugin

## 6. Checkpoint Goal

Answer these exact questions:

1. Does the Codex SDK pass distinct `webSearchMode` values through to the Codex CLI / runtime path for `cached` vs `live`?
2. Does the official Codex surface describe a real semantic distinction between them?
3. If yes, is that distinction currently below OpenCodian's ordinary chat visibility boundary?
4. If no strong distinct semantics can be confirmed, should the plugin treat `cached` vs `live` as non-productizable for now?

## 7. In Scope

- official-doc + installed-SDK + local-runtime semantics audit
- direct inspection of:
  - Codex manual wording
  - SDK types / README / passthrough surfaces
  - any repo-local smoke or diagnostic scripts that can prove argument flow
- small status-doc updates if the audit conclusion becomes clearer

## 8. Explicitly Out Of Scope

- no product-code changes unless a tiny truth-fix is absolutely required
- no settings UI changes
- no new three-mode selector
- no image input work
- no approvalPolicy work
- no MCP management work
- no app-server migration
- no additional ordinary-chat A/B tests unless strictly needed to validate a semantics claim

## 9. Preferred Investigation Order

1. **Official docs first**
   - confirm exact public semantics:
     - `cached` = search cache
     - `live` = fetch most recent data
     - `live` = same as `--search`
2. **Installed SDK surface second**
   - confirm the TypeScript SDK still exposes `ThreadOptions.webSearchMode`
   - confirm any relevant README/examples
3. **Argument-flow proof third**
   - use the narrowest reproducible method available to show whether different values are forwarded
   - acceptable examples:
     - repo-local smoke script
     - controlled wrapper / debug output
     - CLI-visible config/log surface
4. **Truth conclusion last**
   - decide whether `cached` vs `live` is:
     - real but below current product visibility
     - weakly specified / not worth productizing
     - or unexpectedly broken

## 10. Verification Requirements

### If repo code changes

1. add/update focused tests first
2. run `npm run graphify:update:src` if `src/` changes
3. run:
   - `OWNER_GUARD_APPROVED='Checkpoint 10C webSearchMode semantics audit' npm run verify`
4. run `npm run build` only if user-visible/runtime code changed
5. deploy only if runtime-facing code changed

### If docs/runtime-only

- do **not** run build/deploy just for the sake of ceremony
- runtime probes and exact evidence are sufficient

## 11. Desired Outcome Shape

Good outcomes:

- `webSearchMode` remains `readback`, but the reason becomes sharper:
  - "distinct semantics confirmed, current ordinary surface cannot expose them honestly"
  - or
  - "distinct semantics too weak / too invisible to justify separate product controls"

Bad outcomes:

- changing product UI without stronger truth
- promoting `webSearchMode` to `已 pass` without a stable user-visible distinction
- opening image/MCP/approval side quests

## 12. Suggested Final Artifact

- `docs/status/checkpoint-10c-websearchmode-sdk-cli-semantics-audit.md`

Update `docs/status/codex-sdk-current-state-2026-06-09.md` only if the audit meaningfully sharpens the recorded truth.

## 13. Required Final Report Shape

- files changed
- what was diagnosed
- strongest evidence
- remaining gaps
- blockers
- next smallest suggestion
- explicit truth-bucket conclusion for `webSearchMode`

## 14. Stop Rule

After the semantics conclusion is recorded, stop.

Do not automatically open the next checkpoint.

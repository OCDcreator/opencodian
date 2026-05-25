# Proposal: Claude Code Capability Productization Queue

## Problem

OpenCodian has a working Claude Code backend lane, but the product surface is still mixed between proven ordinary user paths, diagnostic-only probes, and intentionally hidden or gated capability areas.

The latest verified anchor is `daf9dd6f fix: validate claude ordinary resume identity`. That slice hardened ordinary Claude chat resume identity, but it did not complete `resume-at`, stable JSONL history, permission/question/MCP ordinary user paths, hooks, sessionStore, structured output, skills/plugins, agent definitions, subagent transcript/progress, rewind/revert/diff, or full Claude Code capability parity.

The next unattended run must keep advancing implementation slices through a gated queue. It must not stop at audit, diagnostic proof, or one batch of commits. It may only promote a Claude capability into an ordinary user path after focused tests, review, build/deploy when runtime-relevant, and fresh Obsidian/Test Vault proof.

## Product Principle

The queue must keep three surfaces distinct:

- Stable user path: enabled only after real product flow proof in Obsidian/Test Vault.
- Diagnostic path: allowed for direct SDK proof and Capability Lab probes, clearly labelled as diagnostic.
- Hidden/gated path: required for unproven, unstable, or OpenCode-only capabilities.

Never state that Claude Code full capability is complete unless all gap-ledger rows have real E2E proof, false exposure is removed, OpenCode regression gates pass, and remaining rows have external-blocker evidence.

## Gap Ledger

Priority order is based on user risk, false-exposure risk, and verifiability.

| Rank | Capability gap | Current state | Target outcome | Required proof |
|---|---|---|---|---|
| 1 | Authenticated `resume` / `resume-at` positive proof | Ordinary resume identity is validated; `resume-at` remains unpromoted | Separate ordinary resume from checkpoint `resume-at`; promote only the valid ordinary path and keep `resume-at` gated or diagnostic until proven | Focused adapter/session tests, fresh runtime proof, no session-id rebinding, no full-capability claim |
| 2 | Permission approval, AskUserQuestion, MCP ordinary user path | Direct SDK smoke and Capability Lab diagnostic proof exist | Either wire an ordinary Claude user path with approvals/questions/MCP rendering, or keep each diagnostic-only with visible reason | Focused bridge/UI tests plus Obsidian proof with `dev:errors` equal to `No errors captured.` |
| 3 | SDK advanced toggles honesty | Several settings are wired as SDK options, but runtime maturity varies | Mature rows stay settings-only/diagnostic until live proof exists; unproven toggles must not read as stable | Capability Lab/settings tests and negative stable-claim runtime assertions |
| 4 | Hooks, sessionStore, JSONL, structured output boundaries | Some options/probes exist; stable product story is incomplete | Keep diagnostic/hidden or produce a narrowly scoped stable import/readback path with rollback | Tests for failure states, docs/modules updates, runtime proof if surfaced |
| 5 | Subagent transcript/progress, skills/plugins, agent definitions authoring | Config/discovery may exist; authoring and full transcript UI are not stable | Keep authoring hidden or implement one read-only/productized slice with proof | Focused tests, no false `Exposed` labels, runtime screenshot/console artifacts |
| 6 | Stable rewind/revert/diff and OpenCode-only boundaries | Rewind/fork visibility is backend-owned; diff/revert remain OpenCode-only | Prevent Claude conversations from inheriting OpenCode controls; only promote Claude controls with backend proof | Routing tests, OpenCode regression tests, runtime assertion |

## Scope

### In Scope

- Continue in the dedicated worktree `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/phase0-capability`.
- Use `OpenSpec -> Task Master -> opencode-loop execute` with review gate and heartbeat.
- Implement multiple queue slices, each with focused tests and docs.
- Run `npm run graphify:update:src` after `src/` changes.
- Run `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, `git diff --check`, and focused tests for every completed slice.
- For deploy-relevant runtime changes, run `npm run build`, deploy to Test Vault, verify `BUILD_ID`, and keep fresh runtime screenshot/console/dev-error artifacts.

### Out of Scope

- Claiming Claude Code full capability completion before the ledger is fully proven.
- Promoting unproven Claude SDK features into stable UI.
- Regressing OpenCode behavior or removing OpenCode-only gates.
- Broad refactors unrelated to the active gap.
- Editing `reference-projects/` unless a task explicitly requires reference inspection.

## Execution Contract

Each queue task must:

- Name the capability boundary it is changing.
- Start from current docs and tests, not from stale assumptions.
- Use focused tests before implementation when changing behavior.
- Update `docs/status/claude-code-current-state-2026-05-22.md`, relevant `docs/requirements/**`, matching `docs/modules/**`, and `devlog.md` when behavior changes.
- Keep unproven capabilities hidden, gated, or diagnostic.
- Include review-gate participation.

## Acceptance Criteria

- A review-gated `opencode-loop` execute queue is created and started under tmux.
- The heartbeat is installed with a 30 minute interval.
- Queue tasks encode the gap ledger above and require project gates.
- Completed slices produce commits, focused test evidence, docs/devlog updates, and runtime artifacts when relevant.
- If a gate repeatedly fails, the run pauses blind retries and converts the latest review/gate JSON plus queue `last_error` into a specific repair target.

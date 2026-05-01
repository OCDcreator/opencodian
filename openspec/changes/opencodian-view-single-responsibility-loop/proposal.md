# Proposal: OpenCodianView Single Responsibility Long Loop

## Problem

OpenCodian remains in a maintenance-first phase. The previous remaining-thick-owner queue completed the `main.ts` and `OpenCodeService.ts` slices, then recorded a checkpoint saying `OpenCodianView.ts` needed a separately designed batch before more unattended work. The current requirement overrides that checkpoint: the next unattended `opencode-loop` run must continue the `OpenCodianView.ts` single-responsibility decomposition without stopping at analysis-only output.

`src/features/chat/OpenCodianView.ts` is still the largest handwritten owner in the repo. It is allowed to remain a high-connection Obsidian view shell, but it must not keep direct ownership of stable behavior slices that already have adjacent chat runtime/service owners.

## Governing Constraints

Follow these sources:

- `AGENTS.md`
- `docs/requirements/maintenance-development-baseline.md`
- `docs/status/development-maintainability-rules.md`
- `graphify-out/GRAPH_REPORT.md`
- `docs/modules/features/chat/OpenCodianView.md`

Hard constraints:

- Maintenance-first only; no general feature work.
- Do not add new runtime truth to `OpenCodianView.ts`.
- Do not create thin helper / adapter / provider / factory files just to reduce line count.
- Prefer extending existing adjacent owners in `src/features/chat/services/`, `src/features/chat/runtime/`, or `src/features/chat/ui/`.
- A new module is allowed only when it owns one complete durable behavior slice and has matching tests/docs.
- Preserve concurrent tab/session streaming, hydration/auth-sync, scroll restore, question/todo/background-task behavior, OMO rendering, and model/permission selection behavior.

## Proposed Solution

Run a literal `OpenSpec -> Task Master -> opencode-loop execute` pipeline in this dedicated worktree:

`/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian-view-single-responsibility-20260501`

The execute queue must be long-running, `tmux` backed, and review-gated. It should keep advancing through source-level `OpenCodianView.ts` ownership slices until the queue is done or a real blocking review/test failure occurs.

The queue should prioritize low-risk, complete slices already suggested by current code shape and docs:

1. Identify the safest current `OpenCodianView.ts` seams from graphify/module docs and recent maintainability status notes.
2. Move one complete debug/diagnostics or render-support slice out of `OpenCodianView.ts` into an existing adjacent owner, or into one durable owner if no suitable owner exists.
3. Move one complete child-session tree, context-usage, tooltip/copy, or assistant/user render-support slice out of `OpenCodianView.ts` by extending the matching existing owner.
4. Move one complete activation/sync/question/todo/background-task host assembly slice only if it can reduce view-owned callback surface without introducing another thin bridge chain.
5. Record a rolling status after every task and immediately continue to the next safe slice rather than stopping at a design-only checkpoint.

## Scope

### In Scope

- `src/features/chat/OpenCodianView.ts`
- adjacent chat runtime/service/ui owners under `src/features/chat/`
- focused tests under `tests/unit/**` for moved behavior
- matching `docs/modules/**`
- `graphify-out/**` refresh after source changes
- status docs under `docs/status/lanes/t5-opencodian-view-single-responsibility/`
- execute queue and hook configuration under `.opencode-loop/`

### Out of Scope

- broad directory reshuffles
- line-count-only splitting
- changes to `ServerManager.ts`, `main.ts`, or `OpenCodeService.ts` unless required by a test fallout directly caused by this queue
- stable UI redesign
- generated asset or provider-icon work
- Test Vault deployment unless runtime deploy-relevant paths are intentionally changed and build succeeds

## Acceptance Criteria

- The run starts in the dedicated worktree, not the main checkout.
- Historical `.opencode-loop` state is not resumed blindly.
- The queue contains multiple source-level `OpenCodianView.ts` thinning tasks, not a single analysis/checkpoint task.
- Each source task must reduce or preserve `OpenCodianView.ts` ownership and must not merely move code into a thin one-off wrapper.
- Each source task updates matching `docs/modules/**` and refreshes graphify when `src/` changes.
- Each source task runs focused tests when applicable plus `npm run check:module-docs`, `npm run check:graphify`, and `npm run verify`.
- Blocking Codex review is installed through `opencode-loop hooks install-review`.
- The supervisor runs through `tmux` with execute profile and a long stale window so the parent shell can disconnect without stopping the run.
- The lane status doc records current task, round, last commit, next focus, blocker category if any, and whether the loop should continue.

## Verification

Default full gate:

```bash
npm run verify
```

Focused gates:

```bash
npm run check:module-docs
npm run graphify:update:src
npm run check:graphify
npm test -- --runInBand <focused test files>
```

## References

- `docs/requirements/maintenance-development-baseline.md`
- `docs/status/development-maintainability-rules.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `graphify-out/GRAPH_REPORT.md`
- `docs/status/lanes/t3-remaining-thick-owner-long-queue/autopilot-status.md`

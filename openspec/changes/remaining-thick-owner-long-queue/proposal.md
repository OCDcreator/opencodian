# Proposal: Remaining Thick Owner Long Queue

## Problem

OpenCodian is still in the maintenance-first phase. One ServerManager batch has already landed on `main`, but the remaining high-connection owners still need a controlled unattended queue that can keep running overnight without drifting into thin-wrapper fragmentation or unreviewed broad refactors.

The remaining thick owners are:

- `src/main.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/features/chat/OpenCodianView.ts`

The repo already rejects line-count-only splitting. This queue therefore must optimize for ownership clarity, not file count, and must stop at a justified checkpoint rather than blindly shredding a shell owner into small files.

## Governing Constraints

This change must obey:

- `AGENTS.md`
- `docs/requirements/maintenance-development-baseline.md`
- `docs/status/development-maintainability-rules.md`
- `graphify-out/GRAPH_REPORT.md`

Hard constraints:

- maintenance first, no general net-new feature work
- thick owners may stay large as shells/facades
- do not add new runtime ownership to `OpenCodeService.ts` or `OpenCodianView.ts`
- do not create thin helper / adapter / provider / factory files
- prefer existing adjacent durable owners
- create a new owner only when it is a complete, reusable, durable responsibility boundary

## Proposed Solution

Run a literal `OpenSpec -> Task Master -> opencode-loop execute` pipeline in a dedicated worktree with a long-running `tmux`-backed supervisor.

This batch focuses on the remaining thick-owner roadmap in a safe order:

1. `main.ts` startup bootstrap shell
2. `main.ts` settings persistence / refresh runtime shell
3. `OpenCodeService.ts` project-compaction reload lifecycle seam
4. checkpoint record for the next remaining thick-owner order, including whether `OpenCodianView.ts` is ready for the next unattended batch

The queue should not reopen the already-landed ServerManager seam work. It should start from current `main`.

## Scope

### In Scope

- build a long execute queue for the remaining thick-owner batch
- keep the queue machine-verifiable and resumable
- move `main.ts` startup bootstrap into one durable adjacent runtime owner
- move `main.ts` settings save / refresh / config-sync flow into one durable adjacent runtime owner
- move `OpenCodeService.ts` project-compaction reload behavior into the existing lifecycle owner if the seam remains cohesive
- update `docs/modules/**`, graphify artifacts, and lane status docs when boundaries change
- require review gate, targeted tests, and `npm run verify`

### Out of Scope

- repeating ServerManager work already on `main`
- broad OpenCodianView churn in the same batch without a proven stable slice
- directory-template rewrites
- line-count-only extraction
- new thin bridge/helper layers

## Acceptance Criteria

- the queue runs from a dedicated worktree, not the main checkout
- stale historical `.opencode-loop` state is archived instead of resumed blindly
- every code task names one primary owner and one narrow boundary move
- every code task includes targeted verification plus `npm run verify`
- every source-task scope includes matching `docs/modules/**` and `graphify-out/`
- every round updates machine state and a human-readable lane status document with round, lane, last commit, and next focus
- review is blocking and includes Codex
- the batch stops only after all queued tasks finish, a real blocker occurs, or a documented checkpoint explicitly justifies pause before `OpenCodianView.ts`

## First Batch Order

1. `main.ts`: startup bootstrap shell -> durable runtime owner
2. doc/verify the startup move
3. `main.ts`: settings save + refresh + config-sync shell -> durable runtime owner
4. doc/verify the settings move
5. `OpenCodeService.ts`: project-compaction reload -> existing lifecycle owner
6. doc/verify the lifecycle move
7. record the next justified checkpoint and remaining order, especially `OpenCodianView.ts`

## Verification

Default gate:

```bash
npm run verify
```

Focused gates by task:

```bash
npm run check:module-docs
npm run check:graphify
npm test -- --runInBand <targeted-tests>
```

## References

- `docs/requirements/maintenance-development-baseline.md`
- `docs/status/development-maintainability-rules.md`
- `docs/requirements/agent-maintainability.md`
- `docs/modules/entry-point/main.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/features/chat/OpenCodianView.md`

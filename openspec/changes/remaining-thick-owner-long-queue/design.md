# Design: Remaining Thick Owner Long Queue

## Intent

This queue is not a general "keep shrinking big files" program. It is a controlled maintenance batch aimed at the remaining thick owners after the landed ServerManager seams. The batch should make visible ownership progress on `main.ts`, then take one justified `OpenCodeService.ts` seam, then stop at a documented checkpoint unless a safe `OpenCodianView.ts` slice is already obvious from the updated repo state.

## Batch Structure

### 1. `main.ts` startup bootstrap

`main.ts` is already a lifecycle composition owner, but startup preparation and bootstrap sequencing still consume a thick shell surface. The intended move is to package startup bootstrap into one durable runtime owner, likely under the existing `src/core/runtime/` neighborhood rather than a new generic startup subtree.

The extracted owner must be cohesive enough to keep owning:

- startup preparation sequencing
- OpenCode runtime bootstrap sequencing
- workspace integration bootstrap handoff
- startup diagnostics coordination that belongs to that bootstrap window

`main.ts` should keep plugin lifecycle entry ownership (`onload`, `onunload`, plugin-facing callbacks), not become a mere forwarder.

### 2. `main.ts` settings runtime flow

The `saveSettings()` flow is another durable slice. It coordinates:

- service update / rollback
- persistence to storage domains
- view refresh and slash catalog invalidation
- permission-mode config sync

Those steps belong together as one settings-runtime owner. This should be packaged as one complete adjacent owner, not four helper functions. The move should preserve the rule that `main.ts` remains the plugin lifecycle shell while no longer holding detailed settings runtime choreography.

### 3. `OpenCodeService.ts` compaction reload lifecycle seam

The target `OpenCodeService.ts` slice is intentionally narrow: project-compaction reload and post-reload validation. This seam already behaves like lifecycle/config coordination and should move into the existing lifecycle owner if that owner can absorb it without becoming a grab bag.

This avoids a weaker alternative where the queue chases low-value public delegation methods or invents a new one-off helper purely to reduce line count.

### 4. Checkpoint before `OpenCodianView.ts`

`OpenCodianView.ts` remains the largest owner in the repo, but that does not mean this batch should automatically touch it. After the `main.ts` and `OpenCodeService.ts` slices land, the queue must record:

- whether `OpenCodianView.ts` now has one clearly bounded next slice
- whether that slice extends an existing adjacent owner
- whether it is suitable for the next unattended batch

If the answer is unclear, the correct result is a documented checkpoint rather than an unsafe live refactor.

## Review Gate Contract

Every code-bearing task must pass a blocking `gate-review` hook driven by Codex. The gate must answer the six maintenance review questions and only return `{"result":"pass"}` when all six are positive.

The gate is there to stop these failure modes:

- `main.ts` or `OpenCodeService.ts` merely shifting complexity into thin wrappers
- verification passing while ownership gets blurrier
- `OpenCodianView.ts` growing indirectly because another owner starts calling back into it more aggressively

## Status Contract

Each round must update:

- machine state in `.opencode-loop/`
- lane status doc under `docs/status/lanes/t3-remaining-thick-owner-long-queue/`

The status doc must make it easy to see:

- current round
- current or last task
- last commit
- next focus
- whether the queue is still in the planned batch or has hit a blocker/checkpoint

## Why This Is A Reasonable Checkpoint

This batch is large enough to be meaningful because it targets three concrete ownership moves, not one micro-refactor. It is still small enough to be safe for unattended execute mode because every move is either:

- a complete `main.ts` shell slice
- a narrow `OpenCodeService.ts` lifecycle slice
- a documentation/checkpoint task

That balance is what makes it appropriate for an overnight long queue.

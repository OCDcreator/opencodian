## Context

OpenCodian already has a repo-local maintainability program and explicit guardrails against growing `OpenCodianView.ts` and `OpenCodeService.ts`, but the current unattended loop is still a broad `dev` program. That mode is useful for open-ended cleanup, yet this specific effort now needs a stricter contract: tasks must be discrete, verifiable, and safe for many unattended rounds without rewarding file-count inflation.

The current codebase already contains the right adjacent owners to extend. `OpenCodianView.ts` has multiple existing coordinators, services, and runtime bridges around rendering, tab lifecycle, background tasks, question flow, and composer interactions. `OpenCodeService.ts` already delegates meaningful chunks to state, query, lifecycle, streaming, and session-control owners. The design should keep pushing behavior into those durable seams instead of inventing new thin wrappers.

## Goals / Non-Goals

**Goals:**

- Convert the thick-file thinning effort into a formal OpenSpec -> Task Master -> `opencode-loop execute` pipeline.
- Define a repeatable refactor rhythm that alternates between `OpenCodeService.ts` and `OpenCodianView.ts`.
- Make each automated task move one complete behavior slice into one primary owner, with at most a small supporting cluster when truly necessary.
- Keep every round independently verifiable and resumable.

**Non-Goals:**

- Rewriting either thick file into a tiny shell in one pass.
- Splitting code solely to reduce line count.
- Creating many one-off helper, adapter, provider, or factory files.
- Changing user-facing plugin behavior unless a refactor requires a behavior-preserving fix.

## Decisions

### 1. Use two alternating refactor lanes instead of draining one file completely first

`OpenCodianView.ts` and `OpenCodeService.ts` are both high-connection owners, but they fail in different ways. Alternating lanes keeps the autonomous program from overfitting to one owner and lets the repo keep reducing risk on both fronts. This also gives every round a simpler choice: pick the next prepared slice from the opposite lane.

Alternative considered:
- Drain `OpenCodianView.ts` first, then `OpenCodeService.ts`.
  Rejected because it leaves one core owner untouched for too long and makes the queue less balanced for unattended work.

### 2. Each queue item must move exactly one stable ownership slice

Every execute-mode task will target one complete behavior slice such as transport/config surface, canonical mutation handling, message rendering, or pane/runtime orchestration. A task is complete only when the old thick file becomes thinner and the new owner is durable enough to keep growing in later rounds.

Alternative considered:
- Let one task cover multiple adjacent slices to chase faster line-count reduction.
  Rejected because it increases unattended risk, makes review harder, and tends to create emergency helpers during the round.

### 3. Prefer existing adjacent owners over brand-new helper files

For `OpenCodianView.ts`, new behavior should first look for an existing coordinator, renderer, or runtime owner. For `OpenCodeService.ts`, new behavior should first extend existing lifecycle, query, streaming, session-control, state, or prompt owners. New files are allowed only when they own a coherent behavior slice that does not already fit an existing adjacent owner.

Alternative considered:
- Freely create fresh helper files whenever a local method block looks large.
  Rejected because the repo guardrails explicitly warn against thin helper proliferation, and this pattern tends to fragment model context.

### 4. The queue contract must encode verification and anti-fragmentation checks

Each task will carry project-specific verification commands plus acceptance checks that encode the real maintainability goal: ownership moved, docs updated, no fragmented helper explosion, and `npm run verify` still passing. This turns the anti-fragmentation rule into something execute mode can enforce instead of a loose guideline.

## Risks / Trade-offs

- [Tasks become too abstract] -> Write queue items against named owners and concrete file boundaries, not generic "clean up file" wording.
- [Automation creates small wrapper files to satisfy a task quickly] -> Encode acceptance checks and task wording around durable owners, adjacent owner preference, and low file-count expansion.
- [Verification cost slows each round] -> Keep the unit of change narrow so `npm run verify` remains affordable and meaningful.
- [Spec describes maintainability intent but not lane order clearly enough] -> Put the exact lane order and first-round slices in `tasks.md`, then import that into Task Master and execute mode.

## Migration Plan

1. Add OpenSpec artifacts for the thick-file thinning program.
2. Initialize Task Master in the repo and parse the proposal into ordered tasks.
3. Enrich the imported queue with verification and acceptance checks for this repo.
4. Promote tasks into `opencode-loop` execute mode and retire this effort's reliance on the broad `dev` loop.
5. Run future unattended rounds through execute mode so each slice is gated and resumable.

## Open Questions

- Which precise slice should be first in each lane after Task Master expansion: `OpenCodeService` transport/config surface first, or `OpenCodianView` message rendering first?
- Whether a `gate-review` hook should be enabled immediately for this queue or after the first successful execute round.

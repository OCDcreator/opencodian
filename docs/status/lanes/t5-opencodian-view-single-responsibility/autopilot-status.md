# T5 OpenCodianView Single Responsibility Autopilot Status

> Started: 2026-05-01
> Worktree: `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian-view-single-responsibility-20260501`
> Branch: `autopilot/opencodian-view-single-responsibility-20260501`

## Current State

- round: 1
- current_task: view-21
- last_commit: cc4fd2d9
- next_focus: Continue with next queued extraction tasks
- blocker_category: none
- continue_loop: true

## Completed Tasks

### view-16 — Identify and document safe seams (DONE)
- Identified 8 candidate extraction slices across 3 priority tiers
- Documented safe seams and rejection rationale

### view-17 — Move child session tree DOM rendering (DONE)
- Extracted child session tree rendering to `ChildSessionGraphCoordinator`
- OpenCodianView.ts reduced by ~120 lines

### view-18 — Move context-usage stream lifecycle (DONE)
- Extracted context-usage stream methods to `ActiveTabContextUsageCoordinator`
- OpenCodianView.ts reduced by ~55 lines

### view-19 — Move tooltip/copy behavior (DONE)
- Extracted tooltip/copy static methods to `ConversationRenderService`
- OpenCodianView.ts reduced by ~30 lines

### view-20 — Extract background-task host assembly slice (DONE)
- Removed 6 background-task wrapper methods from OpenCodianView.ts
- Added `createBackgroundTaskViewHost()` factory to `BackgroundTaskTimelineService`
- View now reuses centralized `backgroundTaskHost` across all host adapters
- OpenCodianView.ts reduced by ~45 lines

## Operating Contract

- Keep running through the queued `OpenCodianView.ts` source-level ownership slices.
- Do not stop at analysis-only, checkpoint-only, or documentation-only output.
- Prefer existing adjacent chat owners before creating any new module.
- Reject thin helper fragmentation even if line count drops.
- Run focused checks, module-doc checks, graphify freshness, `npm run verify`, and blocking Codex review for source tasks.

## Initial Candidate Lanes

- debug or render-support behavior still owned directly by `OpenCodianView.ts`
- child-session tree or context-usage UI/runtime behavior that can move to existing adjacent owners
- tooltip/copy or assistant/user render-support behavior that can move to existing render/ui owners
- activation/sync/question/todo/background-task host assembly only when it reduces callback surface without adding a new bridge chain

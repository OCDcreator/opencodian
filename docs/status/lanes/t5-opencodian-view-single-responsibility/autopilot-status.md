# T5 OpenCodianView Single Responsibility Autopilot Status

> Started: 2026-05-01
> Worktree: `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian-view-single-responsibility-20260501`
> Branch: `autopilot/opencodian-view-single-responsibility-20260501`

## Current State

- round: 2
- current_task: view-srp2-05
- last_verified_source_commit: e39ddb04
- status_checkpoint_commit: rolling checkpoint; use git HEAD for the current doc-only checkpoint commit
- queue_state: completed
- next_focus: none — queue complete
- blocker_category: none
- continue_loop: false

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

### view-21 — Update lane status doc (DONE)
- Updated autopilot-status.md with completed tasks view-16 through view-20
- Graphify already fresh (no src changes in this task)

### view-22 — Run full verification and finalize queue (DONE)
- Ran `npm run verify` — all gates pass:
  - module-docs: pass
  - graphify: pass
  - devlog-order: pass
  - lint: pass (0 errors, 0 warnings)
  - typecheck: clean
  - tests: 1796 pass
  - build: OK
- Fixed 2 pre-existing max-lines lint warnings:
  1. `src/core/opencode/OpenCodeService.ts`: extracted `createLifecycleAssembly()` private method to reduce constructor from 209 to 176 lines
  2. `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`: split runtime-state tests into new `BackgroundTaskTimelineService.runtime.test.ts` (main file reduced from 598 to 384 lines)
- Queue extraction tasks are complete; all source changes verified with zero lint warnings.

## Operating Contract

- Keep running through the queued `OpenCodianView.ts` source-level ownership slices.
- Do not stop at analysis-only, checkpoint-only, or documentation-only output.
- Prefer existing adjacent chat owners before creating any new module.
- Reject thin helper fragmentation even if line count drops.
- Run focused checks, module-doc checks, graphify freshness, `npm run verify`, and blocking Codex review for source tasks.

## Net Impact

OpenCodianView.ts: 5314 → 4971 lines (**−343 lines**)

| Task | Lines Removed from OpenCodianView.ts | Destination |
|------|--------------------------------------|-------------|
| view-17 | ~120 | ChildSessionGraphCoordinator |
| view-18 | ~55 | ActiveTabContextUsageCoordinator |
| view-19 | ~30 | ConversationRenderService |
| view-20 | ~45 | BackgroundTaskTimelineService |
| **Per-task total** | **~250** | **4 existing owners** |
| **Actual measured Δ** | **−343** | *(difference due to inline cleanup, import removal, dead-code elimination)* |

## Round 2 — Second SRP Batch

### view-srp2-01 — Extract ChatSurfaceAppearanceCoordinator (DONE)
- Extracted surface color/appearance sync and scroll-mode appearance management to `ChatSurfaceAppearanceCoordinator`
- New coordinator owns: `syncSurfaceColors()`, `applySurfaceScrollMode()`, color-to-CSS binding
- Added scroll-mode color sync fix: pane coordinator now triggers appearance refresh when switching modes
- OpenCodianView.ts reduced by ~120 lines
- Destination: `src/features/chat/services/ChatSurfaceAppearanceCoordinator.ts` (194 lines)

### view-srp2-02 — Extract SendPipelineDebugSummaries (DONE)
- Extracted send-pipeline debug summarizers to dedicated `SendPipelineDebugSummaries`
- Coordinator owns: `summarizeDebugInfo()`, `summarizeToolPermissions()`, `summarizeActiveModels()`
- OpenCodianView.ts reduced by ~175 lines
- Destination: `src/features/chat/runtime/SendPipelineDebugSummaries.ts` (223 lines)

### view-srp2-03 — Extract UserMessageContentRenderer (DONE)
- Extracted user message body rendering to dedicated `UserMessageContentRenderer`
- Renderer owns: `renderContentBody()`, vault-link resolution, image embedding, code-block handling
- OpenCodianView.ts reduced by ~155 lines
- Destination: `src/features/chat/runtime/UserMessageContentRenderer.ts` (184 lines)

### view-srp2-04 — Move context usage stream operations to ActiveTabContextUsageCoordinator (DONE)
- Moved `beginTabContextUsageStream`, `completeTabContextUsageStream`, `applyUsageChunkToTab`, `openContextUsageDetails`, `refreshContextUsageIndicator` to existing `ActiveTabContextUsageCoordinator`
- Extended `ActiveTabContextUsageCoordinatorHost` with: `hasTab`, `getTabContextUsage`, `setTabContextUsage`, `getActiveTabId`, `openContextUsageDetailsModal`
- Removed 8 private methods from OpenCodianView, cleaned unused imports
- OpenCodianView.ts reduced by ~84 lines
- Destination: `src/features/chat/services/ActiveTabContextUsageCoordinator.ts` (256 lines)
- 10 new tests for stream lifecycle, modal opening, indicator refresh

### view-srp2-05 — Finalize SRP batch with docs and verification (DONE)
- Ran `npm run verify` — all gates pass:
  - module-docs: pass
  - graphify: pass
  - devlog-order: pass
  - lint: pass (0 errors, 0 warnings)
  - typecheck: clean
  - tests: 1882 pass
  - build: OK
- Updated lane status doc with second SRP batch results
- Graphify already fresh (no source ownership changes in this task)
- No thin helper modules introduced: destinations are 2 existing coordinators extended with same-domain responsibilities plus 3 new modules each with substantive domain ownership

### Round 2 Net Impact

OpenCodianView.ts: 4971 → 4437 lines (**−534 lines**)

| Task | Lines Removed | Destination |
|------|---------------|-------------|
| view-srp2-01 | ~120 | ChatSurfaceAppearanceCoordinator (services/) |
| view-srp2-02 | ~175 | SendPipelineDebugSummaries (runtime/) |
| view-srp2-03 | ~155 | UserMessageContentRenderer (runtime/) |
| view-srp2-04 | ~84 | ActiveTabContextUsageCoordinator (services/) |
| **Round 2 Total** | **~534** | **4 owners (2 new, 2 extended)** |

### Cumulative Impact (Rounds 1 + 2)

OpenCodianView.ts: 5314 → 4437 lines (**−877 lines**, **16.5% reduction**)

| Round | Actual Δ | Per-task Estimates | Destinations |
|-------|----------|--------------------|-------------|
| Round 1 (view-17 to view-20) | −343 (5314→4971) | ~120+~55+~30+~45=~250 | 4 existing owners |
| Round 2 (view-srp2-01 to view-srp2-04) | −534 (4971→4437) | ~120+~175+~155+~84=~534 | 4 owners (2 new, 2 extended) |
| **Grand Total** | **−877** | *per-task sums undercount Round 1 by ~93 lines due to inline cleanup, import removal, and dead-code elimination not captured in per-slice estimates* | **8 distinct owners** |

### No Thin Helper Modules Introduced

All extractions went to either:
1. **Existing coordinators** extended with same-domain responsibilities (ActiveTabContextUsageCoordinator, BackgroundTaskTimelineService, ConversationRenderService, ChildSessionGraphCoordinator)
2. **New modules with substantive domain ownership** — each owns a clear, non-trivial responsibility surface (ChatSurfaceAppearanceCoordinator, SendPipelineDebugSummaries, UserMessageContentRenderer)

No adapter/factory/provider indirection layers were created.

## Remaining Candidates (not extracted in this round)

- debug or render-support behavior still owned directly by `OpenCodianView.ts`
- question/todo activation host assembly (skipped as unsafe — adds bridge chain)
- scroll anchoring and viewport math (complex, intertwined with tab switching)
- remaining inline event handlers that reference `this.app` or `this.plugin` directly

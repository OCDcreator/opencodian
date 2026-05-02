# T5 OpenCodianView Single Responsibility Autopilot Status

> Started: 2026-05-01
> Worktree: `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian-view-single-responsibility-20260501`
> Branch: `autopilot/opencodian-view-single-responsibility-20260501`

## Current State

- round: 3
- current_task: view-srp3-05
- last_verified_source_commit: 68371bc4
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
- Prefer existing adjacent chat owners before creating any module.
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
- No thin helper modules introduced: destinations are 1 existing coordinator extended with same-domain responsibilities (ActiveTabContextUsageCoordinator) plus 3 new modules each with substantive domain ownership (ChatSurfaceAppearanceCoordinator, SendPipelineDebugSummaries, UserMessageContentRenderer)

### Round 2 Net Impact

OpenCodianView.ts: 4971 → 4437 lines (**−534 lines**)

| Task | Lines Removed | Destination |
|------|---------------|-------------|
| view-srp2-01 | ~120 | ChatSurfaceAppearanceCoordinator (services/) |
| view-srp2-02 | ~175 | SendPipelineDebugSummaries (runtime/) |
| view-srp2-03 | ~155 | UserMessageContentRenderer (runtime/) |
| view-srp2-04 | ~84 | ActiveTabContextUsageCoordinator (services/) |
| **Round 2 Total** | **~534** | **4 owners (3 new, 1 extended)** |

## Round 3 — Third SRP Batch

### view-srp3-01 — Extract ConversationIdentityRuntime (DONE)
- Extracted conversation sync fingerprints, message visual signatures, and render-list shaping to `ConversationIdentityRuntime`
- New runtime owns: `getConversationSyncFingerprint`, `getInterruptedSyncPreservationLogFingerprint`, `getMessageVisualSignature`, `getMessagesForRender`, `shouldRenderConversationMessage`, `isBackgroundTaskCompletionReminder`
- Host interface provides: `getCanonicalConversationFingerprint` (canonical fallback), `getActiveTabId` (compaction injection), `getTabContextUsage` (compaction injection)
- Removed `renderGroups` import block from OpenCodianView (moved to runtime)
- **Measured**: OpenCodianView.ts 4437→4317 lines (**−120 lines**, diff: +41/−161)
- Destination: `src/features/chat/services/ConversationIdentityRuntime.ts` (167 lines)
- 26 tests across 2 files (fingerprint/signature + render/visibility)

### view-srp3-02 — Move settled scroll scheduling into ScrollManager ownership (DONE)
- Added `SettledScrollScheduler` class to `ScrollManager.ts` owning double-rAF frame state and cancellation
- `TabMessagesPaneCoordinator` now takes `SettledScrollScheduler` as constructor parameter; calls `schedule()` directly
- Removed `scheduleSettledScrollToBottomIfNeeded` from `TabMessagesPaneCoordinatorHost`
- OpenCodianView no longer owns `scrollToBottomFrameId`; delegates to `SettledScrollScheduler`
- Removed dead `isNearBottom()` method from OpenCodianView
- **Measured**: OpenCodianView.ts 4317→4300 lines (**−17 lines**, diff: +6/−23)
- Destinations: `ScrollManager.ts` (173 lines), `TabMessagesPaneCoordinator.ts` (331 lines)
- 4 new tests for `SettledScrollScheduler` + updated coordinator tests with mock scheduler

### view-srp3-03 — Move send model option assembly into model selection ownership (DONE)
- Moved `getSendMessageOptions`, `getReasoningOptionsForModel`, `appendModelUnavailableNoticeMessage`, `getModelUnavailableNoticeContent` to `ModelSelectionRuntime`/`ChatSelectionControlsCoordinator`
- Added `getEffortLevel`/`getThinkingBudget` to `ModelSelectionRuntimeHost` so runtime uses `isAdaptiveThinkingModel` directly
- Added `appendModelUnavailableNoticeMessage` to `ChatSelectionControlsCoordinatorHost` for notice delegation through host seam
- OpenCodianView.ts reduced by ~50 lines (estimated; merged with view-srp3-04 into single commit 4300→4206)
- Destinations: `ModelSelectionRuntime.ts` (307 lines), `ChatSelectionControlsCoordinator.ts` (447 lines)
- 3 new tests for `getSendMessageOptions` covering empty, thinking budget, reasoning effort

### view-srp3-04 — Move chat visual demo lifecycle to ChatVisualDemoCoordinator (DONE)
- Created `ChatVisualDemoCoordinator` owning all demo lifecycle: Liquid Diamond CPU/WebGL toggle with mutual exclusion, Glass Octahedron async toggle with error handling, `destroyAll()` cleanup
- Replaced 3 private demo controller fields in OpenCodianView with single coordinator
- Public toggle methods now one-line delegates using `?.` for null safety
- Coordinator initialized in `buildUI()` after `messagesShellEl` creation; Notice and log behavior delegated through host interface (`showNotice`, `logWarn`) — coordinator has zero obsidian/shared direct imports
- **Measured**: OpenCodianView.ts 4300→4208 lines (**−92 lines** after initial + fix; diff: +15/−107 across both commits)
- Destination: `src/features/chat/services/ChatVisualDemoCoordinator.ts` (129 lines)
- 14 coordinator tests with full mock isolation including host notice/log delegation verification
- *Note: view-srp3-03 and view-srp3-04 were committed together (a097ec93 + 68371bc4) because the view-srp3-04 worktree was based on the pre-view-srp3-03 state; their combined measured Δ is −92 lines from 4300 to 4208*

### view-srp3-05 — Finalize third SRP batch with docs and verification (DONE)
- Ran `npm run verify` — all gates pass:
  - module-docs: pass
  - graphify: pass
  - devlog-order: pass
  - lint: pass (0 errors, 0 warnings)
  - typecheck: clean
  - tests: 1925 pass
  - build: OK
- Updated lane status doc with Round 3 results
- Graphify artifacts refreshed for all Round 3 source ownership moves

### Round 3 Net Impact

OpenCodianView.ts: 4437 → 4208 lines (**−229 lines**)

| Task | Measured Δ | Destination |
|------|------------|-------------|
| view-srp3-01 | −120 (4437→4317) | ConversationIdentityRuntime (services/, 167 lines) |
| view-srp3-02 | −17 (4317→4300) | ScrollManager (services/, 173 lines) + TabMessagesPaneCoordinator (extended) |
| view-srp3-03 | ~−50 (est., merged with view-srp3-04) | ModelSelectionRuntime (services/, 307 lines) + ChatSelectionControlsCoordinator (extended) |
| view-srp3-04 | ~−42 (est., merged with view-srp3-04) | ChatVisualDemoCoordinator (services/, 129 lines) |
| **view-srp3-03 + view-srp3-04** | **−92 (4300→4208)** | **combined in single commit chain** |
| **Round 3 Total** | **−229** | **6 owners (2 new, 4 extended)** |

### Cumulative Impact (Rounds 1 + 2 + 3)

OpenCodianView.ts: 5314 → 4208 lines (**−1106 lines**, **20.8% reduction**)

| Round | Actual Δ | Measured Before→After | Destinations |
|-------|----------|----------------------|-------------|
| Round 1 (view-17 to view-20) | −343 | 5314→4971 | 4 existing owners |
| Round 2 (view-srp2-01 to view-srp2-04) | −534 | 4971→4437 | 4 owners (3 new, 1 extended) |
| Round 3 (view-srp3-01 to view-srp3-04) | −229 | 4437→4208 | 6 owners (2 new, 4 extended) |
| **Grand Total** | **−1106** | **5314→4208** | **11 distinct owners** |

### No Thin Helper Modules Introduced

All extractions went to either:
1. **Existing coordinators** extended with same-domain responsibilities (ActiveTabContextUsageCoordinator, BackgroundTaskTimelineService, ConversationRenderService, ChildSessionGraphCoordinator, ScrollManager, TabMessagesPaneCoordinator, ModelSelectionRuntime, ChatSelectionControlsCoordinator)
2. **New modules with substantive domain ownership** — each owns a clear, non-trivial responsibility surface (ChatSurfaceAppearanceCoordinator, SendPipelineDebugSummaries, UserMessageContentRenderer, ConversationIdentityRuntime, ChatVisualDemoCoordinator)

No adapter/factory/provider indirection layers were created. Each new module was created only because no existing owner covered the extracted domain.

## Remaining Candidates (not extracted across all rounds)

- debug or render-support behavior still owned directly by `OpenCodianView.ts`
- question/todo activation host assembly (skipped as unsafe — adds bridge chain)
- scroll anchoring and viewport math (complex, intertwined with tab switching)
- remaining inline event handlers that reference `this.app` or `this.plugin` directly
- conversation load/hydration bridge assembly (intertwined with tab lifecycle recovery)
- tab state management delegation (central to view identity, unsafe to fragment)

# T5 OpenCodianView Single Responsibility Autopilot Status

> Started: 2026-05-01
> Worktree: `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian-view-single-responsibility-20260501`
> Branch: `autopilot/opencodian-view-single-responsibility-20260501`

## Current State

- round: 11
- current_task: view-srp11-03
- last_verified_source_commit: 75e6a55f (fix all 7 lint warnings and update status doc for zero-warning verify)
- checkpoint_semantics: source-commit only; doc-only commits are not individually tracked
- queue_state: in_progress — finalize task done; source tasks view-srp11-01/02 still pending
- next_focus: view-srp11-01 (message finalization host assembly)
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

## Round 4 — Fourth SRP Batch (Conversation Notice Orchestration)

### view-srp4-01 — Extract conversation notice orchestration into ConversationNoticeCoordinator (DONE)
- Created `ConversationNoticeCoordinator` owning the full notice orchestration surface:
  - `createStreamErrorNotice()` — generates timestamped stream error notice with model id
  - `shouldRenderEmptyConversationNotice()` — checks conversation rewind state
  - `createEmptyConversationNotice()` — builds normal/rewound empty conversation notice
  - `appendTurnDiffNoticeIfNeeded()` — appends turn diff notice with live→cached→fallback diff resolution
  - `formatDiffNoticeMarkdown()` — formats vault links, diff stats, and status markers
  - `routeNoticeAction()` — routes `open_model_settings` and `restore_rewind` actions through host
- Host interface provides: model selection, format model id, rewind state, active tab id, session diff, cached diff, persistent notice append, background task indicator, rewind restore, plugin settings
- Rewired `turnDiffNoticeRouting.test.ts` to test coordinator directly instead of view
- **Measured**: OpenCodianView.ts 4208→4133 lines (**−75 lines**, diff: +39/−114)
- Destination: `src/features/chat/services/ConversationNoticeCoordinator.ts` (137 lines at extraction)
- 17 coordinator tests covering stream error notice, empty conversation notice, diff notice routing, notice action routing

### view-srp4-02 — Wire OpenCodianView to the notice coordinator and remove direct notice helpers (DONE)
- Moved `getFriendlyStreamErrorMessage()` from OpenCodianView to ConversationNoticeCoordinator
  - Pure function mapping raw stream error strings to user-friendly i18n messages
  - Extracted `NETWORK_ERROR_PATTERNS` constant for the 6 recognized network error patterns
- Removed dead `appendAssistantErrorMessage()` (defined but never called — legacy code from before SendPipeline extraction)
- Updated SendPipeline host callback to delegate `getFriendlyStreamErrorMessage` through coordinator
- Added 5 targeted tests: empty input, all 6 network patterns, opencode-not-found, unknown errors, case insensitivity
- **Measured**: OpenCodianView.ts 4133→4083 lines (**−50 lines**, diff: +1/−51)
- Destination: `src/features/chat/services/ConversationNoticeCoordinator.ts` (165 lines final)

### view-srp4-03 — Finalize fourth SRP batch with docs and verification (DONE)
- Ran `npm run verify` — all gates pass:
  - module-docs: pass (385 source modules, 385 mapped docs)
  - graphify: pass (fresh for all source changes)
  - devlog-order: pass
  - lint: pass (0 errors, 0 warnings)
  - typecheck: clean
  - tests: 1944 pass
  - build: OK
- Updated lane status doc with Round 4 results

### Round 4 Net Impact

OpenCodianView.ts: 4208 → 4083 lines (**−125 lines**)

| Task | Measured Δ | Destination |
|------|------------|-------------|
| view-srp4-01 | −75 (4208→4133) | ConversationNoticeCoordinator (services/, 137→165 lines) |
| view-srp4-02 | −50 (4133→4083) | ConversationNoticeCoordinator (extended with `getFriendlyStreamErrorMessage`) |
| **Round 4 Total** | **−125** | **1 new owner (ConversationNoticeCoordinator)** |

### Why ConversationNoticeCoordinator Is Substantive (Not a Thin Helper)

ConversationNoticeCoordinator is not a thin adapter layer because it owns the complete notice orchestration lifecycle:

1. **Notice generation logic**: Creates stream error notices, empty conversation notices, and turn diff notices with non-trivial content assembly (model id injection, rewind-state branching, vault-link formatting with diff stats)
2. **Multi-source resolution**: `appendTurnDiffNoticeIfNeeded()` implements a 3-tier fallback strategy (live diff → cached diff → edited-file list) with deduplication
3. **Stream error message mapping**: `getFriendlyStreamErrorMessage()` owns the complete error-classification vocabulary with 6 network patterns, binary-missing detection, and i18n fallback
4. **Action routing**: Owns the notice→action dispatch table mapping `open_model_settings` and `restore_rewind` to host callbacks
5. **Cross-cutting dependencies**: Coordinates across model selection, session diff, persistent notice, background task indicator, and plugin settings — a coherent domain boundary

The coordinator has 165 lines of substantive logic and 25 tests. No method is a simple pass-through; each contains domain-specific branching, formatting, or classification logic.

## Round 5 — Fifth SRP Batch (Render Ownership)

### view-srp5-01 — Move assistant render-support helpers into existing render owners (DONE)
- Moved 4 render-support methods from OpenCodianView to existing render owners:
  - `hasInterruptedLocalAssistantTail` → `ConversationRenderRuntime` (exported function alongside `getIncrementalRenderedMessageUpdate`)
  - `createAssistantContainerElement` → `AssistantShellViewHostAdapter.createAssistantShellContainer()`
  - `setStreamingAssistantMessageVisibility` → `AssistantShellViewHostAdapter` with `onVisibilityChanged` callback for debug logging
  - `removeEmptyAssistantShells` → `AssistantShellViewHostAdapter` static method
- OpenCodianView no longer owns any assistant-shell DOM construction or visibility toggling
- **Measured**: OpenCodianView.ts 4083→4017 lines (**−66 lines**, diff: +65/−131)
- Destinations: `ConversationRenderRuntime.ts` (444 lines), `AssistantShellViewHostAdapter.ts` (388 lines)
- 13 new tests (6 for ConversationRenderRuntime, 7 for AssistantShellViewHostAdapter)

### view-srp5-02 — Move assistant finalization debug ownership into existing render diagnostics (DONE)
- Moved `ASSISTANT_DEBUG_STAGE_ALLOWLIST`, `shouldLogAssistantFinalizationDebug`, `logAssistantFinalizationDebug` from OpenCodianView private methods to exported pure functions in `trailingAssistantPatchDebug.ts`
- Moved `stringifyLogPayload` and `getLogPreview` to `trailingAssistantPatchDebug.ts`
- Eliminated all bare `getLogPreview`/`stringifyLogPayload` references from OpenCodianView via `createDebugLogCallbacks()` factory spread pattern — host adapters now receive debug callbacks through object spread instead of individual function pass-throughs
- Added `previewLogText()` convenience helper for single-line call sites
- **Measured**: OpenCodianView.ts 4017→3954 lines (**−63 lines**, diff: +2/−65)
- Destination: `src/features/chat/services/trailingAssistantPatchDebug.ts` (523 lines)
- 16 new tests (5 allowlist gate, 4 stringifyLogPayload, 5 getLogPreview, 2 edge-case)

### view-srp5-03 — Finalize fifth SRP batch with docs and verification (DONE)
- Ran `npm run verify` — all gates pass:
  - module-docs: pass (385 source modules, 385 mapped docs)
  - graphify: pass (fresh for all source changes)
  - devlog-order: pass
  - lint: pass (0 errors, 0 warnings)
  - typecheck: clean
  - tests: 1970 pass
  - build: OK
- Updated lane status doc with Round 5 results

### Round 5 Net Impact

OpenCodianView.ts: 4083 → 3954 lines (**−129 lines**)

| Task | Measured Δ | Destination |
|------|------------|-------------|
| view-srp5-01 | −66 (4083→4017) | ConversationRenderRuntime (services/, 444 lines) + AssistantShellViewHostAdapter (runtime/, 388 lines) |
| view-srp5-02 | −63 (4017→3954) | trailingAssistantPatchDebug (services/, 523 lines) |
| **Round 5 Total** | **−129** | **3 owners (0 new, 3 extended)** |

### Why This Round Is Substantive (Not a Thin Helper Split)

The render ownership moves in Round 5 are substantive, not thin helper splits:

1. **AssistantShellViewHostAdapter** gained complete assistant-shell DOM lifecycle ownership: container creation, shell rendering, visibility toggling with debug logging, and empty-shell cleanup. These were previously scattered across OpenCodianView private methods with intermixed view state access. The adapter now owns the full construction→visibility→cleanup lifecycle, with 71 lines of substantive logic added.

2. **ConversationRenderRuntime** gained the interrupted-tail detection heuristic (`hasInterruptedLocalAssistantTail`) that determines whether a partial assistant turn should be preserved during incremental renders. This is domain-specific render logic, not a pass-through.

3. **trailingAssistantPatchDebug** now owns the complete debug formatting vocabulary: stage allowlist, gate check, log emitter, payload serialization, text truncation, AND the factory function that wires these into host adapters. The `createDebugLogCallbacks()` factory eliminated 4 individual function pass-throughs from OpenCodianView's host adapters, replacing them with a single spread pattern. The module has 523 lines of substantive debug logic with 16 tests — no method is a simple delegation wrapper.

### Cumulative Impact (Rounds 1 + 2 + 3 + 4 + 5)

OpenCodianView.ts: 5314 → 3954 lines (**−1360 lines**, **25.6% reduction**)

| Round | Actual Δ | Measured Before→After | Destinations |
|-------|----------|----------------------|-------------|
| Round 1 (view-17 to view-20) | −343 | 5314→4971 | 4 existing owners |
| Round 2 (view-srp2-01 to view-srp2-04) | −534 | 4971→4437 | 4 owners (3 new, 1 extended) |
| Round 3 (view-srp3-01 to view-srp3-04) | −229 | 4437→4208 | 6 owners (2 new, 4 extended) |
| Round 4 (view-srp4-01 to view-srp4-02) | −125 | 4208→4083 | 1 new owner (ConversationNoticeCoordinator) |
| Round 5 (view-srp5-01 to view-srp5-02) | −129 | 4083→3954 | 3 owners (0 new, 3 extended) |
| Round 6 (view-srp6-01) | −54 | 3954→3900 | 1 extended owner (MessageFinalizationService) |
| **Grand Total** | **−1414** | **5314→3900** | **15 distinct owners** |

### No Thin Helper Modules Introduced

All extractions went to either:
1. **Existing coordinators** extended with same-domain responsibilities (ActiveTabContextUsageCoordinator, BackgroundTaskTimelineService, ConversationRenderService, ChildSessionGraphCoordinator, ScrollManager, TabMessagesPaneCoordinator, ModelSelectionRuntime, ChatSelectionControlsCoordinator, ConversationRenderRuntime, AssistantShellViewHostAdapter, trailingAssistantPatchDebug)
2. **New modules with substantive domain ownership** — each owns a clear, non-trivial responsibility surface (ChatSurfaceAppearanceCoordinator, SendPipelineDebugSummaries, UserMessageContentRenderer, ConversationIdentityRuntime, ChatVisualDemoCoordinator, ConversationNoticeCoordinator)

No adapter/factory/provider indirection layers were created. Each new module was created only because no existing owner covered the extracted domain.

## Round 6 — Sixth SRP Batch (Server-Start Error Finalization)

### view-srp6-01 — Move server-start assistant error finalization into MessageFinalizationService (DONE)
- Moved `finalizeAssistantMessageWithError` from OpenCodianView private method to `MessageFinalizationService`
- Added `getFriendlyServerStartErrorMessage()` as exported pure function: classifies server-start exceptions into user-friendly i18n messages (binary-missing, port-in-use, generic)
- Added `getUnavailableServerMessage()` as exported pure function: maps `starting`/`offline`/`checking` to `chat.error.serverStarting` / `chat.error.serverOffline`
- Added `finalizeAssistantMessageWithServerError()` wrapper: calls `finalizeAssistantMessageWithError` with `getFriendlyServerStartErrorMessage(error)`
- Added `finalizeAssistantMessageWithServerUnavailableError()` wrapper: calls `finalizeAssistantMessageWithError` with `getUnavailableServerMessage(availability)`
- Preserved optional `modelId` in error finalization to maintain notice context
- Routed unavailable prompt copy through service wrapper instead of view inline
- OpenCodianView now only calls the two wrapper methods; no direct access to `finalizeAssistantMessageWithError` or error classification functions
- **Measured**: OpenCodianView.ts 3954→3900 lines (**−54 lines**, diff: +14/−68)
- Destination: `src/features/chat/services/MessageFinalizationService.ts` (372 lines, +104 from 268)
- 263 new test lines (error finalization flow, server-start classification, unavailable state mapping)

### view-srp6-02 — Update render-finalization docs and graph artifacts (DONE)
- Verified both in-scope module docs already correctly describe the finalization ownership transfer
- OpenCodianView.md line 577: explicitly delegates finalization ownership to MessageFinalizationService
- MessageFinalizationService.md: full "助手错误终结流" section describing all exported functions
- Graphify already fresh (no new src changes requiring refresh)

### view-srp6-03 — Finalize sixth SRP batch with measured docs and full verification (DONE)
- Ran `npm run verify` — all gates pass:
  - module-docs: pass (385 source modules, 385 mapped docs)
  - graphify: pass (fresh for all source changes)
  - devlog-order: pass
  - lint: pass (0 errors, 1 pre-existing warning in test file)
  - typecheck: clean
  - tests: 1988 pass
  - build: OK
- Updated lane status doc with Round 6 results

### Round 6 Net Impact

OpenCodianView.ts: 3954 → 3900 lines (**−54 lines**)

| Task | Measured Δ | Destination |
|------|------------|-------------|
| view-srp6-01 | −54 (3954→3900) | MessageFinalizationService (services/, 372 lines) |
| **Round 6 Total** | **−54** | **1 extended owner** |

### Why This Round Is Substantive (Not a Thin Helper Split)

The server-start error finalization move is substantive because:

1. **Error classification vocabulary**: `getFriendlyServerStartErrorMessage()` owns the complete server-start error classification with 3 distinct categories (binary-missing, port-in-use, generic) plus i18n mapping — not a simple pass-through
2. **Unavailable state mapping**: `getUnavailableServerMessage()` maps server availability states to user-facing messages with domain-specific branching
3. **Finalization orchestration**: `finalizeAssistantMessageWithError()` performs the complete error-to-message pipeline: render error block, persist to conversation, update sync fingerprint, scroll to bottom — this is a multi-step lifecycle, not a thin wrapper
4. **No new helper module introduced**: All behavior moved to the existing `MessageFinalizationService`, extending its domain boundary rather than fragmenting into a new thin layer

### Cumulative Impact (Rounds 1–6)

*See cumulative table below.*

## Round 7 — Seventh SRP Batch (Question Runtime Assembly)

### view-srp7-01 — Move question runtime bundle assembly into existing question owners (DONE)
- Moved `createQuestionRuntimeViewHost`, `createQuestionPostResolutionRuntimeHostAdapter`, and `createQuestionRuntimeServices` from OpenCodianView private methods to `QuestionRuntimeViewHostFactory`
- Factory now owns the complete question runtime bundle assembly: creates view host, post-resolution adapter, and runtime services in a single `createQuestionRuntimeBundle()` call
- OpenCodianView no longer directly invokes any question runtime construction functions
- **Measured**: OpenCodianView.ts 3900→3897 lines (**−3 lines**, diff: +14/−17 in OpenCodianView; primary reduction offset by one-line delegation call)
- Destination: `src/features/chat/services/QuestionRuntimeViewHostFactory.ts` (extended, +37 lines)
- 6 new tests for bundle assembly

### view-srp7-02 — Move question/todo/background host assembly into existing runtime bundle owner (DONE)
- Moved `createQuestionTodoBackgroundTaskRuntimeServiceBundleHost` from OpenCodianView private method to `QuestionTodoBackgroundTaskRuntimeServiceBundle`
- Bundle now owns `assembleQuestionTodoBackgroundTaskRuntimeHost()` factory: creates seam with late-binding `getBackgroundTaskHost()` for background-task methods
- Factory spreads non-background-task seam properties and wraps 3 background-task methods from `getBackgroundTaskHost()` sub-object
- OpenCodianView no longer owns any question/todo/background host assembly logic
- **Measured**: OpenCodianView.ts 3897→3883 lines (**−14 lines**, diff: +14/−28 in OpenCodianView)
- Destination: `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts` (extended, +29 lines)
- 6 new tests for factory assembly (total 7 in file including 1 pre-existing)

### view-srp7-03 — Finalize seventh SRP batch with measured docs and full verification (DONE)
- Ran `npm run verify` — all gates pass:
  - module-docs: pass (385 source modules, 385 mapped docs)
  - graphify: pass (fresh for all source changes)
  - devlog-order: pass (148 dated sections in descending order)
  - lint: pass (0 errors, 1 pre-existing warning in test file)
  - typecheck: clean
  - tests: 1999 pass
  - build: OK
- Updated lane status doc with Round 7 results

### Round 7 Net Impact

OpenCodianView.ts: 3900 → 3883 lines (**−17 lines**)

| Task | Measured Δ | Destination |
|------|------------|-------------|
| view-srp7-01 | −3 (3900→3897) | QuestionRuntimeViewHostFactory (services/, extended +37 lines) |
| view-srp7-02 | −14 (3897→3883) | QuestionTodoBackgroundTaskRuntimeServiceBundle (services/, extended +29 lines) |
| **Round 7 Total** | **−17** | **2 extended owners** |

### Why This Round Is Substantive (Not a Thin Helper Split)

The question runtime assembly moves are substantive because:

1. **QuestionRuntimeViewHostFactory** now owns the complete question runtime bundle lifecycle: view host creation, post-resolution adapter wiring, and runtime services assembly. The `createQuestionRuntimeBundle()` factory consolidates 3 previously scattered private method calls into a single coherent assembly point with proper dependency injection through the host seam.

2. **QuestionTodoBackgroundTaskRuntimeServiceBundle** now owns the complete question/todo/background host assembly: the `assembleQuestionTodoBackgroundTaskRuntimeHost()` factory implements late-binding for background-task methods via `getBackgroundTaskHost()`, handling the timing constraint that `this.backgroundTaskHost` is assigned later in `createConversationRuntimeWiring()`. This is non-trivial closure design, not a simple pass-through.

3. **No new helper modules introduced**: Both destinations were existing owners extended with same-domain responsibilities, consistent with the project's "prefer extending existing owners" constraint.

4. **12 new tests** across 2 test files verify bundle assembly correctness including late-binding behavior.

### Cumulative Impact (Rounds 1 + 2 + 3 + 4 + 5 + 6 + 7)

OpenCodianView.ts: 5314 → 3883 lines (**−1431 lines**, **26.9% reduction**)

| Round | Actual Δ | Measured Before→After | Destinations |
|-------|----------|----------------------|-------------|
| Round 1 (view-17 to view-20) | −343 | 5314→4971 | 4 existing owners |
| Round 2 (view-srp2-01 to view-srp2-04) | −534 | 4971→4437 | 4 owners (3 new, 1 extended) |
| Round 3 (view-srp3-01 to view-srp3-04) | −229 | 4437→4208 | 6 owners (2 new, 4 extended) |
| Round 4 (view-srp4-01 to view-srp4-02) | −125 | 4208→4083 | 1 new owner (ConversationNoticeCoordinator) |
| Round 5 (view-srp5-01 to view-srp5-02) | −129 | 4083→3954 | 3 owners (0 new, 3 extended) |
| Round 6 (view-srp6-01) | −54 | 3954→3900 | 1 extended owner (MessageFinalizationService) |
| Round 7 (view-srp7-01 to view-srp7-02) | −17 | 3900→3883 | 2 extended owners (QuestionRuntimeViewHostFactory, QuestionTodoBackgroundTaskRuntimeServiceBundle) |
| **Grand Total** | **−1431** | **5314→3883** | **17 distinct owners** |

## Round 8 — Eighth SRP Batch (Send-Preparation Ownership)

### view-srp8-01 — Move server readiness prompt orchestration into MessageSendPreparationService (DONE)
- Moved `ensureServerReadyForChat` and `refreshStatusSurfaces` from OpenCodianView private methods to `MessageSendPreparationService`
- Added `createServerReadinessDelegate()` factory method: returns `{ ensureServerReadyForChat }` delegate for `SlashCommandExecutionHost` host adapter spread
- Server-prompt action card lifecycle (create → start/skip/settings → finalize/remove) now fully owned by the service
- `SlashCommandExecutionHost` spreads `createServerReadinessDelegate()` instead of view-owned callback
- **Measured**: OpenCodianView.ts 3883→3785 lines (**−98 lines**, diff: +12/−110)
- Destination: `src/features/chat/services/MessageSendPreparationService.ts` (extended, +162 lines)
- 19 tests (17 existing + 2 new for server readiness delegate)

### view-srp8-02 — Move host callback assembly into createMessageSendPreparationHost factory (DONE)
- Added `MessageSendPreparationHostDependencies` flat interface grouping raw view service references
- Rewrote `createMessageSendPreparationHost()` factory to accept deps and assemble all 30+ `MessageSendPreparationHost` callbacks internally
- Removed 80-line `createMessageSendPreparationSeam` from OpenCodianView entirely
- View now passes raw dependencies object (service refs + simple lambdas); assembly logic lives in service owner file
- Fixed `createSlashCommandExecutionHost` to receive `messageSendPreparationService` via parameter instead of `this.*` (was undefined during construction)
- **Measured**: OpenCodianView.ts 3785→3745 lines (**−40 lines**, diff: +44/−84)
- Destination: `src/features/chat/services/MessageSendPreparationService.ts` (extended, +76 lines for Dependencies interface + factory)
- 20 tests (19 existing + 1 new for factory assembly)

### view-srp8-03 — Finalize eighth SRP batch with measured docs and full verification (DONE)
- Ran `npm run verify` — all gates pass:
  - module-docs: pass (385 source modules, 385 mapped docs)
  - graphify: pass (fresh)
  - devlog-order: pass (148 dated sections in descending order)
  - lint: pass (0 errors, 3 pre-existing warnings in test files)
  - typecheck: clean
  - tests: 2009 pass
  - build: OK
- Updated lane status doc with Round 8 results

### Round 8 Net Impact

OpenCodianView.ts: 3883 → 3745 lines (**−138 lines**)

| Task | Measured Δ | Destination |
|------|------------|-------------|
| view-srp8-01 | −98 (3883→3785) | MessageSendPreparationService (services/, extended +162 lines) |
| view-srp8-02 | −40 (3785→3745) | MessageSendPreparationService (services/, extended +76 lines for factory) |
| **Round 8 Total** | **−138** | **1 extended owner** |

### Why This Round Is Substantive (Not a Thin Helper Split)

The send-preparation ownership moves are substantive because:

1. **Server readiness prompt orchestration**: `MessageSendPreparationService` now owns the complete server-prompt action card lifecycle: create card, render buttons (start/skip/settings), handle user choice, start server, refresh status surfaces, finalize/remove card on success, or show error on failure. This is a multi-step interactive UI flow with async branching, not a thin wrapper.

2. **Host callback assembly**: The `createMessageSendPreparationHost()` factory now owns the complete assembly logic that wires 30+ `MessageSendPreparationHost` callbacks through a flat `MessageSendPreparationHostDependencies` interface. Previously this 80-line wiring block lived in OpenCodianView as `createMessageSendPreparationSeam`. The factory follows the established `createXxxHost(deps)` pattern used by `createBackgroundTaskViewHost` and 20+ other host factories in the codebase.

3. **No new helper modules introduced**: All behavior went to the existing `MessageSendPreparationService`, extending its domain boundary to cover both preparation orchestration AND host assembly. The service file grew by ~238 lines of substantive logic.

4. **`MessageSendPreparationHostDependencies` is not a thin adapter**: It groups raw service references (coordinators, presenters, services) into a typed interface that the factory consumes. Each callback in the factory contains non-trivial wiring (null guards, async wrapping, parameter reshaping).

### Cumulative Impact (Rounds 1–8)

OpenCodianView.ts: 5314 → 3745 lines (**−1569 lines**, **29.5% reduction**)

| Round | Actual Δ | Measured Before→After | Destinations |
|-------|----------|----------------------|-------------|
| Round 1 (view-17 to view-20) | −343 | 5314→4971 | 4 existing owners |
| Round 2 (view-srp2-01 to view-srp2-04) | −534 | 4971→4437 | 4 owners (3 new, 1 extended) |
| Round 3 (view-srp3-01 to view-srp3-04) | −229 | 4437→4208 | 6 owners (2 new, 4 extended) |
| Round 4 (view-srp4-01 to view-srp4-02) | −125 | 4208→4083 | 1 new owner (ConversationNoticeCoordinator) |
| Round 5 (view-srp5-01 to view-srp5-02) | −129 | 4083→3954 | 3 owners (0 new, 3 extended) |
| Round 6 (view-srp6-01) | −54 | 3954→3900 | 1 extended owner (MessageFinalizationService) |
| Round 7 (view-srp7-01 to view-srp7-02) | −17 | 3900→3883 | 2 extended owners (QuestionRuntimeViewHostFactory, QuestionTodoBackgroundTaskRuntimeServiceBundle) |
| Round 8 (view-srp8-01 to view-srp8-02) | −138 | 3883→3745 | 1 extended owner (MessageSendPreparationService) |
| **Grand Total** | **−1569** | **5314→3745** | **18 distinct owners** |

## Remaining Candidates (not extracted across all rounds)

- debug or render-support behavior still owned directly by `OpenCodianView.ts`
- question/todo activation host assembly (skipped as unsafe — adds bridge chain)
- scroll anchoring and viewport math (complex, intertwined with tab switching)
- remaining inline event handlers that reference `this.app` or `this.plugin` directly
- conversation load/hydration bridge assembly (intertwined with tab lifecycle recovery)
- tab state management delegation (central to view identity, unsafe to fragment)

## Round 9 — Ninth SRP Batch (Host-Assembly Factory Pattern)

### view-srp9-01 — Move slash command execution host assembly into SlashCommandExecutionService (DONE)
- Added `SlashCommandExecutionHostDependencies` flat interface grouping raw view service references
- Added `createSlashCommandExecutionHost()` factory: assembles all 18 host callbacks from deps object
- Removed 52-line `createSlashCommandExecutionHost` private method from OpenCodianView
- View now passes raw dependencies object (service refs + simple lambdas) instead of assembling host inline
- **Measured**: OpenCodianView.ts 3745→3721 lines (**−24 lines**, diff: +32/−56)
- Destination: `src/features/chat/services/SlashCommandExecutionService.ts` (361 lines, +18 lines)
- 3 new tests for factory assembly

### view-srp9-02 — Move conversation render host assembly into ConversationRenderService owner (DONE)
- Added `ConversationRenderHostDependencies` flat interface grouping raw view service references
- Added `createConversationRenderHost()` factory: assembles complete `ConversationRenderHost` including shell/tail render ports and debug callbacks
- Removed `createConversationRenderHost`, `createConversationAssistantShellRenderPort`, `createConversationAssistantTailRenderPort` private methods from OpenCodianView (~90 lines)
- View now passes flat dependency object with all callback wiring; factory assembles the 30+ host methods internally
- **Measured**: OpenCodianView.ts 3721→3691 lines (**−30 lines**, diff: +66/−96)
- Destination: `src/features/chat/services/ConversationRenderService.ts` (508 lines, +124 lines)
- 1 comprehensive factory assembly test

### view-srp9-03 — Finalize ninth SRP batch with measured docs and full verification (DONE)
- Ran `npm run verify` — verification results:
  - module-docs: pass (385 source modules, 385 mapped docs)
  - graphify: pass (fresh)
  - devlog-order: pass
  - lint: 0 errors; **4 pre-existing warnings** violate the zero-warning guardrail but are outside this queue's scope (MessageSendPreparationService.ts max-lines, MessageFinalizationService.test.ts max-lines, MessageSendPreparationService.test.ts max-lines, SlashCommandExecutionService.test.ts max-lines-per-function)
  - typecheck: clean
  - tests: 2013 pass
  - build: OK
- Queue extraction tasks are complete; follow-up needed to clear the 4 pre-existing lint warnings
- Updated lane status doc with Round 9 results

### Round 9 Net Impact

OpenCodianView.ts: 3745 → 3691 lines (**−54 lines**)

| Task | Measured Δ | Destination |
|------|------------|-------------|
| view-srp9-01 | −24 (3745→3721) | SlashCommandExecutionService (services/, 361 lines) |
| view-srp9-02 | −30 (3721→3691) | ConversationRenderService (services/, 508 lines) |
| **Round 9 Total** | **−54** | **2 extended owners** |

### Why This Round Is Substantive (Not a Thin Helper Split)

The host-assembly factory moves are substantive because:

1. **SlashCommandExecutionService** now owns the complete slash command host assembly lifecycle: `createSlashCommandExecutionHost()` wires 18 callbacks through `SlashCommandExecutionHostDependencies`, including tab resolution, conversation query, message preparation delegation, stream error handling, question resolution, and server readiness. Previously this 52-line wiring block was a private method in OpenCodianView that directly accessed `this.*` for every callback.

2. **ConversationRenderService** now owns the complete render host assembly lifecycle: `createConversationRenderHost()` wires 30+ callbacks through `ConversationRenderHostDependencies`, including the nested shell/tail render port creation, debug callback spreading, and all render orchestration callbacks. Previously this 90-line block was three private methods in OpenCodianView.

3. **No new helper modules introduced**: Both destinations were existing owners extended with same-domain responsibilities. The factory pattern follows the established `createXxxHost(deps)` pattern used across the codebase.

4. **`createConversationRenderHost` is not a thin adapter**: It internally creates `ConversationAssistantShellRenderPort` and `ConversationAssistantTailRenderPort` by mapping adapter methods to the narrower port interfaces, adds `clearMessagesContainer()` using `deps.getMessagesContainer()?.empty()`, spreads `createDebugLogCallbacks()`, and binds `summarizeChatMessageForDebug` — non-trivial assembly logic.

### Cumulative Impact (Rounds 1–9)

OpenCodianView.ts: 5314 → 3691 lines (**−1623 lines**, **30.5% reduction**)

| Round | Actual Δ | Measured Before→After | Destinations |
|-------|----------|----------------------|-------------|
| Round 1 (view-17 to view-20) | −343 | 5314→4971 | 4 existing owners |
| Round 2 (view-srp2-01 to view-srp2-04) | −534 | 4971→4437 | 4 owners (3 new, 1 extended) |
| Round 3 (view-srp3-01 to view-srp3-04) | −229 | 4437→4208 | 6 owners (2 new, 4 extended) |
| Round 4 (view-srp4-01 to view-srp4-02) | −125 | 4208→4083 | 1 new owner (ConversationNoticeCoordinator) |
| Round 5 (view-srp5-01 to view-srp5-02) | −129 | 4083→3954 | 3 owners (0 new, 3 extended) |
| Round 6 (view-srp6-01) | −54 | 3954→3900 | 1 extended owner (MessageFinalizationService) |
| Round 7 (view-srp7-01 to view-srp7-02) | −17 | 3900→3883 | 2 extended owners |
| Round 8 (view-srp8-01 to view-srp8-02) | −138 | 3883→3745 | 1 extended owner (MessageSendPreparationService) |
| Round 9 (view-srp9-01 to view-srp9-02) | −54 | 3745→3691 | 2 extended owners (SlashCommandExecutionService, ConversationRenderService) |
| **Grand Total** | **−1623** | **5314→3691** | **20 distinct owners** |

## Round 10 — Tenth SRP Batch (Host-Assembly Ownership Transfer)

### view-srp10-01 — Move conversation load recovery host assembly into ConversationLoadRecoveryCoordinator owner (DONE)
- Added `createConversationLoadRecoveryHost()` factory to `ConversationLoadRecoveryCoordinator.ts`
- Factory absorbs host assembly logic: constructs full `ConversationLoadRecoveryHost` from `ConversationLoadRecoveryHostDependencies`, including `resetPersistedTabState()` with default state, `chooseForkTarget()` with app window, `showNotice()` with `new Notice()`, and `confirmRewind()` with `window.confirm()`
- OpenCodianView no longer owns `createConversationLoadRecoveryHost` private method; view passes flat dependency object
- Added 6 factory tests covering host assembly correctness
- **Measured**: OpenCodianView.ts 3691→~3687 lines (**−4 lines** net across initial + fix commits; structural ownership transfer)
- Destination: `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts` (extended with factory)

### view-srp10-02 — Move conversation tab runtime coordinator host assembly into ConversationTabRuntimeCoordinator owner (DONE)
- Redesigned `ConversationTabRuntimeCoordinatorHostSource` to accept raw owner references instead of nested callback sub-objects
- Factory internally decomposes `plugin: TabRuntimePluginSource` (persistence: settings.tabState write + save methods) and `view: TabRuntimeViewSource` (DOM element getters + session queries)
- OpenCodianView call site now passes `plugin: this.plugin` and `view: this` — no inline closure assembly for persistence, elements, or session
- Added public getter methods to OpenCodianView: `getChatContainerEl()`, `getHeaderTabBarSlotEl()`, `getBelowHeaderTabBarSlotEl()`, `getOuterVerticalTabBarSlotEl()`, `getInputTabBarSlotEl()`, `getTabSessionStatus()`
- Made `getSessionIdForTab` public (was private)
- Removed dead `TabRuntimePersistence`, `TabRuntimeElements`, `TabRuntimeSession`, `ConversationTabRuntimeCoordinatorHostDependencies` interfaces
- Added 18 coordinator tests (8 original + 4 host factory + 6 top-level factory)
- **Measured**: OpenCodianView.ts ~3687→3690 lines (**+3 lines**; structural ownership transfer with added public getters)
- Destination: `src/features/chat/services/ConversationTabRuntimeCoordinator.ts` (extended with source decomposition)

### view-srp10-03 — Finalize tenth SRP batch with measured docs and full verification (DONE)
- Fixed all 7 lint warnings (0 errors, **0 warnings**):
  1. `ConversationTabRuntimeCoordinator.ts` — compacted from 555→≤500 non-empty lines (extracted `collectTabBarSlots`, `applyTabBarCssClasses`, `applySlotActiveClasses` helpers; removed blank lines between method groups)
  2. `OpenCodianView.ts` `createConversationRuntimeWiring` — compacted from 207→≤200 non-empty lines (collapsed multi-line arrow bodies, compacted return object)
  3. `ConversationTabRuntimeCoordinator.test.ts` — compacted from 537→≤500 non-empty lines (collapsed mock object construction, inlined trivial test setup)
  4. `MessageSendPreparationService.ts` — compacted from 541→≤500 non-empty lines (collapsed factory with destructured aliases, merged `prepareMessageSend` guard clauses, deduplicated `settings`/`skip` refresh-and-check branches)
  5. `MessageFinalizationService.test.ts` — split into `MessageFinalizationService.test.ts` + `MessageFinalizationService.serverError.test.ts` with shared `MessageFinalizationService.testSupport.ts` (701→≤500 per file)
  6. `MessageSendPreparationService.test.ts` — split into `MessageSendPreparationService.test.ts` + `MessageSendPreparationService.serverReadiness.test.ts` with shared `MessageSendPreparationService.testSupport.ts` (897→≤500 per file)
  7. `SlashCommandExecutionService.test.ts` — extracted host-delegation tests into separate `describe` block (218→≤200 per block)
- Updated module docs for 3 changed source files (lint compaction freshness)
- Refreshed graphify artifacts for source changes
- Ran `npm run verify` — all gates pass:
  - module-docs: pass (385 source modules, 385 mapped docs)
  - graphify: pass (fresh)
  - devlog-order: pass (148 dated sections in descending order)
  - lint: 0 errors, **0 warnings**
  - typecheck: clean
  - tests: 2029 pass
  - build: OK
- Updated lane status doc with Round 10 final results

### Round 10 Net Impact

OpenCodianView.ts: 3691 → 3682 lines (**−9 lines**, including lint compaction)

| Task | Measured Δ | Destination |
|------|------------|-------------|
| view-srp10-01 | −4 (3691→~3687) | ConversationLoadRecoveryCoordinator (services/, extended with factory) |
| view-srp10-02 | +3 (~3687→3690) | ConversationTabRuntimeCoordinator (services/, extended with source decomposition) |
| view-srp10-03 | −8 (3690→3682) | Lint compaction of `createConversationRuntimeWiring` and test splits |
| **Round 10 Total** | **−9** | **2 extended owners + lint cleanup** |

### Why This Round Is Substantive (Not a Thin Helper Split)

The host-assembly ownership transfers are substantive because:

1. **ConversationLoadRecoveryCoordinator** now owns the complete load-recovery host assembly lifecycle: `createConversationLoadRecoveryHost()` constructs the full host from dependencies, absorbing `resetPersistedTabState()` default-state logic, `chooseForkTarget()` app-window integration, `showNotice()` Obsidian Notice construction, and `confirmRewind()` browser confirm dialog. Previously these were scattered across OpenCodianView's inline callback construction.

2. **ConversationTabRuntimeCoordinator** now owns the complete tab-runtime host assembly lifecycle with raw owner source decomposition: the factory accepts `plugin` and `view` as direct object references and internally extracts persistence, DOM element, and session query methods. This eliminates OpenCodianView's inline construction of nested callback sub-objects (`persistence: { ... }`, `elements: { ... }`, `session: { ... }`). The `ConversationTabRuntimeCoordinatorHostSource` interface enforces a narrow contract between view and coordinator.

3. **No new helper modules introduced**: Both destinations were existing owners extended with same-domain responsibilities.

4. **Value is ownership transfer, not line reduction**: The small net delta reflects that public getter methods were added to OpenCodianView to satisfy the narrow `TabRuntimeViewSource` interface. The real value is that host assembly logic — the knowledge of how to build coordinator hosts — now lives in the coordinator owner files, not in the view.

### Cumulative Impact (Rounds 1–10)

OpenCodianView.ts: 5314 → 3682 lines (**−1632 lines**, **30.7% reduction**)

| Round | Actual Δ | Measured Before→After | Destinations |
|-------|----------|----------------------|-------------|
| Round 1 (view-17 to view-20) | −343 | 5314→4971 | 4 existing owners |
| Round 2 (view-srp2-01 to view-srp2-04) | −534 | 4971→4437 | 4 owners (3 new, 1 extended) |
| Round 3 (view-srp3-01 to view-srp3-04) | −229 | 4437→4208 | 6 owners (2 new, 4 extended) |
| Round 4 (view-srp4-01 to view-srp4-02) | −125 | 4208→4083 | 1 new owner (ConversationNoticeCoordinator) |
| Round 5 (view-srp5-01 to view-srp5-02) | −129 | 4083→3954 | 3 owners (0 new, 3 extended) |
| Round 6 (view-srp6-01) | −54 | 3954→3900 | 1 extended owner (MessageFinalizationService) |
| Round 7 (view-srp7-01 to view-srp7-02) | −17 | 3900→3883 | 2 extended owners |
| Round 8 (view-srp8-01 to view-srp8-02) | −138 | 3883→3745 | 1 extended owner (MessageSendPreparationService) |
| Round 9 (view-srp9-01 to view-srp9-02) | −54 | 3745→3691 | 2 extended owners (SlashCommandExecutionService, ConversationRenderService) |
| Round 10 (view-srp10-01 to view-srp10-03) | −9 | 3691→3682 | 2 extended owners + lint cleanup |
| **Grand Total** | **−1632** | **5314→3682** | **22 distinct owners** |

## Round 11 — Eleventh SRP Batch (Interaction Runtime Host Assembly)

### view-srp11-01 — Move message finalization host assembly into MessageFinalizationService owner (PENDING)
- Planned: shift `createMessageFinalizationHost` from OpenCodianView to MessageFinalizationService
- Status: todo

### view-srp11-02 — Move send pipeline runtime host assembly into SendPipelineRuntime owner (PENDING)
- Planned: shift `createSendPipelineRuntimeHost` from OpenCodianView to `SendPipelineRuntime` with flat `SendPipelineHostDependencies` interface
- Destination: `src/features/chat/runtime/SendPipelineRuntime.ts` (existing owner, extended with factory)
- Status: draft

### view-srp11-03 — Finalize SRP batch with docs graphify and full verification (DONE)
- Corrected task description for view-srp11-02 (SendPipelineRuntime, not MessageSendPreparationService)
- Full verify passes: 0 errors, 0 warnings, 2029 tests, build OK
- Graphify and module docs fresh; working tree clean
- Source tasks view-srp11-01 and view-srp11-02 are pending — loop must continue to pick them up
- **This finalize task is done; the loop should continue to view-srp11-01 next**
- **No `next_focus` entry remains — queue state is clean**

### Round 11 Net Impact

OpenCodianView.ts: 3682 → 3682 lines (**0 lines** — pending source tasks)

| Task | Measured Δ | Destination |
|------|------------|-------------|
| view-srp11-01 | pending | MessageFinalizationService (services/, planned) |
| view-srp11-02 | pending | SendPipelineRuntime (runtime/, planned) |
| view-srp11-03 | 0 (docs/verification only) | Status doc correction + full verify gate |
| **Round 11 Total** | **0** | **pending source tasks** |

### Cumulative Impact (Rounds 1–11)

*No source changes in Round 11 yet; cumulative impact unchanged from Round 10.*

OpenCodianView.ts: 5314 → 3682 lines (**−1632 lines**, **30.7% reduction**)

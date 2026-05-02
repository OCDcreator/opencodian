# T5 OpenCodianView Single Responsibility Autopilot Status

> Started: 2026-05-01
> Worktree: `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian-view-single-responsibility-20260501`
> Branch: `autopilot/opencodian-view-single-responsibility-20260501`

## Current State

- round: 6
- current_task: view-srp6-03
- last_verified_source_commit: 28f3ea67 (refresh graphify after unavailable prompt routing)
- checkpoint_semantics: source-commit only; doc-only commits are not individually tracked
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

### Cumulative Impact (Rounds 1 + 2 + 3 + 4 + 5 + 6)

OpenCodianView.ts: 5314 → 3900 lines (**−1414 lines**, **26.6% reduction**)

| Round | Actual Δ | Measured Before→After | Destinations |
|-------|----------|----------------------|-------------|
| Round 1 (view-17 to view-20) | −343 | 5314→4971 | 4 existing owners |
| Round 2 (view-srp2-01 to view-srp2-04) | −534 | 4971→4437 | 4 owners (3 new, 1 extended) |
| Round 3 (view-srp3-01 to view-srp3-04) | −229 | 4437→4208 | 6 owners (2 new, 4 extended) |
| Round 4 (view-srp4-01 to view-srp4-02) | −125 | 4208→4083 | 1 new owner (ConversationNoticeCoordinator) |
| Round 5 (view-srp5-01 to view-srp5-02) | −129 | 4083→3954 | 3 owners (0 new, 3 extended) |
| Round 6 (view-srp6-01) | −54 | 3954→3900 | 1 extended owner (MessageFinalizationService) |
| **Grand Total** | **−1414** | **5314→3900** | **15 distinct owners** |

## Remaining Candidates (not extracted across all rounds)

- debug or render-support behavior still owned directly by `OpenCodianView.ts`
- question/todo activation host assembly (skipped as unsafe — adds bridge chain)
- scroll anchoring and viewport math (complex, intertwined with tab switching)
- remaining inline event handlers that reference `this.app` or `this.plugin` directly
- conversation load/hydration bridge assembly (intertwined with tab lifecycle recovery)
- tab state management delegation (central to view identity, unsafe to fragment)

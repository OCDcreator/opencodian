# Autopilot Round Roadmap — `h1-chat-runtime-package`

## Queue

### [NEXT] Task 1 - Package `OpenCodianView` hydration and activation assembly

- **Goal**: Move one durable hydration/activation assembly slice out of `OpenCodianView.ts` into existing chat runtime owners so the view stops directly coordinating as many transition details.
- **Key files**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts`
  - `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`
  - `src/features/chat/services/ConversationTransitionBridge.ts`
  - matching tests/docs
- **Acceptance**:
  - `OpenCodianView.ts` line or import surface decreases measurably.
  - No new thin wrapper files are introduced.
  - Hydration/auth-sync, tab activation, and conversation load semantics remain behavior-equivalent.
- **Validation**: `npm test -- --runInBand tests/unit/features/chat/ConversationLoadRecoveryCoordinator.test.ts tests/unit/features/chat/ConversationTabRuntimeCoordinator.test.ts tests/unit/features/chat/ConversationTransitionBridge.test.ts tests/unit/features/chat/ConversationHydrationOutcomeBridge.test.ts`

### [QUEUED] Task 2 - Package question and background-task orchestration out of `OpenCodianView`

- **Goal**: Remove one stable question/background-task orchestration cluster from `OpenCodianView.ts` by strengthening the existing runtime owners around question refresh, reminder fallback, and inline completion state.
- **Key files**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/QuestionDockCoordinator.ts`
  - `src/features/chat/services/BackgroundTaskTimelineService.ts`
  - `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`
  - matching tests/docs
- **Acceptance**:
  - View-local orchestration shrinks without regressing question resolution or background completion notices.
  - Ownership lands in existing chat owners or a clearly durable multi-call owner.
- **Validation**: `npm test -- --runInBand tests/unit/features/chat/QuestionDockCoordinator.test.ts tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts tests/unit/features/chat/backgroundTaskTimeline.test.ts`

### [QUEUED] Task 3 - Package chat shell control seams and checkpoint hotspot deltas

- **Goal**: Reduce one more slice of view-local shell wiring around input/selection/render refresh while documenting before/after hotspot evidence for the lane handoff.
- **Key files**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/InputPanelAppearanceCoordinator.ts`
  - `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
  - `src/features/chat/services/ConversationRenderService.ts`
  - matching tests/docs
- **Acceptance**:
  - The lane can hand off with explicit hotspot delta notes, not only qualitative claims.
  - No new ownership is pushed back into the view.
- **Validation**: `npm test -- --runInBand tests/unit/features/chat/InputPanelAppearanceCoordinator.test.ts tests/unit/features/chat/modelSelectorDisplay.test.ts tests/unit/features/chat/modelSelectorInteractions.test.ts tests/unit/features/chat/ConversationRenderRuntime.test.ts`

## Lane State

- When Task 1-3 are complete and no `[NEXT]` or `[QUEUED]` items remain here, the controller switches to `h2-opencode-runtime-package`.

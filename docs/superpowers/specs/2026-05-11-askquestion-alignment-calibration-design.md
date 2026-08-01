# AskQuestion Alignment Calibration Design

## Context

`docs/archive/maintainability/phases/askquestion-mechanism-alignment-evaluation-2026-05-11.md` is a Council-style evaluation of OpenCodian's AskQuestion behavior against OpenCode desktop/app behavior. The report is useful, but the current source check found several places where it mixes older upstream PR claims with the current local OpenCode reference and misidentifies at least one OpenCodian owner.

The current OpenCodian source still has a confirmed correctness bug: `QuestionDockCoordinator.clearPendingQuestionState()` clears `questionRequestWaiters` without resolving them. A caller waiting in `waitForDockResolutionIfEnabled()` can remain suspended when pending question state is cleared.

## Goal

Make the AskQuestion evaluation report trustworthy before broader implementation work, and fix only the confirmed waiter-clear bug as the first safe code step.

## Non-Goals

- Do not implement the full keyboard-navigation feature in this pass.
- Do not implement tool-part fallback or broader protocol recovery in this pass.
- Do not add `POST /question/ask` or `awaitAnswers` support. The current local OpenCode reference exposes `question.list`, `question.reply`, and `question.reject`, not a `question.ask` HTTP/SDK route.
- Do not introduce new helper, adapter, provider, or factory files.
- Do not move question runtime ownership back into `OpenCodianView.ts`.
- Do not edit `reference-projects/`.
- Do not call `opencode`; this task uses source inspection and local tests.

## Approach Options

### Recommended: calibrate the report, then fix the waiter bug

First update the status report so its owner mapping, upstream reference behavior, and priority table match current source. Then make the smallest code change that resolves dock waiters before clearing pending question state.

This gives the repo a trustworthy report and removes a confirmed hang risk without mixing in larger UX/protocol work.

### Alternative: documentation-only calibration

Only repair the report and leave code untouched. This is safest for the working tree, but it knowingly leaves a confirmed waiter hang in place.

### Alternative: calibrate and implement all P0/P1 items

Repair the report and immediately implement waiter cleanup, keyboard navigation, protocol fallback, and normalization hardening. This can close more gaps, but it turns a report repair into a larger feature/refactor pass and should be planned separately.

## Design

### Report calibration

Update `docs/archive/maintainability/phases/askquestion-mechanism-alignment-evaluation-2026-05-11.md` so it becomes a source-backed implementation guide:

- Correct the waiter bug location from `QuestionDockSlotCoordinator` to `QuestionDockCoordinator`.
- Mark `POST /question/ask` and `awaitAnswers` as not applicable to the current local OpenCode reference unless upstream reintroduces those routes.
- Replace stale desktop/PR assumptions with the current local OpenCode behavior: pending questions are exposed through `question.asked` events and recoverable through `question.list`; clients reply or reject through `question.reply` / `question.reject`.
- Keep keyboard navigation and protocol recovery as later work, but move them out of this pass's implementation scope.
- Keep OpenCodian's inline/dock and per-tab behavior as intentional platform adaptation, not a defect.

### Waiter cleanup

Change `QuestionDockCoordinator.clearPendingQuestionState()` to resolve all pending dock waiters before clearing the waiter map.

The waiter type should stay as `QuestionDockQueueDeferredRequest` with `resolve: () => void`. Do not add a reject path in this pass. The current caller only waits for the dock handoff to end, and resolving preserves the existing method's boolean-return contract without introducing new error semantics.

Expected behavior:

- `clearPendingQuestionsForTab()` clears pending requests, draft answers, active group/index maps, and resolved ids as before.
- Any `waitForDockResolutionIfEnabled()` call already waiting on a dock request is released.
- After cleanup, `questionRequestWaiters.size === 0`.
- No API reply/reject is attempted by cleanup itself.

### Module docs

Update `docs/modules/features/chat/services/QuestionDockCoordinator.md` to mention that clear/reset paths resolve pending dock waiters before dropping runtime state.

No module docs are needed for the status-report-only calibration beyond that code-adjacent owner doc.

## Testing Strategy

Add or extend a focused `QuestionDockCoordinator` unit test:

- Start `waitForDockResolutionIfEnabled()` for an above-input dock request.
- Confirm the pending request and waiter exist.
- Call `clearPendingQuestionsForTab()`.
- Assert the wait promise resolves to `true`.
- Assert pending requests, draft answers, active selection maps, and waiter map are empty.
- Assert no `replyToQuestion()` or `rejectQuestion()` call was made by cleanup.

Then run:

- `npm test -- QuestionDockCoordinator`
- `npm run check:module-docs`

Because this pass changes `src/`, run `npm run graphify:update:src` and `npm run check:graphify` before completion. Full `npm run verify` is preferred before landing, but it may need to be interpreted carefully because the working tree already contains unrelated uncommitted changes.

## Success Criteria

- The evaluation report no longer points the waiter bug at the wrong owner.
- The report no longer treats absent current upstream `question.ask` HTTP/SDK support as an OpenCodian implementation target.
- The confirmed dock waiter clear bug is covered by a regression test.
- Clearing pending questions releases pending dock waiters.
- The matching module doc reflects the cleanup behavior.
- Graphify is refreshed for the source change.
- Focused tests and guard checks pass before claiming the implementation complete.

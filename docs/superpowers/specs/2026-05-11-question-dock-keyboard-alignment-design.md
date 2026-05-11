# Question Dock Keyboard Alignment Design

## Context

`docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md` identifies keyboard navigation as the largest remaining AskQuestion alignment gap. The previous slice calibrated the report and fixed `QuestionDockCoordinator.clearPendingQuestionState()` waiter cleanup. This round should continue alignment in a small, independently verifiable UX slice.

`src/features/chat/ui/QuestionDock.ts` owns the above-input question dock DOM. It currently supports mouse interaction through native radio/checkbox changes, custom input typing, tab clicks, submit/next, reject, and close. It does not install dock-level keyboard handling for option navigation, answer selection, submit/next, or reject/close shortcuts.

## Goal

Add keyboard interaction to the above-input `QuestionDock` only, so docked AskQuestion prompts can be answered efficiently without the mouse while preserving existing render state and coordinator ownership.

## Non-Goals

- Do not modify `QuestionInlineCardRenderer.ts`; inline keyboard alignment is a later round.
- Do not modify `OpenCodeStreamEventTransformer.ts` or protocol fallback behavior.
- Do not add confirm-kind type support or question-count normalization.
- Do not add new service, adapter, provider, or factory files.
- Do not move question UI runtime ownership into `OpenCodianView.ts`.
- Do not change visual styling unless tests show focusability requires a small accessibility attribute.
- Do not call `opencode`; this round uses local source and tests.

## Approach Options

### Recommended: dock-local keyboard controller inside `QuestionDock`

Keep the behavior in `QuestionDock.ts`, because the dock already owns the option/custom-input DOM and footer button behavior. Add small private methods that map keyboard events to the same callbacks and answer collection code already used by click/change/submit.

This is the smallest owner-correct change: no new abstraction, no runtime-state migration, and no cross-surface coupling with inline cards.

### Alternative: shared question keyboard helper

Create a helper reused by Dock and Inline. This might reduce duplication later, but it would add a new thin helper before the Inline requirements are fully known. That conflicts with the repo guardrail against thin helpers unless reused in 3+ places or isolating a high-risk dependency.

### Alternative: implement Dock and Inline together

This would move both surfaces closer to parity at once, but it touches two different rendering lifecycles and increases risk around inline card reuse and scroll pinning. It should be its own later round.

## Design

### Keyboard scope

Keyboard behavior applies only while focus is inside the visible question dock. The dock must not install global document/window listeners. Users should be able to keep using normal text editing in custom answer inputs.

Supported keys:

- `ArrowDown` / `ArrowRight`: move focus to the next option in the current visible question.
- `ArrowUp` / `ArrowLeft`: move focus to the previous option in the current visible question.
- `Home`: focus the first option in the current visible question.
- `End`: focus the last option in the current visible question.
- `Space`: toggle/select the currently focused option. Native input behavior may do this, but the handler should prevent page scroll and keep answer callbacks consistent.
- `Enter`: when focus is on an option, select/toggle it; in `single` mode this may also advance to the next question when the answer is complete. When focus is on the submit/next button, existing button behavior remains valid.
- `Escape`: reject/close the active dock request through `callbacks.onReject()` or `callbacks.onClose()` according to the existing dock semantics. For this round, use `onReject()` from the body/footer question flow; the header close button remains mouse-accessible.

Custom text inputs are excluded from shortcut handling except `Escape`, which should blur or reject only if the existing dock behavior can do so without dropping typed text unexpectedly. To keep this round safe, custom inputs should allow normal text editing and should not intercept Arrow/Space/Enter for option navigation.

### Focus model

Use native `input[type="radio"]` and `input[type="checkbox"]` elements as focus targets. They are already focusable, preserve accessibility semantics, and reduce custom ARIA work.

Each rendered question section should be discoverable from an event target via the existing `.opencodian-question-dock-section` class. Keyboard handlers can query option inputs within that section and focus by index.

In `single` display mode, only one question is visible. Arrow keys operate within that visible question. In `all` display mode, arrow keys operate within the focused question section only; moving between sections stays outside this round.

### Answer selection and auto-advance

Selection must reuse the same answer collection path as mouse changes:

1. Update the native input checked state.
2. Call `callbacks.onAnswerChange(questionIndex, collectAnswerFromSection(...))`.

For single-select questions in `single` display mode:

- Selecting an option should update the answer.
- If the current question is not the last question and the answer is complete, advance with `callbacks.onSelectQuestion(current.index + 1)`.
- If it is the last question, do not auto-submit on selection alone; `Enter` or the submit button should submit. This avoids accidental final submission.

For multi-select questions:

- `Space` / `Enter` toggles the focused checkbox and updates answers.
- Do not auto-advance.

For custom answers:

- Typing in the custom input continues to update answers through the existing `input` event.
- No auto-advance from custom typing in this round.

### Footer behavior

The existing footer click behavior already handles next/submit validation. The keyboard implementation should call a shared private submit/next method so click and keyboard submit stay identical. This avoids adding a second answer-completion branch.

The footer submit button behavior should be refactored only enough to remove duplication:

- `handleSubmitOrNext(viewModel, displayMode, sectionElements, callbacks)`
- click handler calls it;
- keyboard Enter path may call it when appropriate.

### Tests

Add a focused `QuestionDock` unit test file if one does not already exist:

- `tests/unit/features/chat/QuestionDock.test.ts`

Cover these behaviors:

- ArrowDown/ArrowUp moves focus between option inputs in a single visible question.
- Space selects a focused radio option and calls `onAnswerChange`.
- In `single` mode with multiple questions, selecting a complete single-select option advances to the next question with `onSelectQuestion`.
- Enter on the final answered single-select question submits through `onSubmit`.
- Escape calls `onReject`.
- Custom text input preserves normal Enter/Arrow typing behavior and still updates through `input`.

Use DOM events against the rendered dock root. Keep tests independent from `QuestionDockCoordinator`; coordinator behavior has its own coverage.

## Module Docs

Update `docs/modules/features/chat/ui/QuestionDock.md` to document:

- dock-local keyboard handling;
- native input focus targets;
- single-mode auto-advance behavior;
- custom input exclusion from option navigation shortcuts.

## Verification

Run focused verification first:

- `npm test -- QuestionDock --runInBand`
- `npm test -- QuestionDockCoordinator --runInBand`
- `npm run lint -- src/features/chat/ui/QuestionDock.ts tests/unit/features/chat/QuestionDock.test.ts`
- `npm run check:module-docs`

Because this changes `src/`, refresh and check graphify:

- `npm run graphify:update:src`
- `npm run check:graphify`

Finish with full:

- `npm run verify`

If unrelated existing dirty files interfere with staging, stage only files touched by this round and report any generated artifacts left unstaged.

## Success Criteria

- Above-input `QuestionDock` can be operated with keyboard for option focus, option selection, next/submit, and reject.
- Mouse behavior remains unchanged.
- Single-select questions in `single` mode advance after a complete option selection, but final submission still requires Enter or submit.
- Multi-select questions do not auto-advance.
- Custom answer inputs keep normal text editing behavior.
- Focused `QuestionDock` tests cover the new keyboard behavior.
- `QuestionDockCoordinator` tests still pass.
- Module docs, graphify freshness, and full verify pass before completion.

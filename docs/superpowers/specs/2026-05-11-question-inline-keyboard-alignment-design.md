# Question Inline Keyboard Alignment Design

## Context

OpenCodian now has dock-local keyboard controls for the above-input `QuestionDock`, but inline question cards still depend on mouse interaction and button clicks. The current AskQuestion alignment report therefore still overstates the remaining keyboard gap: one question surface is fixed, while `QuestionInlineCardRenderer` remains below desktop/TUI parity.

`src/features/chat/runtime/QuestionInlineCardRenderer.ts` owns the inline card DOM, per-question input state, answer collection, and Promise resolution for both `single` sequential mode and `all` grouped mode. That makes it the right owner for inline keyboard behavior. This round should finish the keyboard UX slice without touching protocol fallback, confirm-kind normalization, or broader question runtime ownership.

## Goal

Add keyboard interaction to inline AskQuestion cards so the inline surface supports option focus navigation, option selection, next/submit, and reject behavior comparable to the above-input dock.

## Non-Goals

- Do not modify `QuestionDock.ts`; dock keyboard controls were completed in the previous round.
- Do not modify `OpenCodeStreamEventTransformer.ts` or add tool-part `waiting` fallback in this round.
- Do not add confirm-kind type support, question-count normalization, retry logic, or waiter timeout behavior.
- Do not add shared keyboard helper files; inline requirements should be proven locally before considering extraction.
- Do not move question runtime ownership into `OpenCodianView.ts`.
- Do not call `opencode`; this round uses local source, tests, and review gates.
- Do not change visual styling unless tests reveal a required focusability or accessibility fix.

## Approach Options

### Recommended: inline-local keyboard handling in `QuestionInlineCardRenderer`

Add private methods to `QuestionInlineCardRenderer` that attach `keydown` listeners to the rendered question sections and operate on the existing `QuestionInputState`. This preserves the current renderer ownership, reuses existing answer collection, and keeps sequential/grouped Promise resolution paths local to the component that already owns them.

This mirrors the dock round without creating premature cross-surface abstractions. The two surfaces have different lifecycles: dock renders from external state and callbacks, while inline cards resolve local Promises. A shared helper would need extra indirection before the duplicated behavior is stable.

### Alternative: extract shared keyboard controller

Extract option focus/toggle logic into a shared helper used by Dock and Inline. This could reduce duplication, but it adds a new helper for only two consumers and would have to abstract over callback-driven and Promise-driven lifecycles. That conflicts with the repo guardrail against thin helpers.

### Alternative: skip inline and move to protocol fallback

Implementing tool-part `waiting` fallback next would address reliability, but it would leave the keyboard UX gap half-finished. Finishing both question surfaces first gives a clear UX checkpoint before moving to the protocol layer.

## Design

### Keyboard Scope

Keyboard behavior applies only while focus is inside the inline question card. The renderer must not install global `document` or `window` listeners.

Supported keys on option inputs:

- `ArrowDown` / `ArrowRight`: focus the next option in the current question.
- `ArrowUp` / `ArrowLeft`: focus the previous option in the current question.
- `Home`: focus the first option in the current question.
- `End`: focus the last option in the current question.
- `Space`: toggle or select the focused option and prevent page scroll.
- `Enter`: toggle/select the focused option, then resolve only when the current inline mode makes that safe.
- `Escape`: reject the active inline request.

Custom text inputs preserve native text-editing behavior for `Enter`, arrows, `Home`, `End`, and `Space`. `Escape` remains a request-level reject shortcut, matching the dock behavior completed in the previous round.

### Sequential `single` Mode

`single` display mode renders one question at a time through `promptForSingleQuestion()`. Keyboard behavior should resolve the current prompt through the same Promise shape used by the submit/reject buttons:

- Single-select `Space` selects the focused radio and, when the answer is complete and this is not the final question, resolves `{ type: 'reply', answer }` so the next question renders automatically.
- On the final single-select question, `Space` selects the answer but does not submit. Final submission still requires `Enter` or the submit button.
- Single-select `Enter` selects the focused radio and resolves `{ type: 'reply', answer }` when the answer is complete.
- Multi-select `Space` / `Enter` toggles the focused checkbox and does not auto-resolve. The user submits with `Enter` on a button or the submit button click path.
- `Escape` resolves `{ type: 'reject' }`.

This keeps accidental final submission risk low while matching desktop-style auto-advance for non-final single-select questions.

### Grouped `all` Mode

`all` display mode renders all questions and resolves one shared Promise only through explicit grouped submission or rejection:

- Arrow keys operate inside the focused question section only.
- `Space` and `Enter` update the focused option state for that question.
- Neither `Space` nor `Enter` on an option submits the grouped request.
- Grouped submission continues to require the submit button, which preserves the existing all-questions-complete validation and Notice path.
- `Escape` resolves `{ type: 'reject' }`.

This avoids a bug class similar to the dock review finding: option-level Enter must not bypass grouped completeness validation.

### Focus and Answer State

Use the existing native `input[type="radio"]` and `input[type="checkbox"]` elements as focus targets. The keyboard handler should operate on the per-question `QuestionInputState` that `renderQuestionSection()` already returns.

Answer collection remains centralized in `collectAnswerFromInputState()`. The keyboard handler should update checked state first, then call that collector only when deciding whether sequential mode can resolve a prompt. It should not introduce a separate answer parser.

### Tests

Add focused DOM tests in a new unit file:

- `tests/unit/features/chat/QuestionInlineCardRenderer.test.ts`

Cover these behaviors:

- ArrowDown/ArrowUp/Home/End moves focus between option inputs in the current inline question.
- Sequential `single` mode: Space on a non-final single-select question selects the option and auto-renders the next question.
- Sequential final single-select: Enter selects and resolves the full inline action.
- Grouped `all` mode: Enter on a radio selects it but does not submit an incomplete grouped request.
- Multi-select: Space/Enter toggles checkboxes without resolving the sequential prompt or grouped action.
- Custom text input preserves native Enter/arrow editing behavior and updates answer through the existing submit path.
- Escape rejects from an option and from a custom text input.

Use real DOM events against the rendered inline card. A small fake `StreamingInlineCardRenderer` and host can create the card container without involving `OpenCodianView`.

## Module Docs

Update `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md` to document:

- inline-local keyboard handling;
- native option input focus targets;
- `single` sequential auto-advance behavior;
- grouped mode non-submit behavior for option-level Enter;
- custom input shortcut exclusions and Escape reject behavior.

## Verification

Run focused checks first:

- `npm test -- QuestionInlineCardRenderer --runInBand`
- `npm test -- QuestionDock --runInBand`
- `npm run lint -- src/features/chat/runtime/QuestionInlineCardRenderer.ts tests/unit/features/chat/QuestionInlineCardRenderer.test.ts`
- `npm run check:module-docs`

Because this changes `src/`, refresh and check graphify:

- `npm run graphify:update:src`
- `npm run check:graphify`

Finish with:

- `npm run verify`

If unrelated existing dirty files interfere with staging, stage only this round's intended files. If graphify artifacts are already dirty from unrelated work, generate isolated artifacts from a clean temporary worktree before staging.

## Success Criteria

- Inline AskQuestion cards can be operated with keyboard for option focus, option selection, next/submit, and reject.
- Sequential single-select questions auto-advance after a complete non-final option selection.
- Final single-select submission still requires `Enter` or the submit button.
- Multi-select questions do not auto-advance or submit from option-level `Space` / `Enter`.
- Grouped `all` mode option-level `Enter` cannot submit an incomplete request.
- Custom answer inputs keep normal text editing behavior, with `Escape` still rejecting the request.
- Focused `QuestionInlineCardRenderer` tests cover the new keyboard behavior.
- Existing dock keyboard tests still pass.
- Module docs, graphify freshness, and full verify pass before completion.

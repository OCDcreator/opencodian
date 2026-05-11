# AskQuestion Final Polish Design

## Context

Council final review approved the AskQuestion alignment with a score of 8.8/10 and no remaining defects. The remaining notes are platform adaptations or low-priority optimizations. One useful final polish is to ensure the repo's status report matches Council's final score and that automated tests explicitly prove sequential single-select `Enter` behavior in both Dock and Inline modes.

## Goal

Make the final AskQuestion alignment record match Council review and add regression coverage for `Enter` selecting a non-final sequential single-select option and advancing to the next question.

## Scope

- Update the AskQuestion status report from the previous internal 9.0/10 closeout to Council's 8.8/10 final approval.
- Add Dock regression coverage for non-final sequential single-select `Enter`.
- Add Inline regression coverage for non-final sequential single-select `Enter`.
- Update module docs to state both `Space` and `Enter` activate non-final sequential single-select auto-advance.

## Non-Goals

- No reply/reject retry implementation.
- No waiter timeout implementation.
- No Dock collapse UI.
- No protocol changes.
- No visual redesign or deployment.

## Design

Dock already routes `Enter` through `handleSubmitOrNext()`, which selects a complete answer and advances when the current single-mode question is not final. Inline already resolves non-final single-select questions when `onOptionActivated()` receives `Enter` or when any activation occurs before the final question. The final polish should therefore avoid behavior changes unless tests reveal a gap.

The status report should clearly record:

- Council final score: 8.8/10.
- All five councillors approved.
- Defects remaining: 0.
- The old issue list is closed.
- Remaining items are platform adaptations or deferred optimizations.

## Verification

- `npm test -- QuestionDock --runInBand`
- `npm test -- QuestionInlineCardRenderer --runInBand`
- `npm run check:module-docs`
- `npm run verify`

# AskQuestion Retry And Dock Collapse Design

## Context

AskQuestion alignment is already approved by Council at 8.8/10 with zero remaining defects. This polish is deliberately narrow: improve request resilience for question reply/reject and add a local collapse affordance to the above-input QuestionDock. It does not change the OpenCode protocol, waiter lifecycle, inline question UI, or question schema.

## Goals

- Retry transient question `reply` and `reject` request failures with at most two additional attempts.
- Preserve the current public APIs and final error behavior: callers still receive the final thrown error and the existing Notice path remains responsible for user-facing failure.
- Let users collapse the above-input QuestionDock while keeping the header, progress, unanswered count, and expand control visible.
- Keep collapse as component-local UI state that never clears pending questions, draft answers, submit/reject callbacks, or request ownership.

## Non-Goals

- No waiter timeout.
- No protocol route or OpenCode server changes.
- No new question schema or answer payload shape.
- No Inline card collapse.
- No settings surface or persisted preference unless future product work asks for it.
- No broad redesign of the Dock layout.

## Design

### Reply/Reject Retry

`OpenCodeQuestionPermissionHub` will wrap only the mutation requests used by `replyToQuestion()` and `rejectQuestion()`. The helper will attempt the provided operation once and then retry up to two more times only when the thrown value looks transient. Transient classification is intentionally conservative and request-oriented: network-style errors with common transport codes/statuses, HTTP `408`, `409`, `425`, `429`, and `5xx`, plus fetch-like timeout/abort/network failure names or messages. Validation, authorization, malformed request, and other deterministic errors are not retried.

The existing SDK-first fallback stays intact. If SDK reply/reject fails, the hub still logs the current SDK warning and falls back to legacy HTTP. Retry applies to the actual SDK mutation attempt and to the legacy fallback mutation attempt, but the final failure is rethrown unchanged.

### Dock Collapse

`QuestionDock` will own a small local state record keyed by active request id. A new request id defaults to expanded, so pending new questions are visible. If the user collapses the current request, later renders of that same request preserve the collapsed state, including draft answers supplied by the coordinator.

Collapsed Dock rendering keeps the header visible and hides tabs, body, and footer. The header gains an icon button with `aria-expanded`, an accessible label, and a visible state through the root `is-collapsed` class. The existing close button remains available. Because `render()` already rebuilds DOM from `state.answers`, expand simply rerenders the body from existing draft state and does not clear inputs.

## Testing

- Add hub tests for reply retry success, reject retry success, and persistent retry failure rethrowing the final error.
- Add Dock tests for collapsed body/footer hiding, expand restoring body/footer, draft answer preservation across collapse/expand, and a new request defaulting to expanded.

## Documentation And Verification

- Update `docs/modules/core/opencode/OpenCodeQuestionPermissionHub.md`.
- Update `docs/modules/features/chat/ui/QuestionDock.md`.
- Refresh graphify because `src/` changes are expected.
- Run focused tests, module-doc guard, graphify guard, and full `npm run verify`.

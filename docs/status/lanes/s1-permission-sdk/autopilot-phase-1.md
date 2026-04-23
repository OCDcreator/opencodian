# Autopilot Phase 1 — `s1-permission-sdk`

> **Status**: [DONE]
> **Lane**: `s1-permission-sdk` — Permission runtime and settings alignment
> **Attempt**: `1`
> **Completed roadmap item**: `P1 - Complete SDK-backed permission runtime wiring`
> **Build ID**: `autopilot-sdk-permission-slash-sdk.202604240153`

## Round Design

- **Exact `[NEXT]` slice**: `P1 - Complete SDK-backed permission runtime wiring`
- **Targeted files/modules**:
  - `src/core/opencode/OpenCodeQuestionPermissionHub.ts`
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - `src/core/types/chat.ts`
  - `tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts`
  - `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
  - `tests/unit/features/chat/streamingAssistantShellVisibility.test.ts`
  - `docs/modules/core/opencode/OpenCodeQuestionPermissionHub.md`
  - `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`
  - `docs/modules/core/types/chat.md`
- **Upstream SDK / command contract confirmed**:
  - Permission requests originate from `ctx.ask({ permission, patterns, always, metadata })` and carry `always` plus optional `tool.messageID/callID` in the upstream SDK `PermissionRequest` / `permission.asked` event shape.
  - `external_directory` approvals use directory-glob `patterns` / `always` values; this round preserves that runtime truth instead of rewriting semantics.
  - Session-scoped permission replies remain SDK-only; no legacy responder path was introduced in this slice.
- **Tests run**:
  - Targeted: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
  - Targeted regression: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/features/chat/streamingAssistantShellVisibility.test.ts`
  - Full validation: `npm run verify`
- **Non-goals / boundaries kept**:
  - No security settings copy work; `P2` remains next.
  - No slash-command runtime or settings work.
  - No permission-mode UI redesign or deploy step.
  - No removal of legacy HTTP fallback for permission list/reply paths.

## Design Review Result

- `PASS` — `automation/opencode-review.sh plan` produced a PASS review in `automation/runtime/opencode-reviews/20260424-014225-plan.txt`.
- The review specifically called out the missing stream-side `always` / `tool` wiring and confirmed the slice scope stayed bounded to permission runtime only.

## Implementation Summary

- Extracted shared permission normalization helpers in `OpenCodeQuestionPermissionHub.ts` so polling permission lists now accept both raw arrays and `{ data: [...] }` envelopes while preserving `patterns`, `always`, `metadata`, and optional `tool` linkage.
- Reused that normalization in `OpenCodeStreamEventTransformer.ts` so `permission.asked` emits the same permission contract as the hub instead of dropping `always` and `tool`.
- Widened `StreamChunk.permission_request` in `src/core/types/chat.ts` to carry `always` plus optional `tool` linkage without changing the existing inline permission UX.
- Updated focused tests and the directly related module docs to match the new permission runtime contract.
- Performed one focused repair after the first `npm run verify` lint failure: split the long hub test describe block and fixed the import sort order before rerunning tests and validation.

## Files Changed

- `src/core/opencode/OpenCodeQuestionPermissionHub.ts`
- `src/core/opencode/OpenCodeStreamEventTransformer.ts`
- `src/core/types/chat.ts`
- `tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts`
- `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
- `tests/unit/features/chat/streamingAssistantShellVisibility.test.ts`
- `docs/modules/core/opencode/OpenCodeQuestionPermissionHub.md`
- `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`
- `docs/modules/core/types/chat.md`
- `docs/status/lanes/s1-permission-sdk/autopilot-round-roadmap.md`
- `docs/status/lanes/s1-permission-sdk/autopilot-phase-1.md`

## Validation

- Initial targeted test run required environment preparation because `node_modules/` was absent; ran `npm install`, then reran the slice tests to capture the intended red state.
- Red state observed: the new permission list envelope test and stream permission contract test both failed before implementation.
- Green targeted tests: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
- Green targeted regression: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/features/chat/streamingAssistantShellVisibility.test.ts`
- Green full validation: `npm run verify`

## Code Review Result

- `PASS` — `automation/opencode-review.sh code` produced a PASS review in `automation/runtime/opencode-reviews/20260424-015028-code.txt`.
- The review confirmed the permission runtime stayed bounded to the P1 slice and that downstream consumers tolerate the widened `permission_request` chunk safely.

## Outcome

- Lane `s1-permission-sdk` advanced through `P1` and now preserves the upstream permission request contract consistently across polling and streaming permission paths.
- The roadmap now promotes `P2 - Align security settings wording and config semantics` to `[NEXT]`.

## Next Recommended Slice

- `P2 - Align security settings wording and config semantics`

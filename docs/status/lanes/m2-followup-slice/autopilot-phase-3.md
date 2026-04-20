# Autopilot Phase 3 — `m2-followup-slice`

> **Status**: [DONE]
> **Date**: 2026-04-21
> **Round**: 6
> **Completed queue item**: Task 6 — Align command, shell, and plugin-injection semantics

## Scope

- Kept the round inside lane `m2-followup-slice` and executed only the roadmap’s active Task 6 slice.
- Extended prompt send assembly so plugin-injected text can travel as explicit synthetic text parts with stable ids and metadata instead of being flattened into the visible user content string.
- Propagated synthetic prompt-part inputs through `MessageSendPreparationService` into `OpenCodeService.buildStructuredPromptSendPayload()` while preserving the existing optimistic user-message content and canonical seed ordering.
- Tightened session command and shell request normalization in `OpenCodeSessionControlOrchestrator` so placeholder expansion, trim/clone hygiene, and structured `parts` passthrough stay centralized at the session-control seam.
- Added structured composer submission parsing in `ComposerInputShellCoordinator` so ordinary prompt text, slash commands, and shell-mode submissions resolve to explicit intent objects before leaving the input-shell owner.
- Preserved the stable OpenCodian UI shell by keeping the live view in prompt mode; shell submissions remain a typed seam for the future runtime owner and are not exposed as a new stable UI path in this round.

## Files Changed

- `src/core/opencode/OpenCodePromptRequestBuilder.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
- `src/features/chat/services/ComposerInputShellCoordinator.ts`
- `src/features/chat/services/MessageSendPreparationService.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts`
- `tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts`
- `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
- `tests/unit/features/chat/ComposerInputShellCoordinatorSkills.test.ts`
- `tests/unit/features/chat/MessageSendPreparationService.test.ts`
- `docs/modules/core/opencode/OpenCodePromptRequestBuilder.md`
- `docs/modules/core/opencode/OpenCodeSessionControlOrchestrator.md`
- `docs/modules/features/chat/services/ComposerInputShellCoordinator.md`
- `docs/modules/features/chat/services/MessageSendPreparationService.md`
- `docs/status/lanes/m2-followup-slice/autopilot-round-roadmap.md`
- `docs/status/lanes/m2-followup-slice/autopilot-phase-3.md`

## Validation

- `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts tests/unit/features/chat/ComposerInputShellCoordinatorSkills.test.ts` — passed.
- `npm test -- --runInBand tests/unit/features/chat/MessageSendPreparationService.test.ts` — passed.
- `npm run lint` — passed with `0 errors / 0 warnings`.
- `npm run typecheck` — passed.
- `npm test` — passed, 299 suites / 1316 tests.
- `npm run build` — passed, final `BUILD_ID` `autopilot-session-message-alignment-20260421.202604210445`.
- Vulture — not configured for this lane; no dead-code observability command was available.

## Lane Advancement

- Task 6 is now marked `[DONE]` in `docs/status/lanes/m2-followup-slice/autopilot-round-roadmap.md`.
- Lane `m2-followup-slice` now has no remaining `[NEXT]` or `[QUEUED]` items.
- The controller should advance from `m2-followup-slice` to `m3-checkpoint` for the next round.

## Next Recommended Slice

- Start lane `m3-checkpoint` with Task 7: rework reload/finalization as compensation over canonical state and add the planned regression coverage.

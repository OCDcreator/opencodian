# Autopilot Phase 1 — `m2-followup-slice`

> **Status**: [DONE]
> **Date**: 2026-04-21
> **Round**: 4
> **Completed queue item**: Task 4 — Make stream processing update canonical parts

## Scope

- Kept the round inside lane `m2-followup-slice` and executed only the first `[NEXT]` roadmap item.
- Extended stream event outcomes with canonical stream mutations while preserving legacy `StreamChunk` output.
- Added per-stream `partID -> messageID` tracking so `message.part.delta` can resolve canonical message ownership after a prior `message.part.updated`.
- Applied stream mutations in `OpenCodeService` before yielding legacy chunks, with minimal assistant-message seeding, part upsert merging, and delta fallback part creation.
- Split large stream transformer tests into a helper suite to keep lint guardrails green while adding tool-first/text-late canonical coverage.

## Files Changed

- `src/core/opencode/OpenCodeStreamEventTransformer.ts`
- `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
- `src/core/opencode/OpenCodeService.ts`
- `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
- `tests/unit/core/opencode/OpenCodeStreamEventTransformer.streamPartHandlingSuite.ts`
- `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts`
- `tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts`
- `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`
- `docs/modules/core/opencode/OpenCodeStreamingRuntimeCoordinator.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/status/lanes/m2-followup-slice/autopilot-round-roadmap.md`
- `docs/status/lanes/m2-followup-slice/autopilot-phase-1.md`

## Validation

- `npm test -- --runInBand tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts` — passed after the focused test harness repair.
- `npm run build` — passed, final `BUILD_ID` `autopilot-session-message-alignment-20260421.202604210400`.
- `npm run lint` — passed with `0 errors / 0 warnings`.
- `npm run typecheck` — passed.
- `npm test` — passed, 298 suites / 1306 tests.
- `npm run check:module-docs` — passed, 347 source modules mapped and 3 required doc targets satisfied.
- Vulture — not configured for this lane; no dead-code observability command was available.

## Lane Advancement

- Roadmap advanced from Task 4 to Task 5.
- Task 4 is marked `[DONE]`.
- Task 5 is now `[NEXT]`.
- Task 6 remains `[QUEUED]`.

## Next Recommended Slice

- Execute Task 5: introduce `ConversationTurnViewModelBuilder` so live and reloaded canonical states assemble the same turn structure while preserving the existing OpenCodian UI shell.

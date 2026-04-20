# Autopilot Phase 2 — `m2-followup-slice`

> **Status**: [DONE]
> **Date**: 2026-04-21
> **Round**: 5
> **Completed queue item**: Task 5 — Introduce a turn view-model builder while keeping the UI shell

## Scope

- Kept the round inside lane `m2-followup-slice` and executed only the first `[NEXT]` roadmap item.
- Added `ConversationTurnViewModelBuilder` to assemble canonical `session/message/part` state into user-led turn view-models.
- Routed `ConversationRenderService` full rerenders and synced update next-input resolution through canonical turns when a canonical session state is available.
- Preserved the existing OpenCodian DOM/CSS shell by hydrating turn view-models back through `OpenCodeService.hydrateOpenCodeMessage()` and the existing `ChatMessage` render delegates.
- Preserved client-only render fields such as interrupted state, notices, question resolution, OMO metadata, and late local fallback messages while canonical state becomes the primary render source.
- Wired `OpenCodianView` to inject the canonical render source without expanding the DOM render host.

## Files Changed

- `src/features/chat/services/ConversationTurnViewModelBuilder.ts`
- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ConversationTurnViewModelBuilder.test.ts`
- `tests/unit/features/chat/ConversationRenderService.renderFlows.test.ts`
- `docs/modules/features/chat/services/ConversationTurnViewModelBuilder.md`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`
- `docs/status/lanes/m2-followup-slice/autopilot-round-roadmap.md`
- `docs/status/lanes/m2-followup-slice/autopilot-phase-2.md`

## Validation

- `npm test -- --runInBand tests/unit/features/chat/ConversationTurnViewModelBuilder.test.ts tests/unit/features/chat/ConversationRenderService.test.ts tests/unit/features/chat/ConversationRenderService.renderFlows.test.ts` — passed after the focused import-sort repair.
- `npm run lint` — passed with `0 errors / 0 warnings`.
- `npm run typecheck` — passed.
- `npm test` — passed, 299 suites / 1311 tests.
- `npm run check:module-docs` — passed, 348 source modules mapped and 2 required doc targets satisfied.
- `npm run build` — passed, final `BUILD_ID` `autopilot-session-message-alignment-20260421.202604210420`.
- Vulture — not configured for this lane; no dead-code observability command was available.

## Lane Advancement

- Roadmap advanced from Task 5 to Task 6.
- Task 5 is marked `[DONE]`.
- Task 6 is now `[NEXT]`.

## Next Recommended Slice

- Execute Task 6: align ordinary prompt sends, slash command execution, shell command execution, and plugin-injected synthetic content around structured part semantics.

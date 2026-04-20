# Autopilot Phase 2 — `m1-hotspot-slice`

> **Status**: [DONE]
> **Lane**: `m1-hotspot-slice` — Session graph, send, and sync foundations
> **Completed roadmap item**: Task 2 - Reshape send preparation around stable `messageID + parts[]`
> **Build ID**: `autopilot-session-message-alignment-20260421.202604210259`

## Scope

- Extended `OpenCodePromptRequestBuilder` to mint stable `messageID` / `part.id` values and return a shared structured send payload for optimistic seed plus transport.
- Updated `OpenCodeService` to reuse prebuilt request parts in SDK/legacy prompt transport and added a canonical user-message seed seam for the session graph store.
- Reshaped `MessageSendPreparationService` and the send pipeline handoff so prepared sends carry stable `messageID`, `requestParts`, and `optimisticUserParts` without changing the existing UI bootstrap order.
- Added focused transport/preparation coverage, refreshed the directly related module docs, and advanced the lane roadmap to Task 3.

## Files Changed

- `src/core/opencode/OpenCodePromptRequestBuilder.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/SendPipelineRuntime.ts`
- `src/features/chat/runtime/SendPipelineTypes.ts`
- `src/features/chat/services/MessageSendPreparationService.ts`
- `tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts`
- `tests/unit/core/opencode/OpenCodeService.httpRuntime.test.ts`
- `tests/unit/core/opencode/OpenCodeService.sdkPromptTransport.test.ts`
- `tests/unit/features/chat/MessageSendPreparationService.test.ts`
- `tests/unit/features/chat/SendPipelineRuntime.test.ts`
- `tests/unit/features/chat/buildLocalStreamOutcome.test.ts`
- `docs/modules/core/opencode/OpenCodePromptRequestBuilder.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/SendPipelineRuntime.md`
- `docs/modules/features/chat/runtime/SendPipelineTypes.md`
- `docs/modules/features/chat/services/MessageSendPreparationService.md`
- `docs/status/lanes/m1-hotspot-slice/autopilot-round-roadmap.md`
- `docs/status/lanes/m1-hotspot-slice/autopilot-phase-2.md`

## Validation

- Targeted lane slice: `npm test -- --runInBand tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts tests/unit/core/opencode/OpenCodeService.sdkPromptTransport.test.ts tests/unit/features/chat/MessageSendPreparationService.test.ts`
- Focused regression: `npm test -- --runInBand tests/unit/features/chat/SendPipelineRuntime.test.ts tests/unit/features/chat/buildLocalStreamOutcome.test.ts tests/unit/core/opencode/OpenCodeService.httpRuntime.test.ts`
- Docs gate: `npm run check:module-docs`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full test: `npm test`
- Build: `npm run build`

## Vulture

- Not configured for this lane round; no dead-code observability command was available.

## Outcome

- Lane `m1-hotspot-slice` advanced through Task 2 with stable `messageID + parts[]` handoff from send preparation into canonical optimistic seed and prompt transport.
- The send pipeline now reuses prepared request parts instead of rebuilding transport payloads after optimistic bootstrap, keeping ordinary text and context/file sends aligned on the same structured IDs.

## Next Recommended Slice

- Task 3 - Convert sync-event handling from reload signal to graph mutation.

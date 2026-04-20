# Autopilot Phase 3 — `m1-hotspot-slice`

> **Status**: [DONE]
> **Lane**: `m1-hotspot-slice` — Session graph, send, and sync foundations
> **Completed roadmap item**: Task 3 - Convert sync-event handling from reload signal to graph mutation
> **Build ID**: `autopilot-session-message-alignment-20260421.202604210332`

## Scope

- Enriched SDK sync-event parsing so `message.updated`, `message.removed`, `message.part.updated`, `message.part.removed`, `message.part.delta`, and `session.diff` now emit reducer-ready payloads instead of ID-only reload hints.
- Wired `OpenCodeService` to apply message/part sync mutations directly into `OpenCodeSessionStateStore` before chat listeners receive the same event.
- Added a canonical session-message read seam and routed non-`session.diff` chat signals through canonical local merge, preserving the existing visible/background post-sync routers and falling back to server reload when canonical graph state is missing.
- Kept `session.diff` on the existing authoritative reload scheduler, refreshed focused tests, and updated module docs for the changed sync/canonical ownership boundary.

## Files Changed

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/ConversationSyncLoadRuntimeHostAdapter.ts`
- `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts`
- `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts`
- `src/features/chat/services/ConversationSessionSignalRuntime.ts`
- `src/features/chat/services/ConversationSyncBridge.ts`
- `src/features/chat/services/ConversationSyncHostAdapter.ts`
- `src/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory.ts`
- `tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts`
- `tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts`
- `tests/unit/features/chat/ConversationAuthoritativeSyncCoordinator.test.ts`
- `tests/unit/features/chat/ConversationSessionSignalRuntime.test.ts`
- `tests/unit/features/chat/ConversationSyncBridge.test.ts`
- `tests/unit/features/chat/ConversationSyncHostAdapter.test.ts`
- `tests/unit/features/chat/ConversationSyncLoadRuntimeHostAdapter.test.ts`
- `tests/unit/features/chat/ConversationSyncLoadRuntimeViewHostFactory.test.ts`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeSyncEventRuntimeCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/ConversationSyncLoadRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/ConversationAuthoritativeReloadCoordinator.md`
- `docs/modules/features/chat/services/ConversationAuthoritativeSyncCoordinator.md`
- `docs/modules/features/chat/services/ConversationSessionSignalRuntime.md`
- `docs/modules/features/chat/services/ConversationSyncBridge.md`
- `docs/modules/features/chat/services/ConversationSyncHostAdapter.md`
- `docs/modules/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory.md`
- `docs/status/lanes/m1-hotspot-slice/autopilot-round-roadmap.md`
- `docs/status/lanes/m1-hotspot-slice/autopilot-phase-3.md`

## Validation

- Focused regression: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts tests/unit/features/chat/ConversationSyncBridge.test.ts tests/unit/features/chat/ConversationSessionSignalRuntime.test.ts tests/unit/features/chat/ConversationSyncHostAdapter.test.ts tests/unit/features/chat/ConversationSyncLoadRuntimeHostAdapter.test.ts tests/unit/features/chat/ConversationSyncLoadRuntimeViewHostFactory.test.ts tests/unit/features/chat/ConversationAuthoritativeSyncCoordinator.test.ts`
- Targeted lane slice: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts tests/unit/features/chat/ConversationSyncBridge.test.ts`
- Docs gate: `npm run check:module-docs`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full test: `npm test`
- Build: `npm run build`

## Vulture

- Not configured for this lane round; no dead-code observability command was available.

## Outcome

- Lane `m1-hotspot-slice` advanced through Task 3 and now has no remaining queued items.
- Sync-event is now the first local canonical merge channel for message/part changes; `session.diff` remains the authoritative reload entry, and canonical gaps fall back to the existing server sync path.
- No Test Vault deployment was required because this round did not touch deploy-relevant files listed in `AGENTS.md`.

## Next Recommended Slice

- Switch to lane `m2-followup-slice`, Task 4 - Make stream processing update canonical parts, not only loose text chunks.

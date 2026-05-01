# Tasks

## 1. Extract Streaming Finalization

- [x] 1.1 Identify the finalization behavior slice in `OpenCodeStreamingRuntimeCoordinator.ts`.
- [x] 1.2 Create `OpenCodeStreamingFinalizationCoordinator.ts` as a durable adjacent owner.
- [x] 1.3 Move final assistant tail recovery, final metadata/error chunk assembly, and trailing text/reasoning/tool replay into the new owner.
- [x] 1.4 Keep `OpenCodeStreamingRuntimeCoordinator.ts` focused on transport coordination; do not grow new runtime ownership.
- [x] 1.5 Add focused tests for tail recovery, error handling, content deduplication, prompt-scoped filtering, retry logic, mixed content, structured output filtering, and tool metadata.
- [x] 1.6 Update module docs and refresh graphify artifacts.
- [x] 1.7 Pass `npm run verify`.

## 2. Extract Legacy SSE Reader Lifecycle

- [x] 2.1 Identify the legacy SSE reader behavior slice in `OpenCodeStreamingRuntimeCoordinator.ts`.
- [x] 2.2 Create `OpenCodeLegacySseStreamReader.ts` as a durable adjacent owner.
- [x] 2.3 Move SSE fetch connection, reader context management, chunk reading/decoding, buffer management, and abort handling into the new owner.
- [x] 2.4 Keep `OpenCodeStreamingRuntimeCoordinator.ts` focused on transport coordination; do not grow new runtime ownership.
- [x] 2.5 Add focused tests for connection lifecycle, chunked parsing, abort handling, and host delegation.
- [x] 2.6 Update module docs and refresh graphify artifacts.
- [x] 2.7 Pass `npm run verify`.

## 3. Checkpoint

- [x] 3.1 Record the lane outcome, final commits, owner-shape changes, and verification evidence.
- [x] 3.2 State explicitly whether `OpenCodeStreamingRuntimeCoordinator.ts` remains a cohesive transport owner after the lane.
- [x] 3.3 Record any review caveats without claiming line-count-only success.
- [x] 3.4 Propose the next lane target only if it has a clear owner boundary and anti-fragmentation rationale.

## Checkpoint Result

**`OpenCodeStreamingRuntimeCoordinator.ts` remains a cohesive transport owner.** At 485 lines, it owns transport selection, active stream registry, SDK/legacy fallback, event transformation, cancel/detach lifecycle, and finalization delegation. The two extractions (`OpenCodeStreamingFinalizationCoordinator.ts` at 641 lines and `OpenCodeLegacySseStreamReader.ts` at 181 lines) are complete, durable adjacent owners with no residual fragments left in the runtime coordinator.

**Next lane target**: explicit design required before resuming unattended execution. `OpenCodianView.ts` (5314+ lines, 80+ methods) and `OpenCodeSessionStateStore` are candidates but need boundary analysis. No clear, safe extraction boundary exists for an unattended batch.

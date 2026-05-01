# Tasks

## 1. Extract Streaming Finalization

- [x] 1.1 Identify the finalization behavior slice in `OpenCodeStreamingRuntimeCoordinator.ts`.
- [x] 1.2 Create `OpenCodeStreamingFinalizationCoordinator.ts` as a durable adjacent owner.
- [x] 1.3 Move final assistant tail recovery, final metadata/error chunk assembly, and trailing text/reasoning/tool replay into the new owner.
- [x] 1.4 Keep `OpenCodeStreamingRuntimeCoordinator.ts` focused on transport coordination; do not grow new runtime ownership.
- [x] 1.5 Add focused tests for tail recovery, error handling, content deduplication, prompt-scoped filtering, retry logic, mixed content, structured output filtering, and tool metadata.
- [x] 1.6 Update module docs and refresh graphify artifacts.
- [x] 1.7 Pass `npm run verify`.

**Result**: Commit `784b904a`. `OpenCodeStreamingFinalizationCoordinator.ts` (641 lines) is a complete, durable adjacent owner with 16 focused tests and module docs.

## 2. Extract Legacy SSE Reader Lifecycle

- [x] 2.1 Identify the legacy SSE reader behavior slice in `OpenCodeStreamingRuntimeCoordinator.ts`.
- [x] 2.2 Create `OpenCodeLegacySseStreamReader.ts` as a durable adjacent owner.
- [x] 2.3 Move SSE fetch connection, reader context management, chunk reading/decoding, buffer management, and abort handling into the new owner.
- [x] 2.4 Keep `OpenCodeStreamingRuntimeCoordinator.ts` focused on transport coordination; do not grow new runtime ownership.
- [x] 2.5 Add focused tests for connection lifecycle, chunked parsing, abort handling, and host delegation.
- [x] 2.6 Update module docs and refresh graphify artifacts.
- [x] 2.7 Pass `npm run verify`.

**Result**: Commit `46bd6042`. `OpenCodeLegacySseStreamReader.ts` (181 lines) is a complete, durable adjacent owner with 10 focused tests and module docs.

## 3. Checkpoint

- [x] 3.1 Record the lane outcome, final commits, owner-shape changes, and verification evidence.
- [x] 3.2 State explicitly whether `OpenCodeStreamingRuntimeCoordinator.ts` remains a cohesive transport owner after the lane.
- [x] 3.3 Record any review caveats without claiming line-count-only success.
- [x] 3.4 Propose the next lane target only if it has a clear owner boundary and anti-fragmentation rationale.
- [x] 3.5 Ensure checkpoint docs pass automated verification.

**Result**: Commit `5f44cbfd`. Checkpoint documentation updated with comprehensive lane outcome, explicit owner-shape assessment, detailed verification evidence, and clear next-target guidance.

## Checkpoint Result

### Owner Cohesion Verdict

**`OpenCodeStreamingRuntimeCoordinator.ts` remains a cohesive transport owner.**

At 485 lines, it owns transport selection, active stream registry, SDK/legacy fallback, event transformation, cancel/detach lifecycle, and finalization delegation. It does NOT own finalization internals (moved to `OpenCodeStreamingFinalizationCoordinator`) or SSE read-loop mechanics (moved to `OpenCodeLegacySseStreamReader`). The runtime coordinator delegates cleanly to both new owners without reimplementing their logic.

### Anti-Fragmentation Verdict

The two extractions are **complete, durable adjacent owners with no residual fragments** left in the runtime coordinator:

- `OpenCodeStreamingFinalizationCoordinator.ts` (641 lines): owns the full finalization behavior slice including tail recovery, metadata assembly, trailing content replay, and structured error extraction.
- `OpenCodeLegacySseStreamReader.ts` (181 lines): owns the full SSE protocol boundary including fetch connection, reader management, chunk decoding, buffer handling, and abort lifecycle.

### Next Lane Target

**No safe unattended target identified. Queue PAUSED.**

- `OpenCodianView.ts` (5314+ lines, 80+ methods) lacks a clear, cohesive extraction boundary. AGENTS.md forbids adding new runtime ownership to this file.
- `OpenCodeSessionStateStore` requires manual boundary analysis before it can be assessed as a viable target.
- Next lane must be explicitly designed with: specific target, clear owner boundary, scope, forbidden paths, and acceptance criteria.

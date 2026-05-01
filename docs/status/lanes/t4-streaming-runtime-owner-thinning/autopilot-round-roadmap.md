# Streaming Runtime Owner Thinning Roadmap

## Goal

Extract cohesive behavior slices from `OpenCodeStreamingRuntimeCoordinator.ts` into durable adjacent owners, keeping the runtime coordinator focused on transport coordination without growing new runtime ownership.

## Batches

### stream-1: Extract streaming finalization (COMPLETE)

**Commit**: `784b904a`
**Target**: `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
**New owner**: `src/core/opencode/OpenCodeStreamingFinalizationCoordinator.ts`

**Moved**:
- Final assistant tail recovery (`loadAssistantTail`, `findLatestAssistantMessage`)
- Final metadata/error chunk assembly (`buildAssistantMetadataChunk`, `buildAssistantErrorChunk`)
- Trailing text/reasoning/tool replay (`collectAssistantTrailing*Chunks`)
- Structured error extraction (`extractStructuredErrorMessage`)
- Helper functions (`resolveReasoningDurationSeconds`, `summarizeAssistantParts`, etc.)

**Kept in runtime coordinator**:
- Transport selection (`streamResponse`)
- Active stream registry (`activeStreams`, `createActiveStreamContext`)
- SDK/legacy fallback (`streamSdkResponse`, `streamLegacyResponse`)
- Cancel/detach lifecycle (`cancelStream`, `detachStream`)
- SSE reader lifecycle (`connectSSE`, `readSseStream`, etc.) — later moved to stream-2

**Verification**:
- 0 lint errors, 1 pre-existing warning
- 1771 tests passed
- Build OK
- 16 focused finalization tests added

### stream-2: Extract legacy SSE reader lifecycle (COMPLETE)

**Commit**: `46bd6042`
**Target**: `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
**New owner**: `src/core/opencode/OpenCodeLegacySseStreamReader.ts`

**Moved**:
- SSE fetch connection (`openSseReader`)
- Reader context management (`createSseStreamContext`, `disposeSseStreamContext`)
- Chunk reading and decoding (`readSseStream`, `readNextSseTextChunk`, `readSseChunk`)
- Buffer management and event parsing delegation (`emitParsedSseEvents`, `flushRemainingSseEvents`)
- Abort handling (`createSseAbortHandler`, `shouldStopSseStream`, `isAbortedSseRead`)
- Public entry (`connectSSE`)

**Kept in runtime coordinator**:
- Transport selection (`streamResponse`)
- Active stream registry (`activeStreams`, `createActiveStreamContext`)
- SDK/legacy fallback (`streamSdkResponse`, `streamLegacyResponse`)
- Cancel/detach lifecycle (`cancelStream`, `detachStream`)
- Event transformation and mutation application (`consumeLegacyEventStream`)
- Finalization delegation (`finishStreamingResponse`)

**Verification**:
- 0 lint errors, 1 pre-existing warning
- 1781 tests passed
- Build OK
- 10 focused legacy SSE reader tests added

### stream-3: Checkpoint documentation (COMPLETE)

**Commit**: `5f44cbfd`
**Scope**: documentation-only

- Recorded lane outcome, final commits, owner-shape changes, verification evidence
- Assessed `OpenCodeStreamingRuntimeCoordinator.ts` as remaining cohesive transport owner
- Proposed next thick-owner target order with anti-fragmentation rationale
- Updated `autopilot-status.md`, `autopilot-round-roadmap.md`, and `tasks.md`

**Verification**:
- 0 lint errors, 1 pre-existing warning
- 1781 tests passed
- Build OK
- Documentation-only change, no source modifications

## Lane Completion

**Status: COMPLETE.**

### Owner Shape After Lane

- `OpenCodeStreamingRuntimeCoordinator.ts` (485 lines): transport selection, active stream registry, SDK/legacy fallback, event transformation, cancel/detach lifecycle, finalization delegation
- `OpenCodeStreamingFinalizationCoordinator.ts` (641 lines): final assistant tail recovery, final metadata/error chunk assembly, trailing text/reasoning/tool replay, structured error extraction
- `OpenCodeLegacySseStreamReader.ts` (181 lines): SSE fetch connection, reader context management, chunk reading/decoding, buffer management, abort handling

### Anti-Fragmentation Assessment

The two extractions are **complete, durable adjacent owners**:

1. **No residual fragments**: The runtime coordinator does not hold any partial logic from either extracted responsibility. All finalization logic lives in `OpenCodeStreamingFinalizationCoordinator`; all SSE read-loop logic lives in `OpenCodeLegacySseStreamReader`.
2. **Clean delegation**: The runtime coordinator calls `finishStreamingResponse()` (delegation) without reimplementing tail recovery, metadata assembly, or error extraction.
3. **Clean protocol boundary**: The runtime coordinator calls `connectSSE()` (protocol boundary) without managing fetch connections, readers, buffers, or chunk decoding.
4. **No new ownership**: The runtime coordinator did not gain any new runtime ownership during the lane.

### Next Lane

**Explicit design required before resuming unattended execution.**

- `OpenCodianView.ts` (5314+ lines, 80+ methods) lacks a safe, cohesive extraction boundary for unattended batch processing
- `OpenCodeSessionStateStore` requires boundary analysis before it can be assessed as a viable target
- AGENTS.md forbids adding new runtime ownership to `OpenCodianView.ts` or `OpenCodeService.ts`
- Next lane must define: specific target, clear owner boundary, scope, forbidden paths, and acceptance criteria

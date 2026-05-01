# Streaming Runtime Owner Thinning Roadmap

## Goal

Extract cohesive behavior slices from `OpenCodeStreamingRuntimeCoordinator.ts` into durable adjacent owners, keeping the runtime coordinator focused on transport coordination without growing new runtime ownership.

## Batches

### stream-1: Extract streaming finalization (COMPLETE)

**Target**: `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
**New owner**: `src/core/opencode/OpenCodeStreamingFinalizationCoordinator.ts`

**Moved**:
- Final assistant tail recovery (`loadAssistantTail`, `findLatestAssistantMessage`)
- Final metadata/error chunk assembly (`buildAssistantMetadataChunk`, `buildAssistantErrorChunk`)
- Trailing text/reasoning/tool replay (`collectAssistantTrailing*Chunks`)
- Helper functions (`resolveReasoningDurationSeconds`, `summarizeAssistantParts`, `extractStructuredErrorMessage`, etc.)

**Kept in runtime coordinator**:
- Transport selection (`streamResponse`)
- Active stream registry (`activeStreams`, `createActiveStreamContext`)
- SDK/legacy fallback (`streamSdkResponse`, `streamLegacyResponse`)
- Cancel/detach lifecycle (`cancelStream`, `detachStream`)
- SSE reader lifecycle (`connectSSE`, `readSseStream`, etc.) — later moved to stream-2

**Deliverables**:
- `src/core/opencode/OpenCodeStreamingFinalizationCoordinator.ts`
- `tests/unit/core/opencode/OpenCodeStreamingFinalizationCoordinator.test.ts`
- `docs/modules/core/opencode/OpenCodeStreamingFinalizationCoordinator.md`
- Updated `docs/modules/core/opencode/OpenCodeStreamingRuntimeCoordinator.md`
- Updated `docs/modules/README.md`

### stream-2: Extract legacy SSE reader lifecycle (COMPLETE)

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

**Deliverables**:
- `src/core/opencode/OpenCodeLegacySseStreamReader.ts`
- `tests/unit/core/opencode/OpenCodeLegacySseStreamReader.test.ts`
- `docs/modules/core/opencode/OpenCodeLegacySseStreamReader.md`
- Updated `docs/modules/core/opencode/OpenCodeStreamingRuntimeCoordinator.md`
- Updated `docs/modules/README.md`

## Lane Completion

- **stream-3**: Checkpoint documentation recorded
- **Owner shape after lane**:
  - `OpenCodeStreamingRuntimeCoordinator.ts` (485 lines): transport selection, active stream registry, SDK/legacy fallback, event transformation, cancel/detach lifecycle, finalization delegation
  - `OpenCodeStreamingFinalizationCoordinator.ts` (641 lines): final assistant tail recovery, final metadata/error chunk assembly, trailing text/reasoning/tool replay, structured error extraction
  - `OpenCodeLegacySseStreamReader.ts` (181 lines): SSE fetch connection, reader context management, chunk reading/decoding, buffer management, abort handling
- **Anti-fragmentation assessment**: The two extractions are complete, durable adjacent owners. The runtime coordinator does not hold residual fragments of either extracted responsibility.
- **Next lane**: explicit design required before resuming unattended execution. `OpenCodianView.ts` and `OpenCodeSessionStateStore` are candidates but need boundary analysis.

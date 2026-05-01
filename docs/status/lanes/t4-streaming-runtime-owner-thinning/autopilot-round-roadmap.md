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

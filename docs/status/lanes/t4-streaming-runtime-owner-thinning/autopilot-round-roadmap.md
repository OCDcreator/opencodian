# Streaming Runtime Owner Thinning Roadmap

## Goal

Extract cohesive behavior slices from `OpenCodeStreamingRuntimeCoordinator.ts` into durable adjacent owners, keeping the runtime coordinator focused on transport coordination without growing new runtime ownership.

## Batches

### stream-1: Extract streaming finalization (IN PROGRESS)

**Target**: `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
**New owner**: `src/core/opencode/OpenCodeStreamingFinalizationCoordinator.ts`

**Move**:
- Final assistant tail recovery (`loadAssistantTail`, `findLatestAssistantMessage`)
- Final metadata/error chunk assembly (`buildAssistantMetadataChunk`, `buildAssistantErrorChunk`)
- Trailing text/reasoning/tool replay (`collectAssistantTrailing*Chunks`)
- Helper functions (`resolveReasoningDurationSeconds`, `summarizeAssistantParts`, `extractStructuredErrorMessage`, etc.)

**Keep in runtime coordinator**:
- Transport selection (`streamResponse`)
- Active stream registry (`activeStreams`, `createActiveStreamContext`)
- SDK/legacy fallback (`streamSdkResponse`, `streamLegacyResponse`)
- Cancel/detach lifecycle (`cancelStream`, `detachStream`)
- SSE reader lifecycle (`connectSSE`, `readSseStream`, etc.)

**Deliverables**:
- `src/core/opencode/OpenCodeStreamingFinalizationCoordinator.ts`
- `tests/unit/core/opencode/OpenCodeStreamingFinalizationCoordinator.test.ts`
- `docs/modules/core/opencode/OpenCodeStreamingFinalizationCoordinator.md`
- Updated `docs/modules/core/opencode/OpenCodeStreamingRuntimeCoordinator.md`
- Updated `docs/modules/README.md`

### stream-2+: TBD

Future extractions from `OpenCodeStreamingRuntimeCoordinator.ts` if additional cohesive slices are identified. Must follow the same rules:
- No thin helper proliferation
- New owner must own a complete behavior slice
- Runtime coordinator must not gain new runtime ownership

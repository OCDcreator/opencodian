# Question Tool-Part Fallback Final Alignment Design

## Context

`docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md` originally identified four AskQuestion alignment gaps: stale report calibration, dock waiter cleanup, keyboard UX, and protocol fallback. The first three implementation slices have now landed:

- report calibration and waiter cleanup
- above-input `QuestionDock` keyboard controls
- inline `QuestionInlineCardRenderer` keyboard controls

The remaining source-level risk is protocol resilience in `OpenCodeStreamEventTransformer`. Current OpenCodian already handles the canonical `question.asked` event and polling through `question.list()`, but it does not emit a `question_request` chunk from a tool part if a future or alternate OpenCode stream shape carries a pending question in tool-part state. Current local OpenCode reference primarily exposes `question.asked` plus `question.list/reply/reject`; no current-source `POST /question/ask` route or confirmed `waiting` metadata route should be treated as a required API.

## Goal

Bring AskQuestion alignment to a final, source-backed state by:

1. Adding a conservative tool-part fallback that emits a question request only when the part is the `question` tool, is explicitly in `waiting` state, and contains a payload that the existing question normalizer accepts.
2. Preserving existing tool rendering and task/MCP metadata behavior.
3. Updating the module docs and status report so they describe the completed Dock/Inline keyboard work, the waiter cleanup, the protocol fallback, and the remaining non-blocking upstream caveats accurately.

## Non-Goals

- Do not add a new OpenCode question API route.
- Do not infer questions from arbitrary tool metadata.
- Do not add confirm-type schema expansion unless current OpenCode exposes it as a distinct type; current prompts are still option-based question prompts.
- Do not add waiter timeouts in this slice. Local waiter cleanup is already fixed, and server-side pending lifecycle still depends on explicit reply/reject.
- Do not change UI layout, settings, locale strings, or deployment artifacts.

## Approach Options

### Option A: Report-only closeout

Update the status document to say current OpenCode does not expose a waiting metadata path. This is accurate for the local reference, but it leaves OpenCodian less defensive if an alternate stream path appears.

### Option B: Broad metadata sniffing

Try to normalize every tool part's metadata as a question request. This maximizes catch-all behavior but risks false positives, duplicate UI, and accidental interpretation of unrelated tool metadata.

### Option C: Conservative `question` tool waiting fallback

Detect only `tool === "question"` parts with `state.status === "waiting"` and try a small set of explicit payload shapes:

- `state.metadata`
- `state.metadata.request`
- `state.metadata.question`
- the tool part itself

The existing `normalizeQuestionRequest()` host seam remains the only validator. If normalization fails, no chunk is emitted. This gives OpenCodian a protocol fallback without inventing a new schema or weakening unrelated tool behavior.

**Chosen:** Option C.

## Design

`OpenCodeStreamEventTransformer` will gain a helper that attempts to extract a `QuestionRequest` from a waiting question tool part:

- `isWaitingQuestionToolPart(part)` returns true only for `part.type === "tool"`, `part.tool === "question"`, and `part.state.status === "waiting"`.
- `resolveQuestionRequestFromToolPart(part)` calls `host.normalizeQuestionRequest()` against candidate payloads in order.
- `appendWaitingQuestionRequestChunk(part, chunks)` pushes `{ type: "question_request", request }` when a valid request is found.

Both `handleToolPartUpdated()` and `appendToolPartChunks()` will call the helper before the existing tool-use logic. The normalizer is intentionally reused so the fallback accepts only the same `id/sessionID/questions` shape as `question.asked` and `question.list()`.

Existing tool behavior remains intact:

- The fallback can emit a question chunk and the existing tool-use chunk for the same part; the question chunk is what wakes the interactive UI, while the tool chunk preserves the stream timeline.
- Non-`question` tools never attempt question normalization.
- `question` tool parts in `running`, `pending`, `completed`, or `error` state do not trigger the fallback.
- If metadata is malformed or answer-only metadata from a completed tool, no question chunk is emitted.

## Testing

Add focused unit coverage in `tests/unit/core/opencode/OpenCodeStreamEventTransformer.streamPartHandlingSuite.ts`:

- A `message.part.updated` event for a `question` tool in `waiting` state with request metadata emits `question_request`.
- A non-question tool in `waiting` state does not call the question normalizer and does not emit a question request.
- `transformPartToChunks()` also supports the fallback for helper callers.

Run:

- `npm test -- OpenCodeStreamEventTransformer --runInBand`
- `npm run check:module-docs`
- `npm run graphify:update:src`
- `npm run check:graphify`
- `npm run verify`

## Documentation

Update:

- `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`
- `docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md`

The status report should become a final alignment record, not another stale gap list. It should state that keyboard UX and waiter cleanup are implemented, protocol fallback is implemented conservatively, and no further required AskQuestion alignment item remains for the current local OpenCode contract.

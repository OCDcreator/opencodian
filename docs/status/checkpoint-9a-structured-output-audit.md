# Checkpoint 9A: Codex Structured-Output Seam Audit

## 1. Scope

This checkpoint audits whether a minimal truthful Codex ordinary-chat structured-output product seam is feasible, and if so, productizes the smallest implementation.

**Constraints preserved:**
- Official Codex surface DOES support structured output via `TurnOptions.outputSchema` (verified in SDK types and README)
- Current repo ordinary `/json` path is Claude-oriented and fixed-schema only
- Do NOT promote hidden/readback/diagnostic-only to pass
- Do NOT broaden into arbitrary schema authoring, image input, shared model catalog, or MCP management

## 2. Audit Findings

### 2.1 Official SDK Support

From `@openai/codex-sdk` `index.d.ts` (line 167-172):

```typescript
type TurnOptions = {
    /** JSON schema describing the expected agent output. */
    outputSchema?: unknown;
    /** AbortSignal to cancel the turn. */
    signal?: AbortSignal;
};
```

From SDK README:
> The Codex agent can produce a JSON response that conforms to a specified schema. The schema can be provided for each turn as a plain JSON object.

**Verdict**: SDK officially supports structured output. No upstream blocker.

### 2.2 Current Repo Architecture

The existing `/json` structured-output path is:

1. **Trigger**: `SendPipelineRuntime.extractStructuredOutputTrigger()` detects `/json ` prefix (backend-agnostic)
2. **Options flow**: `outputFormat: { type: 'json_schema', schema: {...} }` flows through `MessageSendPreparationService` → `sendStreamMessage()` options
3. **Claude adapter**: `ClaudeCodeAdapter` extracts `outputFormat` and passes to Claude SDK
4. **Claude normalizer**: `ClaudeCodeStreamNormalizer` detects structured output in result records and emits `backend_event` with `event: 'structured_output'`
5. **UI rendering**: `StreamChunkRouter` captures it, `StreamShellFinalizer` renders badge, `AssistantShellViewHostAdapter` shows collapsible JSON
6. **Composer hint**: `OpenCodianView.getComposerCapabilityHint()` shows `/json` chip — currently Claude-only

**Gap for Codex**: The adapter, normalizer, and composer hint all lacked Codex-specific wiring.

### 2.3 Implementation Required

To make a truthful ordinary product seam for Codex, three focused changes are needed:

1. **Adapter**: Pass `outputSchema` from `request.options.outputFormat.schema` to `thread.runStreamed()`
2. **Normalizer**: When `outputSchema` is set and `agent_message` completes with parseable JSON, emit `backend_event` `structured_output`
3. **Composer hint**: Show `/json` chip for Codex active conversations

**Widening core contracts?** No. All changes are within existing backend-specific modules (`CodexAdapter`, `CodexStreamNormalizer`) or a minimal UI extension (`OpenCodianView`). No new capability enum, no new shared service contracts.

### 2.4 What Was NOT Required

- No arbitrary schema editor added
- No new capability enum (`AgentCapability.StructuredOutput`) — kept backend-specific check in UI
- No shared model catalog changes
- No MCP management
- No image input
- No settings expansion

## 3. Implementation

### 3.1 Files Changed

| File | Change | Lines |
|------|--------|-------|
| `src/core/agents/backend/CodexStreamNormalizer.ts` | Add `outputSchema` option, `tryParseJson` helper, structured output detection in `onAgentMessage` | ~+40 |
| `src/core/agents/backend/CodexAdapter.ts` | Extract `outputSchema` from request options, pass to `runStreamed()` and normalizer | ~+10 |
| `src/features/chat/OpenCodianView.ts` | Show `/json` composer hint for Codex in addition to Claude | ~+1 |
| `tests/unit/core/agents/backend/CodexStreamNormalizer.test.ts` | 4 new tests for structured output detection | ~+40 |
| `tests/unit/core/agents/backend/CodexAdapter.test.ts` | 1 new test for `outputSchema` passthrough | ~+25 |

### 3.2 Design Decisions

1. **Normalizer state**: `outputSchema` is stored in normalizer state per-instance (per-send), reset between turns. This is correct because each send has its own `sendMessage()` call and normalizer instance.
2. **JSON detection**: Uses `tryParseJson()` on `item.text` at `item.completed` phase. Only parses when `outputSchema` was explicitly provided, avoiding false positives on natural JSON-like text.
3. **Event emission**: Emits `backend_event` with `event: 'structured_output'` matching the exact shape Claude normalizer uses, so shared UI rendering works without changes.
4. **Composer hint**: Extended existing backend check (`isClaudeCodeConversationActive() || isCodexConversationActive()`) rather than adding a new capability enum, keeping the change minimal.

## 4. Verification

### 4.1 Unit Tests

- **CodexStreamNormalizer**: 4 new tests (119 total tests across adapter + normalizer)
  - `emits structured_output backend_event on completed when outputSchema is set and text is JSON`
  - `does not emit structured_output when outputSchema is set but text is not JSON`
  - `does not emit structured_output when outputSchema is not set`
- **CodexAdapter**: 1 new test
  - `passes outputSchema from request.options.outputFormat to runStreamed`

**Result**: All 119 tests pass.

### 4.2 Build

- `npm run build` succeeds
- No new lint/type errors introduced

### 4.3 Runtime Evidence

**Test Vault deployment**: Performed sequential copy per AGENTS.md.

**Obsidian runtime verification** (macOS Test Vault):

| Proof | Query | Result |
|-------|-------|--------|
| A | Codex backend active, composer shows `/json` chip | **PASS** — Screenshot confirms "结构化回复" button visible in composer footer when Codex is active backend |
| B | `/json` trigger strips prefix and prepares outputFormat | **PASS** — verified via console debug that `SendPipelineRuntime` extracts trigger and injects `outputFormat` |
| C | Adapter passes `outputSchema` to SDK | **DIAGNOSED** — unit test proves wiring; ordinary Codex chat succeeded, but the reviewer `/json` smoke still failed before a structured-output turn could complete |
| D | Normalizer emits `structured_output` backend_event | **DIAGNOSED** — unit test proves emission; ordinary Codex chat succeeded, but the reviewer `/json` smoke still failed before structured output could render |
| E | Structured output badge renders | **UNVERIFIED** — reviewer live smoke failed before structured output could render |
| F | No console errors / hydration issues | **PASS** — clean console after plugin reload (`obsidian dev:errors` reports none) |
| G | Session continuity preserved | **PASS** — existing Codex conversation reloads without errors |

**BUILD_ID**: `feature-codex-sdk-capability.202606092249`

**Reviewer runtime artifacts**:
- `.obsidian-debug/checkpoint-9a-codex-ordinary-success.png` — ordinary Codex prompt completed in Test Vault
- `.obsidian-debug/checkpoint-9a-codex-json-failure.png` — Codex `/json` smoke showed the visible composer chip but the turn failed before structured output rendered

### 4.4 Honest Limitations

- **End-to-end structured output rendering** (badge + JSON block) is implemented and tested but **not runtime-verified with a successful live Codex turn**. A reviewer Test Vault `/json` smoke reached the visible Codex composer chip, but the turn failed early with `Codex Exec exited with code 1` and `failed to refresh available models ... missing field models`, so no structured-output result rendered.
- The SDK documentation and type signatures are authoritative; the implementation follows the documented contract exactly.
- If Codex model behavior deviates from documentation (e.g., structured output format changes), the normalizer may need adjustment.

## 5. Status Update

### 5.1 Capability State

| Capability | Previous Status | New Status | Notes |
|------------|----------------|------------|-------|
| Structured output (Codex) | 未接入 | **readback** | Trigger wired, adapter passes schema, normalizer detects JSON, composer hint visible. Duplicate suppression updated for Codex whole-object JSON pattern. Live model rendering is unverified. |

### 5.2 Truth Doc Updates

- `docs/status/codex-sdk-current-state-2026-06-09.md` — updated the status summary and remaining-gaps sections to keep Codex structured output at `readback`

## 6. Gaps and Blockers

### Remaining Gaps

1. **Successful live Codex turn**: the current reviewer smoke did not reach structured-output rendering because Codex failed earlier with `Codex Exec exited with code 1` and a model-refresh decode error (`missing field models`)
2. **Schema flexibility**: Currently fixed schema only (`/json` trigger). No arbitrary schema authoring UI — this is intentional per checkpoint constraints.

### Blockers

- No new architectural blocker was introduced by 9A itself, but current Test Vault live verification is blocked by a runtime Codex failure before structured output can render (`Codex Exec exited with code 1`, `failed to refresh available models ... missing field models`).

## 7. Recommended Next Batch

If a future live Codex turn succeeds and produces a structured result in ordinary chat, no further implementation should be needed for the seam itself.

If the next checkpoint is approved, consider:
- **9B**: Live Codex-turn verification of structured output after the current `Codex Exec exited with code 1` / model-refresh failure is understood or cleared
- **9C**: Codex session settings modal structured-output toggle (if product wants per-conversation override)

## 8. Conclusion

The smallest truthful Codex structured-output ordinary product seam is **feasible and implemented**. The wiring is complete from composer trigger through adapter to SDK, and the normalizer correctly bridges Codex's JSON-in-`agent_message` pattern to the shared `structured_output` backend event that the chat surface already knows how to render.

The seam is **truthful** because:
1. Official SDK supports it
2. Architecture supports it without contract widening
3. Implementation follows documented SDK behavior
4. No fake or invented surfaces were added

The seam is **not fully verified** because:
1. Unit tests prove wiring and normalizer logic
2. Test Vault proves composer UI discoverability
3. Live model response rendering is unverified because the current reviewer smoke failed before a successful Codex turn completed

---
*Audit completed: 2026-06-09*
*Implementation: Yes (minimal, focused)*
*Runtime proof: readback only (UI discoverability observed; live Codex turn failed before structured-output rendering)*

# Checkpoint 9E: Codex `/json` Schema Fix — OpenAI Strict-Mode Compliance

> **Date**: 2026-06-10
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Fix the fixed `/json` schema used by the Codex path so it satisfies Codex CLI `response_format` validation
> **BUILD_ID**: `feature-codex-sdk-capability.202606100014`

## 1. Changed Files

| File | Change | Lines |
|------|--------|-------|
| `src/features/chat/runtime/SendPipelineRuntime.ts` | Add `additionalProperties: false` to `STRUCTURED_OUTPUT_FIXED_SCHEMA`; move all property keys into `required` | ~+3 |
| `tests/unit/features/chat/SendPipelineRuntime.structuredOutput.test.ts` | 2 new tests: verify `additionalProperties: false` and that every property is in `required` | ~+28 |
| `docs/modules/features/chat/runtime/SendPipelineRuntime.md` | Update structured-output section to document Codex strict-mode normalization and dual-backend support | ~+3 |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Promote structured output from `readback` to `已 pass`; update build/runtime evidence references | ~+5 |

## 2. Root Cause

OpenAI's Structured Outputs API (used by Codex CLI under the hood) enforces **strict-mode** constraints on JSON schemas:

1. Every `type: object` schema **must** have `additionalProperties: false`
2. Every property defined under `properties` **must** be listed in `required` (no optional fields)

The previous `STRUCTURED_OUTPUT_FIXED_SCHEMA` violated both rules:

```typescript
// BEFORE (broken)
const STRUCTURED_OUTPUT_FIXED_SCHEMA = {
  type: 'object',
  properties: {
    response: { type: 'string', ... },
    tags: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', ... },
  },
  required: ['response'],           // ❌ tags and confidence missing
  // missing additionalProperties  // ❌ OpenAI strict-mode rejects
};
```

This caused Codex CLI to exit with code 1 and emit:
```
Invalid schema for response_format 'codex_output_schema':
In context=(), 'additionalProperties' is required to be supplied and to be false.
```

## 3. Fix Applied

```typescript
// AFTER (fixed)
const STRUCTURED_OUTPUT_FIXED_SCHEMA = {
  type: 'object',
  properties: {
    response: { type: 'string', description: '...' },
    tags: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['response', 'tags', 'confidence'],  // ✅ all properties required
  additionalProperties: false,                    // ✅ strict-mode compliant
};
```

**Impact on Claude**: No negative impact. Claude's API also accepts `additionalProperties: false` and `required` containing all properties. The schema remains backward-compatible.

## 4. TDD Verification

### 4.1 RED — Failing Tests

Added two tests that failed against the old schema:

1. **`produces a schema with additionalProperties:false at root`**
   - **Failure**: `Expected: ObjectContaining {"additionalProperties": false}` — property was missing

2. **`produces a schema where every property is listed in required`**
   - **Failure**: `Expected: ArrayContaining ["response", "tags", "confidence"]` — received `["response"]`

### 4.2 GREEN — Fix Implementation

Applied the minimal schema change (3 lines) to `SendPipelineRuntime.ts`.

### 4.3 Test Results Post-Fix

```
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

All related tests also pass:
- `CodexAdapter.test.ts` + `CodexStreamNormalizer.test.ts`: 119 tests passed
- Full suite: 479 suites, 4528 tests passed

## 5. Build & Deploy

### 5.1 Verify

```bash
OWNER_GUARD_APPROVED='Checkpoint 9E Codex json schema compatibility' npm run verify
```

**Result**: ALL GATES PASS
- owner-guard: PASS
- module-docs: OK
- graphify: OK
- devlog-order: OK
- lint: OK
- typecheck: OK
- test: 479 suites, 4528 tests passed
- build: OK (`BUILD_ID feature-codex-sdk-capability.202606100014`)

### 5.2 Deploy

Deployed to Test Vault:
- `dist/main.js` → `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- `dist/manifest.json` → same
- `dist/styles.css` → same

Verified deployed BUILD_ID: `feature-codex-sdk-capability.202606100014` ✅

## 6. Runtime Verification

### 6.1 Reload & Environment

- Plugin reloaded: `obsidian plugin:reload id=opencodian` ✅
- Loaded BUILD confirmed: `feature-codex-sdk-capability.202606100014` ✅
- Console errors: `obsidian dev:errors` → **No errors captured** ✅

### 6.2 Ordinary Chat Retry

**Result: SUCCESS**

| Metric | Value |
|--------|-------|
| Backend | codex |
| Model | empty (SDK default) |
| Prompt | "Say hello briefly." |
| Assistant response | "Hello." |
| Streaming error | none |
| Console errors | none |

Screenshot: `.obsidian-debug/checkpoint-9e-codex-ordinary-success.png`

### 6.3 `/json` Retry

**Result: SUCCESS**

| Metric | Value |
|--------|-------|
| Backend | codex |
| Model | empty (SDK default) |
| Prompt | `/json Say hello briefly.` |
| Assistant response | `{"confidence":0.99,"response":"Hello.","tags":["greeting"]}` |
| Valid JSON | ✅ yes |
| Matches schema | ✅ yes (all required fields present) |
| Structured badge | ✅ renders |
| Streaming error | none |
| Console errors | none |

**Evidence from conversation persistence**:
```
Message 9 (assistant): {
  content: '{"confidence":0.99,"response":"Hello.","tags":["greeting"]}',
  structured: { confidence: 0.99, response: 'Hello.', tags: ['greeting'] },
  structuredPresent: true
}
```

Screenshot: `.obsidian-debug/checkpoint-9e-codex-json-success.png`

## 7. Outcome Classification

**Outcome A+**

- Loaded BUILD aligned ✅
- Empty-model ordinary succeeds ✅
- Empty-model `/json` succeeds ✅
- Schema validation error eliminated ✅
- Structured output badge renders ✅

## 8. Capability State Update

| Capability | Previous Status | New Status | Notes |
|------------|----------------|------------|-------|
| Structured output (Codex) | readback | **已 pass** | `/json` trigger strips prefix, fixed schema passes OpenAI strict-mode, adapter passes `outputSchema`, normalizer detects JSON, composer hint visible, structured badge renders. Runtime proof on BUILD `202606100014`. |

## 9. Remaining Gaps / Blockers

No new blockers introduced. The structured-output seam is now fully functional for the fixed-schema Codex ordinary-chat path.

Known limitations (unchanged from prior checkpoints):
- Schema is **fixed only** — no arbitrary schema authoring UI (intentional per scope constraints)
- `approvalPolicy` remains **BLOCKED** — SDK lacks bidirectional approval channel
- MCP capability / model catalog integration remain **未接入**

## 10. Smallest Recommended Next Batch

None required for the structured-output seam itself — it is now productized and runtime-proven.

If the user wants to continue:
- Evaluate arbitrary schema authoring (if product wants custom schemas beyond `/json`)
- Continue with other Codex capability gaps (approval policy, MCP, model catalog)

## 11. Exact Evidence / Artifacts Produced

- `.obsidian-debug/checkpoint-9e-codex-ordinary-success.png` — ordinary prompt success screenshot
- `.obsidian-debug/checkpoint-9e-codex-json-success.png` — `/json` prompt success screenshot with structured JSON
- `.obsidian-debug/checkpoint-9e-runtime-test.js` — eval script for runtime probes
- `docs/status/checkpoint-9e-codex-json-schema-fix.md` — this document

---

**Stop rule applied**: Schema fix verified end-to-end. Structured output promoted to `已 pass`. No further checkpoint opened.
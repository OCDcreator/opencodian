# Checkpoint 9B: Codex `/json` Failure Root-Cause Audit

> **Date**: 2026-06-09
> **Branch**: `feature/codex-sdk-capability`
> **Auditor**: Read-only diagnostic session
> **Scope**: Explain why ordinary Codex chat succeeds while Codex `/json` fails in Test Vault

## 1. Executive Summary

**Status**: `ambiguous` — evidence points to a Codex CLI/runtime failure, but the newer standalone reproduction weakens the earlier theory that `outputSchema` alone is the trigger.

Ordinary Codex chat is proven working (screenshot: `.obsidian-debug/checkpoint-9a-codex-ordinary-success.png`). The `/json` structured-output path fails before any structured output can render, with the Codex CLI subprocess exiting with code 1 and emitting a model-refresh deserialization error (`missing field models`).

The **first meaningful divergence inside the plugin code path** is at `CodexAdapter.sendMessage()` where `thread.runStreamed()` is called with `outputSchema` present vs. absent. However, a later standalone SDK reproduction with explicit `model: "o4-mini"` failed for both ordinary and structured sends, so this divergence is no longer sufficient to explain the runtime failure by itself.

## 2. Code-Path Comparison

### 2.1 Ordinary Codex Send (Working)

```
OpenCodianView.handleComposerInputSubmission({kind: 'prompt', content: 'hello'})
  → SendPipelineRuntime.sendMessage({content: 'hello'})
    → extractStructuredOutputTrigger('hello') → null (no /json prefix)
    → MessageSendPreparationService.prepareMessageSend({content: 'hello'})
      → modelOptions = {provider, model} (no outputFormat field)
    → SendPipelineRuntime.createStreamingExecution(preparedSend, 'hello')
      → host.sendStreamMessage(conversation, 'hello', {
           sessionId: backendSessionId,
           provider, model,  // ← no outputFormat
           contextItems, messageID, requestParts
         })
        → backend.sendMessage({sessionId, content: 'hello', options: {provider, model}})
          → CodexAdapter.sendMessage(request)
            → outputSchema = undefined (request.options has no outputFormat)
            → thread.runStreamed('hello', {})  // ← no outputSchema
              → ✅ SUCCESS
```

### 2.2 Codex `/json` Send (Failing)

```
OpenCodianView.handleComposerInputSubmission({kind: 'prompt', content: '/json hello'})
  → SendPipelineRuntime.sendMessage({content: '/json hello'})
    → extractStructuredOutputTrigger('/json hello')
      → returns {cleanContent: 'hello', outputFormat: {type: 'json_schema', schema: STRUCTURED_OUTPUT_FIXED_SCHEMA}}
    → preparationOptions = {content: 'hello', outputFormat: {type: 'json_schema', schema: {...}}}
    → MessageSendPreparationService.prepareMessageSend(preparationOptions)
      → modelOptions = {provider, model}
      → if (options.outputFormat) { modelOptions.outputFormat = options.outputFormat }  // ← MERGED HERE
    → SendPipelineRuntime.createStreamingExecution(preparedSend, 'hello')
      → host.sendStreamMessage(conversation, 'hello', {
           sessionId: backendSessionId,
           provider, model,
           outputFormat: {type: 'json_schema', schema: {...}},  // ← PRESENT
           contextItems, messageID, requestParts
         })
        → backend.sendMessage({sessionId, content: 'hello', options: {provider, model, outputFormat: {...}}})
          → CodexAdapter.sendMessage(request)
            → outputFormat = request.options.outputFormat
            → outputSchema = outputFormat.schema  // ← the fixed schema object
            → thread.runStreamed('hello', {outputSchema: {...}})  // ← outputSchema PASSED
              → ❌ FAILURE: "Codex Exec exited with code 1"
              → ❌ "failed to refresh available models: stream disconnected before completion: failed to decode models response: missing field models"
```

### 2.3 First Meaningful Divergence

**File**: `src/core/agents/backend/CodexAdapter.ts:283-287`

```typescript
const streamed = await thread.runStreamed(request.content, {
  signal: controller.signal,
  ...(outputSchema !== undefined ? { outputSchema } : {}),
});
```

This is the **only** difference in the plugin code path between ordinary and `/json` sends. When `outputSchema` is omitted, the CLI succeeds. When `outputSchema` is provided, the CLI subprocess exits with code 1.

## 3. Error Analysis

### 3.1 Error Source

The error messages are **not emitted by plugin code**. They originate from the Codex CLI binary itself:

- `"failed to refresh available models"` — found in binary strings (`node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`)
- `"stream disconnected before completion"` — found in binary strings
- `"missing field models"` — inferred from deserialization context in binary strings

This is a **CLI-internal error**, not a plugin serialization or network error.

### 3.2 What the Error Means

The Codex CLI, when receiving `outputSchema`, appears to perform a **model-list refresh** (likely to validate that the selected model supports structured output). This refresh makes an API call to OpenAI's `/models` endpoint (or equivalent). The response fails deserialization because the `models` field is missing from the JSON response.

Why would the `models` field be missing?
1. **API response format changed** — OpenAI's API response no longer includes `models` array in the expected shape
2. **Authentication/network issue** — the request returned an error page or unexpected JSON
3. **Model-specific incompatibility** — the current model doesn't support structured output, and the CLI's fallback model-list query fails
4. **Codex CLI bug** — the CLI has a deserialization bug that surfaces only when `outputSchema` triggers the model-validation path

### 3.3 New Standalone Reproduction Evidence

After this audit was first drafted, a standalone Node reproduction was run from the worktree with:

- `new Codex()`
- `startThread({ model: "o4-mini", skipGitRepoCheck: true, workingDirectory: process.cwd() })`
- one ordinary `runStreamed("Say hello briefly.")`
- one structured `runStreamed("Say hello briefly.", { outputSchema: schema })`

**Result**:

- the ordinary case failed
- the structured case also failed
- both cases emitted the same CLI-internal model refresh decode error:
  - `failed to refresh available models ... missing field models`
- the ordinary case also showed repeated upstream/gateway errors:
  - `503 Service Unavailable: No available channel for model o4-mini under group default (distributor)`
- both cases logged:
  - `Unknown model o4-mini is used. This will use fallback model metadata.`

This means the earlier working-vs-failing contrast is **not reproducible** once the model is pinned explicitly in standalone SDK usage. The stronger current suspect is now the explicit model / gateway / model-catalog path, not `outputSchema` alone.

## 4. Hypothesis Ranking

| Rank | Hypothesis | Evidence For | Evidence Against | Likelihood |
|------|-----------|--------------|------------------|------------|
| 1 | **Explicit `model: "o4-mini"` is invalid or unavailable in the current Codex gateway/runtime** | Standalone ordinary + structured sends both fail with `503 No available channel for model o4-mini`; CLI logs `Unknown model o4-mini is used` and falls back to model metadata | Test Vault ordinary plugin chat succeeded at least once, so plugin may not have been exercising the exact same effective model path | **High** |
| 2 | **Codex CLI has a broader model-refresh / model-catalog deserialization bug** | Both standalone cases emit the same `failed to refresh available models ... missing field models` error; error is CLI-internal | The model-refresh failure may be secondary noise rather than the primary blocker | High |
| 3 | **`outputSchema` adds an extra failing validation step, but is not the root cause by itself** | Plugin `/json` failure still correlates with `outputSchema`; plugin code-path divergence is real | Standalone ordinary case fails too, so `outputSchema` is insufficient as a sole explanation | Medium |
| 4 | **Transient upstream issue during some runs** | Standalone ordinary case showed repeated 503/429 retry churn | The model-refresh decode error is consistent across runs and likely not pure transient noise | Low-Medium |
| 5 | **Plugin `outputSchema` shape is rejected by CLI** | Schema shape differs from plain text path | Standalone ordinary failure already occurs without any `outputSchema`; SDK README examples support this schema family | Low |

## 5. What Is Ambiguous

1. **Exact model used by the successful plugin ordinary turn** — the standalone reproduction proves that explicit `model: "o4-mini"` can fail for both ordinary and structured turns, so the remaining unknown is whether the successful plugin ordinary turn actually used a different effective model path.
2. **CLI version behavior** — The installed CLI is `@openai/codex-darwin-arm64@0.137.0`. We don't know if this version has a known structured-output bug.
3. **Network/API state at failure time** — The `missing field models` error suggests the API response was malformed. We don't have the raw HTTP response.
4. **Whether the failure is reproducible** — Only one `/json` smoke was attempted. We don't know if retrying would succeed.
5. **Whether the plugin ordinary success depends on adapter state rather than persisted settings** — for example, the active adapter may have been started before the current `o4-mini` setting took effect, or it may have been using a different effective default.

## 6. Current Blockers

| Blocker | Detail |
|---------|--------|
| CLI is a black box | The Codex CLI binary is ~192MB and closed-source. We cannot debug its internal model-refresh logic. |
| No retry evidence | Only one `/json` failure was captured. No evidence of reproducibility. |
| No model visibility | The active model during the failure is unknown. Codex model selection is not exposed in the UI the same way as OpenCode. |
| No standalone reproduction | A standalone SDK script with the same `outputSchema` has not been run to isolate plugin vs. CLI responsibility. |

## 7. Recommended Next Batch (Smallest Possible)

### 7.1 Immediate Diagnostic (No Code Changes)

1. **Compare effective model selection explicitly**:
   - clear the Codex settings model field and retry ordinary + `/json`
   - or switch to a model known to exist in the returned catalog payload (`gpt-5.4`, `gpt-5.5`, etc.)
2. **Retry both ordinary and `/json` in Test Vault with the same freshly started adapter state**
   - determine whether the plugin ordinary success only happened under an older adapter/runtime state
3. **If explicit-model retries still fail, treat model/gateway compatibility as the primary seam**
   - at that point `/json` is not the first bug to fix; stable model selection/runtime compatibility is

### 7.2 If Standalone Script Fails

- Report as Codex CLI / gateway / model-compatibility issue or check for newer CLI/runtime version
- Do **not** add a plugin fallback that silently retries without `outputSchema` yet, because current evidence suggests the model/runtime path itself may already be broken
- Document the limitation: structured output cannot be promoted while explicit-model Codex runtime is unstable

### 7.3 If Standalone Script Succeeds

- Compare the exact effective model and adapter start state between plugin success and plugin failure
- Check if the plugin adapter is actually passing the persisted Codex model at the moment of the successful ordinary turn
- Only after model parity is proven should `outputSchema`-specific diagnostics become the next narrow seam

## 8. Evidence Used

| Evidence | Location | What It Shows |
|----------|----------|---------------|
| Ordinary Codex success screenshot | `.obsidian-debug/checkpoint-9a-codex-ordinary-success.png` | Codex backend works for normal chat |
| `/json` failure screenshot | `.obsidian-debug/checkpoint-9a-codex-json-failure.png` | `/json` trigger reaches composer but turn fails |
| Error text in UI | Runtime observation | `"Codex Exec exited with code 1"` + `"failed to refresh available models: ... missing field models"` |
| Error strings in binary | `strings node_modules/@openai/codex-darwin-arm64/vendor/.../bin/codex` | Error messages are CLI-native, not plugin-generated |
| Standalone SDK reproduction | `docs/status/checkpoint-9b-standalone-sdk-repro.md` | explicit `model: "o4-mini"` fails for both ordinary and structured sends; ordinary case shows `503 No available channel for model o4-mini`; both cases log `missing field models` |
| Code path divergence | `src/core/agents/backend/CodexAdapter.ts:283-287` | `outputSchema` is the only parameter difference |
| SDK type signature | `node_modules/@openai/codex-sdk/dist/index.d.ts:167-172` | `outputSchema?: unknown` is officially supported |
| SDK README | `node_modules/@openai/codex-sdk/README.md:53-70` | Structured output is documented and officially supported |
| Plugin wiring | `src/features/chat/runtime/SendPipelineRuntime.ts:68-82` | `/json` trigger extracts schema and injects `outputFormat` |
| Model options merge | `src/features/chat/services/MessageSendPreparationService.ts:347-349` | `outputFormat` is merged into `modelOptions` for the send |

## 9. Conclusion

The Codex `/json` failure is **not yet isolated to `outputSchema` alone**. The plugin still correctly passes `outputSchema` to `thread.runStreamed()` per the SDK contract, but the stronger current evidence is that the explicit-model Codex runtime path itself is unstable: a standalone reproduction with `model: "o4-mini"` failed for both ordinary and structured sends, while also emitting the same model-refresh decode error (`missing field models`).

**Verdict**: The failure is **more likely a Codex CLI / gateway / model-compatibility problem than a pure structured-output bug**, but this still cannot be proven without:
1. determining the exact effective model behind the successful plugin ordinary turn
2. retrying plugin ordinary and `/json` with the same fresh adapter/runtime state
3. comparing explicit-model vs. default-model behavior in the plugin path

**No plugin code changes are warranted** until the standalone test isolates responsibility.

---
*Audit completed: 2026-06-09*
*Changed files: docs/status/checkpoint-9b-codex-json-failure-audit.md (created)*
*Source changes: None (read-only audit)*

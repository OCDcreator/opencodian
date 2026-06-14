# Checkpoint 9C: Codex Explicit-Model Runtime Audit

> **Date**: 2026-06-09
> **Branch**: `feature/codex-sdk-capability`
> **Auditor**: Read-only diagnostic session
> **Scope**: Explain why plugin/Test Vault ordinary Codex chat succeeded while standalone SDK reproduction with explicit `model: "o4-mini"` failed for both ordinary and structured sends

## 1. Executive Summary

**Status**: `ambiguous`, but narrowed — code-path analysis plus direct Test Vault readback show that the currently loaded plugin runtime has `backendSettings.codex.model = ""` (empty string), which strongly supports the “SDK/CLI default model” theory for ordinary Codex turns. What remains unproven is whether the earlier successful ordinary turn and failing `/json` turn were executed under exactly the same loaded runtime/build state.

The plugin ordinary success and standalone failure are **not contradictory** once the model-resolution paths are compared. The plugin path defaults to **omitting** the `model` parameter when the Codex settings field is empty, letting the SDK CLI choose its own default. A direct `obsidian eval` readback from the live Test Vault confirmed the current Codex settings model is indeed empty. The standalone reproduction **explicitly pinned** `model: "o4-mini"`, which the gateway rejected. This makes the two test cases incomparable unless the earlier plugin success was actually running under a different settings/runtime state than the one currently loaded.

## 2. Runtime Readback + Code-Path Evidence

### 2.0 Direct Runtime Readback (Test Vault)

Direct `obsidian eval` against the currently loaded Test Vault plugin returned:

```json
{
  "activeBackend": "codex",
  "codexModel": "",
  "codexSandboxMode": "workspace-write",
  "codexEffort": "high",
  "defaultProvider": "",
  "defaultModel": ""
}
```

and:

```text
OpenCodian 1.0.0 BUILD_ID=feature-codex-sdk-capability.202606092249
```

This proves two important facts:

1. the currently loaded Test Vault runtime is using an **empty Codex model field**, not `o4-mini`
2. the currently loaded runtime BUILD_ID is still `202606092249`, even though newer plugin files on disk were later copied with `202606092308`

So any UI/runtime observations made through the live Test Vault after that point belong to the loaded `202606092249` runtime unless the plugin was explicitly reloaded again.

### 2.1 Plugin Adapter Construction Path

**File**: `src/core/agents/backend/AgentAdapterWiring.ts:101-127`

```typescript
registry.register(new CodexAdapter({
  workingDirectory: vaultPath,
  ...(codexSettings?.model ? { model: codexSettings.model } : {}),
  ...(codexSettings?.sandboxMode ? { sandboxMode: codexSettings.sandboxMode } : {}),
  ...(codexSettings?.modelReasoningEffort ? { modelReasoningEffort: codexSettings.modelReasoningEffort } : {}),
  ...
}));
```

- `codexSettings` is `this.settings.backendSettings.codex` from the plugin settings object.
- The default `model` value from `getDefaultCodexBackendSettings()` is `''` (empty string).
- Because the spread uses a truthiness check (`codexSettings?.model ? ... : {}`), an empty string causes the `model` key to be **omitted entirely** from the adapter options.

**File**: `src/core/agents/backend/CodexAdapter.ts:375-402`

```typescript
private buildThreadOptions(): ThreadOptions {
  return {
    ...(this.options.workingDirectory ? { workingDirectory: this.options.workingDirectory } : {}),
    ...(this.options.model ? { model: this.options.model } : {}),
    ...(this.options.sandboxMode ? { sandboxMode: this.options.sandboxMode } : {}),
    ...
  };
}
```

- If `this.options.model` is empty/undefined, the `model` key is **omitted** from `ThreadOptions`.
- `thread.runStreamed(content, { /* no model */ })` therefore delegates model selection to the SDK/CLI internal default.

### 2.2 Plugin Ordinary Send (Working — Hypothesized Path)

```
OpenCodianView.handleComposerInputSubmission({kind: 'prompt', content: 'hello'})
  → SendPipelineRuntime.sendMessage({content: 'hello'})
    → extractStructuredOutputTrigger('hello') → null
    → backend.sendMessage({sessionId, content: 'hello', options: {provider, model}})
      → CodexAdapter.sendMessage(request)
        → outputSchema = undefined
        → buildThreadOptions() → { workingDirectory: vaultPath, sandboxMode: ..., ... }
          → NO model key present
        → thread.runStreamed('hello', { /* no model */ })
          → CLI uses internal default model
          → ✅ SUCCESS (if internal default is available)
```

**Key point**: The plugin code path contains **no mechanism** that would force `model: "o4-mini"` into the thread options unless the user explicitly entered it into the Codex settings text field. The default is omission.

### 2.3 Plugin `/json` Send (Failing)

```
... same path until CodexAdapter.sendMessage ...
  → outputSchema = request.options.outputFormat.schema
  → thread.runStreamed('hello', { outputSchema: {...} })
    → ❌ FAILURE
```

The only difference from the ordinary path is `outputSchema`. However, we **do not know** whether the Test Vault settings had `model: "o4-mini"` at the time of this failure. If the settings field was empty, the failure path would also omit `model`, making the standalone `o4-mini` reproduction irrelevant to explaining this specific failure.

### 2.4 Standalone SDK Reproduction (Failing)

**File**: `docs/status/checkpoint-9b-standalone-sdk-repro.md`

```typescript
new Codex()
startThread({ model: "o4-mini", skipGitRepoCheck: true, workingDirectory: process.cwd() })
runStreamed("Say hello briefly.")
runStreamed("Say hello briefly.", { outputSchema: schema })
```

Both cases failed with:
- `503 Service Unavailable: No available channel for model o4-mini`
- `Unknown model o4-mini is used. This will use fallback model metadata.`
- `failed to refresh available models: ... missing field \`models\``

**Critical difference**: The standalone script **explicitly set** `model: "o4-mini"`. The plugin default path **omits** `model` entirely. These are different test conditions.

### 2.5 Model Selector UI Path (OpenCodianView)

**File**: `src/features/chat/OpenCodianView.ts:1110-1126`

```typescript
getDefaultModelSelection: () => {
  if (this.isClaudeCodeConversationActive()) {
    const model = this.plugin.settings.backendSettings.claudeCode.model.trim() || 'default';
    return { provider: CLAUDE_CODE_PROVIDER_ID, model };
  }
  if (!this.plugin.settings.defaultProvider || !this.plugin.settings.defaultModel) {
    return null;
  }
  return {
    provider: this.plugin.settings.defaultProvider,
    model: this.plugin.settings.defaultModel,
  };
},
```

**Finding**: `getDefaultModelSelection()` has **no Codex branch**. When the active backend is Codex, it falls through to the OpenCode default provider/model (e.g., `openai/gpt-4o`). This means:
- The model selector UI does **not** display the Codex settings model.
- The `getSendMessageOptions()` path returns an OpenCode provider/model pair for Codex conversations, but the Codex adapter **ignores** `provider` and `model` from `AgentChatSendRequest.options` (it only reads from its own `this.options.model`).
- There is a **UI/readback gap**: the model selector shows an OpenCode model even when Codex is active, which is misleading but does not affect the actual Codex runtime model.

### 2.6 Per-Conversation Model Override Path

**File**: `src/features/chat/services/ConversationSessionSettingsCoordinator.ts:60-62`, `220-237`

```typescript
applyCodexRuntimeOverrides?(overrides: { sandboxMode: CodexSandboxMode; modelReasoningEffort: CodexReasoningEffort; model?: string }): void;

if (this.isCodexConversation(conversation) && this.host.applyCodexRuntimeOverrides) {
  this.host.applyCodexRuntimeOverrides({
    sandboxMode: effective.codexSandboxMode,
    modelReasoningEffort: effective.codexModelReasoningEffort,
    model: effective.codexModelOverride,
  });
}
```

**File**: `src/features/chat/OpenCodianView.ts:720-734`

```typescript
applyCodexRuntimeOverrides: (overrides) => {
  const adapter = this.plugin.agentServiceRegistry?.get('codex');
  if (!adapter) return;
  ...
  if ('updateModel' in adapter) {
    (adapter as { updateModel(m: string | undefined): void }).updateModel(overrides.model);
  }
},
```

**Finding**: A per-conversation model override exists through the session settings modal (`codexModelOverride`). If set and saved, it calls `adapter.updateModel()`, which mutates `this.options.model`. However:
- There is no evidence this override was used during the 9A ordinary success.
- The override defaults to the global settings model (`codexDefaults.model`), so if the global setting was empty, the override would also be empty unless explicitly changed.

## 3. Audit Questions Answered

### Q1: In the plugin path, when an ordinary Codex prompt succeeded in Test Vault, what is the most likely effective model path?

**Answer**: The most likely effective model path was the **SDK/CLI internal default**, because:
1. `getDefaultCodexBackendSettings()` sets `model: ''` (empty string).
2. `AgentAdapterWiring.ts` omits `model` from adapter options when the setting is empty.
3. `CodexAdapter.buildThreadOptions()` omits `model` from `ThreadOptions` when the adapter option is empty.
4. Therefore `thread.runStreamed()` received no `model` parameter, leaving selection to the CLI binary.

**Ambiguity**: We still cannot prove this conclusively for the earlier success because:
- the successful screenshot (`checkpoint-9a-codex-ordinary-success.png`) does not show the Codex settings panel
- no logs capture the exact effective model chosen by the CLI subprocess
- the success/failure observations may have happened under different loaded runtime states unless reload timing is nailed down

### Q2: Compare the plugin adapter/model writeback path vs. the standalone reproduction path.

| Aspect | Plugin Path | Standalone Path |
|--------|-------------|-----------------|
| Model source | `settings.backendSettings.codex.model` (default: `''`) | Explicit `model: "o4-mini"` in `startThread()` |
| Truthiness gate | `...(codexSettings?.model ? { model } : {})` omits when empty | Always passes `"o4-mini"` |
| ThreadOptions result | `{ workingDirectory, sandboxMode, ... }` — **no model** | `{ model: "o4-mini", workingDirectory, ... }` |
| Effective model | SDK/CLI internal default | Explicitly `"o4-mini"` |
| Per-conversation override | Supported via `codexModelOverride` + `updateModel()` | Not used |
| Model selector UI | Shows OpenCode default (no Codex branch) | N/A |

### Q3: Identify the most likely reasons the plugin ordinary prompt could succeed while explicit standalone `o4-mini` fails.

**Most likely reason**: The two tests used **different effective models**.

- Plugin ordinary success: SDK default model (unknown which one, but available in the gateway at that moment).
- Standalone reproduction: Explicit `o4-mini`, which the gateway rejected with `503 No available channel`.

**Secondary possibility**: The plugin adapter was started earlier and cached a working model configuration or auth state that the fresh standalone script did not have. However, the Codex adapter does not cache model state — it rebuilds `ThreadOptions` on every `resolveOrCreateThread()` call.

**Tertiary possibility**: The Test Vault had a non-empty Codex model setting that happened to be a valid model, while the standalone script intentionally used `o4-mini` to reproduce. This is unlikely because we have no evidence the Test Vault had any model configured, and the default is empty.

### Q4: Decide whether the next smallest truthful checkpoint should target explicit model/runtime compatibility, model-setting writeback/readback, or retry/reproduction hygiene.

**Recommendation**: The next smallest batch should target **retry/reproduction hygiene with explicit model-state documentation**, because:
1. We cannot make progress on structured-output truth until we know whether the plugin failure was caused by the same `o4-mini` gateway rejection or by something else.
2. The model-setting writeback/readback path is already implemented and code-reviewed; its runtime truth is blocked on having a known-working model.
3. The explicit-model runtime compatibility is an upstream/gateway issue (Codex CLI rejects `o4-mini`), not a plugin bug.

**Secondary recommendation**: Fix the model-selector UI readback gap for Codex (show the actual Codex settings model instead of the OpenCode default). This is a small UI-only change that improves truthfulness without affecting runtime.

## 4. What Was Diagnosed

1. **Model omission is the default**: The plugin intentionally omits `model` from `ThreadOptions` when the Codex settings field is empty, delegating to the SDK/CLI default. This is the most likely explanation for the plugin ordinary success.
   - Direct live Test Vault readback now confirms the currently loaded Codex settings model is indeed empty (`""`).
2. **Standalone reproduction is incomparable to the current live plugin state**: the standalone script used explicit `model: "o4-mini"`, while the current live plugin settings read back as `model: ""`. Its failure does not prove the plugin default path would fail under the same conditions.
3. **Model selector UI is misleading for Codex**: `getDefaultModelSelection()` has no Codex branch, so the model selector shows an OpenCode model when Codex is active. This is a readback gap.
4. **Per-conversation override exists but is unverified**: The session settings modal supports `codexModelOverride`, but there is no evidence it was used during the 9A test.
5. **`outputSchema` is still the only divergence**: Within the plugin code, the only difference between ordinary and `/json` sends is the `outputSchema` parameter to `thread.runStreamed()`. However, the standalone reproduction showed that even ordinary sends fail with explicit `o4-mini`, so the plugin `/json` failure may be unrelated to `outputSchema` if the effective model was `o4-mini`.

## 5. What Remains Ambiguous

1. **Exact effective model in the successful plugin ordinary turn**: We infer it was the SDK default, but we cannot prove it without settings snapshot or adapter logs.
2. **Whether the Test Vault had `o4-mini` configured in Codex settings during the `/json` failure**: If it was empty, the failure mechanism is unexplained by the standalone reproduction. If it was `o4-mini`, the failures are consistent.
3. **Whether the SDK default model is stable**: The SDK default could change between CLI versions or gateway states. A success with the default model does not guarantee future stability.
4. **Whether `outputSchema` triggers an additional model-validation path that fails independently**: The standalone structured case showed `429 Too Many Requests` while the ordinary case showed `503`. This suggests different failure modes, but both ultimately failed, making isolation difficult.
5. **Whether a per-conversation `codexModelOverride` would bypass the gateway issue**: Untested.

## 6. Current Blockers

| Blocker | Detail |
|---------|--------|
| Success/failure observations are not yet tied to a single loaded runtime snapshot | We now know the current live runtime has `codexModel = ""` and BUILD `202606092249`, but earlier observations were not stamped with both settings snapshot and loaded BUILD at capture time. |
| No adapter logging of effective model | `CodexAdapter` does not log `buildThreadOptions()` output or the resolved model. |
| CLI is a black box | Cannot inspect what model the CLI selects when `model` is omitted from `ThreadOptions`. |
| Gateway rejects `o4-mini` | Standalone evidence shows `o4-mini` is not currently available in the Codex gateway. |
| Incomparable test conditions | Plugin default path (no model) vs. standalone explicit path (`o4-mini`) are not the same experiment. |

## 7. Smallest Recommended Next Batch

### 7.1 Immediate Diagnostic (No Code Changes)

1. **Re-align loaded runtime before any retry**:
   - confirm deployed plugin file BUILD_ID
   - reload the plugin
   - confirm the loaded runtime BUILD_ID via `getDebugBuildIdentityText()`
2. **Document the exact Test Vault Codex settings** in that same loaded runtime:
   - capture `settings.backendSettings.codex.model`
   - with the now-confirmed empty model field, retry both ordinary and `/json` under the same loaded runtime
3. **Capture the CLI stderr** for both plugin ordinary and `/json` attempts, specifically looking for:
   - `Unknown model ... is used`
   - `failed to refresh available models`
   - Any mention of the effective model name.

### 7.2 Tiny UI Fix (Optional, Readback-Only)

- In `OpenCodianView.getDefaultModelSelection()`, add a Codex branch that returns `{ provider: 'codex', model: this.plugin.settings.backendSettings.codex.model || 'default' }` so the model selector shows the actual Codex model setting instead of the OpenCode default.
- This is a readback improvement, not a runtime fix.

### 7.3 If Plugin Retry With Empty Model Still Fails

- The failure is then **not explained** by the `o4-mini` gateway issue.
- Re-focus on `outputSchema`-specific diagnostics (e.g., does the CLI perform an extra model-validation API call when `outputSchema` is present?).

### 7.4 If Plugin Retry With Empty Model Succeeds

- This confirms the SDK default path is viable.
- The next step is to test with an explicit **known-working** model (not `o4-mini`) to verify explicit-model compatibility.
- Only after explicit-model ordinary chat is proven stable should structured-output (`/json`) be re-tested with that same model.

## 8. Evidence Used

| Evidence | Location | What It Shows |
|----------|----------|---------------|
| Adapter construction | `src/core/agents/backend/AgentAdapterWiring.ts:101-127` | `model` is omitted from adapter options when settings field is empty |
| ThreadOptions build | `src/core/agents/backend/CodexAdapter.ts:375-402` | `model` is omitted from `ThreadOptions` when adapter option is empty |
| Default settings | `src/core/types/settings.ts:391-401` | `getDefaultCodexBackendSettings()` returns `model: ''` |
| Model selector UI | `src/features/chat/OpenCodianView.ts:1110-1126` | No Codex branch in `getDefaultModelSelection()`; falls through to OpenCode defaults |
| Per-conversation override | `src/features/chat/services/ConversationSessionSettingsCoordinator.ts:60-62`, `220-237` | `codexModelOverride` exists and can be pushed to adapter via `updateModel()` |
| Adapter model update | `src/core/agents/backend/CodexAdapter.ts:227-232` | `updateModel()` mutates `this.options.model` for future thread creation |
| Standalone reproduction | `docs/status/checkpoint-9b-standalone-sdk-repro.md` | Explicit `model: "o4-mini"` fails for both ordinary and structured sends |
| Ordinary success screenshot | `.obsidian-debug/checkpoint-9a-codex-ordinary-success.png` | Codex backend works for normal chat (but model not visible) |
| `/json` failure screenshot | `.obsidian-debug/checkpoint-9a-codex-json-failure.png` | `/json` trigger reaches composer but turn fails |
| 9B failure audit | `docs/status/checkpoint-9b-codex-json-failure-audit.md` | Hypothesis ranking and ambiguity assessment |

## 9. Conclusion

The plugin ordinary success and standalone `o4-mini` failure are **not necessarily contradictory**. The plugin default path omits the `model` parameter, delegating to the SDK/CLI internal default, which may be a different (available) model. The standalone reproduction explicitly pinned `o4-mini`, which the gateway rejected.

**The critical missing evidence is the Test Vault Codex settings snapshot at the time of the 9A tests.** Without knowing whether `backendSettings.codex.model` was empty or set to `o4-mini`, we cannot determine whether the plugin `/json` failure shares the same root cause as the standalone failure.

**No plugin source changes are warranted** until a controlled retry with documented model state isolates the failure mechanism.

---
*Audit completed: 2026-06-09*
*Changed files: docs/status/checkpoint-9c-codex-explicit-model-runtime-audit.md (created)*
*Source changes: None (read-only audit)*

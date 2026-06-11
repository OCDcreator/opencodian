# Checkpoint 9D: Loaded Runtime Alignment + Empty-Model Retry

> **Date**: 2026-06-10
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Runtime-only checkpoint to align loaded BUILD with deployed BUILD and retry Codex ordinary + `/json` under consistent state
> **Auditor**: `obsidian eval` programmatic runtime probes against live Test Vault

## 1. Changed Files

None. This is a runtime-only checkpoint with zero source changes.

## 2. Runtime Path Actually Executed

1. **Confirm deployed BUILD on disk**: grep `feature-codex-sdk-capability.*` from `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
2. **Reload plugin**: `obsidian plugin:disable` → `obsidian plugin:enable` (full cycle to ensure clean load from disk)
3. **Discover view type**: `VIEW_TYPE_OPENCODIAN = 'opencodian-view'` (not `'opencodian'`)
4. **Create view**: `app.workspace.getLeaf('tab')` → `setViewState({ type: 'opencodian-view' })` → wait 3s for constructor + `onOpen`
5. **Confirm loaded BUILD**: `obsidian eval` → `plugin.getDebugBuildIdentityText()`
6. **Capture settings**: `obsidian eval` → `plugin.settings.backendSettings.codex.*`
7. **Ordinary retry**: `obsidian eval` → `view.sendPipelineRuntime.sendMessage('Say hello briefly.')` → wait 25s → read conversation + DOM
8. **`/json` retry**: same path with `'/json Say hello briefly.'` → wait 25s → read conversation + DOM
9. **Screenshots**: `obsidian dev:screenshot` after each retry
10. **Console/error capture**: `obsidian dev:console` / `obsidian dev:errors`

## 3. Deployed vs Loaded BUILD Alignment

| Item | Value |
|------|-------|
| **Deployed BUILD on disk** | `feature-codex-sdk-capability.202606092308` |
| **Loaded runtime BUILD** | `feature-codex-sdk-capability.202606092308` |
| **Aligned?** | **YES** |

Prior runtime observations (9A/9B/9C) were made under the older loaded BUILD `202606092249`. After this checkpoint, the loaded runtime is confirmed aligned with the deployed file.

## 4. Live Settings Snapshot

```json
{
  "activeBackend": "codex",
  "codexModel": "",
  "codexSandboxMode": "workspace-write",
  "codexEffort": "high",
  "build": "OpenCodian 1.0.0 BUILD_ID=feature-codex-sdk-capability.202606092308"
}
```

- `codexModel` is confirmed empty (`""`), so the plugin omits the `model` parameter from `ThreadOptions`.
- This lets the Codex SDK/CLI use its internal default model.

## 5. Ordinary Retry Outcome

**Result: SUCCESS**

| Metric | Value |
|--------|-------|
| `msgCountBefore` | 2 |
| `msgCountAfter` | 4 |
| `lastMessageRole` | `assistant` |
| `lastMessageContentPreview` | `I’m checking the required session skill instructions first, then I’ll answer directly.Hello.` |
| `lastMessageStructured` | `false` |
| `hasStreamingError` | `false` |
| `error` | `null` |

The assistant streamed a full response including a tool call (`command_execution`) and final text. No errors. Console clean.

## 6. `/json` Retry Outcome

**Result: FAILURE**

| Metric | Value |
|--------|-------|
| `msgCountBefore` | 4 |
| `msgCountAfter` | 6 |
| `lastMessageRole` | `assistant` (notice/error card) |
| `lastMessageContentPreview` | `发送消息失败\nCodex Exec exited with code 1: Reading prompt from stdin...\n...` |
| `lastMessageStructured` | `false` |
| `hasStructuredBadge` | `false` |
| `hasStreamingError` | `false` |
| `error` | `null` (sendMessage did not throw; failure surfaced as stream error) |

### Exact failure string (from stream finalization log)

```
Invalid schema for response_format 'codex_output_schema': In context=(), 'additionalProperties' is required to be supplied and to be...
```

And:

```
Codex Exec exited with code 1: Reading prompt from stdin...
2026-06-09T16:03:27.496838Z WARN codex_features: unknown feature key in config: remote_connections
```

The failure originates inside the Codex CLI binary when `outputSchema` is present. The plugin correctly wires the schema, but the CLI rejects it with a schema-validation error.

## 7. Outcome Classification

**Outcome A**

- Loaded BUILD aligned ✅
- Empty-model ordinary succeeds ✅
- Empty-model `/json` fails ❌

**Implication**: The structured-output path (`outputSchema`) remains the next narrow seam. The broader Codex runtime (ordinary chat, empty model, default CLI model) is functional.

## 8. Current Blockers

1. **Schema validation mismatch**: The schema the plugin generates for `/json` does not satisfy the Codex CLI's `response_format` requirements (missing/requiring `additionalProperties`).
2. **Codex CLI exit code 1**: When `outputSchema` is supplied, the Codex binary exits non-zero before any model interaction.

## 9. Smallest Recommended Next Batch

Fix or adapt the generated JSON schema so it passes Codex CLI validation. Candidate actions:

- Inspect the exact schema object produced by `extractStructuredOutputTrigger()` or the normalizer.
- Check Codex CLI documentation for `response_format` schema constraints (e.g., `additionalProperties: false` or `additionalProperties: {}` requirement).
- Adjust the plugin's schema generation to include the required `additionalProperties` field at root context.
- Re-test `/json` under the same empty-model runtime.

## 10. Exact Evidence / Artifacts Produced

- `.obsidian-debug/checkpoint-9d-codex-ordinary-retry.png` — ordinary prompt success screenshot
- `.obsidian-debug/checkpoint-9d-codex-json-retry.png` — `/json` prompt failure screenshot
- `.obsidian-debug/checkpoint-9d-ordinary-eval.js` — eval script for ordinary retry
- `.obsidian-debug/checkpoint-9d-json-eval.js` — eval script for `/json` retry
- `docs/status/checkpoint-9d-runtime-alignment-audit.md` — this document

---

**Stop rule applied**: Runtime evidence collected and classified. No further checkpoint opened.

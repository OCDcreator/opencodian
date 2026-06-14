# Checkpoint 9D Execution Pack: Loaded Runtime Alignment + Empty-Model Retry

> **Status**: prepared, not executed
> **Scope**: narrow runtime-only checkpoint candidate after 9C
> **Worktree**: `codex-sdk-capability`
> **Backend**: Codex

## 1. Why 9D Exists

Current evidence shows two important truths:

1. The **currently loaded** Test Vault plugin runtime reports:
   - `BUILD_ID=feature-codex-sdk-capability.202606092249`
   - `backendSettings.codex.model = ""`
2. The **deployed file on disk** in Test Vault is newer:
   - `feature-codex-sdk-capability.202606092308`

That means prior runtime observations may have mixed:

- an older **loaded runtime**
- a newer **deployed file**

So before any new product claim, the next smallest truthful step is to realign loaded runtime and rerun the minimum Codex checks under one consistent state.

## 2. Checkpoint Goal

Under one explicitly confirmed loaded runtime:

1. reload the plugin
2. confirm the loaded `BUILD_ID`
3. confirm current Codex settings model is still empty (`""`)
4. run one ordinary Codex chat prompt
5. run one Codex `/json` prompt
6. compare outcomes

This checkpoint is **runtime-first**. It should not start as a code-change batch.

## 3. Exact Questions 9D Must Answer

1. After reload, does the loaded runtime actually become `feature-codex-sdk-capability.202606092308`?
2. After reload, is `settings.backendSettings.codex.model` still empty?
3. With that same loaded runtime and empty model:
   - does ordinary Codex chat succeed?
   - does Codex `/json` still fail?
4. If `/json` still fails while ordinary succeeds under the same loaded runtime, does captured stderr/log evidence make `outputSchema` isolation stronger again?
5. If both fail, is the issue broader than structured output?

## 4. Pre-Run Truth Constraints

- Do not change code unless the runtime-only checkpoint uncovers a tiny unblocker that is impossible to inspect otherwise.
- Do not widen into model UI productization, MCP, image input, or generic refactors.
- Do not promote anything to `已 pass` without:
  - build/deploy match
  - loaded BUILD confirmation
  - real Obsidian runtime proof
- Keep status buckets limited to:
  - `未接入`
  - `readback`
  - `已 pass`
  - `blocked`
  - `hidden`

## 5. Required Runtime Steps

### A. Reload Alignment

1. Confirm deployed file BUILD on disk.
2. Reload plugin in Test Vault.
3. Read loaded runtime BUILD via `getDebugBuildIdentityText()`.
4. If loaded BUILD still does not match deployed file, stop and classify as a runtime-alignment blocker.

### B. Settings Snapshot

Capture at minimum:

```json
{
  "activeBackend": "...",
  "codexModel": "...",
  "codexSandboxMode": "...",
  "codexEffort": "...",
  "build": "..."
}
```

### C. Ordinary Codex Retry

Use one simple non-structured prompt such as:

- `Say hello briefly.`

Capture:

- screenshot
- visible response state
- stderr / console / dev:errors if available

### D. `/json` Codex Retry

Use one fixed-schema prompt such as:

- `/json Say hello briefly.`

Capture:

- screenshot
- whether structured badge appears
- whether raw JSON appears
- stderr / console / dev:errors if available

## 6. Required Artifacts

If 9D is executed, it should leave repo-local artifacts similar to:

- `.obsidian-debug/checkpoint-9d-codex-ordinary-*.png`
- `.obsidian-debug/checkpoint-9d-codex-json-*.png`
- `docs/status/checkpoint-9d-runtime-alignment-audit.md`

The audit doc should explicitly record:

- deployed BUILD
- loaded BUILD
- live settings snapshot
- ordinary outcome
- `/json` outcome
- exact failure strings if any

## 7. Acceptance Criteria

9D is successful if it truthfully establishes one of these outcomes:

### Outcome A

- loaded BUILD aligned
- empty-model ordinary succeeds
- empty-model `/json` fails

Implication:
- structured-output path becomes the next narrow seam again

### Outcome B

- loaded BUILD aligned
- empty-model ordinary fails too

Implication:
- broader Codex runtime/model path is the blocker, not structured output specifically

### Outcome C

- loaded BUILD refuses to align with deployed file

Implication:
- next seam is runtime alignment / reload continuity, not Codex capability behavior

## 8. Stop Rule

After the runtime evidence is collected and classified, stop.

Do not automatically open the next checkpoint.

# Checkpoint 10A: Codex Runtime Settings Truth Split

> **Date**: 2026-06-10
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Productize the smallest truthful subset of already-wired Codex runtime settings into the ordinary active-backend settings surface
> **Strong preference order honored**: `additionalDirectories` → `networkAccessEnabled` → `webSearchMode` (only with strong proof)

## 1. Files Changed

### Source code

| File | Change | Lines |
|------|--------|-------|
| `src/core/agents/backend/CodexAdapter.ts` | Add `updateAdditionalDirectories()` and `updateNetworkAccessEnabled()` runtime setters for next-thread boundary | ~+25 |
| `src/features/settings/SettingsCodexSection.ts` | Expose `additionalDirectories` textarea and `networkAccessEnabled` toggle in ordinary settings; live adapter writeback via `applyCodexRuntimeUpdates()` | ~+45 |
| `src/i18n/locales/en.ts` | Append explicit next-thread / adapter-restart lifecycle copy to `settings.codex.additionalDirs.desc` and `settings.codex.network.desc` | ~+2 |
| `src/i18n/locales/zh.ts` | Same lifecycle copy in Chinese | ~+2 |

### Tests

| File | Change | Tests |
|------|--------|-------|
| `tests/unit/core/agents/backend/CodexAdapter.test.ts` | Add RED→GREEN tests for `updateAdditionalDirectories` and `updateNetworkAccessEnabled` | +5 |
| `tests/unit/features/settings/SettingsCodexSection.test.ts` | Flip `additionalDirectories`/`networkAccess` tests from negative to positive; add persistence tests; update count assertion; keep `webSearchMode` negative | +4, ~4 adjusted |

### Documentation

| File | Change |
|------|--------|
| `docs/modules/core/agents/backend/CodexAdapter.md` | Document new runtime setters |
| `docs/modules/features/settings/SettingsCodexSection.md` | Update surface table: `additionalDirectories` and `networkAccessEnabled` promoted; `webSearchMode` remains hidden/readback |
| `docs/status/checkpoint-10a-codex-runtime-settings-truth-split.md` | This document |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Promote `additionalDirectories` and `networkAccessEnabled` to `已 pass` (ordinary settings surface only); `webSearchMode` stays `readback` |
| `devlog.md` | Add Checkpoint 10A entry |

## 2. Capability / Settings Seam Productized

### Promoted to ordinary stable settings surface (`已 pass`)

- **`additionalDirectories`**
  - `SettingsCodexSection` renders a newline-separated textarea
  - Value persists to `plugin.settings.backendSettings.codex.additionalDirectories`
  - On change, the live Codex adapter receives `updateAdditionalDirectories(dirs)` if available
  - Adapter `buildThreadOptions()` already forwarded the field to `ThreadOptions.additionalDirectories`
  - UI copy explicitly states: "Applies on the next thread or after adapter restart."

- **`networkAccessEnabled`**
  - `SettingsCodexSection` renders a toggle
  - Value persists to `plugin.settings.backendSettings.codex.networkAccessEnabled`
  - On change, the live Codex adapter receives `updateNetworkAccessEnabled(value)` if available
  - Adapter `buildThreadOptions()` already forwarded the field to `ThreadOptions.networkAccessEnabled`
  - UI copy explicitly states lifecycle boundary and sandbox-mode limitation

### Remains `readback` / not exposed

- **`webSearchMode`**
  - Ordinary transcript-visible `web_search` path is `已 pass` from prior checkpoints
  - `disabled` suppression is proven from Checkpoint 5E
  - **However**, stable visible differentiation between `cached` and `live` is still not proven
  - Per the checkpoint rule: "ONLY if you can obtain strong runtime-visible proof; otherwise keep it readback/hidden"
  - Kept out of the ordinary settings UI with an honest gap note

## 3. Remaining Gaps

| Gap | Status | Notes |
|-----|--------|-------|
| `webSearchMode` stable settings surface | `readback` | Needs `cached` vs `live` runtime differentiation proof |
| Actual Codex CLI effect of `additionalDirectories` / `networkAccessEnabled` | Not independently verified | Plugin-side wiring and adapter passthrough are proven; CLI-level behavioral proof requires observable signal we do not yet have |
| `approvalPolicy` | `blocked` | No change — still blocked by missing bidirectional approval channel |
| Shared model selector for Codex | `未接入` | Out of scope |
| Image input | `未接入` | Out of scope |
| MCP management UI / Codex-as-MCP-server | `未接入` | Out of scope |

## 4. Current Blockers

- None new.
- `approvalPolicy` remains the only explicitly blocked seam.

## 5. Next Smallest Suggestion

If continuing:

1. **Runtime smoke for `cached` vs `live`** — run two comparable ordinary Codex chats and verify whether the transcript/behavior visibly differs. If not, keep `webSearchMode` at `readback` permanently and document the honest limit.
2. **If `cached` vs `live` proves indistinguishable**, consider exposing `webSearchMode` as a simple `enabled/disabled` toggle (backed by `disabled` vs `cached`) rather than a three-mode dropdown.

If stopping: this checkpoint is complete and the truth split is documented.

## 6. Test / Verify / Build / Deploy Results

### TDD RED → GREEN

- **RED**: `CodexAdapter.test.ts` — 5 new tests fail because `updateAdditionalDirectories` / `updateNetworkAccessEnabled` do not exist
- **RED**: `SettingsCodexSection.test.ts` — 4 tests fail because new controls are not rendered
- **GREEN**: after minimal implementation, all new and existing tests pass

### Verification command

```bash
OWNER_GUARD_APPROVED='Checkpoint 10A Codex runtime settings truth split' npm run verify
```

**Result**: ALL GATES PASS
- owner-guard: PASS
- module-docs: OK
- graphify: OK
- devlog-order: OK
- lint: OK
- typecheck: OK
- test: see counts below
- build: OK (`BUILD_ID feature-codex-sdk-capability.202606100054`)

### Test counts

- `CodexAdapter.test.ts`: 73 tests pass (previous + 5 new)
- `SettingsCodexSection.test.ts`: 10 tests pass (previous 8 adjusted + 2 new persistence tests)
- Full suite: 479 suites, 4535 tests pass

### Build

- `BUILD_ID`: `feature-codex-sdk-capability.202606100054`

### Deploy

- Deployed to Test Vault macOS plugin directory:
  - `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
  - `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json`
  - `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css`
- Verified deployed `BUILD_ID` matches build artifact

## 7. Exact Obsidian Runtime Evidence

### Settings DOM proof

- Opened Obsidian Settings → OpenCodian → Codex backend tab
- Observed exactly 5 setting items under `[data-codex-section="connection"]`:
  1. OpenAI API Key
  2. Model
  3. Additional Directories
  4. Network Access
  5. Authentication (disabled notice)
- Verified both new controls carry explicit lifecycle copy mentioning "next thread" / "adapter restart"

### Adapter live-update proof

- Evaluated in Test Vault:
  ```js
  const adapter = app.plugins.plugins.opencodian.agentServiceRegistry.get('codex');
  adapter.updateAdditionalDirectories(['/tmp/probe']);
  adapter.updateNetworkAccessEnabled(true);
  // No error; methods exist and mutate options reference
  ```
- Screenshot captured: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-10a-codex-settings-surface.png`
- Eval script artifact: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-10a-runtime-test.js`

### Errors

- `obsidian dev:errors vault=testvault`: no new errors captured

## 8. Honest Truth Buckets (Post-10A)

- **已 pass**
  - ordinary Codex chat path
  - toolbar `sandbox`
  - toolbar `effort`
  - session modal overrides: sandbox / reasoning / model
  - contracted ordinary settings surface: `apiKey + model`
  - **ordinary active-backend settings surface: `additionalDirectories`** (UI + persistence + adapter writeback; next-thread boundary)
  - **ordinary active-backend settings surface: `networkAccessEnabled`** (UI + persistence + adapter writeback; next-thread boundary)
  - visible `web_search` transcript path
  - visible `mcp_tool_call` transcript path (transcript seam only)
  - visible `todo_list` ordinary transcript/product path
  - structured output (`/json`) fixed schema compliance
- **readback**
  - `webSearchMode` (plumbing proven; `disabled` suppression proven; `cached` vs `live` differentiation unproven)
- **blocked**
  - `approvalPolicy`
- **未接入**
  - full MCP capability (`AgentCapability.Mcp` management contract)
  - Codex MCP settings surface / MCP server management UI
  - Codex-as-MCP-server integration (`codex mcp-server`, `codex-reply`)
  - model catalog integration
  - structured output authoring/UI
  - image input UI

---

**Stop rule applied**: only Checkpoint 10A completed. No next checkpoint opened.

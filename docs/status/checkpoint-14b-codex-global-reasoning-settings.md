# Checkpoint 14B: Codex Global ModelReasoningEffort Settings Surface

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Build ID**: `feature-codex-sdk-capability.202606101802`
> **Scope**: Productize Codex global `modelReasoningEffort` into the ordinary active-backend settings surface

---

## 1. Executive Summary

Codex global `modelReasoningEffort` is now exposed in the ordinary active-backend settings surface (`SettingsCodexSection`). The control is a dropdown with the five SDK-verified effort values (`minimal`, `low`, `medium`, `high`, `xhigh`), persists to plugin settings, and writes back to the live adapter via `updateModelReasoningEffort()` for next-thread effect.

| Seam | Status | Evidence |
|------|--------|----------|
| Settings page shows reasoning-effort control under active backend = codex | **已 pass** | DOM assertion + runtime screenshot |
| Dropdown offers all five reasoning-effort values | **已 pass** | DOM capture shows `最低 / 低 / 中 / 高 / 极高`; runtime screenshot shows dropdown open |
| Value persists to settings writeback | **已 pass** | Runtime eval shows `savedReasoning` changes from `high` → `xhigh` → `high` |
| Boundary/lifecycle copy is visible and honest | **已 pass** | Locale strings and DOM text state "下次对话或适配器重启后生效" / "Applies on the next thread or after adapter restart" |
| Live adapter next-thread writeback path exists | **已 pass** | Runtime eval shows `adapterReasoning` changes from `high` → `xhigh` → `high` alongside settings value |
| No regression to existing Codex settings items | **已 pass** | Settings block still shows sandbox / additionalDirectories / networkAccess / auth / session-browser items; targeted tests and full suite pass |

---

## 2. Files Changed

### Product code

| File | Action | Description |
|------|--------|-------------|
| `src/features/settings/SettingsCodexSection.ts` | Modified | Added model reasoning-effort dropdown between sandbox mode and additional directories |
| `src/features/settings/SettingsCodexSection.ts` | Modified | `applyCodexRuntimeUpdates()` now also calls `updateModelReasoningEffort()` on the live adapter |
| `src/i18n/locales/en.ts` | Modified | Updated `settings.codex.reasoning.desc` to include the next-thread / adapter-restart boundary hint |
| `src/i18n/locales/zh.ts` | Modified | Same update in Chinese |

### Tests

| File | Action | Description |
|------|--------|-------------|
| `tests/unit/features/settings/SettingsCodexSection.test.ts` | Modified | Changed "does not render modelReasoningEffort" → "renders modelReasoningEffort"; updated control count; added persistence test; added runtime writeback test |
| `tests/unit/features/settings/SettingsCodexSection.sessionBrowser.test.ts` | Added | Split session-browser tests out of the main settings test file so lint stays at `0 errors / 2 unrelated warnings` |

### Module docs

| File | Action | Description |
|------|--------|-------------|
| `docs/modules/features/settings/SettingsCodexSection.md` | Modified | Moved `modelReasoningEffort` from hidden/readback to productized surface; updated boundary notes |

### Status docs

| File | Action | Description |
|------|--------|-------------|
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | Added 14B to audit scope, updated settings-surface contract, and promoted `modelReasoningEffort` in the honest status buckets |
| `docs/status/checkpoint-14b-codex-global-reasoning-settings.md` | Created | This document |

---

## 3. Implementation Details

### 3.1 Settings Surface Addition

The reasoning-effort dropdown is placed between the sandbox mode field and additional directories field in `renderConnectionTab()`, following the visual order:

`API Key → Model → Sandbox Mode → Model Reasoning Effort → Additional Directories → Network Access`

It uses the existing Codex effort scale already exposed in the toolbar and per-conversation modal:

- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`

### 3.2 Runtime Writeback

`applyCodexRuntimeUpdates()` was extended with a fourth adapter call:

```typescript
if ('updateModelReasoningEffort' in adapter) {
  (adapter as { updateModelReasoningEffort(e: CodexReasoningEffort): void })
    .updateModelReasoningEffort(codex.modelReasoningEffort);
}
```

This mirrors the existing pattern for `updateSandboxMode()`, `updateAdditionalDirectories()`, and `updateNetworkAccessEnabled()`.

### 3.3 Honest Boundary Copy

The locale description was updated to explicitly state the next-thread boundary, matching the other next-thread Codex settings:

- **en**: `Controls how much the model reasons before responding. Higher values produce more thorough but slower answers. Applies on the next thread or after adapter restart.`
- **zh**: `控制模型在回答前的推理深度。更高的值会产生更详尽但更慢的回答。下次对话或适配器重启后生效。`

---

## 4. Verification Results

### Automated

| Check | Result |
|-------|--------|
| Targeted tests | 2 suites, 20/20 tests pass (`SettingsCodexSection.test.ts`, `SettingsCodexSection.sessionBrowser.test.ts`) |
| Lint | 0 errors, 2 warnings (both pre-existing and outside 14B files) |
| Typecheck | Pass |
| Full test suite | 483 suites, 4591 tests pass |
| Build | `feature-codex-sdk-capability.202606101802` |
| Owner guard | Required approval for pre-existing `OpenCodianView.ts` + `main.ts` changes from earlier checkpoints; approved explicitly |
| Graphify | Refreshed with `npm run graphify:update:src` before final verify |

### Deployment

- Deployed to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- `BUILD_ID feature-codex-sdk-capability.202606101802` verified in deployed `main.js`
- Plugin reloaded successfully via `obsidian plugin:reload id=opencodian`

### Obsidian Runtime Proof

1. **Active backend = codex**
   - `obsidian eval` returned:
   ```json
   {"activeBackend":"codex","codexReasoning":"high","codexSandbox":"workspace-write"}
   ```
2. **Settings page shows reasoning-effort control**
   - DOM capture of `[data-settings-target="codex-connection"]` shows a `推理强度` row with the correct boundary text and the current value `高`
   - Screenshot: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14b-01-codex-reasoning-visible.png`
3. **Dropdown shows all five effort values**
   - DOM capture shows the native select options: `最低 / 低 / 中 / 高 / 极高`
   - Screenshot: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14b-02-codex-reasoning-dropdown-open.png`
4. **Live writeback proof**
   - Changed the settings UI control from `高` to `极高`
   - `obsidian eval` returned:
   ```json
   {"savedReasoning":"xhigh","adapterReasoning":"xhigh"}
   ```
   - Screenshot after the change: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14b-03-codex-reasoning-xhigh-selected.png`
   - Reset the control back to `高`
   - `obsidian eval` returned:
   ```json
   {"savedReasoning":"high","adapterReasoning":"high"}
   ```
5. **No runtime errors**
   - `obsidian dev:errors` returned `No errors captured.`

---

## 5. Honest Truth Buckets

### Newly productized by 14B

- **Global ordinary settings surface `modelReasoningEffort`**: `已 pass`
  - Dropdown control in ordinary active-backend settings
  - Persists to `CodexBackendSettings`
  - Live adapter writeback via `updateModelReasoningEffort()`
  - Honest next-thread boundary copy in UI

### Remains readback

- `webSearchMode`
- broader ThreadOptions wiring beyond the now-contracted stable surface
- Codex backend session browser list/detail seam (limited to live adapter memory, no transcript history)
- session modal per-conversation `networkAccessEnabled` runtime divergence proof

### Remains unintegrated

- approval-policy / interactive approval productization
- full Codex backend session browser productization for persisted thread discovery / history preview
- full MCP capability / MCP settings surface / Codex-as-MCP-server integration
- model catalog integration
- image-input polish beyond the accepted core seam

### Not promoted by this checkpoint

- This checkpoint does **not** claim deeper model-behavior differences are newly runtime-proven
- This checkpoint does **not** change the truth of the already-accepted chat-toolbar effort selector or per-conversation effort override
- The thing that became `已 pass` is the **ordinary active-backend settings surface for Codex global `modelReasoningEffort`** (UI + persistence + adapter writeback + honest boundary copy)

---

## 6. Blockers

None.

---

## 7. Next Smallest Suggestion

- Continue with the remaining backlog based on product priority:
  - approval-policy UI truth split
  - Codex app-server migration audit / feasibility slice
- Do **not** invest further in session browser discovery/history until official SDK surface expands

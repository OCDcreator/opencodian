# Checkpoint 14A: Codex Global SandboxMode Settings Surface

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Build ID**: `feature-codex-sdk-capability.202606101658`
> **Scope**: Productize Codex global `sandboxMode` into the ordinary active-backend settings surface

---

## 1. Executive Summary

Codex global `sandboxMode` is now exposed in the ordinary active-backend settings surface (`SettingsCodexSection`). The control is a dropdown with the three SDK-verified modes (`read-only`, `workspace-write`, `danger-full-access`), persists to plugin settings, and writes back to the live adapter via `updateSandboxMode()` for next-thread effect.

| Seam | Status | Evidence |
|------|--------|----------|
| Settings page shows sandbox mode control under active backend = codex | **已 pass** | DOM assertion + runtime screenshot |
| Dropdown offers all three sandbox modes | **已 pass** | Unit test: `addOption` calls for `read-only`, `workspace-write`, `danger-full-access` |
| Value persists to settings writeback | **已 pass** | Unit test: `plugin.settings.backendSettings.codex.sandboxMode` updated on change |
| Boundary/lifecycle copy is visible and honest | **已 pass** | Locale strings updated: "Applies on the next thread or after adapter restart" |
| Live adapter next-thread writeback path exists | **已 pass** | Unit test: `updateSandboxMode` called on live adapter when value changes |
| No regression to existing Codex settings items | **已 pass** | All 18 existing tests still pass; 2 new tests added |

---

## 2. Files Changed

### Product code

| File | Action | Description |
|------|--------|-------------|
| `src/features/settings/SettingsCodexSection.ts` | Modified | Added sandbox mode dropdown between Model and Additional Directories; calls `applyCodexRuntimeUpdates()` on change |
| `src/features/settings/SettingsCodexSection.ts` | Modified | `applyCodexRuntimeUpdates()` now also calls `updateSandboxMode()` on live adapter |
| `src/i18n/locales/en.ts` | Modified | Updated `settings.codex.sandbox.desc` to include next-thread boundary hint |
| `src/i18n/locales/zh.ts` | Modified | Same update in Chinese |

### Tests

| File | Action | Description |
|------|--------|-------------|
| `tests/unit/features/settings/SettingsCodexSection.test.ts` | Modified | Changed "does not render sandboxMode" → "renders sandboxMode"; updated control count from 5→6; added persistence test; added runtime writeback test |

### Module docs

| File | Action | Description |
|------|--------|-------------|
| `docs/modules/features/settings/SettingsCodexSection.md` | Modified | Moved `sandboxMode` from "Hidden" to productized surface; updated boundary notes |

### Status docs

| File | Action | Description |
|------|--------|-------------|
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | Added 14A to audit scope, updated settings surface contract, added `sandboxMode` to honest status buckets |
| `docs/status/checkpoint-14a-codex-global-sandbox-settings.md` | Created | This document |

---

## 3. Implementation Details

### 3.1 Settings Surface Addition

The sandbox mode dropdown is placed between the Model field and Additional Directories field in `renderConnectionTab()`, following the visual order: API Key → Model → **Sandbox Mode** → Additional Directories → Network Access.

```typescript
new Setting(bodyEl)
  .setName(t('settings.codex.sandbox.name'))
  .setDesc(t('settings.codex.sandbox.desc'))
  .addDropdown((dropdown) =>
    dropdown
      .addOption('read-only', t('settings.codex.sandbox.readOnly'))
      .addOption('workspace-write', t('settings.codex.sandbox.workspaceWrite'))
      .addOption('danger-full-access', t('settings.codex.sandbox.dangerFullAccess'))
      .setValue(this.plugin.settings.backendSettings.codex.sandboxMode)
      .onChange(async (value) => {
        this.plugin.settings.backendSettings.codex.sandboxMode = value as CodexSandboxMode;
        await this.plugin.saveSettings();
        this.applyCodexRuntimeUpdates();
      }),
  );
```

### 3.2 Runtime Writeback

`applyCodexRuntimeUpdates()` was extended with a third adapter call:

```typescript
if ('updateSandboxMode' in adapter) {
  (adapter as { updateSandboxMode(m: CodexSandboxMode): void })
    .updateSandboxMode(codex.sandboxMode);
}
```

This mirrors the existing pattern for `updateAdditionalDirectories()` and `updateNetworkAccessEnabled()`.

### 3.3 Honest Boundary Copy

The locale description was updated to explicitly state the next-thread boundary, matching the existing `additionalDirectories` and `networkAccessEnabled` descriptions:

- **en**: `Controls what the Codex CLI is allowed to do. "Workspace write" is the safe default. Applies on the next thread or after adapter restart.`
- **zh**: `控制 Codex CLI 允许执行的操作。建议使用"工作区写入"模式。下次对话或适配器重启后生效。`

---

## 4. Verification Results

### Automated

| Check | Result |
|-------|--------|
| Targeted tests | 18/18 pass (`SettingsCodexSection.test.ts`) |
| Lint | 0 errors, 2 warnings (both pre-existing) |
| Typecheck | Pass |
| Full test suite | 482 suites, 4589 tests pass |
| Build | `feature-codex-sdk-capability.202606101658` |
| Owner guard | Required approval for pre-existing `OpenCodianView.ts` + `main.ts` changes from Checkpoint 13E; approved explicitly |

### Deployment

- Deployed to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- `BUILD_ID` verified in deployed `main.js`

### Obsidian Runtime Proof

- **Active backend = codex**: Confirmed via eval (`{"activeBackend":"codex","enabledBackends":["opencode","claude-code","codex"]}`)
- **Settings page shows sandbox mode control**: Screenshot `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14a-02-codex-sandbox-visible.png`
- **Dropdown shows three modes**: DOM inspection confirms `read-only`, `workspace-write`, `danger-full-access` options; screenshot `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14a-03-sandbox-dropdown-open.png`
- **Value persists**: Settings updated in-memory after selection change (`sandboxMode` changed from `workspace-write` to `read-only` via settings API)
- **Boundary copy visible**: Description text includes "下次对话或适配器重启后生效" (Chinese) / "Applies on the next thread or after adapter restart" (English)
- **No console errors**: `obsidian dev:console level=error` reports no messages

---

## 5. Honest Truth Buckets

### Newly productized by 14A

- **Global ordinary settings surface `sandboxMode`**: `已 pass`
  - Dropdown control in ordinary active-backend settings
  - Persists to `CodexBackendSettings`
  - Live adapter writeback via `updateSandboxMode()`
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

- This checkpoint does **not** claim OS-level sandbox enforcement is newly proven
- This checkpoint does **not** claim `sandboxMode` runtime behavior differs meaningfully between the three modes (that would require authenticated Codex turns with observable sandbox violations)
- The thing that became `已 pass` is the **ordinary active-backend settings surface for Codex global sandboxMode** (UI + persistence + adapter writeback + honest boundary copy)

---

## 6. Blockers

None.

---

## 7. Next Smallest Suggestion

- Continue with existing backlog based on product priority:
  - Approval-policy UI
  - Codex app-server migration
  - Broader session browser refactor once upstream SDK supports `listThreads()` / `getThreadMessages()`
- Do **not** invest further in Codex session browser discovery/history until official SDK surface expands.

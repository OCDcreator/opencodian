# Capability Lab Backend Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Capability Lab long page with a persisted, accessible, lazy-mounted backend tab rail for Claude Code, OpenCode, and Codex.

**Architecture:** Keep `SettingsCapabilityLabSection` as the owner of backend capability content. Add a focused `capabilityLabBackendTabs.ts` controller for descriptor-driven tabs, manual keyboard activation, and one-time panel mounting; persist only the selected backend id in the existing UI settings envelope. Reuse the already implemented backend workspace helper, OpenCode safe refresh/export path, state calculation, and diagnostic renderers.

**Tech Stack:** TypeScript, Obsidian DOM APIs, Jest/jsdom, CSS, OpenCodian i18n, graphify, Obsidian Plugin Autodebug.

## Global Constraints

- Work from the current dirty tree and preserve the existing backend workspace refactor; do not reset or recreate it from `HEAD`.
- The new design supersedes only the previous consecutive long-page DOM layout. Preserve backend isolation, state semantics, OpenCode safe refresh/export, focus restoration, sanitized feedback, and CJK wrapping.
- Backend ownership is fixed: Claude Code owns all current deep diagnostics, OpenCode owns only its SDK snapshot/refresh/export, and Codex owns only its capability matrix.
- Do not add a shared diagnostics tab or move Backend Routing out of Claude Code.
- `capabilityLabSelectedBackend` is a UI preference only. It must not change `activeBackend`, enabled backends, experimental gates, or runtime configuration.
- Tabs use complete ARIA semantics and manual activation. Focus-only keyboard movement must not mount or load a panel.
- Panels mount on first activation and are reused. Unvisited panels must not trigger History, Subagent, Rewind, or other reads.
- The tab rail remains one line and scrolls locally at 320px. Only the tab rail and table shells may own horizontal overflow.
- Do not record raw settings, credentials, tokens, server payloads, or raw errors.
- Update matching `docs/modules/**`, regenerate `styles.css`, run `npm run graphify:update:src`, and pass `npm run verify` with zero warnings.
- Use Obsidian Plugin Autodebug for real Test Vault keyboard, persistence, DOM, overflow, console, and screenshot proof.

---

### Task 1: Persist The Capability Lab Backend Preference

**Files:**
- Modify: `src/core/types/settings.ts`
- Modify: `src/core/types/settingsLoadNormalization.ts`
- Modify: `src/core/storage/StorageService.ts`
- Modify: `tests/unit/core/types/settings.test.ts`
- Modify: `tests/unit/core/types/settingsLoadNormalization.test.ts`
- Modify: `tests/unit/core/storage/StorageService.test.ts`

**Interfaces:**
- Produces: `OpenCodianSettings.capabilityLabSelectedBackend: AgentBackendKind | undefined`.
- Produces: `normalizeCapabilityLabSelectedBackend(value: unknown): AgentBackendKind | undefined`.
- Persists the field in `.opencodian/settings.ui.json`, not `settings.core.json`.

- [x] **Step 1: Add failing default and normalization tests.**

Add assertions equivalent to:

```typescript
expect(DEFAULT_SETTINGS.capabilityLabSelectedBackend).toBeUndefined();
expect(normalizeCapabilityLabSelectedBackend('  codex  ')).toBe('codex');
expect(normalizeCapabilityLabSelectedBackend('unknown')).toBeUndefined();
expect(normalizeCapabilityLabSelectedBackend(null)).toBeUndefined();
```

Add bootstrap cases proving a saved `opencode` value survives and a stale value normalizes to `undefined`.

- [x] **Step 2: Add a failing UI-envelope persistence assertion.**

Extend the existing `saveUiSettings` fixture with `capabilityLabSelectedBackend: 'claude-code'` and assert the serialized UI envelope contains the field while core extraction excludes it.

- [x] **Step 3: Run the focused tests and verify the expected red state.**

Run:

```bash
npm test -- --runInBand tests/unit/core/types/settings.test.ts tests/unit/core/types/settingsLoadNormalization.test.ts tests/unit/core/storage/StorageService.test.ts
```

Expected: failures because the setting, normalizer, and persisted UI key do not exist.

- [x] **Step 4: Implement the typed setting and normalizer.**

In `settings.ts`, add:

```typescript
const CAPABILITY_LAB_BACKEND_IDS: readonly AgentBackendKind[] = [
  'claude-code',
  'opencode',
  'codex',
];

export function normalizeCapabilityLabSelectedBackend(value: unknown): AgentBackendKind | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim() as AgentBackendKind;
  return CAPABILITY_LAB_BACKEND_IDS.includes(normalized) ? normalized : undefined;
}
```

Add the optional field to `OpenCodianSettings` and set its default to `undefined`.

- [x] **Step 5: Normalize and persist the field.**

Set the final bootstrap value with:

```typescript
capabilityLabSelectedBackend: normalizeCapabilityLabSelectedBackend(
  normalizedSettings?.capabilityLabSelectedBackend,
),
```

Add the key to `PersistedUiSettingsKey`, `PERSISTED_UI_SETTINGS_KEYS`, and `extractPersistedUiSettings()`.

- [x] **Step 6: Run the focused tests and verify green.**

Run the Step 3 command. Expected: all selected suites pass.

- [x] **Step 7: Review and commit Task 1.**

Stage only the six Task 1 files and commit with:

```bash
git commit -m "Persist Capability Lab backend selection"
```

---

### Task 2: Build The Descriptor-Driven ARIA Tabs Controller

**Files:**
- Create: `src/features/settings/capabilityLabBackendTabs.ts`
- Create: `tests/unit/features/settings/capabilityLabBackendTabs.test.ts`

**Interfaces:**
- Consumes: backend descriptors supplied by `SettingsCapabilityLabSection`.
- Produces: `createCapabilityLabBackendTabs(options): CapabilityLabBackendTabsController`.
- Produces controller methods `activate(id, options?)`, `refreshState(id)`, `getActiveId()`, and `dispose()`.

Define the public contract as:

```typescript
export interface CapabilityLabBackendTabState {
  state: string;
  label: string;
}

export interface CapabilityLabBackendTabRenderContext {
  refreshState(): void;
  isCurrent(): boolean;
}

export interface CapabilityLabBackendTabDescriptor {
  id: string;
  label: string;
  getState(): CapabilityLabBackendTabState;
  render(panelEl: HTMLElement, context: CapabilityLabBackendTabRenderContext): void;
}

export interface CapabilityLabBackendTabsController {
  activate(id: string, options?: { focus?: boolean; persist?: boolean }): void;
  refreshState(id: string): void;
  getActiveId(): string;
  dispose(): void;
}
```

- [x] **Step 1: Write failing descriptor and fallback tests.**

Prove descriptor order drives tab order, a synthetic fourth descriptor appears without controller changes, and initial selection resolves as persisted id, then active backend, then Claude Code.

- [x] **Step 2: Write failing ARIA and manual keyboard tests.**

Assert `tablist`, `tab`, `tabpanel`, `aria-selected`, `aria-controls`, `aria-labelledby`, roving `tabindex`, native `hidden`, Arrow wrapping, Home/End, Enter/Space activation, and pointer activation.

- [x] **Step 3: Write failing lazy-mount and cache tests.**

Use `jest.fn()` descriptor renderers and prove:

```typescript
expect(renderClaude).not.toHaveBeenCalled(); // when OpenCode starts active
opencodeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
expect(renderClaude).not.toHaveBeenCalled(); // focus only
claudeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
expect(renderClaude).toHaveBeenCalledTimes(1);
// switch away and back
expect(renderClaude).toHaveBeenCalledTimes(1);
```

- [x] **Step 4: Run the new test suite and verify red.**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/capabilityLabBackendTabs.test.ts
```

Expected: failure because `capabilityLabBackendTabs.ts` does not exist.

- [x] **Step 5: Implement the controller with no backend-specific branches.**

Create all tabs and empty panel shells up front. Mount only the selected panel. Keep per-panel `mounted` and render generation state, set `data-capability-panel-mounted="true"` after successful render, and render a localized caller-supplied error string on failure.

Use manual activation key handling:

```typescript
if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
  event.preventDefault();
  focusTab(nextIndex);
  return;
}
if (event.key === 'Enter' || event.key === ' ') {
  event.preventDefault();
  activate(descriptor.id, { focus: true, persist: true });
}
```

Call `scrollIntoView({ block: 'nearest', inline: 'nearest' })` only when available, so jsdom and Obsidian both remain stable.

- [x] **Step 6: Run the new suite and verify green.**

Run the Step 4 command. Expected: all controller tests pass.

- [x] **Step 7: Review and commit Task 2.**

Commit the controller and its tests with:

```bash
git commit -m "Add accessible Capability Lab backend tabs"
```

---

### Task 3: Recompose Capability Lab Into Lazy Backend Panels

**Files:**
- Modify: `src/features/settings/SettingsCapabilityLabSection.ts`
- Modify: `src/features/settings/capabilityLabBackendWorkspace.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`
- Modify: `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts`

**Interfaces:**
- Consumes: `createCapabilityLabBackendTabs()` from Task 2.
- Consumes: existing `createCapabilityLabBackendWorkspace()` and OpenCode snapshot methods.
- Produces: three descriptors with strict backend content ownership.

- [x] **Step 1: Adapt integration tests to activate the owning panel.**

Add helpers that click or keyboard-activate a backend tab before querying its workspace. Assert one selected tab and one visible panel. Replace assertions that expect all backend workspaces or all diagnostics to exist immediately.

- [x] **Step 2: Add failing ownership and lazy-load tests.**

Prove:

- Starting with persisted OpenCode mounts only OpenCode.
- Focusing Claude Code does not call adapter history/subagent APIs.
- Activating Claude Code mounts the capability matrix and every deep diagnostic block inside the Claude panel.
- Codex mounts only the Codex matrix.
- Backend Routing remains inside Claude Code.
- Unconfigured backends remain selectable.

- [x] **Step 3: Add failing persistence and refresh-state tests.**

Click Codex and assert `plugin.settings.capabilityLabSelectedBackend === 'codex'` and `saveSettings()` is called. Refresh OpenCode and assert its tab state label updates without replacing the tablist or changing selection.

- [x] **Step 4: Run the focused integration suite and verify red.**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsCapabilityLabSection.test.ts
```

Expected: failures because the current implementation renders one consecutive long page.

- [x] **Step 5: Build three local descriptors in `attachTabbed()`.**

After the warning and summary, call the tab controller with descriptors in this order:

```typescript
[
  { id: 'claude-code', label: t('settings.capabilityLab.tabs.claudeCode'), getState, render },
  { id: 'opencode', label: t('settings.capabilityLab.tabs.openCode'), getState, render },
  { id: 'codex', label: t('settings.capabilityLab.tabs.codex'), getState, render },
]
```

Resolve the initial id from `capabilityLabSelectedBackend`, then `activeBackend`, then `claude-code`. Persist activation by updating only `capabilityLabSelectedBackend` and calling `saveSettings()` without awaiting the navigation change.

- [x] **Step 6: Move all Claude-owned blocks into the Claude renderer.**

Create the Claude workspace and matrix first, followed by History, Subagents, Rewind, Structured Output, Fork, Resume, Session Detail, Backend Routing, and Discovery/Status as descendants of the Claude panel. Do not invoke any of these renderers before Claude activation.

- [x] **Step 7: Keep OpenCode and Codex renderers narrow.**

OpenCode creates only its workspace, snapshot table, safe refresh, and sanitized export. Its refresh completion calls the render context's `refreshState()` after updating the workspace. Codex creates only its workspace and matrix.

- [x] **Step 8: Add localized tablist, tab state, and load-failure copy.**

Add English and Chinese keys for the tablist accessible label, backend tab labels, tab state accessible label, and sanitized panel load failure. Do not add emoji or expose raw error messages.

- [x] **Step 9: Correct the Capability Lab boundary copy.**

Update the file comment and banner text so they no longer claim that nothing persists. State that backend selection and explicit Claude diagnostic controls are settings writes, while capability probes remain read-only, dry-run, or isolated diagnostic-store operations.

- [x] **Step 10: Run the controller and integration suites.**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/capabilityLabBackendTabs.test.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts
```

Expected: both suites pass, including existing OpenCode refresh/export/focus coverage.

- [x] **Step 11: Review and commit Task 3.**

This commit intentionally includes the preserved uncommitted backend workspace baseline because the tabs are its final product composition. Stage only the five Task 3 files plus the already existing workspace helper and commit with:

```bash
git commit -m "Separate Capability Lab backends into tabs"
```

---

### Task 4: Apply The Tab Rail Visual Contract And Sync Documentation

**Files:**
- Modify: `src/style/components/settings-capability-lab.css`
- Modify: generated `styles.css`
- Modify: `docs/modules/features/settings/SettingsCapabilityLabSection.md`
- Create: `docs/modules/features/settings/capabilityLabBackendTabs.md`
- Modify: `docs/modules/features/settings/capabilityLabBackendWorkspace.md`
- Modify: `docs/modules/style/components/settings-capability-lab.md`
- Modify: `docs/modules/core/types/settings.md`
- Modify: `docs/modules/core/types/settingsLoadNormalization.md`
- Modify: `docs/modules/core/storage/StorageService.md`
- Modify: `docs/modules/i18n/locales/en.md`
- Modify: `docs/modules/i18n/locales/zh.md`
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`

**Interfaces:**
- Consumes: stable tab and panel data attributes from Tasks 2-3.
- Produces: compact underline tab rail, narrow-width local scrolling, synchronized module docs and generated artifacts.

- [x] **Step 1: Add CSS contract assertions before CSS changes.**

Extend the existing style tests or source assertions to require:

- `overflow-x: auto` and `flex-wrap: nowrap` on the tablist.
- Compact 13px tabs with normal letter spacing.
- Underline active state using existing semantic variables.
- Focus-visible outline.
- Hidden panels do not display.
- No card background/radius/shadow on the tablist.
- Only table shells and tab rail own horizontal overflow.

- [x] **Step 2: Run the focused suite and verify the CSS assertions fail.**

Run the Capability Lab integration suite. Expected: failure because the tab CSS does not exist.

- [x] **Step 3: Implement the compact tab rail.**

Use the existing design tokens and Obsidian variables. Keep transitions limited to color, border-color, and background-color at approximately 150ms. At narrow widths, preserve a single line and local scrolling; do not reduce font size with viewport width.

- [x] **Step 4: Regenerate the root CSS bundle.**

Run:

```bash
npm run build:css
```

Expected: `styles.css` contains the new Capability Lab tab selectors.

- [x] **Step 5: Synchronize module documentation.**

Document descriptor ownership, persisted selection fallback, ARIA/manual activation, lazy mounting, backend content ownership, safe OpenCode refresh, selectors, and 320px overflow rules. Correct any old module wording that says all diagnostics are purely non-persistent.

- [x] **Step 6: Run focused tests, lint, and typecheck.**

Run:

```bash
npm test -- --runInBand tests/unit/core/types/settings.test.ts tests/unit/core/types/settingsLoadNormalization.test.ts tests/unit/core/storage/StorageService.test.ts tests/unit/features/settings/capabilityLabBackendTabs.test.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts
npm run lint
npm run typecheck
```

Expected: all commands exit 0 with zero warnings.

- [x] **Step 7: Refresh Graphify before repository verification.**

Run:

```bash
npm run graphify:update:src
```

Expected: committed graph metadata reflects the current source tree and no transient `src/graphify-out/` remains.

- [x] **Step 8: Run the full repository gate.**

Run:

```bash
npm run verify
```

Expected: module docs, graph freshness, devlog order, lint, typecheck, all Jest suites, and production build pass.

- [x] **Step 9: Review and commit Task 4.**

Stage the Task 4 style, docs, generated CSS, graph artifacts, and completed plan checkboxes. Commit with:

```bash
git commit -m "Polish and document Capability Lab backend tabs"
```

---

### Task 5: Deploy And Prove The Real Obsidian UI

**Files:**
- Output only: `.obsidian-debug/capability-lab-backend-tabs-20260715-*/`

**Interfaces:**
- Consumes: the production build produced by `npm run verify`.
- Produces: BUILD_ID, deployment hashes, DOM/focus/overflow assertions, console evidence, screenshots, and independent review verdicts.

- [x] **Step 1: Run Obsidian Plugin Autodebug preflight.**

Use the repo-local or skill-provided doctor command to verify Test Vault path, plugin id, Obsidian control channel, and screenshot support. Record the output in the evidence directory.

- [x] **Step 2: Build, then deploy sequentially to the macOS Test Vault.**

Run `npm run build`. After it succeeds, copy these files in separate sequential operations to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`:

```text
dist/main.js
dist/manifest.json
dist/styles.css
```

Do not chain build and copy. Verify the deployed `main.js` contains the new `BUILD_ID` and compare source/destination hashes.

- [x] **Step 3: Reload and verify navigation behavior.**

Open Debug > Capability Lab and prove:

- One page title and one visible backend panel.
- Three tabs in Claude Code, OpenCode, Codex order.
- Arrow/Home/End move focus only.
- Enter/Space activates and mounts.
- Pointer activation works.
- The selected backend survives Settings close/reopen and Obsidian reload.
- Unconfigured backends remain selectable.

- [x] **Step 4: Verify lazy loading and OpenCode safety.**

Start on OpenCode or Codex and use DOM/API counters or observable loading markers to prove Claude History/Subagent content has not mounted. Activate Claude and prove it mounts once. In OpenCode, run safe refresh and sanitized evidence export; verify selection remains OpenCode, `aria-busy` clears, one feedback node exists, and no raw error or credential appears.

- [x] **Step 5: Verify responsive and theme behavior.**

Capture light and dark screenshots at normal Settings width and a 320px-equivalent narrow width. Assert:

- Page-level `scrollWidth <= clientWidth`.
- Tab rail may scroll horizontally and the active/focused tab scrolls into view.
- Table overflow remains local.
- CJK labels and state text do not overlap, clip, or orphan unnaturally.
- Focus rings and active underline remain visible in both themes.

- [x] **Step 6: Run independent GPT-5.6 sol reviews.**

Dispatch two fresh read-only reviewers in parallel: one for design-system/functional integrity and one for visual/CJK/accessibility precision. Give them the complete fresh screenshot set, DOM/computed-style assertions, BUILD_ID, and source paths. Fix all blocking product findings, rebuild, redeploy, recapture, and repeat until both pass on the same current build.

- [x] **Step 7: Run final verification and report.**

Re-run the focused tests affected by any QA fixes, `npm run graphify:update:src` if source changed, and `npm run verify`. Report final commits, test counts, BUILD_ID, deployment hashes, evidence directory, screenshot paths, independent review verdicts, and residual risks. Do not commit `.obsidian-debug/` evidence.

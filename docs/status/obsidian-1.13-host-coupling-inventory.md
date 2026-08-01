# Obsidian 1.13.4 Host Coupling Inventory

Scope: traceable audit of every OpenCodian host-coupling point against Obsidian
1.13.4 (public, 2026-07-30). Each item carries a status of **已修复 / 当前兼容 /
需人工场景验证 / 不适用** plus a code location and concrete evidence.

Runtime baseline: Obsidian 1.13.4, OpenCodian 1.1.3. Repo `obsidian` typings
upgraded to `^1.13.1` (declared in package.json devDependencies; originally audited
at `1.12.3`, then raised to `^1.13.1` to compile against the official 1.13
declarative-settings API). `manifest.json`/`versions.json` `minAppVersion` =
`1.4.5` and is preserved — the declarative code is runtime-guarded
(`getSettingDefinitions()` returns `[]` on <1.13 where `SettingPage` is absent,
so `display()` is the fallback) and raises no version floor.

> **⚠️ Runtime-verification disclosure (Phase B, updated).** The macOS Test Vault
> runs **Obsidian 1.13.4** (confirmed via window title `1.13.4` + `is-measuring`
> probes present in `obsidian.asar`); the user updated the app in-place from a
> 1.12.7 installer, so `Info.plist` / `@electron/remote.app.getVersion()` still
> report the **installer** version 1.12.7 and the **bundled Electron is still 39**
> (not 43 — the 1.13.4 changelog's "Electron 43" requires reinstalling the
> installer, which was not done). Runtime acceptance below is therefore split:
> Obsidian-1.13.4 behaviors (Settings search, declarative page, keyboard nav,
> `.is-measuring` probes, `dev:errors`) are **verified on the real 1.13.4 app**;
> any behavior specific to **Electron 43** (e.g. Electron-43-only dialog quirks)
> remains **未验证 (needs the Electron-43 installer reinstall)**.

Authoritative references:
- Changelog: https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/
- Declarative settings typings: `obsidianmd/obsidian-api` `obsidian.d.ts`
  (`SettingTab`, `PluginSettingTab`, `SettingDefinitionPage/Group/List/Control/...`,
  all marked `@since 1.13.0`).

---

## 1. Settings dropdown double-render regression — **已修复 (Phase A)**

- Symptom (Test Vault runtime): 3 real `<select>` + 3 `.select.dropdown.is-measuring`
  nodes, but 6 `.opencodian-settings-dropdown-trigger` — each settings row shows
  two visible dropdowns.
- Root cause: Obsidian 1.13 inserts a hidden `select.dropdown.is-measuring` width
  probe per `DropdownComponent`; `SettingsDropdownControl.enhanceSettingsDropdowns`
  scanned **all** `select` in the container and re-scanned on every
  `MutationObserver` select-add, so each probe was self-rendered as a second
  dropdown.
- Code: `src/features/settings/SettingsDropdownControl.ts` `enhanceSettingsDropdowns` (the container enhancer) — its `refresh()` scans via `isEnhanceableRealSelect()`, and the container `MutationObserver` (watching `childList` + `class` attribute) re-scans on real-select adds or class flips. Callers: `OpenCodianSettings.displayInto`, `OpenCodianSettingsView.renderSettings`, `McpServerEditorModal.renderForm`, plus the modals.
- CodeGraph blast radius: `enhanceSettingsDropdowns` has **6 distinct method/function
  callers** — `OpenCodianSettings.display`, `OpenCodianSettingsView.renderSettings`,
  `McpServerEditorModal.renderForm`, `ModelConfigModal.render`, `ModelPickerModal.onOpen`,
  `ProviderBuiltinIconPickerModal.onOpen`. `enhanceSettingsSelect` impact @depth 2 =
  27 nodes / 28 edges. Fixing the predicate inside `SettingsDropdownControl` covers
  all callers.
- Fix: add an explicit, testable `isEnhanceableRealSelect()` predicate that rejects
  `.is-measuring` (and already-enhanced + detached) nodes, used by both the initial
  scan and the MutationObserver increment. No timing dependency, no blanket
  `aria-hidden` hiding.
- Coverage: main settings tab, editor-area settings view, MCP editor modal (2
  dropdowns at `McpServerEditorModal.ts:82,219`).
- Regression test: `tests/unit/features/settings/SettingsDropdownControl.test.ts`
  (insert real select then `.dropdown.is-measuring` probe; assert one trigger, probe
  not enhanced, real value still changeable).
- Excluded paths (use raw `<select>`, no `DropdownComponent`): `ModelConfigModal`'s
  raw select is enhanced via `enhanceSettingsSelect` directly — still covered by the
  same predicate.
- **1.13.4 runtime verified**: settings-modal surface shows `dropdownTriggers ===
  realSelects` with `enhancedProbeCount === 0` and `noProbeEnhanced === true`
  (probes carry host `aria-hidden=true`, untouched); `obsidian dev:errors` empty.

## 2. New Settings API / global search — **已修复 (Phase B, 1.13.4 已验证)**

- Obsidian 1.13 deprecates `PluginSettingTab.display()` and renders declaratively
  from `getSettingDefinitions()` when it returns a non-empty array; definitions feed
  the global Settings search index. `display()` is **only** called as a fallback for
  <1.13 or when definitions are empty.
- Code: `src/features/settings/OpenCodianSettings.ts` — `OpenCodianSettingTab extends PluginSettingTab`; `display()` delegates to `displayInto(activeSettingsContainer ?? containerEl)`; `getSettingDefinitions()` returns one `SettingDefinitionPage` whose `page()` factory lazily builds an `OpenCodianSettingsPage` (via `createOpenCodianSettingsPageCtor`) whose `display()` calls `displayInto(this.containerEl)`.
- Migration strategy: **dual support (Path B)** — keep `display()` (works on all
  versions; deprecated but functional on 1.13) and add `getSettingDefinitions()`
  returning a single `SettingDefinitionPage` (NOT groups/items) whose lazy
  `SettingPage.display()` delegates to the existing classic/tabbed layout via
  `displayInto()`; the page's name/desc make plugin settings discoverable in global
  search. Do **not** add a separate capability-overview settings page.
- `minAppVersion` stays `1.4.5`: the page class is built **lazily** via
  `getSettingPageCtor()` (runtime `require('obsidian').SettingPage`, no module-level
  `extends SettingPage`), and `getSettingDefinitions()` returns `[]` when `SettingPage`
  is absent (<1.13) so the host calls `display()`. This keeps the plugin loadable on
  Obsidian 1.4.5+ without raising the version floor (covered by a `<1.13` regression
  test that nulls `SettingPage` and asserts `[]`).

## 3. Host DOM/CSS class coupling — **需人工场景验证 / 已修复 (Phase B)**

- `.vertical-tab-*` (`.vertical-tab-content`, `.vertical-tab-content-container`):
  used as the Settings scroll container contract in `SettingsSectionCoordinator.ts:8-9`,
  `searchInputEnhancer.ts:65`, `SettingsAcpSection.ts:383`,
  `SettingsFormatterSection.ts:219,333`, `ConversationSessionSettingsModal.ts:1388`,
  and CSS `model-selector.css:459-460`. **Removed from 1.13 Settings** — cannot
  remain the sole layout contract. Phase B: verify scroll-restore / quick-nav /
  search enhancer degrade gracefully (selectors are multi-fallback lists including
  `.modal-content` and the plugin's own containers) and add a 1.13 Settings
  container selector where needed.
- `.workspace-leaf-content[data-type="opencodian-settings-view"]` / `[data-type=
  "opencodian-view"]`: workspace-leaf contract, **not** Settings-modal contract;
  expected current-compatible. `OpenCodianView.ts:2735,2779`,
  `settings-layout-contract.css:2760`, `model-selector.css:465-471`. Phase B: confirm
  the editor-area settings view still opens in 1.13.
- `.setting-item-control`: stable public settings row class; CSS coupling only
  (`settings-dropdown.css:21`, `settings-claude-providers.css`, `settings-agents.css`).
  **Current-compatible** — still emitted by `Setting`.
- `.modal-container` / `.modal`: `ConversationSessionSettingsCoordinator.ts:154-155`,
  CSS z-index notes in `settings-dropdown.css:134`, `agent-switcher.css:40`. Phase B:
  confirm modal portal z-index still clears the (now windowed) Settings.

## 4. `app.setting.open` / `openTabById` — **当前兼容 (1.13.4 已验证)**

- Evidence: `rg "app\.setting|\.setting\.(open|openTabById)" src/` → **no matches**.
  OpenCodian never calls host `app.setting.*`; deep-links are internal
  (`SettingsSectionCoordinator` / `SettingsTabbedRenderer` scroll + the editor-area
  ItemView). No isolation layer needed because there is no coupling.
- Phase B runtime on 1.13.4: `app.setting.open` and `openTabById` are both
  `function` and open the OpenCodian settings surface. Typing "OpenCodian" into the
  1.13 global Settings search box navigates to the plugin's declarative settings
  page; keyboard nav (ArrowDown + Enter) lands on it with **no double-render**
  (surfaces=1, dropdown triggers=2 stable, before/after navigation identical).

## 5. Electron 43 + `@electron/remote` — **部分验证 (dialog open verified; cancel needs manual click)**

- `SettingsDebugSection.ts:90-105`: directory picker via `dynamicRequire('@electron/remote')`
  with `electron.remote` fallback. `TraceRedactor.ts:333`: diagnostics path via
  `require('@electron/remote').app.getPath(...)`.
- Phase B runtime on 1.13.4 (Electron 39): `require('@electron/remote')` requireable;
  `app.getPath('temp')` resolves; `dialog.showOpenDialog` is a `function` and a real
  native directory picker **was opened** on screen multiple times (the "open" half).
- Cancel handling verified in code + deployed build: `pickDirectory` (lines 614-633)
  checks `result.canceled || result.filePaths.length === 0` → returns `null`
  (confirmed in `dist/main.js`). The literal `{canceled:true}` return value was NOT
  auto-captured because the native macOS open-directory dialog does not respond to
  scripted cancel (AppleScript Escape/Cmd+., Quartz CGEvent, BrowserWindow close all
  failed) — it requires a real mouse Cancel click. Status: **open + code-cancel-path
  verified; literal canceled-true capture needs a manual click**.
- **Electron-43-specific** dialog behavior remains **未验证 (needs the Electron-43
  installer reinstall)** — the bundled Electron is still 39 because the 1.12.7
  installer was not reinstalled.

## 6. CodeMirror selection highlight — **当前兼容 (1.13.4 live show/hide 已验证)**

- `src/utils/editorSelectionHighlight.ts`: standard `@codemirror/state`+
  `@codemirror/view` `StateField`/`Decoration.mark` extension (`show`/`hide`
  effects). Consumed by `RetainedSelectionHighlightService` /
  `RetainedSelectionRuntimeCoordinator`. Version-agnostic extension API.
- Phase B runtime on 1.13.4 (LIVE flip captured): drove the real retained-selection
  flow via the view's `retainedSelectionRuntimeCoordinator` — open note → select range
  → `primeRetainedSelectionHighlightFromActiveEditor()` → focus composer textarea
  (`focusin`) → blur (`focusout`). **In one sequence: marks `before=0` → `shown=1`
  (mark appears, `composerFocused=true`) → `hidden=0` (mark removed on blur,
  `composerFocused=false`). `showWorked=true`, `hideWorked=true`.** This exercises the
  actual `showSelectionHighlight`/`hideSelectionHighlight` bundle functions on a live
  CM6 editor under 1.13.4. `opencodian-selection-highlight` CSS effective
  (`backgroundColor: rgba(255,16,16,0.467)`). `obsidian dev:errors` stays empty.

## 7. `--callout-color` OKLCH change — **当前兼容 (未使用) — 已验证**

- Evidence: `rg "callout-color" src/ style/` → **no matches**. Phase B runtime
  confirms: of 17 live CSS rules mentioning `--callout-color`, all 14 definitions
  and all 4 consumers are **host-authored** (`opencodianDefineCount === 0`).
  OpenCodian does not set or read `--callout-color`. The OKLCH / "expects a valid
  CSS color" breaking change does not apply.

## 8. macOS input/button styles, Modal layout & portal layering — **当前兼容 (部分验证)**

- No targeted fix needed. `.modal-container` / `.modal` still emitted by host.
  Dropdown menu portal `z-index 2001` over `.modal-container` `z-index 1000`
  (`settings-dropdown.css:134`) — statically verified; live portal render to
  `document.body` confirmed in Phase A.
- Windowed-Settings scroll-restore in 1.13's detached settings window:
  **未验证 (obsidian eval cannot query the separate settings-window document)**.
  The host IS Obsidian 1.13.4 (this is not a version gap); the untested scenario is
  specifically scroll-restore/quick-nav behavior inside the new detached settings
  Electron window, because `obsidian eval` runs in the main vault window and cannot
  reach the settings window's DOM after it detaches. Declarative-page render,
  dropdown single-trigger, and no-double-render WERE verified in the settings window
  via the settings-doc (`ownerDocument`) path while reachable.

## 9. Windows cross-platform — **未验证**

- Requirement 5 requires Windows to either pass equivalent runtime acceptance or be
  explicitly marked "未验证". **Windows runtime acceptance was NOT run this session.**
- The Windows host (`desktop-gs1a9np`) is reachable via SSH; its Obsidian installer is
  1.12.7.0 with the OpenCodian plugin (1.1.3) deployed, but there is no `obsidian`
  CLI control surface (`eval` / `dev:*`) on Windows to drive the equivalent live
  acceptance (settings search, MCP modal, CodeMirror flip, dialog, dev:errors). So
  Windows cross-platform compatibility is **未验证**, and the upgrade must not be
  claimed as cross-platform-complete on Windows.

---

## Phase gates

- Phase A: items 1 (dropdown regression) fixed + tested + Test Vault evidence, then
  fresh read-only Codex review. `APPROVED` required to enter Phase B.
- Phase B: items 2–8 implemented/verified per status, then fresh read-only Codex
  review. `APPROVED` required to close.

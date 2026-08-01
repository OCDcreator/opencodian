# Obsidian 1.13.4 Host Coupling Inventory

Scope: traceable audit of every OpenCodian host-coupling point against Obsidian
1.13.4 (public, 2026-07-30). Each item carries a status of **已修复 / 当前兼容 /
需人工场景验证 / 不适用** plus a code location and concrete evidence.

Runtime baseline: Obsidian 1.13.4, OpenCodian 1.1.3. Repo `obsidian` typings at
audit time: `1.12.3` (installed) vs `master` 1.13 typings fetched from
`obsidianmd/obsidian-api` for API discovery. `manifest.json`/`versions.json`
`minAppVersion` = `1.4.5` and must be preserved (no API requires raising it).

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
- Code: `src/features/settings/SettingsDropdownControl.ts:134` (`enhanceSettingsDropdowns`),
  `:143` (refresh scans all `select`), `:136-141` + `:149-153` (MutationObserver
  re-scan).
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

## 2. New Settings API / global search — **已修复 (Phase B)**

- Obsidian 1.13 deprecates `PluginSettingTab.display()` and renders declaratively
  from `getSettingDefinitions()` when it returns a non-empty array; definitions feed
  the global Settings search index. `display()` is **only** called as a fallback for
  <1.13 or when definitions are empty.
- Code: `src/features/settings/OpenCodianSettings.ts:53` (`OpenCodianSettingTab
  extends PluginSettingTab`), `:265` (`display()`).
- Migration strategy: **dual support (Path B)** — keep `display()` (works on all
  versions; deprecated but functional on 1.13) and add `getSettingDefinitions()`
  returning `SettingDefinitionPage[]`/groups built from the existing section
  metadata so plugin settings are discoverable by name+desc in global search.
  Preserve the classic/tabbed multi-level layout inside the page's `render`/items;
  do **not** add a separate capability-overview settings page.
- `minAppVersion` stays `1.4.5`: the declarative types are compile-time only; at
  runtime `<1.13` uses `display()` and `>=1.13` uses definitions. No version bump.

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

## 4. `app.setting.open` / `openTabById` — **当前兼容 (未使用)**

- Evidence: `rg "app\.setting|\.setting\.(open|openTabById)" src/` → **no matches**.
  OpenCodian never calls host `app.setting.*`; deep-links are internal
  (`SettingsSectionCoordinator` / `SettingsTabbedRenderer` scroll + the editor-area
  ItemView). No isolation layer needed because there is no coupling. Phase B: confirm
  opening the plugin tab via global Settings search lands without double-render.

## 5. Electron 43 + `@electron/remote` — **需人工场景验证 (Phase B)**

- `SettingsDebugSection.ts:90-105`: directory picker via `dynamicRequire('@electron/remote')`
  with `electron.remote` fallback. `TraceRedactor.ts:333`: diagnostics path via
  `require('@electron/remote').app.getPath(...)`.
- Phase B gate: actually open the debug directory picker and **cancel** once (not
  just `require`-probe), and confirm the diagnostic log path resolves under Electron
  43. Report concrete result.

## 6. CodeMirror selection highlight — **需人工场景验证 (Phase B)**

- `src/utils/editorSelectionHighlight.ts`: standard `@codemirror/state`+
  `@codemirror/view` `StateField`/`Decoration.mark` extension (`show`/`hide`
  effects). Consumed by `RetainedSelectionHighlightService` /
  `RetainedSelectionRuntimeCoordinator`. Version-agnostic extension API, but 1.13
  upgraded CodeMirror — Phase B: runtime verify the show/hide flow on a live editor.

## 7. `--callout-color` OKLCH change — **当前兼容 (未使用)**

- Evidence: `rg "callout-color" src/ style/` → **no matches**. OpenCodian does not set
  or read `--callout-color` and ships no callout color overrides. The OKLCH /
  "expects a valid CSS color" breaking change does not apply.

## 8. macOS input/button styles, Modal layout & portal layering — **需人工场景验证 (Phase B)**

- No targeted fix expected; Phase B runtime capture must confirm native `<select>`,
  buttons, and the dropdown menu portal (`z-index 2001` over `.modal-container`
  `z-index 1000`, `settings-dropdown.css:134`) still render correctly under 1.13's
  windowed Settings.

---

## Phase gates

- Phase A: items 1 (dropdown regression) fixed + tested + Test Vault evidence, then
  fresh read-only Codex review. `APPROVED` required to enter Phase B.
- Phase B: items 2–8 implemented/verified per status, then fresh read-only Codex
  review. `APPROVED` required to close.

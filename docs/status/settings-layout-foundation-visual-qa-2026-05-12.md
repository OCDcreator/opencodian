# Settings Layout Foundation Visual QA - 2026-05-12

## Scope

Visual QA for the settings UI layout contract foundation branch.

Branch: `codex/settings-ui-layout-foundation`

Deployed build: `codex-settings-ui-layout-foundation.202605122000`

Test vault plugin directory: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

## Deployment Check

- Copied `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` into the Mac Test Vault plugin directory.
- Verified deployed `main.js` contains `BUILD_ID=codex-settings-ui-layout-foundation.202605122000`.
- Verified deployed `manifest.json` and `styles.css` match `dist/`.
- Reloaded plugin with `obsidian plugin:reload id=opencodian vault=testvault`.
- Confirmed `opencodian` is enabled in the Test Vault.

## Visual And DOM Checks

- Default theme, dark, settings modal, classic mode: root marker `data-settings-surface="page"`, `data-settings-layout-mode="classic"`; quick nav present; no `.opencodian-settings-tab-panel`.
- Default theme, dark, settings modal, tabbed mode: structural `.opencodian-settings-content-shell` present; no `.opencodian-settings-tab-panel`.
- Default theme, light, settings modal, classic mode at 1280px and 720px: shared section blocks and ordinary setting rows rendered without obvious overlap or clipping.
- Default theme, light, settings modal, tabbed mode at 1280px and 720px: one structural content shell, shared section block, no heavy tab-panel shell.
- Editor-area settings view: `.workspace-leaf-content[data-type="opencodian-settings-view"] > .view-content.opencodian-settings` present with root markers on `contentEl`, not the outer leaf.
- Dropdown portal check at 720px: layout-mode dropdown opened as portal menu, stayed inside viewport, and exposed two options.
- Keyboard check: focused layout-mode dropdown, sent `ArrowDown` + `Enter`, and confirmed the setting saved and re-rendered to `tabbed`.
- Console/errors: `obsidian dev:errors` reported no captured errors; `obsidian dev:console level=error` reported no captured messages.

## Screenshot Evidence

Runtime screenshots were saved under `.obsidian-debug/settings-layout-visual-qa/`:

- `default-dark-classic-1280.png`
- `default-dark-tabbed-1280.png`
- `default-light-classic-1280.png`
- `default-light-classic-720.png`
- `default-light-tabbed-1280.png`
- `default-light-tabbed-720.png`
- `editor-area-classic-1280-unmodal.png`

The `.obsidian-debug/` directory is runtime evidence and is not committed.

## Notes

- The vault originally used the Minimal theme in dark mode; QA temporarily switched to the default theme for the required checks, then restored Minimal dark mode.
- The settings layout mode was restored to `classic` after the dropdown keyboard check.

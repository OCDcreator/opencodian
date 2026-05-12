# Settings Formatter Density Visual QA - 2026-05-12

## Scope

This pass implements Slice 4 of the settings UI refactor: Formatter settings density. It keeps formatter runtime/config behavior intact and only changes visual hierarchy.

The goal is to make Formatter settings follow the same shared settings contract as layout foundation, model availability, and MCP/server density:

- Summary cards, runtime list, builtin formatter rows, and custom formatter rows use object tokens.
- Runtime table, override fields, custom fields, and JSON editor use row tokens.
- Environment key/value rows use inline tokens.
- Enabled/disabled formatter badges keep semantic colors because formatter state affects user decisions.

## Branch And Build

- Branch: `codex/settings-ui-layout-foundation`
- Worktree: `/Users/dht/.codex/worktrees/settings-ui-layout-foundation/opencodian`
- Test vault plugin path: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`
- Build ID deployed to Test Vault: `codex-settings-ui-layout-foundation.202605122305`

The deployed Test Vault `main.js` contains the build ID above.

## Implementation Evidence

- `src/style/modals/config-editor-modal.css` now maps `.opencodian-formatter-*` summary cards, runtime list/table, builtin/custom rows, nested fields, environment rows, and JSON editor to shared `--opencodian-settings-*` tokens.
- `.opencodian-formatter-summary-card`, `.opencodian-formatter-runtime-list`, `.opencodian-formatter-builtin-row`, and `.opencodian-formatter-custom-row` use object token background/border/radius with `box-shadow: none`.
- `.opencodian-formatter-table`, `.opencodian-formatter-override-fields`, `.opencodian-formatter-custom-fields`, and `.opencodian-formatter-json-editor` use row tokens.
- `.opencodian-formatter-env-row` uses inline tokens.
- `tests/unit/features/settings/SettingsFormatterSection.test.ts` now contains a CSS contract test guarding against formatter-only heavy cards, gradients, blur, hover lift, side-stripe borders, and undefined radius tokens.
- `docs/modules/style/modals/config-editor-modal.md` documents the new Formatter density guardrail.

## Validation

Focused verification:

```text
npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts
```

Result: 1 suite passed, 28 tests passed.

```text
npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts
```

Result: 2 suites passed, 39 tests passed.

Full verification:

```text
npm run verify
```

Result: owner guard, module docs, graphify freshness, devlog order, lint, typecheck, full tests, and production build passed. Full tests reported 383 suites and 2359 tests passed.

## Obsidian Autodebug Evidence

### Deployment And Reload

Commands used:

```text
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
obsidian dev:debug on vault=testvault
obsidian dev:console clear vault=testvault
obsidian dev:errors clear vault=testvault
obsidian plugin:reload id=opencodian vault=testvault
```

Reload output:

```text
Reloaded: opencodian
```

### Tabbed Overview DOM/CSS Check

The settings modal was opened to OpenCodian -> Formatter -> Overview.

```json
{
  "ok": true,
  "mode": "tabbed",
  "primary": "formatter",
  "secondary": "overview",
  "formatter": true,
  "summaryCards": 4,
  "runtimeList": false,
  "tabPanel": false,
  "summaryCard": {
    "boxShadow": "none",
    "borderLeftWidth": "1px",
    "borderRadius": "10px"
  }
}
```

`runtimeList` was false in this test-vault state because no formatter runtime rows were returned, but the CSS contract covers the runtime-list/table styles directly.

### Tabbed Config DOM/CSS Check

The settings modal was opened to OpenCodian -> Formatter -> Config. The Test Vault formatter config was `{}`, so custom-mode editors rendered for visual verification.

```json
{
  "ok": true,
  "mode": "tabbed",
  "primary": "formatter",
  "secondary": "config",
  "formatter": true,
  "builtinRows": 52,
  "customRows": 0,
  "jsonEditor": true,
  "tabPanel": false,
  "builtinRow": {
    "boxShadow": "none",
    "borderLeftWidth": "1px",
    "borderRadius": "10px"
  },
  "jsonEditorStyle": {
    "boxShadow": "none",
    "borderLeftWidth": "1px",
    "borderRadius": "10px"
  },
  "buttonBar": {
    "boxShadow": "none",
    "borderLeftWidth": "0px",
    "borderRadius": "0px"
  }
}
```

### Classic Mode Check

Classic settings mode rendered the same Formatter surface in the full settings flow:

```json
{
  "ok": true,
  "mode": "classic",
  "formatter": true,
  "summaryCards": 2,
  "tabPanel": false
}
```

After the classic check, the Test Vault setting was restored to tabbed mode with primary tab `formatter` and secondary tab `overview`.

### Screenshots

Runtime screenshot artifacts were captured under `.obsidian-debug/` and are intentionally not committed:

- `.obsidian-debug/settings-formatter-density/tabbed-formatter-overview.png`
- `.obsidian-debug/settings-formatter-density/tabbed-formatter-config.png`
- `.obsidian-debug/settings-formatter-density/classic-formatter.png`

### Error Capture

After debugger attach, plugin reload, settings open, tabbed overview/config checks, classic check, screenshot capture, and restoring tabbed mode:

- `obsidian dev:errors vault=testvault`: `No errors captured.`
- `obsidian dev:console vault=testvault level=error limit=80`: `No console messages captured.`

## Remaining Design Debt

This slice only normalizes Formatter settings. Remaining setting-density slices:

- Agents / Commands / Plugin catalog rows
- Deep appearance/theme preview cards

The next slices should continue using shared settings tokens and owner-specific CSS contract tests.

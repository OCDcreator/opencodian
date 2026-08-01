# Settings Plugin Catalog Density Visual QA - 2026-05-12

## Scope

This pass implements Slice 5 of the settings UI refactor: Agents, Commands, and Plugin catalog/settings row density.

The goal is to make the shared plugin/catalog settings family follow the same hierarchy contract as the previous settings layout slices:

- `.opencodian-plugin-block` is an unframed section shell, not a nested card.
- catalog `Setting` rows and plugin summary rows use row tokens.
- agent editor groups and plugin source items use object tokens.
- plugin source paths use inline tokens.

No settings behavior, defaults, schema, locale copy, OpenCode runtime logic, command logic, agent logic, or plugin-management logic changed.

## Branch And Build

- Branch: `codex/settings-ui-layout-foundation`
- Worktree: `/Users/dht/.codex/worktrees/settings-ui-layout-foundation/opencodian`
- Test vault plugin path: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`
- Build ID deployed to Test Vault: `codex-settings-ui-layout-foundation.202605122329`

The deployed Test Vault `main.js` and local `dist/main.js` both contain the build ID above.

## Implementation Evidence

- `src/style/modals/config-editor-modal.css` now maps `.opencodian-plugin-block*`, `.opencodian-settings-catalog-scroll`, `.opencodian-agent-editor-*`, `.opencodian-plugin-summary-*`, and `.opencodian-plugin-source-*` to shared `--opencodian-settings-*` tokens.
- `.opencodian-plugin-block` now uses transparent background, zero border, zero radius, and no shadow.
- catalog rows use row token background/border/radius with `box-shadow: none`.
- agent editor groups and plugin source items use object token background/border/radius with `box-shadow: none`.
- plugin source paths use inline token background/border/radius.
- `tests/unit/features/settings/SettingsPluginSection.test.ts` now contains a CSS contract test guarding against nested heavy cards, gradients, blur, hover lift, side-stripe borders, and undefined radius tokens.
- `docs/modules/style/modals/config-editor-modal.md` documents the new Agents / Commands / Plugin catalog density guardrail.

## Validation

Focused verification:

```text
npm test -- --runInBand tests/unit/features/settings/SettingsPluginSection.test.ts
```

Initial expected result: failed before CSS because `.opencodian-plugin-block` still used the old card shell.

```text
npm test -- --runInBand tests/unit/features/settings/SettingsPluginSection.test.ts tests/unit/features/settings/SettingsAgentsSection.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts
```

Result: 4 suites passed, 37 tests passed.

Build and graph refresh:

```text
npm run build:css
npm run graphify:update:src
```

Result: both passed. `graphify-out` content did not change for this CSS-only slice; the freshness gate required staged `src` paths so it could compare mtimes correctly.

Full verification:

```text
npm run verify
```

Result: owner guard, module docs, graphify freshness, devlog order, lint, typecheck, full tests, and production build passed. Full tests reported 383 suites and 2360 tests passed.

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

### Tabbed Agents Catalog DOM/CSS Check

```json
{
  "ok": true,
  "mode": "tabbed",
  "primary": "agents",
  "secondary": "catalog",
  "catalogRows": 13,
  "tabPanel": false,
  "block": {
    "background": "rgba(0, 0, 0, 0)",
    "borderLeftWidth": "0px",
    "borderRadius": "0px",
    "boxShadow": "none"
  },
  "row": {
    "borderLeftWidth": "1px",
    "borderRadius": "10px",
    "boxShadow": "none"
  },
  "blockIsUnframed": true,
  "rowUsesFlatBorder": true
}
```

### Tabbed Commands Catalog DOM/CSS Check

```json
{
  "ok": true,
  "mode": "tabbed",
  "primary": "commands",
  "secondary": "catalog",
  "catalogRows": 28,
  "tabPanel": false,
  "blockIsUnframed": true,
  "rowUsesFlatBorder": true
}
```

### Tabbed Plugins Overview DOM/CSS Check

```json
{
  "ok": true,
  "mode": "tabbed",
  "primary": "plugins",
  "secondary": "overview",
  "summaryRows": 12,
  "tabPanel": false,
  "blockIsUnframed": true,
  "summaryUsesFlatBorder": true
}
```

### Tabbed Plugins Global Sources DOM/CSS Check

```json
{
  "ok": true,
  "mode": "tabbed",
  "primary": "plugins",
  "secondary": "global",
  "sourcePaths": 6,
  "sourceItems": 10,
  "tabPanel": false,
  "blockIsUnframed": true,
  "pathUsesInlineBorder": true,
  "itemUsesObjectBorder": true
}
```

### Classic Agents Catalog DOM/CSS Check

```json
{
  "ok": true,
  "mode": "classic",
  "catalogRows": 13,
  "tabPanel": false,
  "blockIsUnframed": true,
  "rowUsesFlatBorder": true
}
```

After the classic check, the Test Vault setting was restored to tabbed mode with primary tab `plugins` and secondary tab `overview`.

### Screenshots

Runtime screenshot artifacts were captured under `.obsidian-debug/` and are intentionally not committed:

- `.obsidian-debug/settings-plugin-catalog-density/tabbed-agents-catalog.png`
- `.obsidian-debug/settings-plugin-catalog-density/tabbed-commands-catalog.png`
- `.obsidian-debug/settings-plugin-catalog-density/tabbed-plugins-overview.png`
- `.obsidian-debug/settings-plugin-catalog-density/tabbed-plugins-global.png`
- `.obsidian-debug/settings-plugin-catalog-density/classic-agents-catalog.png`

### Error Capture

After debugger attach, plugin reload, settings open, tabbed catalog checks, classic check, screenshot capture, and restoring tabbed mode:

- `obsidian dev:errors vault=testvault`: `No errors captured.`
- `obsidian dev:console vault=testvault level=error limit=80`: `No console messages captured.`

## Remaining Design Debt

This slice normalizes Agents, Commands, and Plugin catalog/settings rows. Remaining setting-density slices:

- Deep appearance/theme preview cards
- Any isolated legacy cards found during a final sweep after appearance cleanup

The next slice should continue using shared settings tokens and owner-specific CSS contract tests.

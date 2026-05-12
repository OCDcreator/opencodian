# Settings Classic Catalog Hierarchy Repair Visual QA - 2026-05-12

## Scope

This repair responds to visual review feedback on Slice 5: Agents, Commands, and Plugin catalog rows became too flat in classic settings mode.

The correction keeps tabbed mode light, because secondary tabs already separate the child areas. Classic mode now gives `.opencodian-plugin-block` a lightweight section panel so multi-block settings like Agents, Commands, and Plugins regain readable hierarchy.

## Branch And Build

- Branch: `codex/settings-ui-layout-foundation`
- Worktree: `/Users/dht/.codex/worktrees/settings-ui-layout-foundation/opencodian`
- Test vault plugin path: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`
- Build ID deployed to Test Vault: `codex-settings-ui-layout-foundation.202605122347`

The deployed Test Vault `main.js` and local `dist/main.js` both contain the build ID above.

## Implementation Evidence

- Base `.opencodian-plugin-block` remains transparent/unframed for tabbed mode.
- `.opencodian-settings[data-settings-layout-mode="classic"] .opencodian-plugin-block` now uses object token background/border/radius with `box-shadow: none`.
- Catalog rows still use row tokens, preserving the section -> row hierarchy instead of restoring the old heavy card nesting.
- `tests/unit/features/settings/SettingsPluginSection.test.ts` now guards both contracts: flat tabbed blocks and framed classic blocks.

## Validation

Focused verification:

```text
npm test -- --runInBand tests/unit/features/settings/SettingsPluginSection.test.ts
```

Initial expected result: failed before CSS because no classic-scoped plugin block rule existed.

```text
npm test -- --runInBand tests/unit/features/settings/SettingsPluginSection.test.ts tests/unit/features/settings/SettingsAgentsSection.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts
```

Result: 4 suites passed, 37 tests passed.

Full verification:

```text
npm run build:css
npm run graphify:update:src
npm run verify
```

Result: owner guard, module docs, graphify freshness, devlog order, lint, typecheck, full tests, and production build passed. Full tests reported 383 suites and 2360 tests passed.

## Obsidian Autodebug Evidence

Deployment and reload:

```text
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
obsidian dev:console clear vault=testvault
obsidian dev:errors clear vault=testvault
obsidian plugin:reload id=opencodian vault=testvault
```

Reload output:

```text
Reloaded: opencodian
```

### Classic Agents Catalog

```json
{
  "ok": true,
  "mode": "classic",
  "catalogRows": 13,
  "tabPanel": false,
  "block": {
    "borderLeftWidth": "1px",
    "borderRadius": "10px",
    "boxShadow": "none"
  },
  "row": {
    "borderLeftWidth": "1px",
    "borderRadius": "10px",
    "boxShadow": "none"
  },
  "rowUsesFlatBorder": true
}
```

Classic screenshot:

- `.obsidian-debug/settings-plugin-catalog-density/classic-agents-catalog-repair.png`

### Tabbed Agents Catalog

```json
{
  "ok": true,
  "mode": "tabbed",
  "primary": "agents",
  "secondary": "catalog",
  "catalogRows": 13,
  "tabPanel": false,
  "block": {
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

Tabbed screenshot:

- `.obsidian-debug/settings-plugin-catalog-density/tabbed-agents-catalog-repair.png`

### Error Capture

After plugin reload, classic check, tabbed check, and screenshots:

- `obsidian dev:errors vault=testvault`: `No errors captured.`
- `obsidian dev:console vault=testvault level=error limit=80`: `No console messages captured.`

## Result

The repaired hierarchy now differs by mode:

- classic mode: visible lightweight child section panels for scanability;
- tabbed mode: unframed child blocks because tabs already provide the hierarchy;
- catalog rows: still flat, tokenized row surfaces in both modes.

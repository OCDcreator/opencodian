# Settings MCP Server Density Visual QA - 2026-05-12

## Scope

This pass implements Slice 3 of the settings UI refactor: MCP/server management density. It keeps all MCP runtime/config behavior intact and only changes visual hierarchy.

The goal is to make MCP management follow the shared settings contract established by the prior layout and model availability slices:

- Management toolbar uses inline tokens instead of a local toolbar card.
- Overview metrics and server rows use object tokens.
- Helper/error/empty rows use row tokens.
- Status badges keep semantic colors because connection, auth, failure, and disabled states affect user decisions.

## Branch And Build

- Branch: `codex/settings-ui-layout-foundation`
- Worktree: `/Users/dht/.codex/worktrees/settings-ui-layout-foundation/opencodian`
- Test vault plugin path: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`
- Build ID deployed to Test Vault: `codex-settings-ui-layout-foundation.202605122245`

The deployed Test Vault `main.js` contains the build ID above.

## Implementation Evidence

- `src/style/modals/config-editor-modal.css` now maps `.opencodian-mcp-*` toolbar, cards, details, form groups, helper rows, and empty state to shared `--opencodian-settings-*` tokens.
- `.opencodian-mcp-overview-toolbar` uses inline token background/border/radius and `box-shadow: none`.
- `.opencodian-mcp-overview-card` and `.opencodian-mcp-server-card` use object token background/border/radius and `box-shadow: none`.
- `.opencodian-mcp-server-card-helper` and `.opencodian-mcp-empty` use row token backgrounds.
- `tests/unit/features/settings/SettingsMcpSection.test.ts` now contains a CSS contract test that guards against reintroducing MCP-only heavy cards, gradients, blur, hover lift, or side-stripe borders.
- `docs/modules/style/modals/config-editor-modal.md` documents the new MCP/server density guardrail.

## Validation

Focused verification:

```text
npm test -- --runInBand tests/unit/features/settings/SettingsMcpSection.test.ts
```

Result: 1 suite passed, 13 tests passed.

```text
npm test -- --runInBand tests/unit/features/settings/SettingsMcpSection.test.ts tests/unit/features/settings/SettingsMcpSection.actions.test.ts tests/unit/features/settings/McpServerEditorModal.test.ts tests/unit/features/settings/McpServerStatusModal.test.ts
```

Result: 4 suites passed, 29 tests passed.

Full verification:

```text
npm run verify
```

Result: owner guard, module docs, graphify freshness, devlog order, lint, typecheck, full tests, and production build passed. Full tests reported 383 suites and 2358 tests passed.

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

### Tabbed Mode DOM/CSS Check

The settings modal was opened to OpenCodian -> MCP -> Overview.

```json
{
  "ok": true,
  "mode": "tabbed",
  "primary": "mcp",
  "secondary": "overview",
  "mcp": true,
  "serverCards": 12,
  "empty": false,
  "tabPanel": false,
  "toolbar": {
    "boxShadow": "none",
    "borderLeftWidth": "1px",
    "borderRadius": "6px"
  },
  "overviewCard": {
    "boxShadow": "none",
    "borderLeftWidth": "1px",
    "borderRadius": "10px"
  },
  "serverCard": {
    "boxShadow": "none",
    "borderLeftWidth": "1px",
    "borderRadius": "10px"
  }
}
```

The first autodebug pass caught a bad local token choice (`--opencodian-settings-radius-md/lg`, not defined). The CSS was corrected to existing `--opencodian-settings-radius-inline/row` tokens and the test was tightened to guard those token names.

### Classic Mode Check

Classic settings mode rendered the same MCP management surface in the full settings flow:

```json
{
  "ok": true,
  "mode": "classic",
  "mcp": true,
  "serverCards": 6,
  "empty": false,
  "tabPanel": false
}
```

After the classic check, the Test Vault setting was restored to tabbed mode with primary tab `mcp` and secondary tab `overview`.

### Screenshots

Runtime screenshot artifacts were captured under `.obsidian-debug/` and are intentionally not committed:

- `.obsidian-debug/settings-mcp-server-density/tabbed-mcp.png`
- `.obsidian-debug/settings-mcp-server-density/classic-mcp.png`

### Error Capture

After debugger attach, plugin reload, settings open, tabbed/classic checks, screenshot capture, and restoring tabbed mode:

- `obsidian dev:errors vault=testvault`: `No errors captured.`
- `obsidian dev:console vault=testvault level=error limit=80`: `No console messages captured.`

## Remaining Design Debt

This slice only normalizes MCP/server management. Remaining setting-density slices:

- Formatter/runtime rows
- Agents/commands/plugin catalog rows
- Deep appearance/theme preview cards

The next slices should continue using shared settings tokens and owner-specific CSS contract tests.

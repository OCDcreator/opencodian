# Settings Layout Visible Unification Visual QA - 2026-05-12

## Scope

This pass implements the first visible foundation slice for the settings UI layout refactor. It keeps the existing settings behavior, schema, normalization, and option grouping intact, while making the hierarchy rules visible in both supported layout modes:

- Classic mode keeps the quick-navigation surface, but uses the same section and row weight as tabbed content.
- Tabbed mode keeps primary tabs as a first-class navigation surface, but removes the extra heavy tab-panel card layer.
- Ordinary setting rows keep a restrained card feel without piling full cards inside full cards.

## Branch And Build

- Branch: `codex/settings-ui-layout-foundation`
- Worktree: `/Users/dht/.codex/worktrees/settings-ui-layout-foundation/opencodian`
- Test vault plugin path: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`
- Build ID deployed to Test Vault: `codex-settings-ui-layout-foundation.202605122133`

The deployed Test Vault `main.js` contains the build ID above.

## Implementation Evidence

- `src/style/components/settings-layout-contract.css` now owns the shared visible hierarchy tokens for settings navigation, section blocks, focus rings, and object-level cards.
- `src/style/components/model-selector.css` no longer makes `.opencodian-settings-tab-panel` a heavy outer card; the compatibility panel is `display: contents`.
- `.opencodian-style-section` no longer uses the old left-stripe hierarchy accent; it now inherits the shared settings section token weight.
- Unit tests assert the layout contract selectors and guard against reintroducing the heavy tab-panel card and local left stripe.
- Module docs describe that tabbed and classic are peer layout modes, not separate visual systems.

## Obsidian Autodebug Evidence

### Deployment And Reload

- `npm run verify` completed successfully before deployment. The final verified build emitted `BUILD_ID: codex-settings-ui-layout-foundation.202605122133`.
- Copied `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to the Test Vault plugin directory.
- `obsidian plugin:reload id=opencodian vault=testvault` reported `Reloaded: opencodian`.
- `obsidian dev:debug on vault=testvault` reported `Debugger attached. Console capture started.`

### Tabbed Mode DOM/CSS Check

```json
{
  "mode": "tabbed",
  "primaryTabs": 14,
  "secondaryTabs": 0,
  "contentShell": true,
  "tabPanel": false,
  "primaryBg": "color(srgb 0.185704 0.23032 0.16168)",
  "primaryBorder": "color(srgb 0.360075 0.529616 0.268784)",
  "primaryRadius": "6px",
  "sectionBg": "color(srgb 0.1324 0.1324 0.1324)",
  "sectionBorder": "color(srgb 0.21 0.21 0.21 / 0.92)",
  "sectionShadow": "none"
}
```

Key confirmation: tabbed mode has primary tabs and one content shell, but no `.opencodian-settings-tab-panel` card wrapper.

### Classic Mode DOM/CSS Check

```json
{
  "mode": "classic",
  "quickNav": true,
  "primaryTabs": 0,
  "contentShell": false,
  "tabPanel": false,
  "sections": 10,
  "quickNavBg": "color(srgb 0.13 0.13 0.13 / 0.54)",
  "quickNavBorder": "color(srgb 0.21 0.21 0.21 / 0.72)",
  "sectionShadow": "none",
  "firstRowBg": "color(srgb 0.1472 0.1472 0.1472)",
  "firstRowBorder": "color(srgb 0.21 0.21 0.21 / 0.82)"
}
```

Key confirmation: classic mode keeps quick navigation and full-section rendering, but shares the same flat section/no-shadow contract as tabbed mode.

After the classic check, the Test Vault setting was restored to tabbed mode.

### Screenshots

Runtime screenshot artifacts were captured under `.obsidian-debug/` and are intentionally not committed:

- `.obsidian-debug/settings-layout-visible-unification/classic-settings.png`
- `.obsidian-debug/settings-layout-visible-unification/tabbed-settings.png`

### Error Capture

After debugger attach, plugin reload, settings open, tabbed/classic checks, and restoring tabbed mode:

- `obsidian dev:errors vault=testvault`: `No errors captured.`
- `obsidian dev:console vault=testvault level=error limit=80`: `No console messages captured.`

After the final verified build was redeployed, the plugin was reloaded again and the current tabbed surface still reported:

```json
{
  "mode": "tabbed",
  "primaryTabs": 14,
  "contentShell": true,
  "tabPanel": false
}
```

The post-redeploy error buffers still reported no captured errors and no error-level console messages.

## Remaining Design Debt

This foundation slice deliberately does not migrate every object-heavy subsection. The next safe slices should target owner-specific setting clusters where the current UI still overuses small cards:

- MCP and server-related rows
- Model availability/provider management rows
- Formatter/runtime rows
- Agents, commands, and plugin-related configuration clusters
- Deep appearance previews and theme object cards

Those follow-up slices should reuse the shared layout tokens from `settings-layout-contract.css` instead of adding new local card systems.

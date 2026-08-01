# Settings Model Availability Density Visual QA - 2026-05-12

## Scope

This pass implements Slice 2 of the settings UI refactor: model availability and provider management density. It keeps all provider/model availability behavior intact and only changes the visual hierarchy of complex setting rows.

The goal is to make the model availability area follow the shared settings contract from the prior layout foundation pass:

- Provider rows are object-level rows, not full nested cards.
- Expanded model rows are row-level children, not another full card family.
- Search/filter/catalog controls use inline or row tokens instead of a local glass toolbar.
- Provider/model status badges keep semantic color because availability state changes user decisions.

## Branch And Build

- Branch: `codex/settings-ui-layout-foundation`
- Worktree: `/Users/dht/.codex/worktrees/settings-ui-layout-foundation/opencodian`
- Test vault plugin path: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`
- Build ID deployed to Test Vault: `codex-settings-ui-layout-foundation.202605122214`

The deployed Test Vault `main.js` contains the build ID above.

## Implementation Evidence

- `src/style/modals/config-editor-modal.css` now maps model availability controls and provider/model rows to shared `--opencodian-settings-*` tokens.
- `.opencodian-model-toggle-provider` uses object background/border tokens with `box-shadow: none` and no gradient or hover lift.
- `.opencodian-model-toggle-model` uses row background/border tokens with `box-shadow: none` and no `backdrop-filter`.
- `.opencodian-model-availability-search-container` uses inline tokens instead of a local glass search surface.
- `.opencodian-model-catalog-summary-card` uses object tokens and keeps active/focus states.
- `tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts` now contains a CSS contract test that guards against reintroducing heavy model availability cards.
- `docs/modules/style/modals/config-editor-modal.md` documents the new guardrail.

## Validation

Focused verification:

```text
npm test -- --runInBand tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts
```

Result: 1 suite passed, 8 tests passed.

```text
npm test -- --runInBand tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/OpenCodianSettingsView.test.ts
```

Result: 3 suites passed, 24 tests passed.

Full verification:

```text
npm run verify
```

Result: owner guard, module docs, graphify freshness, devlog order, lint, typecheck, full tests, and production build passed. Full tests reported 383 suites and 2357 tests passed.

Note: `check:graphify` mis-parsed the leading-space porcelain path for an unstaged ` M src/...` change during the first attempt. Staging the planned files made the repo-local freshness check parse the path correctly, after `npm run graphify:update:src` had already refreshed graphify timestamps.

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

The settings modal was opened to OpenCodian -> Model -> Availability.

```json
{
  "mode": "tabbed",
  "primary": "model",
  "secondary": "availability",
  "availability": true,
  "providers": 7,
  "models": 3
}
```

CSS source inspection from Obsidian confirmed:

```text
.opencodian-model-toggle-provider
  box-shadow: none

.opencodian-model-toggle-model
  box-shadow: none
```

### Classic Mode Check

Classic settings mode rendered the same provider/model availability surface in the full settings flow:

```json
{
  "mode": "classic",
  "providers": 7,
  "models": 3,
  "providerList": true
}
```

After the classic check, the Test Vault setting was restored to tabbed mode with primary tab `model` and secondary tab `availability`.

### Screenshots

Runtime screenshot artifacts were captured under `.obsidian-debug/` and are intentionally not committed:

- `.obsidian-debug/settings-model-availability-density/tabbed-model-availability.png`
- `.obsidian-debug/settings-model-availability-density/classic-model-availability.png`

### Error Capture

After debugger attach, plugin reload, settings open, tabbed/classic checks, screenshot capture, and restoring tabbed mode:

- `obsidian dev:errors vault=testvault`: `No errors captured.`
- `obsidian dev:console vault=testvault level=error limit=80`: `No console messages captured.`

## Remaining Design Debt

This slice only normalizes model availability/provider management. Remaining setting-density slices:

- MCP and server cards
- Formatter/runtime rows
- Agents/commands/plugin catalog rows
- Deep appearance/theme preview cards

The next slices should continue using the shared settings tokens instead of creating local card systems.

# Settings Classic Local Hierarchy Visual QA - 2026-05-13

## Scope

第八轮精修 classic / tiled mode 下 MCP、Formatter、Model availability 的局部层级。目标是让这些复杂区域在平铺滚动流里更容易区分标题、说明、对象区和普通行，同时不改变 tabbed mode 的结构和不改变任何设置功能。

本轮只改 CSS、CSS contract tests、模块文档和 QA 记录。

## Changes

- Model availability classic block 去掉旧的 gradient、blur 和 heavy shadow，改用 shared object tokens。
- Model availability classic description 和 provider rows 增加更明确的分隔与间距。
- MCP classic overview / server list 增加局部 rhythm，server list shell 用轻量 top divider 分出子区域。
- Formatter classic summary cards 和 builtin/custom formatter rows 增加分隔与 row spacing。
- Tabbed mode 不新增 panel，不改变 primary / secondary tab 行为。

## Acceptance Criteria

- Classic Model availability 不再像一张独立玻璃大卡片。
- Classic MCP 能区分 overview controls、metric cards 和 server list。
- Classic Formatter 能区分 summary cards、runtime/list rows、builtin/custom rows。
- Tabbed mode 不出现新的 nested-card noise。
- 不引入功能、schema、locale、默认值或运行时行为变化。

## Verification

Commands:

- `npm test -- --runInBand tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts tests/unit/features/settings/SettingsMcpSection.test.ts tests/unit/features/settings/SettingsFormatterSection.test.ts`: pass, 3 suites / 49 tests.
- `npm test -- --runInBand tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts tests/unit/features/settings/SettingsMcpSection.test.ts tests/unit/features/settings/SettingsFormatterSection.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`: pass, 4 suites / 64 tests.
- `npm run build:css`: pass, root `styles.css` refreshed.
- `npm run graphify:update:src`: pass, graphify artifacts refreshed for the `src/style` change.
- `npm run verify`: pass, 383 suites / 2361 tests, production build complete.

Deployment:

- Test Vault plugin artifacts copied sequentially from `dist/`.
- BUILD_ID in `dist/main.js`: `codex-settings-ui-layout-foundation.202605130053`.
- BUILD_ID in Test Vault `main.js`: `codex-settings-ui-layout-foundation.202605130053`.
- `obsidian plugin:reload id=opencodian vault=testvault`: reloaded successfully.

Autodebug:

- `obsidian dev:errors vault=testvault`: no errors captured.
- `obsidian dev:console vault=testvault level=error limit=80`: no console messages captured.

Representative DOM checks:

| Surface | Result |
| --- | --- |
| Classic model availability | `ok: true`, `mode: classic`, provider count `7`, no tab panel, provider object has 1px border / 10px radius / no shadow |
| Classic MCP | `ok: true`, `mode: classic`, server cards `6`, no tab panel |
| Classic formatter | `ok: true`, `mode: classic`, summary cards `2`, no tab panel |
| Tabbed model availability | `ok: true`, `mode: tabbed`, `primary: model`, `secondary: availability`, provider count `7`, no tab panel |
| Tabbed MCP | `ok: true`, `mode: tabbed`, `primary: mcp`, `secondary: overview`, server cards `6`, no tab panel |
| Tabbed formatter | `ok: true`, `mode: tabbed`, `primary: formatter`, `secondary: overview`, summary cards `2`, no tab panel |

Evidence paths:

- `.obsidian-debug/settings-classic-local-hierarchy/classic-model-availability-result.json`
- `.obsidian-debug/settings-classic-local-hierarchy/classic-mcp-result.json`
- `.obsidian-debug/settings-classic-local-hierarchy/classic-formatter-result.json`
- `.obsidian-debug/settings-classic-local-hierarchy/tabbed-model-availability-result.json`
- `.obsidian-debug/settings-classic-local-hierarchy/tabbed-mcp-result.json`
- `.obsidian-debug/settings-classic-local-hierarchy/tabbed-formatter-result.json`
- `.obsidian-debug/settings-classic-local-hierarchy/classic-model-availability.png`
- `.obsidian-debug/settings-classic-local-hierarchy/classic-mcp.png`
- `.obsidian-debug/settings-classic-local-hierarchy/classic-formatter.png`

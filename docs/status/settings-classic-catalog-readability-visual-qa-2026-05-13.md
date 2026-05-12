# Settings Classic Catalog Readability Visual QA - 2026-05-13

## Scope

第七轮专门修正 classic / tiled mode 下 Agents、Commands、Plugin catalog 的层级可读性。用户反馈的核心问题是：这些区域包含很多子选项，tabbed mode 依靠二级 tab 还能分开，但 classic mode 连续平铺时仍然不够容易扫读。

本轮只改 CSS 视觉层级，不改设置保存、schema、locale、默认值、agent / command / plugin 运行行为。

## Changes

- Classic `.opencodian-plugin-block` padding 从 12px 调整到 14px。
- Classic 子块 heading 明确为 13px / 1.35 line-height，降低与父 section 标题的竞争。
- Classic `.opencodian-plugin-block-body` 增加 1px top divider，并使用 `--opencodian-settings-space-lg` 分隔标题区和内容区。
- Classic `.opencodian-settings-catalog-scroll > .setting-item + .setting-item` 间距调整为 `--opencodian-settings-space-md`。
- Tabbed `.opencodian-plugin-block` 保持透明、无框、无 shadow。

## Acceptance Criteria

- Classic mode 可以一眼分出 section、child panel、catalog row。
- Tabbed mode 不出现新的 nested card 感。
- Catalog rows 仍使用 row tokens，不升级为 object cards。
- 不引入 gradient、decorative blur、hover lift、side-stripe border 或 heavy shadow。

## Verification

Commands:

- `npm test -- --runInBand tests/unit/features/settings/SettingsPluginSection.test.ts`: pass, 6 tests.
- `npm test -- --runInBand tests/unit/features/settings/SettingsPluginSection.test.ts tests/unit/features/settings/SettingsAgentsSection.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`: pass, 4 suites / 41 tests.
- `npm run build:css`: pass, root `styles.css` refreshed.
- `npm run graphify:update:src`: pass, graphify artifacts refreshed for the `src/style` change.
- `npm run verify`: pass, 383 suites / 2361 tests, production build complete.

Deployment:

- Test Vault plugin artifacts copied sequentially from `dist/`.
- BUILD_ID in `dist/main.js`: `codex-settings-ui-layout-foundation.202605130037`.
- BUILD_ID in Test Vault `main.js`: `codex-settings-ui-layout-foundation.202605130037`.
- `obsidian plugin:reload id=opencodian vault=testvault`: reloaded successfully.

Autodebug:

- `obsidian dev:errors vault=testvault`: no errors captured.
- `obsidian dev:console vault=testvault level=error limit=80`: no console messages captured.

Representative DOM checks:

| Surface | Result |
| --- | --- |
| Classic agents catalog | `ok: true`, `mode: classic`, catalog rows `13`, block has 1px border / 10px radius / no shadow, row uses flat row border |
| Classic commands/plugins | `ok: true`, `mode: classic`, command rows `28`, plugin sources `4`, command and plugin blocks have 1px border / 10px radius / no shadow |
| Tabbed commands/plugins | `ok: true`, commands `primary: commands`, `secondary: catalog`, plugins `primary: plugins`, `secondary: global`, no tab panels |

Evidence paths:

- `.obsidian-debug/settings-classic-catalog-readability/classic-agents-catalog-result.json`
- `.obsidian-debug/settings-classic-catalog-readability/classic-commands-plugins-result.json`
- `.obsidian-debug/settings-classic-catalog-readability/tabbed-commands-plugins-result.json`
- `.obsidian-debug/settings-classic-catalog-readability/classic-agents-catalog.png`
- `.obsidian-debug/settings-classic-catalog-readability/classic-commands-plugins.png`
- `.obsidian-debug/settings-classic-catalog-readability/tabbed-commands-plugins.png`

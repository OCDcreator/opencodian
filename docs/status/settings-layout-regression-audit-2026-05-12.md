# Settings Layout Regression Audit - 2026-05-12

## Scope

第六轮是设置界面重构的 regression audit 与 contract hardening pass。目标是审查前五轮已经完成的 layout foundation、model availability、MCP/server、Formatter、Agents / Commands / Plugin catalog 视觉迁移，确认它们没有继续制造两类问题：

- classic / tiled mode 和 tabbed mode 的视觉层级不对等。
- 普通设置项、对象项、目录项混用卡片样式，导致大卡片套小卡片或完全扁平。

本轮不改变 schema、defaults、migration、locale、runtime 行为、OpenCode service 行为、agent/command/plugin 保存语义。

## Final Hierarchy Rules

Tabbed mode 和 classic mode 都作为一等公民保留。它们不需要长得完全一样，但必须同等清晰、同等精致。

- Navigation shell: quick nav、primary tabs、secondary tabs 使用 nav / inline tokens，不使用内容卡片视觉。
- Primary section: `.opencodian-settings-section` 使用 section tokens，是设置页面的主要父级。
- Classic child panel: classic mode 内部的多子区域可以使用 object tokens 表示轻量父子层级，尤其适用于 Agents、Commands、Plugin catalog 这类子选项很多的区域。
- Object surface: provider、server、formatter、editor group、plugin source item 使用 object tokens。
- Row surface: ordinary settings rows、catalog rows、helper rows、tables、nested editable rows 使用 row tokens。
- Inline surface: paths、key/value、toolbars、filters、button bars 使用 inline tokens 或透明背景。

关键规则：不要把同一条层级规则同时硬套到 classic mode 和 tabbed mode。Classic mode 需要扫读分组时，可以保留轻量 child panel。Tabbed mode 已经有 secondary tabs 时，继续叠 panel 会变成卡片套卡片。

## Audit Matrix

| Area | Current mode rule | Result |
| --- | --- | --- |
| Layout foundation | quick nav 与 primary / secondary tabs 同级，content shell 不承担重卡片视觉 | Accepted |
| Model availability | provider/model groups 使用共享 section/object/row/inline tokens，mode differences limited to shell structure | Accepted |
| MCP/server | metric/server/config rows 映射到 shared tokens，semantic status color retained | Accepted |
| Formatter | summary/runtime/builtin/custom rows 映射到 shared tokens，formatter-only heavy card family removed | Accepted |
| Agents catalog | tabbed mode unframed child blocks, classic mode lightweight child panels for scanability | Accepted after Slice 5 repair |
| Commands catalog | same as Agents catalog | Accepted after Slice 5 repair |
| Plugin catalog | same as Agents catalog, plugin source items remain object surfaces | Accepted after Slice 5 repair |

## Guardrails Added

- `docs/modules/style/components/settings-layout-contract.md` now documents `Mode-Aware Hierarchy Taxonomy`.
- `tests/unit/features/settings/OpenCodianSettings.test.ts` now checks that the docs and CSS preserve classic/tabbed hierarchy language and catalog row token usage.
- `docs/modules/style/modals/config-editor-modal.md` already documents the `classic hierarchy repair`, and this audit treats that repair as the governing rule for catalog-like sections.

## Remaining Design Debt

- Future settings slices should audit individual owner surfaces against the taxonomy before touching CSS.
- If another settings area contains many child groups in classic mode, it may need a classic child panel even when its tabbed version stays flatter.
- Runtime screenshots remain necessary for settings surfaces with stateful data, because CSS tests can guard selectors but cannot judge scanability alone.

## Autodebug Evidence

Autodebug ran against the deployed Test Vault build:

- BUILD_ID in `dist/main.js`: `codex-settings-ui-layout-foundation.202605130005`
- BUILD_ID in Test Vault `main.js`: `codex-settings-ui-layout-foundation.202605130005`
- `obsidian help`: available and includes Developer commands.
- `obsidian plugin:reload id=opencodian vault=testvault`: reloaded successfully.
- `obsidian dev:errors vault=testvault`: no errors captured.
- `obsidian dev:console vault=testvault level=error limit=80`: no console messages captured.

Representative DOM checks:

| Surface | Result |
| --- | --- |
| Classic model availability | `ok: true`, `mode: classic`, provider count `7`, no tab panel, provider object has 1px border, 10px radius, no shadow |
| Tabbed model availability | `ok: true`, `mode: tabbed`, `primary: model`, `secondary: availability`, provider count `7`, no tab panel |
| Classic MCP | `ok: true`, `mode: classic`, server cards `6`, no tab panel |
| Tabbed MCP | `ok: true`, `mode: tabbed`, `primary: mcp`, `secondary: overview`, server cards `6`, no tab panel |
| Classic formatter | `ok: true`, `mode: classic`, summary cards `2`, no tab panel |
| Tabbed formatter | `ok: true`, `mode: tabbed`, `primary: formatter`, `secondary: overview`, summary cards `2`, no tab panel |
| Classic agents catalog | `ok: true`, `mode: classic`, catalog rows `13`, plugin block is framed as a lightweight child panel, row uses flat row border, no tab panel |
| Tabbed agents catalog | `ok: true`, `mode: tabbed`, `primary: agents`, `secondary: catalog`, catalog rows `13`, plugin block is unframed, row uses flat row border, no tab panel |
| Classic commands/plugins | `ok: true`, `mode: classic`, command rows `28`, plugin sources `4`, command/plugin blocks use lightweight child panels, no tab panel |
| Tabbed commands/plugins | `ok: true`, commands `primary: commands`, `secondary: catalog`, plugins `primary: plugins`, `secondary: global`, no tab panels |

Evidence paths:

- `.obsidian-debug/settings-layout-regression-audit/classic-model-availability-result.json`
- `.obsidian-debug/settings-layout-regression-audit/tabbed-model-availability-result.json`
- `.obsidian-debug/settings-layout-regression-audit/classic-mcp-result.json`
- `.obsidian-debug/settings-layout-regression-audit/tabbed-mcp-result.json`
- `.obsidian-debug/settings-layout-regression-audit/classic-formatter-result.json`
- `.obsidian-debug/settings-layout-regression-audit/tabbed-formatter-result.json`
- `.obsidian-debug/settings-layout-regression-audit/classic-agents-catalog-result.json`
- `.obsidian-debug/settings-layout-regression-audit/tabbed-agents-catalog-result.json`
- `.obsidian-debug/settings-layout-regression-audit/classic-commands-plugins-result.json`
- `.obsidian-debug/settings-layout-regression-audit/tabbed-commands-plugins-result.json`

Screenshot paths:

- `.obsidian-debug/settings-layout-regression-audit/classic-model-availability.png`
- `.obsidian-debug/settings-layout-regression-audit/tabbed-model-availability.png`
- `.obsidian-debug/settings-layout-regression-audit/classic-mcp.png`
- `.obsidian-debug/settings-layout-regression-audit/tabbed-mcp.png`
- `.obsidian-debug/settings-layout-regression-audit/classic-formatter.png`
- `.obsidian-debug/settings-layout-regression-audit/tabbed-formatter.png`
- `.obsidian-debug/settings-layout-regression-audit/classic-agents-catalog.png`
- `.obsidian-debug/settings-layout-regression-audit/tabbed-agents-catalog.png`
- `.obsidian-debug/settings-layout-regression-audit/classic-commands-plugins.png`
- `.obsidian-debug/settings-layout-regression-audit/tabbed-commands-plugins.png`

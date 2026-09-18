# Obsidian CLI 命令目录

> **源码**: `src/core/obsidianTooling/obsidianToolingCatalog.ts`
> **状态**: [REVIEW]

## 概述

R-B4（Obsidian 原生工具，路线 A 官方 CLI）的单一事实源：桌面 CLI 全部子命令的四类划分（`read` / `navigation` / `vault-write` / `high-impact`）。`high-impact` 为确认门拦截集（主题/插件管理、任意 `command`、`eval`/dev 面、`delete`、`reload`/`restart` 等）；`vault-write` 经运行中的应用写 vault，天然产生 vault 事件，被 R-B3 侧栏按轮记录。目录同时驱动生成的门脚本、注入块与设置页状态行。

## 关键导出

| 导出 | 说明 |
|------|------|
| `OBSIDIAN_TOOLING_COMMAND_CATALOG` | 子命令清单（subcommand/class/mvp），核对自 `obsidian --help`（CLI 1.13.7，2026-09-18） |
| `classifyObsidianSubcommand()` | 纯分类；未知/空输入**fail-closed 归入 high-impact** |
| `buildGateScriptCommandSets()` | 门脚本内嵌的 passthrough / high-impact 两个稳定排序集合 |
| `OBSIDIAN_TOOLING_DIR` 等 | `.opencodian/obsidian-tooling/`、`requests/`、门脚本名、等待上/下限、过期时长的常量 |

## 边界与约束

- 未来新增的 CLI 子命令在目录更新前一律走确认门（fail-closed），不会静默绕过。
- 门脚本在每次 `applySettings()` 时按当前目录重生成，目录修订自动传播到已启用的仓库。

# SettingsCommandsSection

> **源码**: `src/features/settings/SettingsCommandsSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsCommandsSection` 是 settings/commands 分区的 owner。它负责把当前 OpenCode runtime 返回的 slash command 目录，与当前 vault `.opencode/opencode.json` 里的 project `command` 配置合并成一个只读 catalog shell，并把用户级 hide/unhide 开关写回插件设置 `hiddenSlashCommands`。

这一轮只交付 item 6 的最小壳层：

- 读取 `sdk.command.list()` runtime slash command 目录
- 读取 `OpencodeConfigManager.getCommandConfig()` 的 project command map
- 过滤掉 MCP / skill prompt，只保留 OpenCode command catalog
- 合并 runtime 条目、project override 与 project-only 条目
- 用插件设置 `hiddenSlashCommands` 控制 slash menu 可见性

command template 编辑、placeholder preview、command-owned hidden agent 与 slash execution runtime 仍留给后续 slice。

## 核心逻辑

### runtime + project catalog 合并

owner 会并行读取：

- `openCodeService.sdk.command.list()`：当前 runtime scope 的 slash command 目录
- `OpencodeConfigManager.getCommandConfig()`：当前 vault `.opencode/opencode.json` 里的 project `command` map

合并时：

- project `description` / `agent` / `model` / `subtask` 优先覆盖 runtime metadata
- runtime 中不存在、但 project config 存在的条目会保留成 `projectOnly`
- `source: 'mcp' | 'skill'` 的 runtime 条目不会进入这个 catalog shell

### 用户可见性写回

本轮不改 project `command` 配置里的任何字段。toggle 只负责维护插件设置：

- 打开 toggle = 从 `hiddenSlashCommands` 移除该 command ID
- 关闭 toggle = 把该 command ID 加入 `hiddenSlashCommands`
- 写回时会去重、裁剪空白并按字母序排序，避免重复 ID 长期累积

因此这条路径只表达“当前 Obsidian profile 下的 slash menu 可见性”，不改变 OpenCode runtime 自身的 command config。

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 挂载 Commands section，创建 heading 与 catalog block，并启动首次异步刷新 |
| `dispose()` | 递增 refresh run id，避免旧异步请求回写已重建的设置页 |
| `refreshCatalog()` | 并行加载 runtime/project commands，合并后重新渲染 catalog |
| `renderCatalog()` | 为每个 slash command 渲染 `/<id>` setting 与 visible toggle |
| `updateCommandVisibility()` | 把用户 hide/unhide 操作写回 `hiddenSlashCommands` |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并挂载本 owner，把 Commands section 从主设置页中独立出来
- `OpenCodeService`: 通过 SDK façade 的 `command.list()` 读取 runtime slash command 目录
- `OpencodeConfigManager`: 读取当前 vault 的 project `command` 配置
- `core/types/settings.ts`: 提供插件设置里的 `hiddenSlashCommands`
- `i18n/locales/*`: 提供 Commands section 标题、catalog 来源、可见性和错误文案

## 注意事项

- 不要把 Commands settings ownership 塞回 `OpenCodianSettings.ts`、`OpenCodianView.ts` 或 `OpenCodeService.ts`。
- 当前 owner 只写用户设置 `hiddenSlashCommands`，不写 project command 模板字段。
- 如果后续 slice 需要 command editor / placeholder preview，应继续沿着本 owner 扩展，而不是绕开现有 catalog seam。

# settingsLayoutRegistry

> **源码**: `src/features/settings/settingsLayoutRegistry.ts`
> **状态**: [REVIEW]

## 概述

`settingsLayoutRegistry.ts` 定义设置页多级标签分类模式的标签结构。它是一个纯数据 registry，不包含任何设置保存逻辑，但现在也负责把旧的 `language` 一级标签记忆兼容到新的 `general`，并把旧的 `Server > MCP` 停留位置迁移到新的一级 `MCP` 类目。

## 主要定义

- `SettingsPrimaryTab`: 一级标签定义，包含 id、labelKey、icon、defaultSecondaryTabId
- `SettingsSecondaryTab`: 二级标签定义，包含 id、labelKey
- `SettingsPrimaryTabDefinition`: 完整的一级标签定义，包含 secondaryTabs 数组
- `SETTINGS_PRIMARY_TABS`: 所有一级标签及其二级标签的静态配置数组

## 一级/二级标签结构

当前涵盖 14 个一级标签：

| 一级标签 | 二级标签 |
|---------|---------|
| `general` | `basic`, `language` |
| `server` | `connection`, `auth`, `status` |
| `model` | `common`, `project-config`, `availability`, `tools` |
| `conversation` | `title`, `compaction`, `display`, `questions`, `rendering` |
| `agents` | `default`, `catalog`, `editor`, `workspace` |
| `commands` | `mode`, `editor`, `catalog` |
| `mcp` | `overview` |
| `formatter` | `overview`, `config` |
| `plugins` | `overview`, `global`, `project-directory`, `omo` |
| `security` | `config`, `permissions`, `safety` |
| `ui` | `general` |
| `style` | `presets`, `background`, `layout`, `user`, `assistant`, `input`, `scrollbar`, `advanced` |
| `debug` | `general`, `modules`, `logs`, `actions` |
| `user` | `profile`, `prompt`, `tags` |

## 查找与回退函数

- `getPrimaryTabDefinition(id)`: 按 id 查找一级标签定义，并兼容旧 `language -> general`
- `resolvePrimaryTabId(candidate)`: 校验一级标签 id，旧 `language` 会迁移为 `general`，其余失效值回退到第一个主标签
- `resolveSecondaryTabId(primaryTabId, candidate)`: 校验二级标签 id，失效时回退到该一级标签的默认值
- `getActiveSecondaryTabId(primaryTabId, secondaryTabByPrimary)`: 从持久化记录恢复二级标签；当 `general` 没有新记录但发现旧 `language` 记录时，会把它解释成 `General > Language`

## 模式集成

`settingsLayoutMode` 为 `'classic'` 时不使用本 registry。为 `'tabbed'` 时，`SettingsTabbedRenderer` 读取本 registry 构建标签栏并路由内容面板。

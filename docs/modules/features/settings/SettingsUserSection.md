# SettingsUserSection

> **源码**: `src/features/settings/SettingsUserSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsUserSection.ts` 提供用户相关设置的独立渲染 owner。从 `OpenCodianSettings.ts` 中提取，以控制主文件的代码行数，并避免主设置页继续持有 user section shell 与 tabbed profile/prompt/tags 路由。

## 职责

- `SettingsUserSection.attach(containerEl)`: 渲染经典布局中的 User section heading，并按 profile、prompt、excluded tags 顺序挂载字段
- `SettingsUserSection.attachTabbed(containerEl, secondaryTabId)`: 渲染标签布局中的 `profile` / `prompt` / `tags` 单面板内容
- 保留 leaf-level rendering functions，便于字段级测试或相邻 owner 复用

## 导出函数

- `renderUserProfileSetting(containerEl, plugin)`: 渲染用户名设置
- `renderUserPromptSetting(containerEl, plugin)`: 渲染系统提示词设置（多行文本区）
- `renderUserExcludedTagsSetting(containerEl, plugin)`: 渲染排除标签设置（多行文本区，每行一个标签）

## 使用方

- `OpenCodianSettings`: 创建并复用 `SettingsUserSection`，经典模式调用 `attach()`，标签模式通过 `renderUserContent` seam 调用 `attachTabbed()`
- `SettingsTabbedRenderer`: 只接收单一 user content callback，不再分别持有 profile/prompt/tags leaf render callbacks

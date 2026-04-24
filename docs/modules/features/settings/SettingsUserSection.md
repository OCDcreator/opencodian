# SettingsUserSection

> **源码**: `src/features/settings/SettingsUserSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsUserSection.ts` 提供用户相关设置的独立渲染函数。从 `OpenCodianSettings.ts` 中提取，以控制主文件的代码行数。

## 导出函数

- `renderUserProfileSetting(containerEl, plugin)`: 渲染用户名设置
- `renderUserPromptSetting(containerEl, plugin)`: 渲染系统提示词设置（多行文本区）
- `renderUserExcludedTagsSetting(containerEl, plugin)`: 渲染排除标签设置（多行文本区，每行一个标签）

## 使用方

- `OpenCodianSettings`: 在经典模式和标签模式下均使用这些函数
- `SettingsTabbedRenderer`: 通过依赖注入传递这些函数，用于标签模式的 User 内容面板

# SettingsUserSection

> **源码**: `src/features/settings/SettingsUserSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsUserSection` 是用户相关设置的独立 owner。它把 classic settings 和 tabbed settings 里的 user/profile/prompt/tags 渲染逻辑从主设置页中抽离出来，并在重建面板时统一管理 textarea 尺寸记忆的生命周期。

## 职责

- `attach(containerEl)`: 渲染经典布局中的 User section heading，并按 profile、prompt、excluded tags 顺序挂载字段
- `attachTabbed(containerEl, secondaryTabId)`: 渲染标签布局中的 `profile` / `prompt` / `tags` 单面板内容
- `dispose()`: 释放当前 section 持有的 `TextareaSizeMemory` observer，避免 settings 重建后残留旧 textarea 监听器
- 在 owner 内部维护字段级 render 方法，而不是继续向外暴露独立导出函数

## 字段行为

- 用户名字段仍是普通单行 `text` 控件，只负责更新 `settings.userName`
- 系统提示词字段使用多行 textarea，并通过 `TextareaSizeMemory` 以 `user-system-prompt` 为稳定 key 持久化用户手动拉伸后的高度
- 排除标签字段使用多行 textarea，并通过 `TextareaSizeMemory` 以 `user-excluded-tags` 为稳定 key 持久化高度；保存时继续按“每行一个 tag”规范写回 `settings.excludedTags`

## 使用方

- `OpenCodianSettings` 与 `OpenCodianSettingsView`: 创建并复用该 owner，在 classic / tabbed 两种设置布局之间共享 user section 的渲染与清理逻辑
- `SettingsTabbedRenderer`: 只接收单一 user content callback，不再分别持有 profile/prompt/tags 的字段级渲染函数

## 注意事项

- `attach()` 与 `attachTabbed()` 都会先调用 `dispose()`，确保旧 DOM 上挂着的 textarea resize observer 会在重渲染前被释放
- 如果后续再为 user section 增加新的长文本输入，优先继续复用 `TextareaSizeMemory`，并为每个字段分配稳定、唯一的持久化 key

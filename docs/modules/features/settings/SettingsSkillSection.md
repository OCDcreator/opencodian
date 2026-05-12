# SettingsSkillSection

> **源码**: `src/features/settings/SettingsSkillSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsSkillSection` 是设置页 `Skills` 一级标签的 section owner。它在设置 UI 中读取 OpenCode `GET /skill` 目录，按来源分组展示技能，并提供全局 `skill` 工具权限写入入口。

## 核心逻辑

### 技能目录加载

- 直接通过 Obsidian `requestUrl` 请求当前设置解析出的 OpenCode server `/skill` endpoint。
- 支持数组响应和 `{ skills: [...] }` 响应两种形态。
- 请求失败时显示 `settings.skills.empty`，不阻塞设置页其他内容。

### 来源分组

技能按 `location` 归类为 project / global / builtin / claude / agents。归类规则与 `SkillCatalogService` 保持一致，方便后续改回共享 service seam。

### 权限写入

顶部权限 dropdown 读取 `opencodeConfigManager.read().permission` 中的 `skill` 配置，并通过 `OpencodeConfigManager.setToolPermission('skill', action)` 写回项目 OpenCode 配置。

## 与其他模块的交互

- `src/features/settings/SettingsTabbedRenderer.ts`: 路由 `skills` 一级标签并调用 `attachTabbed()`。
- `src/core/config/OpencodeConfigManager.ts`: 读取和写入 `skill` 工具权限。
- `src/features/chat/services/SkillCatalogService.ts`: 复用其 `SkillInfo` / `SkillSourceGroups` 类型与来源语义。
- `src/core/types/settings.ts`: 提供 server base URL 解析。

## 注意事项

- 该 section 当前自包含技能 fetch 逻辑，不依赖 plugin 级 `skillCatalogService` 属性。
- 不要在这里实现 per-skill permission pattern；当前 OpenCode 配置 seam 只写平铺 `skill` 权限。

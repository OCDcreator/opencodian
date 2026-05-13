# SkillCatalogService

> **源码**: `src/features/chat/services/SkillCatalogService.ts`
> **状态**: [REVIEW]

## 概述

`SkillCatalogService` 是聊天侧技能目录的缓存与分组 owner。它通过宿主注入的 `fetchSkills()` 获取技能列表，按 TTL 缓存结果，合并并发加载请求，并按 location 将技能归类为 project、global、plugin、builtin、claude 或 agents 来源。

## 关键导出

- `SkillInfo`: 单个技能的名称、描述、来源位置和内容。
- `SkillSourceGroups`: 按来源分组后的技能集合。
- `SkillCatalogServiceHost`: 服务宿主需要提供的 fetch 与 TTL seam。
- `SkillCatalogService`: 提供技能查询、刷新和来源分组的 class。

## 核心逻辑

### 缓存读取

- `getAll()` 在 TTL 内返回缓存技能列表。
- 如果已有 `pendingLoad`，并发调用会复用同一个 Promise，避免重复请求宿主。
- `refresh()` 清空缓存时间戳并强制重新加载。

### 查询和分组

- `getByName()` 基于 `getAll()` 查找指定 skill name。
- `groupBySource()` 将技能按来源分成 project、global、plugin、builtin、claude、agents 六组。
- `classifySource()` 根据 location 字符串识别 builtin、OpenCode global skills、OpenCode plugin package cache skills、Claude skills、agents skills，其余默认为 project。

### 错误兜底

- `loadSkills()` 捕获宿主 fetch 错误并记录日志。
- 加载失败时优先返回旧缓存；没有缓存时返回空数组。

## 依赖

- `src/shared`: 提供 `createLogger()`。
- 宿主注入的 `SkillCatalogServiceHost`: 提供技能获取和 cache TTL。

## 注意事项

- 该模块不直接访问文件系统或 OpenCode API，所有外部读取都通过 host seam 完成。
- location 分类是字符串约定；新增技能来源时应同步更新 `SkillSourceGroups` 与 `classifySource()`。

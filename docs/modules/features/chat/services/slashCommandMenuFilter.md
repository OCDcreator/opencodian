# slashCommandMenuFilter

> **源码**: `src/features/chat/services/slashCommandMenuFilter.ts`
> **状态**: [REVIEW]

## 概述

`slashCommandMenuFilter.ts` 是聊天输入区 slash autocomplete 的纯过滤 helper。它把命令 ID 和描述的 fuzzy scoring 从 `ComposerInputShellCoordinator` 中移出，避免输入区 DOM/layout owner 继续膨胀。

## 公开接口

```typescript
export function filterSlashCommandMenuItems(
  items: SlashCommandMenuItem[],
  query: string,
  maxCount: number,
): SlashCommandMenuItem[];
```

## 行为

- 空查询时按原始顺序返回前 `maxCount` 个命令
- 非空查询时同时匹配 command ID 与 description
- ID 前缀匹配拥有最高权重，非连续字符匹配用于支持轻量 fuzzy 搜索
- 返回结果按分数降序排列，并裁剪到 `maxCount`

## 边界

- 不读取 OpenCode runtime、项目 `.opencode` 配置或插件 settings
- 不渲染 DOM，也不处理键盘/鼠标事件
- catalog merge、hidden command 过滤仍属于 `src/core/config/slashCommandCatalog.ts`

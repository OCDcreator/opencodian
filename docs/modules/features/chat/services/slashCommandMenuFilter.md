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
  options?: SlashCommandMenuFilterOptions,
): SlashCommandMenuItem[];
```

## 行为

- 空查询时按原始顺序返回命令
- 非空查询时同时匹配 command ID 与 description
- ID 前缀匹配拥有最高权重，非连续字符匹配用于支持轻量 fuzzy 搜索
- 返回结果按分数降序排列
- direct skill mode 下，runtime `source: 'skill'` 与普通 runtime/project command 一样参与顶层过滤
- `skills-command` mode 下，顶层过滤隐藏单个 skill 并追加合成 `/skills` 入口（`isBuiltin: false`，非 OpenCode 内置）
- `/skills <query>` nested 查询只过滤 skill items，并把显示/插入文本改成 `/skills <id> `
- 调用方传入 `isMidText` 时，过滤结果会强制限定为 skill-only：direct mode 直接返回 skill entries，`skills-command` mode 则返回 `/skills <id> ` 形式的 prefixed skill entries；普通 command 不会出现在句中 slash 弹框里

## 边界

- 不读取 OpenCode runtime、项目 `.opencode` 配置或插件 settings；调用方通过 options 传入已解析的 skill mode
- 不渲染 DOM，也不处理键盘/鼠标事件
- catalog merge、hidden command 过滤仍属于 `src/core/config/slashCommandCatalog.ts`

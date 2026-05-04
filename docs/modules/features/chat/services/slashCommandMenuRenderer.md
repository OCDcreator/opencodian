# slashCommandMenuRenderer

> **源码**: `src/features/chat/services/slashCommandMenuRenderer.ts`
> **状态**: [REVIEW]

## 概述

`slashCommandMenuRenderer.ts` 是聊天输入区 autocomplete overlay 的纯渲染 helper。它把 slash menu 的状态行、badge、skill 来源文案、menu item DOM，以及 `@agent` 候选 item DOM 从 `ComposerInputShellCoordinator` 中抽离，避免输入区 shell owner 因菜单展示细节继续膨胀。

## 公开接口

```typescript
export type SlashCommandMenuStatus =
  | 'idle'
  | 'loading'
  | 'emptyCatalog'
  | 'noMatches'
  | 'loadFailed';

export function renderSlashCommandMenu(options: RenderSlashCommandMenuOptions): void;
export function renderAgentMentionMenu(options: RenderAgentMentionMenuOptions): void;
```

## 行为

- 空列表时根据 `status` 渲染 loading / empty / noMatches / loadFailed 状态行
- 有命令时输出 title、source badge、skill provenance 文案和 description
- 有 agent 候选时输出 `@id` 标题、可选 displayName badge 和 description
- `mouseenter` 与 `click` 只通过回调把 index 交还给调用方，不直接持有 coordinator 状态
- skill provenance 文案基于 catalog 的 `skillSource` 做多语言映射，不重新推断路径来源

## 边界

- 不负责 slash / `@agent` query 解析、catalog 加载、fuzzy 过滤或真正执行命令
- 不调度 layout sync，也不直接操作 textarea
- 选择状态仍由调用方持有；本模块只消费当前 `selectedIndex`

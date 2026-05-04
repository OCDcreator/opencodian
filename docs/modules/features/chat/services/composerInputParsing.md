# composerInputParsing

> **源码**: `src/features/chat/services/composerInputParsing.ts`
> **状态**: [REVIEW]

## 概述

`composerInputParsing.ts` 是 chat composer 的纯解析 helper。它把 textarea 文本归类为 prompt / slash command / shell submission，并提供 slash autocomplete 的 token 查询解析，让 `ComposerInputShellCoordinator` 继续专注 DOM、layout 与菜单状态编排。

## 公开接口

```typescript
export function buildComposerInputSubmission(
  content: string,
  mode?: ComposerInputMode,
): ComposerInputSubmission | null;

export function getSlashCommandMenuQuery(textarea: HTMLTextAreaElement): string | null;
```

## 行为

- 空白输入返回 `null`
- shell mode 直接生成 `{ kind: 'shell', rawContent, command }`
- prompt mode 下 `/command args` 会生成 structured command submission，`//` 不触发 command
- 普通文本生成 `{ kind: 'prompt', content }`
- slash query 只在光标折叠、仍停留在 command token 内时返回；`/skills <query>` 是唯一允许继续跨空格补全的 nested form

## 边界

- 不加载 slash catalog，也不做 fuzzy filter
- 不处理 `@agent`；agent 查询和 source span 追踪由 `AgentMentionComposerController` 负责
- 不触碰 DOM，除读取 textarea value 与 selection range

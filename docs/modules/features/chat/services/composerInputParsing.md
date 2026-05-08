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

export function buildComposerInputSubmissionWithAgentIntents(
  content: string,
  mode: ComposerInputMode,
  mentions: AgentMentionIntent[],
  primaryAgent: string | null | undefined,
): ComposerInputSubmission | null;

export function decoratePromptSubmissionWithAgentMentions(
  submission: ComposerInputSubmission | null,
  mentions: AgentMentionIntent[],
): ComposerInputSubmission | null;

export function shiftAgentMentionSourceSpans(
  mentions: AgentMentionIntent[],
  delta: number,
): AgentMentionIntent[];

export function decoratePromptSubmissionWithPrimaryAgent(
  submission: ComposerInputSubmission | null,
  primaryAgent: string | null | undefined,
): ComposerInputSubmission | null;

export function getSlashCommandMenuQuery(textarea: HTMLTextAreaElement): string | null;
```

## 行为

- 空白输入返回 `null`
- shell mode 直接生成 `{ kind: 'shell', rawContent, command }`
- prompt mode 下 `/command args` 会生成 structured command submission，`//` 不触发 command
- 普通文本生成 `{ kind: 'prompt', content }`
- `buildComposerInputSubmissionWithAgentIntents()` 是 composer submit 边界的组合 helper：先归类 submission，再调整 mention source span，最后合并 mention 与 primary agent intent
- `decoratePromptSubmissionWithAgentMentions()` 只处理 prompt submission，并把 selected `@agent` mention intent 合并进 `invocationIntent.mentions`
- `shiftAgentMentionSourceSpans()` 用于把 textarea 原始坐标调整到 trim 后的 prompt content 坐标，避免 coordinator 内联 source span 改写
- `decoratePromptSubmissionWithPrimaryAgent()` 只处理 prompt submission，并把 composer 主 Agent selector 的选择值写入 `invocationIntent.primaryAgent`
- slash query 只在光标折叠、仍停留在 command token 内时返回；`/skills <query>` 是唯一允许继续跨空格补全的 nested form。`/` 前必须是空白或文本开头（`slashIndex > 0` 时检查前一字符是否为 `\s`），不会在 `path/to` 这种词中触发

## 边界

- 不加载 slash catalog，也不做 fuzzy filter
- 不解析 `@agent` 查询；agent 查询和 source span 追踪由 `AgentMentionComposerController` 负责，主 Agent 选择由 `ChatSelectionControlsCoordinator` 负责
- 不触碰 DOM，除读取 textarea value 与 selection range

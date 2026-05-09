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

export interface SlashCommandMenuQuery {
  query: string;
  isMidText: boolean;
}

export function getSlashCommandMenuQuery(textarea: HTMLTextAreaElement): SlashCommandMenuQuery | null;

export function replaceSlashTokenAtCursor(
  current: string,
  cursorPos: number,
  replacement: string,
): { value: string; cursorPos: number };
```

## 行为

- 空白输入返回 `null`
- shell mode 直接生成 `{ kind: 'shell', rawContent, command }`
- prompt mode 下 `/command args` 会生成 structured command submission，`//` 不触发 command
- **行首 `/command`**（backward compatible）：`/command args` 归类为 command submission，`rawContent` 为完整输入
- **行中 `/command`**（`/command` 出现在空白之后）：例如 `some text /review src/app.ts` 也会归类为 command submission，`command = "review"`、`arguments = "src/app.ts"`、`precedingText = "some text"`、`originalContent = "some text /review src/app.ts"`。对于行中命令，`rawContent` 设为完整原始文本，这样当 `SlashCommandExecutionService` 不识别该命令时，发送管道会将完整内容作为普通 prompt 发送而不丢失文字
- 普通文本生成 `{ kind: 'prompt', content }`
- `buildComposerInputSubmissionWithAgentIntents()` 是 composer submit 边界的组合 helper：先归类 submission，再调整 mention source span，最后合并 mention 与 primary agent intent
- `decoratePromptSubmissionWithAgentMentions()` 只处理 prompt submission，并把 selected `@agent` mention intent 合并进 `invocationIntent.mentions`
- `shiftAgentMentionSourceSpans()` 用于把 textarea 原始坐标调整到 trim 后的 prompt content 坐标，避免 coordinator 内联 source span 改写
- `decoratePromptSubmissionWithPrimaryAgent()` 只处理 prompt submission，并把 composer 主 Agent selector 的选择值写入 `invocationIntent.primaryAgent`
- slash query 只在光标折叠、仍停留在 command token 内时返回；`/skills <query>` 是唯一允许继续跨空格补全的 nested form。当前实现会优先识别“最后一个以空白或文本开头为边界的 `/skills ...` 片段”，所以像 `/skills agent-browser why /skills ` 这种前文里再次输入的 `/skills` 也会继续弹出 nested skill 菜单，而不是只支持整段输入从 `/skills` 开始的场景。精确的 `/skills` 和 `/skills ` 现在都会被当成“空的 nested skill 查询”，直接展开 skill 候选，而不是退回成顶层 `/skills` 帮助项。返回值还会标注 `isMidText`，供菜单层把句中 slash 限定为 skill-only 候选；普通 `/` token 仍要求 `/` 前必须是空白或文本开头（`slashIndex > 0` 时检查前一字符是否为 `\s`），不会在 `path/to` 这种词中触发
- `replaceSlashTokenAtCursor()` 做局部 token 替换并保留前后文本。普通 `/command` 只替换当前 token；`/skills <query>` 会把整个 prefixed skill 查询范围当成当前可替换片段，即使光标停在 `/skills ` 后的空白处，也能把中段文本里的 `hello /skills  world` 稳定替换为 `hello /skills skill-name  world`
- `isCommandComposerText()` 调用 `parseCommandSubmission()` 判断输入是否包含可识别的 `/command`（行首或行中均可）

## 边界

- 不加载 slash catalog，也不做 fuzzy filter
- 不解析 `@agent` 查询；agent 查询和 source span 追踪由 `AgentMentionComposerController` 负责，主 Agent 选择由 `ChatSelectionControlsCoordinator` 负责
- 不触碰 DOM，除读取 textarea value 与 selection range

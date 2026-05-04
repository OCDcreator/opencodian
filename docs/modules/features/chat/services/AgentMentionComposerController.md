# AgentMentionComposerController

> **源码**: `src/features/chat/services/AgentMentionComposerController.ts`
> **状态**: [REVIEW]

## 概述

`AgentMentionComposerController` 是 chat composer 的 `@agent` producer owner。它把 `@` 查询、agent 候选过滤、菜单选择、textarea 插入和 source span 追踪从 `ComposerInputShellCoordinator` 中抽出，避免输入 shell 因 agent 交互继续变厚。

它不发明后端协议：选中的 agent 会在 submit 时转成 `SurfaceInvocationIntent.mentions`，后续仍由 `AgentInvocationService` 和 `OpenCodePromptRequestBuilder` 变成 OpenCode 原生 `agent` request part。

## 公开接口

```typescript
export interface AgentMentionCandidate {
  id: string;
  displayName?: string;
  description?: string;
  mode: 'primary' | 'subagent' | 'all' | null;
  hidden?: boolean;
}

export class AgentMentionComposerController {
  getQuery(textarea: HTMLTextAreaElement): AgentMentionQuery | null;
  refresh(query: AgentMentionQuery, menuEl: HTMLElement | null): Promise<void>;
  tryHandleKeydown(event: KeyboardEvent, textarea: HTMLTextAreaElement | null, menuEl: HTMLElement | null): boolean;
  resolveMentionIntents(content: string): AgentMentionIntent[];
  clearTrackedMentions(): void;
  clear(menuEl: HTMLElement | null): void;
  reset(): void;
}
```

## 行为

- 只在 prompt mode 下识别 `@(\S*)$` 查询；shell mode 和选区非折叠时不接管输入
- 候选过滤对齐上游 OpenCode：只展示 `mode === 'subagent'` 或 `mode === 'all'`，并排除 `hidden`
- 使用和 slash menu 相同的 overlay 容器、loading / empty / noMatches / loadFailed 状态和键盘选择语义
- 选中候选后把当前 token 替换为可见 `@agent ` 文本，并记录 `{ agentId, value }`
- submit 前只使用仍位于 tracked source span 的 selected mention，生成 `source: { value, start, end }`；后续输入会把 span 安全平移，覆盖 mention 本体的编辑会让该 intent 失效
- 用户手写但没有从候选选中的 `@name` 不会被静默提升为 agent intent

## 边界

- 不负责 agent catalog 加载；候选由 host 提供
- 不负责最终 request part 生成；这是 `AgentInvocationService` / `OpenCodePromptRequestBuilder` 的职责
- 不负责 slash command query、context attachments、send gate 或 streaming state
- 不直接保存 conversation，也不触碰 child-session / task tool UI

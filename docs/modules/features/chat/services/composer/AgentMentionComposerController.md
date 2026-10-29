# AgentMentionComposerController

2026-10-29：统一引用菜单的各分类可独立折叠。非空搜索加载匹配结果后自动展开相应分类，未匹配分类及空查询保留当前折叠状态；同一搜索结果中仍可手动收起。控制器在当前聊天面板生命周期内保留折叠状态，并令方向键及提交只访问已展开的候选；全部收起时保留可重新打开的分类标题，Enter 不插入隐藏项，Tab 可进入原生分类按钮。分类切换不更改草稿或原生引用身份。

> **源码**: `src/features/chat/services/composer/AgentMentionComposerController.ts`
> **状态**: [REVIEW]

## 概述

`AgentMentionComposerController` 是 chat composer 的统一 `@` producer owner。它拥有查询、候选过滤、菜单选择、textarea 插入和 source span 追踪。

文件、文件夹、本 Vault 会话和后端原生插件/应用/MCP 资源由可选 `loadPromptReferenceCandidates(query)` 提供，只展示有效候选。资源选择保存 `PromptReferenceService.encodePromptReference` 的稳定 token，能力判断与发送准备仍属于相邻服务。

它不发明后端协议：选中的 agent 会在 submit 时转成 `SurfaceInvocationIntent.mentions`，后续仍由 `AgentInvocationService` 和 `OpenCodePromptRequestBuilder` 变成 OpenCode 原生 `agent` request part。

## 公开接口

```typescript
export interface AgentMentionCandidate {
  id: string;
  displayName?: string;
  description?: string;
  mode: 'primary' | 'subagent' | 'all' | null;
  hidden?: boolean;
  reference?: PromptReference;
}

export interface AgentMentionPillSpan {
  agentId: string;
  value: string;
  start: number;
  end: number;
}

export class AgentMentionComposerController {
  getQuery(textarea: HTMLTextAreaElement): AgentMentionQuery | null;
  refresh(query: AgentMentionQuery, menuEl: HTMLElement | null): Promise<void>;
  tryHandleKeydown(event: KeyboardEvent, textarea: HTMLTextAreaElement | null, menuEl: HTMLElement | null): boolean;
  resolveMentionPillSpans(content: string): AgentMentionPillSpan[];
  resolveMentionIntents(content: string): AgentMentionIntent[];
  clearTrackedMentions(): void;
  clear(menuEl: HTMLElement | null): void;
  reset(): void;
}
```

## 行为

- 只在 prompt mode 下识别 `@` 查询；支持空白、行首、中文及全角标点后紧接 `@`，以及 `@"带空格的查询`。邮件地址、非折叠选区、已完成引用 token 和 shell mode 不触发
- 原生 agent 候选只展示 `mode === 'subagent'` 或 `mode === 'all'`，并排除 `hidden`
- 稳定引用候选与原生 agent 并行加载，单一目录失败不会隐藏其他有效候选。文件/文件夹、会话、插件/应用、MCP 资源和 agent 分组后排序；引用状态使用独立本地化文案
- `getPromptReferenceContextKey()` 绑定后端、Vault 与当前会话；切换后清空原生 agent 追踪和旧候选，异步迟到结果不能回填。编码引用从草稿重新解析，可在 tab 恢复、撤销/重做和重载后恢复标签
- 使用和 slash menu 相同的 overlay 容器、loading / empty / noMatches / loadFailed 状态和键盘选择语义
- 选中候选后把当前 token 替换为可见 `@agent ` 文本，并记录 `{ agentId, value, start, end }`；`ComposerInputShellCoordinator` 会把这些 span 渲染成带 `data-type="agent"` / `data-name` 的 pill
- 对 tracked agent mention 和稳定引用执行原子编辑保护：光标位于 pill 内、Backspace/Delete 会修改 pill 边界字符，或选区只覆盖 pill 一部分时，先阻止本次编辑并选中整个 token；用户可整体删除 selected mention
- submit 前只使用仍位于 tracked source span 的 selected mention，生成 `source: { value, start, end }`；后续输入会把 span 安全平移，覆盖 mention 本体的外部编辑仍会让该 intent 失效
- 用户手写但没有从候选选中的 `@name` 不会被静默提升为 agent intent

## 边界

- 不直接读取 agent/引用目录、Vault 文件或历史消息；候选由 host 提供
- 不把文件/会话/插件引用转换成 agent dispatch intent；`resolveReferencePillSpans` 只提供展示标签与 source range
- 不负责最终 request part 生成；这是 `AgentInvocationService` / `OpenCodePromptRequestBuilder` 的职责
- 不负责 slash command query、context attachments、send gate 或 streaming state
- 不直接保存 conversation，也不触碰 child-session / task tool UI

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/services/composer/AgentMentionComposerController.ts`。
- 原位置：`src/features/chat/services/AgentMentionComposerController.ts`；文件名、导出接口与业务职责保持不变。
- 随目录调整更新的依赖：`src/features/chat/services/commands/slashCommandMenuRenderer.ts`。

## 验证（2026-10-29）

`AgentMentionComposerController.references.test.ts` 覆盖中文和带空格查询、邮件与 shell 排除、分组/日期、CodeMirror 焦点下的鼠标选择、稳定身份与重载恢复、原子删除、后端切换竞态和部分目录失败。

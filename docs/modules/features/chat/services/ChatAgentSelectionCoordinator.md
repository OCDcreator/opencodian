# ChatAgentSelectionCoordinator

> **源码**: `src/features/chat/services/ChatAgentSelectionCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChatAgentSelectionCoordinator` 承接聊天输入工具栏里的主 Agent 下拉框。它只处理 composer 级选择，不写项目配置；`null` 代表继续使用 OpenCode / project default，非空 agent id 会在提交时作为 `SurfaceInvocationIntent.primaryAgent` 传给发送链路。

## 公开接口

```typescript
export interface ChatAgentSelectionCoordinatorHost {
  loadAgentSelectionCandidates(): Promise<AgentSelectionCandidate[]>;
  closePeerDropdowns(): void;
  restoreInputFocus(): void;
}

export class ChatAgentSelectionCoordinator {
  mount(containerEl: HTMLElement): void;
  getSelectedAgentId(): string | null;
  reloadCatalog(): Promise<void>;
  applyLocaleTexts(): void;
  isOpen(): boolean;
  closeDropdown(): void;
  destroy(): void;
}
```

## 关键行为

- `mount()` 创建 trigger、dropdown、轻量列表标题和 OpenCode default 选项；首次打开下拉框时再异步加载 default-eligible agents
- `reloadCatalog()` 通过 host seam 拉取 `primary` / `all` agent 候选；如果当前选择不再存在，则回退为 OpenCode default
- `openDropdown()` 会先调用 `closePeerDropdowns()`，确保 Agent / permission / model 下拉框不会同时打开；dropdown 打开时会添加 `is-open` 类以触发 CSS 入场动画
- dropdown 使用 `AnchoredOverlayLayoutController` 按最近的 `.opencodian-container` 计算 340px 首选宽度、272px 最小宽度和左右 8px 安全区；侧栏更窄时允许继续收缩
- 选中任意 agent 或 OpenCode default 后会关闭 dropdown 并调用 `restoreInputFocus()`，让用户可以继续在 composer 中输入
- trigger 暴露 `button` / `aria-expanded` / `aria-haspopup=listbox`，dropdown 和选项分别暴露 `listbox` / `option` 与 `aria-selected`，让样式重塑后仍保留明确的辅助技术语义
- 选项渲染保留 default row、agent mode badge、checkmark、loading / empty / load-failed 状态行，以及用于紧凑布局的 main/meta 分区；OpenCode default 现在和 agent row 共用同一 option 视觉模型，description 固定作为低优先级二级文本展示，不再渲染临时详情按钮或展开态
- `destroy()` 断开浮层边界 observer，并释放 DOM refs 与 pending load run；当前 selected agent id 保留在 coordinator 实例中，直到下一次 catalog reload 判定不可用

## 边界

- 不读取 OpenCode SDK 或 `.opencode/opencode.json`；候选加载由 host 提供
- 不参与 `@agent` mention 解析；那条链路由 `AgentMentionComposerController` 与 `AgentMentionCandidateService.projectCandidates()` 负责
- 不直接提交消息；`ComposerInputShellCoordinator` 通过 `getSelectedAgentId()` 读取选择值

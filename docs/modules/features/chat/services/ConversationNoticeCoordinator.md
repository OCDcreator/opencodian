# ConversationNoticeCoordinator

> **源码**: `src/features/chat/services/ConversationNoticeCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationNoticeCoordinator` 把 `OpenCodianView` 里与 conversation notice 相关的编排收束起来：空对话 notice、stream error notice、turn diff notice，以及 notice action 路由。

它不负责 notice 的持久化保存，也不负责 notice card 的渲染；这些仍分别交给 `PersistentAssistantNoticeService` 和 `AssistantNoticeCardRenderer`。

## 导入关系

```text
上游: OpenCodianView
下游: PersistentAssistantNoticeService, AssistantNoticeRenderer, AssistantNoticeCardRenderer
```

## 核心类型 / 接口

```typescript
export interface ConversationNoticeCoordinatorHost {
  getCurrentSessionModel(): ModelSelectorSelection | null;
  formatModelId(model: ModelSelectorSelection | null | undefined): string | undefined;
  isConversationRewound(): boolean;
  getActiveTabId(): TabId | null;
  getSessionDiff(sessionId: string, sourceMessageId: string): Promise<SessionDiffEntry[]>;
  getCachedSessionDiffEntries(sessionId: string): SessionDiffEntry[];
  appendPersistentNotice(options: PersistentAssistantNoticeMessageOptions): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
  handleRestoreRewindRequest(): Promise<void>;
  openPluginSettingsPreservingScroll(): void;
}

export class ConversationNoticeCoordinator {
  getFriendlyStreamErrorMessage(rawMessage: string): string;
  createStreamErrorNotice(message: string): ChatMessage;
  shouldRenderEmptyConversationNotice(): boolean;
  createEmptyConversationNotice(): ChatMessage;
  appendTurnDiffNoticeIfNeeded(...): Promise<void>;
  formatDiffNoticeMarkdown(entries: SessionDiffEntry[]): string;
  routeNoticeAction(actionType: ...): Promise<void>;
}
```

## 核心逻辑

### 空对话与 rewind notice

- `shouldRenderEmptyConversationNotice()` 只读 host 的 rewind 状态
- `createEmptyConversationNotice()` 根据 rewind 状态返回 normal empty-state 或 rewind warning notice

### stream error notice

- `createStreamErrorNotice()` 复用 `AssistantNoticeRenderer.buildStreamErrorNotice()`，统一补上当前模型 id
- `getFriendlyStreamErrorMessage()` 把原始流错误字符串映射为用户友好文案：网络错误 → server connection，opencode not found → binary missing，空消息 → no response，其余 → send failed + 原文

### turn diff notice

- `appendTurnDiffNoticeIfNeeded()` 先查当前 session 的 live diff，再回退 cached diff，最后回退 edited file 列表
- `formatDiffNoticeMarkdown()` 输出 vault 链接、diff stats 与 status
- 只有 active tab 才会补发 background task indicator

### notice action 路由

- `routeNoticeAction()` 只处理 `open_model_settings` 与 `restore_rewind`
- `open_model_settings` 通过 host 打开 settings 并保留滚动位置

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `getFriendlyStreamErrorMessage()` | 将原始流错误字符串映射为用户友好文案 |
| `createStreamErrorNotice()` | 生成 stream error assistant notice |
| `shouldRenderEmptyConversationNotice()` | 判断是否应显示 empty notice |
| `createEmptyConversationNotice()` | 生成 normal / rewind empty notice |
| `appendTurnDiffNoticeIfNeeded()` | 为编辑过的文件补发 turn diff notice |
| `formatDiffNoticeMarkdown()` | 格式化 diff notice markdown |
| `routeNoticeAction()` | 路由 notice action |

## 与其他模块的交互

- 依赖 `PersistentAssistantNoticeService` 完成 notice 持久化
- 依赖 `OpenCodeService` 提供 session diff 与 cached diff
- 依赖 `ChatSelectionControlsCoordinator` 提供模型 id 格式化
- 依赖 `OpenCodianView` host seam 执行 rewind、settings 和 background task indicator 后续动作

## 注意事项

- `open_model_settings` 的滚动恢复逻辑仍由 view host 负责
- model-unavailable notice 仍归 `ChatSelectionControlsCoordinator`，不要迁移进这个 coordinator

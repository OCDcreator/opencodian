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
  hasAnyEnabledBackend(): boolean;
  hasBackendConnection(): boolean;
}

export class ConversationNoticeCoordinator {
  getFriendlyStreamErrorMessage(rawMessage: string, backend?: AgentBackendKind): string;
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
- `createEmptyConversationNotice()` 现在会先区分四类 chat surface 空状态：
  - rewind：保留原有 rewind warning notice
  - 没有任何 enabled backend：返回 warning notice，引导用户去启用 backend，而不是继续显示“输入消息开始对话”
  - backend 已启用但当前不可连接：返回 warning notice，并从全局插件设置读取当前 backend display name，使用 `chat.empty.backendOffline.titleWithBackend` / `descriptionWithBackend` 在文案中点出 backend 名称，引导用户检查对应 backend / server 设置
  - 只有在 backend 可用时才回落到普通 empty-state

### stream error notice

- `createStreamErrorNotice()` 复用 `AssistantNoticeRenderer.buildStreamErrorNotice()`，统一补上当前模型 id
- `getFriendlyStreamErrorMessage()` 把原始流错误字符串映射为用户友好文案：网络错误 → server connection，opencode not found → binary missing，空消息 → backend-aware no response，其余 → send failed + 原文
- 空消息在 OpenCode 保留既有 server-no-response 指引；Claude Code 改为“未返回可显示内容”，避免用户被错误引导到 OpenCode 服务设置
- Claude Code backend 的 SDK/stream 错误保留 Claude Code 标签，不再被映射成 OpenCode server connection failure，避免用户在 Claude 后端失败时被引导去排查 OpenCode 本地服务。

### turn diff notice

- `appendTurnDiffNoticeIfNeeded()` 先查当前 session 的 live diff，再回退 cached diff，最后回退 edited file 列表
- **OpenCode-only diff gate**: `backend !== 'opencode'` 时直接返回。`getSessionDiff` 与 `getCachedSessionDiffEntries` 是 OpenCode-specific API，暂无 backend-neutral 等价物。Claude 等 backend 的 diff surface 未稳定完成前不伪造 diff notice。
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
| `createEmptyConversationNotice()` | 生成 normal / rewind / no-backend / backend-offline empty notice；backend-offline 会本地读取 active backend display name 并点出 backend 名称 |
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

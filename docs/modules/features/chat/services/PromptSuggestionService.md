# PromptSuggestionService

> **源码**: `src/features/chat/services/PromptSuggestionService.ts`
> **状态**: [REVIEW]

## 概述

`PromptSuggestionService` 是 Claude Code SDK `prompt_suggestion` 后续提示建议的运行时状态协调器。

它持有当前活跃的建议，并在生命周期边界（新用户轮次开始、标签页切换）清除状态。
点击建议只会将文本插入到输入框中，不会自动发送。

`ComposerInputShellCoordinator` 在 `build()` 期间通过模块级 sink bus (`promptSuggestionSink`) 自行连接适配器和会话变更事件，无需 view 层转发。

## 核心类型

```typescript
export interface PromptSuggestionData {
  type: 'prompt_suggestion';
  suggestion: string;
  uuid: string;
  sessionId?: string;
}
```

## 生命周期

1. SDK `prompt_suggestion` 消息到达 `pumpRuntimeOutput`，通过 `postResultCallback` 通知服务
2. 服务存储建议并通知监听器
3. **会话键对齐（build 时）**：`activeSessionId` 可能为 `null`（例如 coordinator 在当前会话 hydration 后才 build）。`ComposerInputShellCoordinator.build()` 会先从 `host.getCurrentBackendSessionId()` 读一次当前会话 id，再把它同步到服务，保证已知会话上的 suggestion 能立即命中 active session。
4. **会话键对齐（会话切换 / 首轮写回后）**：当 `setCurrentConversation()` 因标签切换、对话切换或首轮 `backendSessionId` 写回而触发时，`TabActivationRuntimeHostProvider` / `OpenCodianView` 会把新的 backend session id 转发给 `syncPromptSuggestionSession(sessionId)`。这就是当前 tracked source 中真正关闭 race 的生产路径：suggestion 可以先到，session id 随后通过 conversation-state writeback 补齐，chip 再显示。
5. 聊天 UI 渲染建议为可点击的标签
6. 用户点击后，建议文本被插入到输入框
7. 以下任一事件清除建议：
   - `clearActiveOnTurnStart()`：新用户轮次开始
   - `onActiveSessionChanged(sessionId)`：标签页切换（通过 scoped bus）
   - `clearAll()`：view teardown、backend 切换，或 sink 被清除（backend stop/restart 时 coordinator 收到 `null` 通知）

## 不自动发送

服务没有 `send` 或 `autoSend` 方法。用户必须显式操作才能发送建议文本。

## 生命周期清理

- `attachAdapter()` 返回一个 unsubscribe 函数，coordinator 在 teardown 时调用它，防止 stale callback。该 unsubscribe 同时调用 adapter 返回的 unsubscribe（从 `postResultCallbacks` Set 中移除），实现双层清理。
- `onBarRefreshRequested()` 返回 unsubscribe，coordinator 在 build/destroy 闭环中捕获，避免重复 build 时累计刷新回调。
- `ClaudeCodeAdapter.stop()`/`dispose()` 调用 `clearPromptSuggestionSink()` 清除已注册的 sink，所有 `onPromptSuggestionSinkChange` 订阅者收到 `null` 通知。
- 多视图并发时，每个 coordinator 独立 `attachAdapter()`，adapter 内部通过 `postResultCallbacks` Set 维护所有活跃订阅，避免单回调覆盖（callback clobbering）。

## 分类

此能力被分类为 **readback**：
- SDK options wiring 已证明（`promptSuggestions` 通过 `buildClaudeCodeOptions`）
- `pumpRuntimeOutput` 回调发射已证明（单元测试覆盖）
- 端到端 CLI 子进程建议传递到聊天 UI 未独立验证

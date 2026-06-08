# promptSuggestionSink

> **源码**: `src/core/agents/backend/promptSuggestionSink.ts`
> **状态**: [REVIEW]

## 概述

`promptSuggestionSink` 是模块级事件总线，解耦 Claude Code adapter（core 层）与 ComposerInputShellCoordinator（features 层），使 `OpenCodianView.ts` 无需转发 prompt-suggestion 事件。

## 核心职责

- **Sink 注册**: `ClaudeCodeAdapter.start()` 注册自身为 sink；`stop()`/`dispose()` 清除注册。
- **Sink 变更订阅**: `onPromptSuggestionSinkChange(cb)` 允许 coordinator 在 build 之后监听 sink 的注册/清除事件，解决 late-registration gap（sink 在 coordinator build 之后才可用，或 backend 重启后重新注册）。
- **通道管理**: 每个协调器实例创建一个 scoped channel，防止独立 chat view（leaf）之间的 session-change 交叉干扰。
- **DOM 范围发现**: 协调器在 `build()` 时将通道 ID 标记到其容器 DOM 元素上（`data-opencodian-ps-scope` 属性）。Tab-activation provider 在 `setCurrentConversation` 时从活动标签页的 messages container DOM 元素向上遍历，发现同一视图子树中的标记通道，实现 scoped emission 而无需宿主视图传递通道 ID。
- **会话变更事件**: `TabActivationRuntimeHostProvider` 在 `setCurrentConversation` 时通过 DOM 发现通道后发射 scoped 会话变更。协调器在 `build()` 时订阅自己通道的变更。

## 公共 API

```typescript
// Sink registration
registerPromptSuggestionSink(sink: PromptSuggestionSink): void
getPromptSuggestionSink(): PromptSuggestionSink | null
clearPromptSuggestionSink(): void
onPromptSuggestionSinkChange(cb: (sink: PromptSuggestionSink | null) => void): () => void

// Channel management
createPromptSuggestionChannel(): string
deletePromptSuggestionChannel(channelId: string): void

// Session change events
emitPromptSuggestionSessionChange(sessionId: string | null, channelId?: string): void
onPromptSuggestionSessionChange(cb: SessionCallback, channelId?: string): () => void
clearAllPromptSuggestionSessionCallbacks(): void

// DOM scope discovery
stampPromptSuggestionScope(container: HTMLElement, channelId: string): void
removePromptSuggestionScope(container: HTMLElement): void
findPromptSuggestionScope(fromElement: Element): string | undefined
```

## 通道隔离模型

- **Scoped emit**: 当 `channelId` 提供时，仅该通道的订阅者收到事件。
- **Global emit**: 当 `channelId` 省略时，所有订阅者（全局 + 所有通道）收到事件（向后兼容）。
- **DOM scope discovery**: 协调器在 `build()` 时将通道 ID 标记到其 `inputContainerEl`。Provider 在 `setCurrentConversation` 时从 `getTabMessagesContainer(activeTabId)` 向上遍历 DOM 找到同一视图子树中的标记通道。此机制不依赖宿主视图（`OpenCodianView.ts`）传递通道 ID。

## 生命周期

1. `ClaudeCodeAdapter.start()` → `registerPromptSuggestionSink(this)`（显式初始化路径）
2. `ClaudeCodeAdapter.ensureReadyForQuery()` → `registerPromptSuggestionSink(this)`（真实产品路径：每次 `sendMessage`/`createSession` 调用时触发；幂等——同一 adapter 不会重发 callback）
3. `ComposerInputShellCoordinator.build()` → `createPromptSuggestionChannel()` + `stampPromptSuggestionScope(inputContainerEl, channelId)` + `onPromptSuggestionSessionChange(cb, channelId)` + `onPromptSuggestionSinkChange(cb)`（动态 attach adapter，处理 late registration）
4. `TabActivationRuntimeHostProvider.setCurrentConversation()` → DOM walk from `messagesContainer` → `findPromptSuggestionScope()` → `emitPromptSuggestionSessionChange(sessionId, discoveredChannelId)`
5. `MessageFinalizationHost.setActiveTabConversation(conversation, tabId)` → scoped `promptSuggestionSessionResync(tabId, sessionId)` → `emitPromptSuggestionSessionChange(sessionId, channelId)`（provisional → final SDK id 切换后的 scoped session resync）
6. `ComposerInputShellCoordinator.destroy()` → `removePromptSuggestionScope()` + `deletePromptSuggestionChannel()` + 清除所有订阅（包括 sink-change 订阅和 adapter unsubscribe）
7. `ClaudeCodeAdapter.stop()`/`dispose()` → `clearPromptSuggestionSink()` → 所有 `onPromptSuggestionSinkChange` 订阅者收到 `null`

## 分类

此模块支持的整体能力已被分类为 **pass**（live proof 2026-06-06, BUILD_ID feature-phase0-capability.202606060953：Test Vault 普通聊天中端到端观测到 suggestion chip，quick interaction proof 全部通过）。

Capability Lab 中的诊断 probe（`runPromptSuggestionsReadbackProbe`）仍分类为 **readback**：它验证 settings→SDK option mapping，不执行真实 SDK 查询。

Runtime caveat：SDK 可能在首轮对话、API 错误后、计划模式下或非 Claude 模型时不发射 `prompt_suggestion`——这是平台限制，不是插件 bug。

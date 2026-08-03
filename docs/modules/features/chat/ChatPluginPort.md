# ChatPluginPort

> **源码**: `src/features/chat/ChatPluginPort.ts`
> **状态**: [REVIEW]
> **最近更新**: ChatPluginPort slice — 为 `OpenCodianView` 提供 consumer-owned、窄化的插件依赖契约

## 概述

`ChatPluginPort` 是聊天 shell 的纯 TypeScript type seam。它不包含实现、运行时状态、初始化逻辑或 lifecycle；`OpenCodianView` 的 constructor 只接收这个 port，既有 `onOpen()`、`onClose()`、tab/session streaming 与恢复语义保持不变。

该 port 以 `Pick` 收窄聊天视图实际访问的依赖域：

| 域 | 契约 |
| --- | --- |
| Obsidian / manifest | `app.vault`、manifest `dir/id` |
| Settings | `OpenCodianSettings` 中聊天、backend、tab、theme、locale 及回合变更记录显示开关等实际读取字段 |
| OpenCode / config / model | `OpenCodeService`、`OpencodeConfigManager`、`ModelConfigService`、`ModelPricingService` 的窄方法集 |
| UI contexts | Claude Code permission 与 Codex approval 的 active-tab/card renderer 回调 |
| Settings tab | 可选的 scroll/refresh/navigation 回调 |
| Conversation commands | load/create/save/delete、查询、标题、cache pin 与主题背景解析 |

唯一保留的 concrete service 是 `AgentServiceRegistry`。backend routing helpers 需要该带 private state 的 nominal class 实例；其余服务与 context 均通过 `Pick` 或函数契约暴露，避免把完整插件对象作为聊天模块的上游依赖。

## Tab runtime 兼容边界

`ChatPluginPort extends TabRuntimePluginSource` 仅因为 view 会把同一份 `plugin: this.plugin` 引用传给 `ConversationTabRuntimeCoordinator`。因此 port 复用现有的 UI-state save 与 cache-trim persistence 合同（`saveSettingsUiStateImmediately()`、`scheduleSettingsUiStateSave()`、`trimConversationFullMessageCache()` 及其既有 settings shape）；它不是新增的 forwarding layer，也不是 service locator。tab runtime 仍按原有 owner 负责 tab bar、persisted state 和 pane lifecycle。

## 维护约束

- 新增成员前必须有 `OpenCodianView` 的真实访问证明，并优先使用已有窄接口；不要因为潜在调用而恢复完整插件类型。
- 改变 port 依赖域时，同步检查 `OpenCodianView`、`ConversationTabRuntimeCoordinator` 与相应 owner/module-doc，确认没有复制 canonical runtime/state/lifecycle。
- 该文件只记录 type boundary；不要把具体服务的实现细节或巨大 method 清单复制进来。

## 模块关系

- 上游：`OpenCodianView` constructor consumer，以及 app-composition 注入的实现对象。
- 下游：`ConversationTabRuntimeCoordinator` 只消费其继承的 `TabRuntimePluginSource` persistence contract。
- Barrel：`src/features/chat/index.ts` 不重新导出 `ChatPluginPort`；它是 chat shell 的内部类型 seam。

# PiAdapter

> 源码: src/core/agents/backend/pi/PiAdapter.ts

## 职责

AgentService 的聊天、模型、会话/分叉、上下文和费用入口；白名单管理命令由独立 SDK 服务执行。PiSessionRuntime 维持每会话服务；句柄同步真实 sessionFile 和标题，分叉后恢复原服务分支。

发送等待完整 prompt 响应，保留原生消息 ID 和真实费用，禁止提前以 agent_end 结束。模型 setters 只写服务内存。准备阶段取消不发送 prompt；提前退出迭代后 abort，5秒后关闭无响应连接。stopSession 可结束工作台长操作。

## 验证

tests/unit/core/agents/backend/pi/，scripts/pi-sdk-acceptance.mjs，scripts/pi-rpc-smoke.mjs。只引用共享接口和 Pi 模块，不能导入其他后端实现。

2026-09-09：配置操作路由到configurationOnly进程，不构造Agent和扩展；坏模型默认值不能阻止打开配置。其他命令/历史仍由每会话服务处理。

- 2026-09-13: sendMessage 以 prependMemoryInjection（core.memory 共享契约，Pi 边界测试已加白）在 prompt 前置记忆注入块。

- 2026-09-15: 实现 `AgentAuxQueryCapability.startAuxQuerySession()`：用 Pi 原生的 `set_tools` / `get_tools` 把会话限制为只读工具并以 SDK 回读校验（fail closed）。实现见本目录的 `PiAuxQuerySession.ts`。

- 2026-09-17: UI 请求转发前先落一份状态：`setStatus` / `notify` 的文本存进适配器（`getExtensionStatus()` → `PiExtensionStatusSnapshot`），其余方法原样交给 `onUiRequest`。Pi 的 MCP 能力来自扩展而非 RPC，这是宿主机唯一能观测到的运行时状态，设置页的 Pi MCP 面板读它；FakeClient 测试覆盖上报与 `setStatus` 空文本清除该键。

- 2026-09-18 (FlowText R-B4): Obsidian 原生工具注入接缝接入——sendMessage 现在把 options.obsidianToolingInjection 以 prependObsidianToolingInjection 前缀到消息文本（记忆块之后），同一选项袋接缝。

> 2026-09-18 (R-C3)：实现 `AgentInlineCompletionCapability`——`startInlineCompletionSession()` 复用 `PiAuxQuerySession` 的 `set_tools`/`get_tools` 读回机制，经 `WarmInlineCompletionSession` 包装；capabilities 增加 `AgentCapability.InlineCompletion`。

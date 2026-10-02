# PiAdapter
> 2026-09-21 (advantage-parity R-F7)：PiAdapterOptions 新增 `getExtraEnv`，经既有 options 透传至 PiSessionRuntime → launch options。
> 2026-09-21 (advantage-parity R-F1)：新增 steerTurn——活动 run 的 RPC 客户端上发 {type:'prompt', streamingBehavior:'steer'}（忙时无此字段的 prompt 被明确拒绝并指名该参数，实证于 pi 0.86.0）；能力集声明 TurnSteering。

> 源码: src/core/agents/backend/pi/PiAdapter.ts

## 职责

AgentService 的聊天、模型、会话/分叉、上下文和费用入口；白名单管理命令由独立 SDK 服务执行。PiSessionRuntime 维持每会话服务；句柄同步真实 sessionFile 和标题，分叉后恢复原服务分支。

2026-10-02（T07最小协议slice，reviewed continuation）：人类明确授权原跨scope图结果后，`command()` 仅扩展导入和内联allowlist为包含 `PI_OPTIONAL_RPC_COMMANDS`，接通 `get_available_thinking_levels`、`get_entries(since?)` 的公共 typed command 入口。方法支持仍来自服务 `get_state.commands/capabilities` 对实际SDK方法的检测，缺失时明确unavailable；adapter不从静态命令类型或版本号推断可用性。optional命令不加入mandatory handshake，因此旧SDK缺少方法仍能启动。`since`/原生entry/leaf数据及服务错误原样透传，未知since不回退全量历史。

`PiSdkReadCommands.test.ts` 将公共dispatch连到实际 `assets/pi/commands.mjs` handler，通过离线SDK fixture验证实时档位/空集合、增量及分支leaf、空历史、新旧方法组合的unavailable和错误拒绝。optional读取只启动普通session/catalog客户端；输入中的伪造 `type` 不能转发成配置操作，未声明命令在任何客户端启动前拒绝。安装SDK只验证内存公开读方法，不启动真实CLI/模型/凭据。本slice不扩产品UI，不代表整T07完成；完整服务握手与产品实机流程待后续验收。

发送等待完整 prompt 响应，保留原生消息 ID 和真实费用，禁止提前以 agent_end 结束。模型 setters 只写服务内存。准备阶段取消不发送 prompt；提前退出迭代后 abort，5秒后关闭无响应连接。stopSession 可结束工作台长操作。

## 验证

tests/unit/core/agents/backend/pi/，scripts/pi-sdk-acceptance.mjs，scripts/pi-rpc-smoke.mjs。只引用共享接口和 Pi 模块，不能导入其他后端实现。

2026-09-09：配置操作路由到configurationOnly进程，不构造Agent和扩展；坏模型默认值不能阻止打开配置。其他命令/历史仍由每会话服务处理。

- 2026-09-13: sendMessage 以 prependMemoryInjection（core.memory 共享契约，Pi 边界测试已加白）在 prompt 前置记忆注入块。

- 2026-09-15: 实现 `AgentAuxQueryCapability.startAuxQuerySession()`：用 Pi 原生的 `set_tools` / `get_tools` 把会话限制为只读工具并以 SDK 回读校验（fail closed）。实现见本目录的 `PiAuxQuerySession.ts`。

- 2026-09-17: UI 请求转发前先落一份状态：`setStatus` / `notify` 的文本存进适配器（`getExtensionStatus()` → `PiExtensionStatusSnapshot`），其余方法原样交给 `onUiRequest`。Pi 的 MCP 能力来自扩展而非 RPC，这是宿主机唯一能观测到的运行时状态，设置页的 Pi MCP 面板读它；FakeClient 测试覆盖上报与 `setStatus` 空文本清除该键。

- 2026-09-18 (FlowText R-B4): Obsidian 原生工具注入接缝接入——sendMessage 现在把 options.obsidianToolingInjection 以 prependObsidianToolingInjection 前缀到消息文本（记忆块之后），同一选项袋接缝。

> 2026-09-18 (R-C3)：实现 `AgentInlineCompletionCapability`——`startInlineCompletionSession()` 复用 `PiAuxQuerySession` 的 `set_tools`/`get_tools` 读回机制，经 `WarmInlineCompletionSession` 包装；capabilities 增加 `AgentCapability.InlineCompletion`。

## 2026-10-02 T07 readonly facade / UI

getAvailableThinkingLevels(sessionId?:string) 与 getSessionEntries(sessionId:string,since?:string) 复用既有 allowlisted command。sessionId 使用 plugin-local store handle，经 requireSession 映射 native file；since 使用 native entry ID。typed facade 校验返回结构，原样保留动态 level 字符串、native id/parentId/leafId 和未知节点字段，旧SDK unavailable 不变为空数据。缺 local session handle 的 entries 在派发前拒绝。

PiAdapter.uiReads.test.ts 覆盖动态 max/future strings、since/空原生历史、unavailable/failure、缺会话/坏结构。产品工作台与 Pi 模型绑定已有消费；真实 native 证据单独由 native-t12 提供，此 worker 未运行付费模型。

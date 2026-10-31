# PiAdapter
> 2026-09-21 (advantage-parity R-F7)：PiAdapterOptions 新增 `getExtraEnv`，经既有 options 透传至 PiSessionRuntime → launch options。
> 2026-09-21 (advantage-parity R-F1)：新增 steerTurn——活动 run 的 RPC 客户端上发 {type:'prompt', streamingBehavior:'steer'}（忙时无此字段的 prompt 被明确拒绝并指名该参数，实证于 pi 0.86.0）；能力集声明 TurnSteering。

> 源码: src/core/agents/backend/pi/PiAdapter.ts

## 职责

AgentService 的聊天、模型、会话/分叉、上下文和费用入口；白名单管理命令由独立 SDK 服务执行。PiSessionRuntime 维持每会话服务；句柄同步真实 sessionFile 和标题，分叉后恢复原服务分支。

辅助查询与普通聊天共用可执行路径语义：空路径（含未提供 settings 回调）以 `''` 交给 `PiAuxQuerySession` → `PiRpcClient` 的既有官方 Pi 安装自动解析，显式路径原样透传。`PiAuxQuerySession` 的只读 `set_tools` / `get_tools` 回读校验与 fail-closed 规则保持不变。

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

2026-10-07 Pi queue history: prompt 前保存原生 entry ID 集合，收尾只将第一个新增 user ID 关联到本次 UI input；queued/steering user 不覆盖该身份，SDK command 没有新增 user 时不绑定旧 ID。getChatMessages 经既有 PiStreamMapper 提供完整规范化原生历史，供聊天收尾使用。

辅助查询与内联补全原样透传同一 live getExtraEnv 回调到 PiAuxQuerySession/RPC spawn；当前 provider domain 环境在启动时读取，严格工具 allowlist/native readback 保持。

Registered extension commands that complete successfully without an assistant turn receive a local command-completed status. Command registration and native prompt success are both required; unknown/failed commands are never promoted to success. Final message metadata is emitted only for an assistant entry created by the current send, preventing a previous turn identity from binding to a command status.

Command confirmation text is formatted by an injected host callback; direct consumers receive a plain English fallback. PiAdapter retains the existing shared-contract-only isolation boundary.

Bundled Pi service forwards modern ModelRuntime OAuth LoginOptions.getDeviceId from the configured installation SettingsManager; minimum AuthStorage login remains unchanged. Auth ACK is separate from browser authorization and credential activation.

## 2026-10-28：原生命令与技能弹框

原生 slash 命令和 /skill:name 保留首 token 与原始参数，不把 memory/tooling 前缀混入命令参数；普通提示继续注入上下文。get_commands 返回的 extension、prompt 与 skill 来源由聊天目录保留。
## 2026-10-29：会话引用只读路径

`getPromptReferenceMessages(id)` 使用 `runtime.getExisting(id)`，仅从已经驻留的来源服务读取原生 `get_messages` 有效分支。该入口不会创建服务、恢复／切换来源会话；未驻留或读取不可用时返回 null，统一层可明确记录插件缓存快照的来源。

## Goal 与会话工作台（2026-10-30）

统一 Goal 接口由具名 @narumitw/pi-goal 0.54.x 桥驱动，catalog runtime 先探测是否实际加载；未加载扩展不可预备新目标。get_goal/control_goal 和 goal_update 边界持续读回，不安装或启用用户扩展。

## 会话信息面板（2026-10-31）

get_resources 的实际 agentsFiles 作为后端已加载上下文来源，仅返回路径/标签，不暴露提示词全文，也不把可用 skill 目录当作已注入来源。未有标准扩展读回的套餐、MCP、子智能体保持未报告。

get_session_stats 同时提供原生 tokens.total（累计，包含缓存类别）和 contextUsage（当前窗口）；两组数独立返回，不能将累计数写入 context。

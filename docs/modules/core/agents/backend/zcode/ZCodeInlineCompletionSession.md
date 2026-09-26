# ZCodeInlineCompletionSession

> 源码: `src/core/agents/backend/zcode/ZCodeInlineCompletionSession.ts`

## 职责

实现 ZCode 的**仅文本**内联补全会话。它复用 OpenCodian 已拥有且已启动的官方 `app-server` 连接，但每次补全都调用 `workspace/generateText`，不调用 `session/create` 或 `session/send`：因此不会在聊天列表、会话历史或标题路径留下原生会话。Adapter 已声明 `InlineCompletion`；速度随模型变化，超过共享 4 秒预算时按取消处理。

创建时必须用实时 ZCode 模型目录验证 provider、model 与 `reasoningLevel`；无效模型或推理档位在发出请求前拒绝。每回合传递完整 system/user 文本、显式 `tools: []`、稳定的 `operationId` 与小输出上限；小于 64 token 的上限会被当前提供商拒绝，因此短补全也至少请求 64 token，显示层仍按字符数截断。官方响应的 `toolCalls` 原样归一为补全层审计输入。取消只调用同一 operationId 的 `workspace/cancelGenerateText`，不停止任何聊天会话。

安全证据的边界必须如实保留：官方实现会将 `tools: []` 交给直接模型调用，因此它是请求出站和运行时源码的约束；但协议没有每请求“实际生效工具清单”的原生读回，不能把该请求字段填写成通用辅助查询所需的有效工具读回。真实 `krill/gpt-6-sol` 探针返回 `ZCODE_INLINE_OK`、`toolCalls: []`，且 `session/list` 为 `0 → 0`，只证明该一次无会话、未观测到工具调用的文本回合。该模型耗时 **5,703ms**，超过共享 4 秒预算；另一个提供商模型的直连请求约 1.6 秒成功。现有产品路径保持 4 秒预算，慢模型诚实取消。

另一次真实 `opencode-go/gpt-5.6-luna` 直连请求在约 1.6 秒返回 `RED`，说明该路径可用，但速度随模型和提供商变化；完整产品验收仍需在 Obsidian 编辑器中执行。每回合遵守统一的 `INLINE_COMPLETION_TURN_TIMEOUT_MS`（4 秒）生成预算。超时后发送同一 operationId 的原生取消，并最多等待 1 秒 ACK；ACK 缺失时如实按“取消请求未获确认”降级为本地取消结果，绝不等 app-server 的通用 15 秒请求超时。迟到的原生生成结果已有 rejection/resolve 处理且被忽略；不会取消任何其它 ZCode 回合。

这是连接预热而不是持久化会话预热：`reset()`/`dispose()` 只取消在途直接模型请求，因协议面没有需要关闭或删除的 native session。它**不**实现通用辅助查询；后者仍要求图片回合和可审计的通用只读边界。

## 依赖与边界

- `AgentInlineCompletionCapability`：复用统一的光标 prompt、结果与安全证明形状。
- `ZCodeModelCatalog`：只接受实时目录验证后的模型/推理档位。
- 官方协议仅通过 `workspace/generateText` 与 `workspace/cancelGenerateText` 访问；不得退回 `session/send`，后者会物化会话历史。

## 验证

`tests/unit/core/agents/backend/ZCodeInlineCompletionSession.test.ts` 覆盖 `tools:[]` 的出站形状、完整模型/推理映射、无 session 路由、原生 operationId 手动/超时取消、无 ACK 的 1 秒上界、快速触发的串行化、失败脱敏与 reset/dispose 无会话调用；它不能替代上述真实产品时延或有效工具清单读回证据。

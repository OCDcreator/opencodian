# Claude Code Queue

> **源码**: `src/core/agents/backend/ClaudeCodeQueue.ts`
> **状态**: [ACTIVE]

## 概述

为 Claude Code 持久查询提供异步队列和运行时辅助类型。`ClaudeCodeAsyncQueue` 是一个单消费者异步迭代队列，用于将用户提示送入持久 SDK 查询并将 SDK 消息传回适配器的流式生成器。

## 导入关系

上游: `ClaudeCodeStreamNormalizer`（类型引用）
下游: `ClaudeCodeAdapter`

## 核心类型

| 类型 | 说明 |
|------|------|
| `ClaudeCodeQueuedPrompt` | 入队用户消息结构 |
| `ClaudeCodeRuntimeOutput` | 运行时输出事件（message / error） |
| `ClaudeCodeSessionRuntime` | 会话运行时状态（input queue、output queue、normalizer、abort controller、当前 effort、query handle） |

## 核心导出

| 导出 | 说明 |
|------|------|
| `ClaudeCodeAsyncQueue<T>` | 单消费者异步迭代队列，支持 push / close |
| `createSessionId()` | 生成 `claude-code-{timestamp}-{random}` 格式的会话 ID |
| `createUserPrompt()` | 构造标准用户消息结构 |
| `isTurnBoundaryMessage()` | 判断 SDK 消息是否为 result 边界 |
| `isPromptSuggestionMessage()` | 判断 SDK 消息是否为 prompt_suggestion 类型 |

## 注意事项

- 队列在关闭后不再接受新消息，已排队的等待者会收到 `done: true`。
- `ClaudeCodeSessionRuntime.effort` 记录创建当前 SDK query 时使用的 Claude Code effort；adapter 用它判断 composer effort 变化时是否需要重启 resumed query。
- `ClaudeCodeSessionRuntime.query` 是 Claude SDK `Query` 的窄类型，只列出 adapter 会用到的控制方法：`interrupt`、`setModel`、`setPermissionMode`、`setMcpServers`、`rewindFiles`、`supportedModels` 和 `close`。`setMcpServers` 与 `rewindFiles` 返回值按 SDK 的结果对象处理为 `Promise<unknown>`，调用方不假设具体结构。
- `interrupt` 返回值同样按 `Promise<unknown>` 处理（2026-09-02，SDK 0.3.252 起 `Query.interrupt()` 解析为 `SDKControlInterruptResponse | undefined`——带 `interrupt_receipt_v1` 能力的 CLI 会返回 still-queued 异步消息回执）。插件侧丢弃回执（`void ...interrupt?.()`），不假设具体结构。
- 从 `ClaudeCodeAdapter` 提取以控制文件行数，不影响公共 API。

## 图片消息约定（2026-07-22）

- `ClaudeCodeQueuedPrompt` 继承官方 `SDKUserMessage`，故每条用户消息都显式携带必填的 `parent_tool_use_id: null`。
- `createUserPrompt(prompt, images)` 在纯文本时保留 SDK 的字符串 content 快路径；有图片时生成 base64 `image` content blocks，空文字加图片则只发送图片数组。
- 队列只序列化 composer 已读取完成的 JPEG、PNG、GIF 或 WebP base64 数据，不读文件、不负责 UI 预览。

## 2026-09-02 SDK 0.3.252 消息谓词

- 新增 `isConversationResetMessage` / `isCommandsChangedMessage` / `readConversationResetId`：分别识别顶层 `conversation_reset` 消息（CLI 把会话移到新 id）、`system/commands_changed`（slash 命令目录变化），供 adapter pump 侧在消息进入流消费者前做身份重映射与订阅通知。
- 2026-09-08：活动 query 兼容形状新增 `reloadSkills?: () => Promise<unknown>`，供设置页在资源写入后原地刷新；旧 CLI 拒绝由设置 owner 退回 runtime restart。

## 2026-10-02 T08：两项新增 control 的 SDK 派生契约

- 基线固定为官方 `@anthropic-ai/claude-agent-sdk@0.3.283/sdk.d.ts`，query 可选成员新增 `setMcpPermissionModeOverride?: Query['setMcpPermissionModeOverride']`、`reloadOutputStyles?: Query['reloadOutputStyles']`。用可选成员表达旧 runtime 缺方法，签名与结果直接派生官方 `Query`，不扩大为 string/unknown/void。
- `ClaudeCodeMcpPermissionModeOverride` 精确等于 `'default' | 'auto' | null`；只有 null 清除 override。SDK 的 tighten-only 语义与 warning 处理见 adapter 模块页的固定 source 说明。
- `ClaudeCodeSessionControlResult<TResponse>` 是 adapter 两项 native controls 使用的显式结果契约：`acknowledged` 必有 `nativeSessionId` 和 native `response`；`unavailable` 原因为 invalid-native-session-id/no-active-session/missing-method；`failed` 原因为 invalid-input/request-failed/invalid-response/session-changed。两项专属结果类型从官方方法 ReturnType/Awaited 派生。
- ACK 不是 effective-setting 或 prompt-application proof；styles 返回的只有 `available_output_styles: string[]`。这些类型不持有 session、状态、override map 或任何 runtime ownership。
- 初轮仅改类型并因 class gate 停止；用户随后授权 reviewed continuation，adapter 两项 public controls 和 private native selector 已落地。完整图证据、授权边界、运行行为与负向回归见 [ClaudeCodeAdapter](./ClaudeCodeAdapter.md)。沿用既有 persistent query，不创建外部 runtime helper 或新的状态 owner。
- 聚焦负向类型回归：`tests/unit/core/agents/backend/ClaudeCodeQueue.controlContracts.test.ts`。聚焦 Jest 启动显式 TypeScript noEmit 语义检查（不依赖 isolatedModules 转译）验证 `@ts-expect-error`：widening/undefined mode、non-callable 方法、void ACK、错误 warning/names 与虚构 promptApplied 均不得编译。该测试本身只证明 source/type contract；adapter 行为另由 `ClaudeCodeAdapter.sessionControls.test.ts` 验证。无需真实 CLI/model/config；两类 mock pass 均不能计成真实 CLI/runtime 或 UI pass。

本轮验证：`node scripts/run-jest.js --runTestsByPath tests/unit/core/agents/backend/ClaudeCodeQueue.controlContracts.test.ts` **9/9 pass**；显式 noEmit semantic check 使用 `strictNullChecks: true` 并验证全部 11 条有效负向指令。最初的 unused directive 位于说明性注释第 18 行（误以 `// @ts-expect-error cases...` 开头），已改普通说明；未删除有效断言或放宽响应类型。两个改动 TS 文件的聚焦 ESLint 为 **0 errors / 0 warnings**。

按要求执行了全共享树 diff 管道 CodeGraph affected（33 changed files / 1,673 traversed dependents），并单独检查 Queue（1,670 traversed dependents）；两次均返回 904 个 affected test paths。这是旧 snapshot 的传递依赖集合，不能替代 method/class 有限 depth gate，也不表示这些 tests 已运行。新的测试文件尚未进入 snapshot；统一 sync/freshness 与整合门禁由主代理负责。

2026-10-02 reviewed continuation：Queue 的现有 SDK 精确类型无需进一步放宽或变更，adapter 直接消费。新增 runtime-contract 回归涵盖 native target/missing-method/unchecked input/malformed response/await 生命周期变化和其它 session 零 dispatch；统一整合 graph refresh/verify 留给主代理。

reviewed continuation 聚焦验证：`ClaudeCodeAdapter.sessionControls.test.ts` + `ClaudeCodeQueue.controlContracts.test.ts` + 既有 `ClaudeCodeAdapter.test.ts` 合计 **284/284 pass**；专属 types 保持精确 SDK 签名，未放宽响应类型。局部 ESLint 0 warnings、四文件 noEmit 0 diagnostics；真实 CLI/effective-permission/prompt/UI 尚未验证。

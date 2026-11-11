# backend/diagnostics/DshSessionTraceService

> **源码**: `src/core/agents/backend/diagnostics/DshSessionTraceService.ts`
> **状态**: [REVIEW]

## 概述

DSH（DeepSeek Harness）wire-trace owner。与 Codex/Claude trace service 同构：`TraceStore` 持久化 + `TraceRedactor`（hardened）+ `TraceReportBuilder`，`runStartEventName` 固定为 `turn.started`，bundle 前缀 `dsh-trace`。本轮契约刻意收窄：**只有元数据、生命周期与真实计时**——没有 deep capture、没有任何 raw content 采集开关；prompt/credential/config 原始载荷永远不进 buffer 或报告。

会话绑定、turn 生命周期与事件账本完全由 wire 记录自驱（`DshAcpClient` 注入的 observer 是唯一数据缝），DshAdapter 无需任何 trace 调用。`session/prompt` 请求-响应对派生 `turn.started`/`turn.finished`，`metrics.clientRoundTripMs` 是**客户端观测的 RPC 往返**（request 写入 → response 解析的墙钟）；模型执行耗时无来源，任何路径都不编造。`session/update` 通知按 `sessionUpdate` 白名单投影，chunk 类事件名带 `.delta` 后缀以复用 store 压力合并；`backendTimeMs` 只有当 update envelope 真带 `time` 字段才记录（本轮 native 侧尚未提供，全部时间为 client-observed）。

Native 与 ACP 传输分别由 `DshSessionTraceSettings.nativeEnabled` / `acpEnabled` 门控；事件按 `transport` 标签路由。dead 标记按 `sourceId@generation` 记录最近一次 connection `closed`/`error` 的 client 代：死代的迟到记录直接丢弃，同代的 `starting`/`connected` 不能使其复活，只有新一代 client 的显式 `starting` 才登记新源，断线后不可能写入新 session。transport 终止时未决 prompt turn 以 `state: 'incomplete'` 收尾、不带合成时长。

## 公开接口

- `recordWireEvent(record: DshWireRecord)`：`DshAcpWireObserver` 入口（`DshTracePort` 继承该契约）。
- `readSessionLedger(sessionId)` → `DshTraceLedgerSnapshot | null`：按显式 sessionId 读取账本（上下文模态入口；未知 session 返回 null）。
- `resolveTraceId` / `getStorageStatus` / `listRecentTraces` / `buildSmartReport` / `exportTrace` / `clearAll` / `dispose`。
- `projectDshTraceLedger(events)`（导出纯函数）：把存储事件投影为可读账本——turn/tool/usage/approval/connection 行为主；wire RPC、chunk delta、config push 只计入 `timing.eventCount` 不进账本行。tool span 只在显式 `completed`/`failed` 终端状态配对（两端共享 session id 与 toolCallId，按 client 到达时间，跨度 ≤30 分钟）时计算，缺一端或非终态为 unknown。

## 注意事项

- 双层凭据擦除：client 侧 `extractDshSessionUpdateDetail` 已擦 `sk-`/bearer/JWT 形态，service 在 `sanitizeWireDetail` 对全部 detail 字符串再擦一次；不信任 client 时代。
- 账本行 `timeSource` 恒为 `client`（客户端观测）；tool span 仅在显式 `completed`/`failed` 终端状态配对时计算；RPC 成功只记 `response-received` 客户端收据、不推断执行成功。UI 文案不得把 RPC 往返称为后端执行时间。
- detail 白名单逐字段固化在 `DshAcpClient.extractDshSessionUpdateDetail`；`rawInput`/`content`/`arguments` 等载荷字段被刻意省略。
- stderr 完全不采集（省略优于事后脱敏）；title／reason／raw error 等自由文本不在任何采集路径，错误只记固定分类 + 数值 `errorCode` + 严格 `stopReason` 枚举（未知值不 trace）。
- 身份与容量（按语义分类，均为本 service 实例内的边界）：wire 记录携带 client 的 `sourceId@generation`，pending/session/dead 簿记按该身份隔离。
  - 保护状态，不逐出：per-trace 预算表（`MAX_BUDGET_ENTRIES` 1024）满即 fail-closed 拒绝新 trace，不淘汰已有预算（否则已封顶的 trace 会悄悄重新计数）；source 登记表（`MAX_SOURCE_REGISTRATIONS` 1024）只由显式 `starting` 边界登记，已 closed 的同代 `starting`/`connected` 都不重开，未登记源拒收，表满拒新源并写一次性 `trace.source_registry_limit`；dead 墓碑不逐出（受 source 登记总上限约束）。
  - 可逐出缓存：open turn、server request（各 1024）与 session 绑定缓存（512）超限淘汰最旧；session 绑定淘汰只丢缓存，store 索引仍在。
  - 采集预算：每 trace 2000 事件，超限写单条 `trace.session_limit` 标记后该 trace 停采；全部 trace 合计 40000 事件，超限写单条 `trace.capture_limit` 全局标记后全部停采；从既有 summary seed 预算时不重复追加标记。
  - 呈现与读取：global/source/budget 任一表满或预算封顶在账本以 `limited` 呈现（会话无可解析 trace 时返回空行 + limited）；summary 事件数 >8000 时 `readSessionLedger` 拒读全量历史、只报已知 summary 计数。
  - gate 关闭时：生命周期登记与 dead 标记仍在有界内存中进行，事件行不落盘。
  - 边界声明：这不是跨运行的永久磁盘硬上限，持久历史的保留仍以既有共享 `TraceStore` 策略为界。非交互 wire 轮询/控制读取不落盘。
- 状态：源码已成型冻结交独立复核，安全 PASS 与宿主验收待完成；review 如有 fix 再更新。
- 失败隔离：`recordWireEvent`/`emit` 全程 try/catch，trace 故障不得影响聊天路径。

## 焦点测试

- `tests/unit/core/agents/backend/diagnostics/DshSessionTraceService.test.ts`：turn 生命周期、单端不编造、native/acp 独立门控、parent/child 会话按真实 id 分离、死传输迟到记录、incomplete 无合成时长、控制读取与 content 不进 buffer、按 sessionId 读账本。
- `tests/unit/core/agents/backend/DshAcpClientTraceHooks.test.ts`：wire 记录白名单与往返计时、无 hook 零行为变化。

## 目录定位（2026-11-10）

- 源码位置：`src/core/agents/backend/diagnostics/DshSessionTraceService.ts`。
- wire 记录与 observer 契约：`src/core/agents/backend/dsh/DshAcpClient.ts`（传输 owner）。

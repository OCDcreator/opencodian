# AgentAuxQueryCapability

> **源码**: `src/core/agents/backend/AgentAuxQueryCapability.ts`
> **状态**: [REVIEW]

## 概述

定义 backend 无关的**一次性只读辅助查询**能力接口。聊天通道（`AgentChatCapability.sendMessage`）会进历史、触发标题生成与同步事件，语义上不适合 inline edit 这类"插件自己写回、模型只负责生成"的场景，因此新增独立能力。

方案见 `docs/requirements/inline-edit.md` §5。

## 职责

- 声明 `BackendModelSelection`：按 backend 归一化的模型引用（opencode/pi 为 provider+model，claude-code 为 SDK alias 或完整 id，codex 为 model+可选 effort），避免强行统一成一种结构而丢信息
- `AuxQuerySessionConfig.effort`：backend 原生努力程度（claude `low..max`、codex `minimal..persistent`），无 effort 接缝的后端忽略；adapter 层对非法值 fail loudly
- 声明短生命周期会话 `AuxQuerySession`：`query` / `followUp` / `cancel` / `dispose`，澄清循环建立在同一原生会话上
- `AuxQueryTurnRequest`（R-A3/R-A4）：`onTextChunk`（累计文本流式回调，逐 token 或逐回合发射）+ `images`（`AuxQueryImageAttachment[]`，base64 不带 data-URL 前缀，媒体类型白名单 png/jpeg/webp/gif；后端不支持图片时必须拒绝该回合而不是静默丢图）
- 声明 `AuxQueryImageAttachment`：与聊天侧 `ImageAttachment`（`src/core/types/chat.ts`）同形，四后端复用聊天序列化，不维护第二套
- `AuxQuerySession.supportsImages`：会话级图片传输能力声明；`false` 让服务层给出明确的能力缺失提示而非降级
- 声明运行时安全证明 `AuxQuerySafetyProof`：`enforcedPolicy`、`effectiveTools`（来自后端原生枚举/配置回读，**不是**请求参数）、`deniedCapabilities`、`mechanism`
- 声明 `AgentAuxQueryCapability.startAuxQuerySession()`：无法运行时证明只读时必须 reject（fail closed）
- 提供 `findWriteToolCalls()`：按名称/kind 判定写类工具调用，供服务层在 `AuxQueryResult.toolCalls` 上做审计
- 导出 `AUX_DENIED_CAPABILITIES`（write/edit/patch/shell/mcp/package/subagent）作为四后端统一的 denied 集合

## 依赖

- `src/core/types/chat.ts`：`AgentBackendKind`
- `./AgentService`：`AgentService` 基接口

## 维护约束

- 该接口是可选能力，调用侧必须先用 `AgentCapability.AuxQuery` + 类型守卫收窄，不要修改 `AgentService` 本体
- `effectiveTools` 语义是"运行时回读到的生效事实"，禁止用请求里发出去的参数填充
- 新增写类工具模式时同时更新 `WRITE_TOOL_PATTERNS` 与本文件说明
- 四个 adapter 都必须实现 `startAuxQuerySession`，这是 inline edit 的验收硬指标；缺实现时调用侧置灰而不是降级

> 2026-09-18 (R-C3)：`AuxQuerySessionConfig` 新增**可选** `turnTimeoutMs`（默认不变，各后端仍为 180s），供补全等低延迟调用方显式缩短回合预算；aux 契约其余语义（fail-closed、每次编辑新建、退出即 dispose）一字未改。

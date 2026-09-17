# OpenCodeAuxQuerySession

> **源码**: `src/core/agents/backend/auxiliary/OpenCodeAuxQuerySession.ts`
> **状态**: [REVIEW]

## 概述

在 `OpenCodeAuxScope` 的隔离实例上实现 `AuxQuerySession`：每个 inline edit 一个原生 session，`dispose()` 时删除。

## 职责

- `create()`：启动/复用 scope，取其验证结果构造 `AuxQuerySafetyProof`（`effectiveTools` = scope 回读到的只读工具），创建原生 session
- `query()`：`POST /session/{id}/message`，body 含 `agent`（隔离 scope 中的只读 agent）、`system`（aux 系统提示词）、`model`（opencode 归一化引用）、`parts`；图片附件（R-A4）按聊天侧 `OpenCodeContextPartSerializer` 的 `file` part 形态（`mime` + `data:` URL）追加在文本 part 之后，纯内存传输不落盘
- 回合前后各读一次 `GET /session/{id}/message`，用差集提取本回合的助手文本与工具调用，写入 `AuxQueryResult`；工具调用是 §5.5 审计的输入
- `followUp()`：同一原生 session 上继续一轮，复用后端的原生会话状态
- `cancel()`：`AbortController` + `POST /session/{id}/abort`
- `dispose()`：`DELETE /session/{id}`，清理原生残留
- 会话 `directory` 始终取自 scope 的私有会话目录，不落在 vault

## 依赖

- `./OpenCodeAuxScope`：隔离实例与 scope URL 约定
- `../AgentAuxQueryCapability`：接口与 denied 集合
- `src/shared/logger.ts`

## 维护约束

- 所有请求必须走 `scopeUrl()`，保证 `directory` 作用域不被绕过
- 单会话串行：同一时刻只允许一个回合在跑，重复调用返回错误而不是排队
- `dispose()` 幂等；`cancel()` 只取消当前回合，不销毁会话（澄清循环需要会话存活）
- 工具调用只从**消息历史**读取（同步响应只含最后一条助手消息的分片），改动观察通道前先确认 M1 审计仍然通过

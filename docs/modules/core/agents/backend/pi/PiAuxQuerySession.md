# PiAuxQuerySession

> **源码**: `src/core/agents/backend/pi/PiAuxQuerySession.ts`
> **状态**: [REVIEW]

## 概述

在 Pi RPC 协议上实现 `AuxQuerySession`。Pi 提供会话级 active-tool allowlist（`set_tools` / `get_tools`），因此只读约束是 SDK 原生机制，而不是提示词降级。

## 职责

- 在系统临时目录创建会话作用域，直接用 `PiRpcClient` 启动（不经过插件的 `PiSessionStore`），使辅助会话不出现在插件会话列表、也不在 vault 落 `.pi` 残留
- 校验 `serviceProtocol`，`new_session` 后取 `get_tools` 的原生工具目录，与只读候选集（read/grep/find/ls/glob）求交集
- `set_tools` 下发白名单，再用 `get_tools` 回读 `active`：必须与白名单**完全一致**，且不得残留任何写类工具（bash/powershell/edit/write/patch/task 等），否则拒绝会话（fail closed）
- `query()` / `followUp()`：把系统提示词拼在首轮消息前（Pi 没有 system 接缝），`prompt` 后取 `get_last_assistant_text`
- 通过订阅 `tool_execution_start` 事件收集本回合实际发起的工具调用，供服务层审计
- `cancel()` 发送 `abort`；`dispose()` 关闭客户端、等待文件句柄释放后删除临时作用域

## 依赖

- `./PiRpcClient`：`PiRpcClient`、`piRecord`、`PiRpcPort`
- `../AgentAuxQueryCapability`、`src/shared/logger.ts`

## 维护约束

- `get_tools` 的回读结果是该 backend 的运行时证据；`safety.effectiveTools` 必须来自它，禁止用请求白名单填充
- 若某个 Pi 版本不再暴露任何只读工具，会话直接拒绝；**不要**回退成"提示词约束 + 结果校验"
- 临时作用域与会话文件在 `dispose()` 后必须消失；Pi 关闭进程后文件句柄可能短暂占用，删除前保留等待
- 该模块属于 `core.backend-pi` owner 的目录，新增跨 backend 依赖需先更新 `PiBoundaryContract` 允许列表并说明理由

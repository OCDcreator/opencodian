# PiAdapter

> 源码: src/core/agents/backend/pi/PiAdapter.ts

## 职责

AgentService 的聊天、模型、会话/分叉、上下文和费用入口；白名单管理命令由独立 SDK 服务执行。PiSessionRuntime 维持每会话服务；句柄同步真实 sessionFile 和标题，分叉后恢复原服务分支。

发送等待完整 prompt 响应，保留原生消息 ID 和真实费用，禁止提前以 agent_end 结束。模型 setters 只写服务内存。准备阶段取消不发送 prompt；提前退出迭代后 abort，5秒后关闭无响应连接。stopSession 可结束工作台长操作。

## 验证

tests/unit/core/agents/backend/pi/，scripts/pi-sdk-acceptance.mjs，scripts/pi-rpc-smoke.mjs。只引用共享接口和 Pi 模块，不能导入其他后端实现。

2026-09-09：配置操作路由到configurationOnly进程，不构造Agent和扩展；坏模型默认值不能阻止打开配置。其他命令/历史仍由每会话服务处理。

- 2026-09-13: sendMessage 以 prependMemoryInjection（core.memory 共享契约，Pi 边界测试已加白）在 prompt 前置记忆注入块。

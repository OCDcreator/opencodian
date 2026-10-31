# BackendGoalRuntime

> 源码：`src/core/agents/backend/BackendGoalRuntime.ts`
> Owner：core.backend

## 职责与边界

后端目标投影的共享类型与缓存。定义来源、能力、状态、执行阶段、计量、控制结果和事件；每会话控制串行，独立会话互不阻塞。版本计数阻止慢快照覆盖新事件；失败保留旧目标。绝不启动 continuation。测试 BackendGoalRuntime.test.ts。

## 验证

聚焦测试、类型检查、lint、模块文档与图刷新均为修改期门禁。真实模型/宿主行为验收见 `.scratch/goal-agent-workbench-20261030/evidence/`；未验收能力不得由单测替代。

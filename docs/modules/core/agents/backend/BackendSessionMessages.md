# BackendSessionMessages

> 源码：`src/core/agents/backend/BackendSessionMessages.ts`
> Owner：core.backend

## 职责与边界

将 Claude/Codex/ZCode/Harness 原生会话记录映射为稳定 ChatMessage。保留 native ID、turn ID、文本、thinking、工具调用结果和图片，支持首轮完成后的自动轮对账。与前台流状态分离，不推断目标完成。测试 BackendSessionMessages.test.ts。

`preserveGoalIntentMessages` 保留 `opencodian_goal_intent` 用户消息。原生 Goal 命令仅写入助手回复时，按原有相邻消息位置插回；存在同一用户项时保留标记并去重，不保留普通的过期消息。

尊重原生消息和 part 的 `semantics.uiVisibility`、`semantics.transcriptVisibility` 以及 `visibility/model-only` 标记，不把内部环境和 Goal continuation 注入显示为用户消息。可见的系统控制事件仍显示。

## 验证

聚焦测试、类型检查、lint、模块文档与图刷新均为修改期门禁。真实模型/宿主行为验收见 `.scratch/goal-agent-workbench-20261030/evidence/`；未验收能力不得由单测替代。

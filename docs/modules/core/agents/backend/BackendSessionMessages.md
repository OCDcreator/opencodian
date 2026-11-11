# BackendSessionMessages

> 源码：`src/core/agents/backend/BackendSessionMessages.ts`
> Owner：core.backend

## 职责与边界

将 Claude/Codex/ZCode/Harness 原生会话记录映射为稳定 ChatMessage。保留 native ID、turn ID、文本、thinking、工具调用结果和图片，支持首轮完成后的自动轮对账。与前台流状态分离，不推断目标完成。测试 BackendSessionMessages.test.ts。

`preserveGoalIntentMessages` 保留 `opencodian_goal_intent` 用户消息。原生 Goal 命令仅写入助手回复时，按原有相邻消息位置插回；存在同一用户项时保留标记并去重，不保留普通的过期消息。

尊重原生消息和 part 的 `semantics.uiVisibility`、`semantics.transcriptVisibility` 以及 `visibility/model-only` 标记，不把内部环境和 Goal continuation 注入显示为用户消息。可见的系统控制事件仍显示。

可选的逐消息模型来源（2026-11-10）：适配器可从消息自身记录的路由设置 `recordedModelId`（DSH：`sourceKind==='model'` 的助手消息经 `sourceProvider`/`sourceModel` 编码，与实时回合 `formatModelId` 同格式）。投影只在 wire role 为 `assistant` 且值非空白时输出 `modelId`，值原样保留；tool/activity/user 转录永不因此获得模型标签。来源缺失或空白时输出对象完全没有 `modelId` 键——权威合并把投影展开到本地消息上时，本地已知的 modelId 得以保留，不会被 `modelId: undefined` 抹掉。绝不从当前会话选择或相邻消息回填。

图片块合同（2026-11-10）：`consumeImage` 接受 `{type:'image', mimeType|mediaType, data}` 与 Claude 形状 `{type:'image', source:{media_type, data}}` 两种形状，mediaType 白名单为 png/jpeg/gif/webp；`data` 非字符串或缺省的块（如 DSH 桥接的 `unavailable` 标记）静默不进 `images`。DSH 桥接提供的顶层 `name` 透传为 `ImageAttachment.filename`（加性字段，Claude 形状无 `name`，行为不变）——渲染侧用作 alt/预览标题。不可用图片由 adapter 转为占位文本后按普通文本投影。

## 验证

聚焦测试、类型检查、lint、模块文档与图刷新均为修改期门禁。真实模型/宿主行为验收见 `.scratch/goal-agent-workbench-20261030/evidence/`；未验收能力不得由单测替代。

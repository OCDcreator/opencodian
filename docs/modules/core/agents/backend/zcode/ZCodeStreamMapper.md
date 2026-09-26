# ZCodeStreamMapper

> 2026-09-24（续做）：`readZCodeContextUsage` 从同一原生会话的 `session/read` projection 与 `session/usage` 构造快照；必需计数缺失时返回 null，成本始终不伪造。模型身份优先取最后一条助手消息的原生 `info.model`，避免尚未发送的选择覆盖实际用量身份；尚无助手消息时才取原生当前模型。

> 2026-09-24 (票 05)：工具/后台/用量映射扩展——`model.streaming` 的 `tool_input_delta`（流式输入→tool_progress）与 `tool_call`（终稿 input 按 toolCallId 入库）；`tool.updated` 五 kind：scheduled→`tool_use`（getToolIdentity 身份 + 追踪 input + 全原生 toolMetadata）、started→tool_progress、result→`tool_result`（isError 终态）+ 完成/失败进度（duration 与 perf.totalMs 双证据）、error→脱敏的失败终态（不显示可能含路径的原生错误详情）、batch→informational；`session.updated` 的 `{taskId, taskKind, status, toolCallId...}`→`background_tasks_changed`（稳定 taskId、仅告知、绝不覆盖前景回合状态）；终稿消息快照 `{contextWindow, usage, stopReason}` 记账后于 turn.completed 发 `context_usage`（仅原生证据，`totalCost: null` 绝不制造 $0，无快照则不发）。part.delta 的 field:input/output 改走独立 tool_progress 通道（不再丢弃，与文本去重互斥解耦）。

> 源码: src/core/agents/backend/zcode/ZCodeStreamMapper.ts

## 职责

把官方 ZCode `session/event` 负载映射到既有后端中立 `StreamChunk` 契约（唯一认识 ZCode 事件封装的模块）。映射：`turn.started` → `message_start`；`model.streaming`（`kind: text_delta|reasoning_delta`）→ `text`/`thinking`；`part.delta`（`field: text|reasoning`）→ `text`/`thinking`（tool IO 字段留给工具面票）；`turn.completed` → 未流式时回填 `response` + `usage`（token/缓存计数如实映射，provider/model 身份缺失留空不臆造）；`turn.failed` → 结构化 `error` 块。

顺序规则保证部分输出不重复：`seq` 单调去重（迟到/乱序丢弃并计数）；回合内 delta 通道互斥（`model.streaming` 与 `part.delta` 择一，另一通道计入 ignored）；终结后到达的帧一律忽略，不重开流。未知事件类型零输出容忍。

## 验证

tests/unit/core/agents/backend/ZCodeStreamMapper.test.ts：delta 映射、seq 去重、通道互斥、part 通道独立可用、终结用量映射（不回显已流文本）、无流式回填、结构化失败归一、终结后迟到帧忽略、未知事件容忍、封装归一化。

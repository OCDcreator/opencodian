# TitleGenerationService

> **源码**: `src/features/chat/services/title/TitleGenerationService.ts`
> **状态**: [REVIEW]

## 职责

拥有六后端会话标题生命周期、来源、生成取消、限时、提交校验和标题写入顺序。视图仅组装调用并刷新标签和 rail，不再自行拥有模型执行、原生同步或标题优先级。

## 流程

1. 首条消息以本地规则标题立即展示；已有人工／导入标题保留。图片首发无文本使用附件标签。规则标题不写回原生，避免把未命名会话提前改成 custom、抑制原生标题生成。
2. AI 开关开启时先读取所属后端 session 标题。OpenCode 2／Claude／ZCode／DSH 等最多轮询 12 次、间隔 1.5 秒；每次读回有 2 秒预算，Pi／Codex 没有已接入的原生自动生成入口，只读一次。
3. `readBackendSessionTitleSnapshot` 保留原生 generated/custom/native/unknown 来源；first_input、默认占位与未知来源的首条输入预览不算生成完成。消费原生显示标题不声称它一定由 AI 生成。
4. 原生不可用时调用 `TitleModelResolver`；OpenCode 2 走无聊天会话的 `generate.text`，其他五后端走所属适配器的隔离只读 `startAuxQuerySession`。旧 OpenCode 只保留已有会话兼容路径，不是其他后端的回退服务。
5. 辅助模型选择、启动和查询合计 45 秒预算，aux 单轮 30 秒；传递取消信号并检查 runtime safety proof 和 observed tool calls。写类工具、MCP、空结果、超时和调用错误都失败关闭，保持规则标题。
6. 优先解析 JSON `title`，兼容纯文本首行，清理前缀、引号、末尾标点并按 Unicode 码点限长。输入最多 600 码点。模型响应是数据，不执行响应中的工具指令。
7. 成功提交前再读取一次原生标题；失败后有有限的迟到原生读回窗口，仍为 rule 来源时可更新。人工标题始终优先。

## 状态和并发

`Conversation.titleState` 和 metadata sidecar 持久化 `source`（rule/native/ai/manual）、`revision`、请求选模及选模来源、失败原因。native 只表示来自原生读回；它与可证明的 AI 生成来源分开。

- `createFallbackUpdate` / `createGeneratedUpdate` / `createRetryUpdate` 生成带 revision 的更新。
- `persistUpdate` 提交前再次核对 revision；即使人工标题与规则标题文字完全相同，代次也会阻止迟到结果覆盖。
- 本地保存和原生重命名分别按会话排队，避免慢保存／慢 rename 反向覆盖人工改名。规则与原生读回结果不再调用 rename。
- AI 辅助结果和普通人工标题先本地保存、刷新，再 best-effort 原生同步。ZCode 人工 rename 保留先原生确认、后本地保存的契约。
- 活动任务按 conversation ID 隔离；切换标签不取消，关闭视图仍 `cancelAll`。旧任务 finally 只能移除自己的 controller，不能移除后继任务。
- 历史记录失败项提供明确的重试入口；重试推进 revision 并沿用该会话记录的模型。
- 重载时 `recoverPending` 先读一次原生标题，未完成则标记 failed、保留规则标题，允许显式重试，不自动重复付费请求。
- 失去 conversation/backend 所有权时直接失败，不默认借用旧 OpenCode。
- 请求模型记录为选择／请求信息；backend 未提供最终模型读回时不把它描述为已证明的实际模型或价格。

## 依赖与边界

- `TitleGenerationPort`：标题设置、registry、conversation 读写、规则标题；旧 OpenCode 最小兼容依赖。
- `TitleModelResolver`：六种模型目录与 provider 边界的高风险依赖隔离。
- `AgentBackendRouting`：六后端原生标题与来源读取。
- `MessageSendPreparationService`：六后端首条消息入口；Claude 使用已有 autoTitle，其他后端使用 titleMode。
- `OpenCodianView`：转发更新、标签/rail 刷新、重试与重载恢复挂载。

## 验证

见 `tests/unit/features/chat/services/TitleGenerationService.backends.test.ts`、`TitleModelResolver.test.ts`、旧服务契约测试、send-preparation、storage、Codex 活跃会话标题测试，以及 `docs/status/session-title-refactor-2026-10-30.md`。

原生回合 settled 触发 readNativeTitleUpdate；重载/激活也可读回 failed 的 rule 标题。每次仅查询原生，未开启 AI 的规则模式不会被这些观察覆盖；原生更新仍通过 revision 提交。

# InlineCompletionService

> **源码**: `src/features/inline-edit/InlineCompletionService.ts`
> **状态**: [REVIEW]

## 概述

R-C3 的暖会话池（§3.2.4）：每 `backend × workingDirectory` 至多 1 个已验证只读补全会话；首个编辑器焦点预热（首个 Alt 懒启动兜底）；空闲 TTL 5 分钟 dispose；开关关闭 / 模型或笔记切换 / 插件卸载立即重建或释放。失败语义 fail-closed，绝不退化为本地伪补全。

## 职责

- `obtain()`：开关 → `resolveCompletionTarget()`（一次调用拿齐 backend/目录/model/effort/startSession 快照）→ unsupported 短路 → 命中键取会话（modelRef 或 notePath 变了即经工厂重建 = reset 语义）→ 起会话/复用 → 续 TTL
- 失败链（§3.2.6）：start 失败 → 本周期 unsupported + 如实 Notice；单回合失败静默；连续 2 次 → dispose 供下次冷启动重试；第 3 次 → 本周期 unsupported；`reportTurnSuccess` 清零计数
- `reportWriteToolViolation`：写工具命中 → dispose + unsupported + 如实 Notice（ghost 从未入文档，无损害可撤）
- `disposeAll()`：开关关闭与 `onunload` 调用；`resetUnsupported()`：新启用周期清状态
- `InlineCompletionPoolHost`：插件注入的宿主面（isEnabled / locale / maxChars / notePath / resolveCompletionTarget / buildSystemPrompt），main.ts 以 inline-edit host 桥实现（模型解析沿用 C3-Q3 优先级链）

## 依赖

- `../../core/agents/backend/AgentInlineCompletionCapability`、`../../core/agents/backend/AgentAuxQueryCapability`（类型）、`../../core/types/chat`、`../../i18n`

## 维护约束

- 池是 vault 作用域（非每编辑器一份）；「编辑器卸载」的会话处置由 TTL 与笔记切换 reset 承担，ghost 状态清理在控制器
- `unsupported` 是**周期**语义：仅重新开关功能（或重载插件）才解除，避免坏后端被反复重试
- TTL 到期必须同时清 map 条目与释放原生会话（无进程/连接泄漏）
- `notify` 是**必填**选项（生产由 main.ts 注入 Obsidian `Notice`）：§3.2.6 的如实上报消息（sessionUnavailable / unsupportedAfterFailures / writeToolObserved）全部经它送达；漏配必须编译期失败而非静默吞掉（R-C3-D1 缺陷即漏配所致），不得改回可选或加本地 Notice 兜底

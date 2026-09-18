# CanvasNodeRewriteService

> **源码**: `src/features/canvas-integration/CanvasNodeRewriteService.ts`
> **状态**: [REVIEW]

## 概述

R-C5 节点改写的只读 aux 编排（设计 §3.4）。契约纪律与行内编辑完全一致、不被削弱：唯一 AI 通道是 `AgentAuxQueryCapability.startAuxQuerySession()`（运行时可证只读）；响应复用行内编辑已审计的 `parseInlineEditResponse`（`<replacement>` 协议 = 恰为节点新内容；无标签 = 澄清）；`findWriteToolCalls` 保持阻断审计，命中即丢弃整个回合并销毁会话。服务自身永不写：只返回 preview，写入由控制器在确认弹窗之后执行。

会话生命周期：一次改写一个短命会话，`rewrite()` 的 `finally` 无条件 `dispose()`，任何退出路径不泄漏原生会话。

## 关键导出

| 导出 | 说明 |
|------|------|
| `CanvasNodeRewriteService.rewrite(input)` | 请求构建 → 会话 → 回合 → 审计 + 解析 → preview/clarification/error |
| `buildCanvasNodeRewriteRequest(input)` | `<canvas_node path nodeType>` 块；指令为空/内容超限/协议标签冲突 fail-closed 拒绝 |
| `buildCanvasNodeRewriteSystemPrompt(locale)` | 双语提示词：恰一个 replacement 标签、只改写不扩写、Mermaid 目标输出单个 ```mermaid 块 |
| `CanvasRewriteAdapter` / `CanvasAuxTarget` | 组合根注入的窄适配器切片（由行内编辑 host 的 resolveAdapter 结构性满足） |
| `CANVAS_NODE_REWRITE_MAX_CONTENT_CHARS` | 节点内容 20k 上限 |

## 边界与约束

- 测试：`tests/unit/features/canvas-integration/CanvasNodeRewriteService.test.ts`（写工具审计丢弃、澄清不猜测、改写期间 vault 快照零变化、会话必被 dispose）。
- 请求块不复用行内编辑的 `editor_selection`（那会对画布节点撒谎），响应协议严格复用——审计过的部分是响应契约。

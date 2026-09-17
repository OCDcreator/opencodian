# InlineEditStreamPreview

> **源码**: `src/features/inline-edit/InlineEditStreamPreview.ts`
> **状态**: [REVIEW]

## 概述

R-A3「流式 diff 预览」的纯逻辑层：渐进解析 + rAF 合批渲染调度 + 单轮流式会话状态机。XML 标签协议在流式下天然歧义（闭合标签到达前无法判定合法与否），本模块给出**只用于渲染**的解释，收尾权威仍是 `parseInlineEditResponse()` 严格解析（`InlineEditPrompt.ts`）——两者不一致时以严格解析为准（清预览 + 报错，绝不部分应用）。

全部纯函数 / 纯类（不依赖 CM6 与 Obsidian），整个流式状态机可单测。

## 职责

- `parseInlineEditStream(accumulated)`（纯）：把累计文本分类为 `preamble`（尚无标签 → spinner + 澄清流）/ `streaming`（已识别开标签 → 模式 + 累积标签体 + 是否已闭合）/ `violation`（`multiple-tags` / `malformed-tag`）。尾部可能是标签 token 前缀的片段（`<repl`、`</re`）被**扣住不渲染**，等下一 chunk 定形
- `findSafeScanEnd(text)`（纯）：`lastIndexOf('<')` 后的尾巴若是某个协议 token 的严格前缀则回退到 `<` 之前；与严格解析同一 regex 扫描
- `createInlineEditStreamBatcher(scheduler, dispatch)`：chunk 通知合批——同一帧内 N 个 chunk 只调度一次 dispatch（1000 chunk 的生成 ≈ 每帧一次装饰更新，而非 1000 次）；`flush()` 立即派发 pending 帧（回合收尾），`cancel()` 丢帧（Esc / 关闭）
- `inlineEditFrameScheduler(host)`：浏览器侧取 `requestAnimationFrame`，缺省时退回 16ms timer（测试/异常宿主）
- `createInlineEditStreamSession(handlers, scheduler)`：单轮编排——`handleChunk` 重解析并标记帧脏；`violation` 后**冻结**最后一帧好画面（不再更新也不清除，清除与否由回合收尾的严格解析结果决定）；`onPreambleReply` 走澄清通道（输入框上方），`onPreview` 走预览通道（编辑器内装饰）

## 依赖

- 无（不 import CM6 / Obsidian / 其他 inline-edit 模块）

## 维护约束

- 渐进解析必须与严格解析**同 regex、同判定方向**：任何 progressive 判为 violation 的文本，严格解析必须也报错（单测显式锁定两者一致性）；新增协议标签时两处同步
- 渐进解析结果**不得**作为落盘依据；controller 在 `applyOutcome('preview')` 时一律用严格解析文本重建 payload
- 装饰更新的合批必须留在 rAF（或 scheduler 注入的帧），禁止把 chunk 回调直接接到 dispatch

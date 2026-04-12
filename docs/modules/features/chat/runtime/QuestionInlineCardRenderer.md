# QuestionInlineCardRenderer

> **源码**: `src/features/chat/runtime/QuestionInlineCardRenderer.ts`
> **状态**: [REVIEW]

## 概述

`QuestionInlineCardRenderer` 是 question request 的 inline card helper。它复用 `StreamingInlineCardRenderer` 完成 placement 与 shell reveal，并维护当前 tab 的可复用 question card 容器；grouped 与 sequential 两种问题内容构造、按钮渲染、答案收集和点击等待都集中在这里。

## 公开接口

- `collectAction()`：按 `questionDisplayMode` 渲染 grouped 或 sequential inline question card，并等待 `reply` / `reject`
- `getOrCreateCard()`：复用仍连接的 question inline card，或通过 `StreamingInlineCardRenderer` 创建新卡片
- `clear()`：移除当前 tab 的临时 question inline card
- `QuestionInlineCardRendererHost`：只暴露 active tab、tab runtime 查询与保持 question card 贴底所需的回调

## 设计目的

- 让 `OpenCodianView.showQuestionDialog()` 不再持有 grouped/sequential DOM 拼装与按钮等待细节
- 继续复用既有 question inline card 容器，避免 sequential 模式每题都创建新的 stream card
- 继续复用 `StreamingInlineCardRenderer` 的 post-tool-call placement 与 reveal 规则
- 让 question inline card 的 grouped/sequential 行为可以独立于大视图类做小范围单测，并通过 `QuestionRuntimeHostAdapter` 复用统一的 question runtime host 装配

## 注意事项

- 这个模块不负责调用 `replyToQuestion()` 或 `rejectQuestion()`；最终 service 回传仍由 `OpenCodianView` 处理
- 已回答/已拒绝的 resolved question 回顾卡片内容与协调分别由 `QuestionResolutionCardRenderer.ts` / `QuestionResolutionCoordinator.ts` 负责，本模块继续提供共享容器复用与待回答 inline card 交互
- host wiring 现在通常由 `QuestionRuntimeHostAdapter.ts` 统一提供，不要再把 active tab / runtime / pin-to-bottom 三段回调重新散落回 view
- 不要在这里复制 streaming shell 查询或 reveal 逻辑，统一继续走 `StreamingInlineCardRenderer`
- sequential 模式必须复用并清空同一个 question card，避免破坏当前 scroll/pin 行为

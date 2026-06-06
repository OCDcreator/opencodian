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

- 让 question resolve flow 不再直接持有 grouped/sequential DOM 拼装与按钮等待细节
- 继续复用既有 question inline card 容器，避免 sequential 模式每题都创建新的 stream card
- 继续复用 `StreamingInlineCardRenderer` 的 post-tool-call placement 与 reveal 规则
- 让 question inline card 的 grouped/sequential 行为可以独立于大视图类做小范围单测，并通过 `QuestionRuntimeHostAdapter` 复用统一的 question runtime host 装配

## 键盘交互

Inline question card 的键盘处理保持在 `QuestionInlineCardRenderer` 本地，不安装全局 `document` / `window` listener。选项 input 获得焦点时，`ArrowDown` / `ArrowRight` 聚焦下一个选项，`ArrowUp` / `ArrowLeft` 聚焦上一个选项，`Home` / `End` 跳到首尾选项，`Space` 切换或选择当前选项，`Escape` 拒绝当前 question request。

`single` sequential 模式下，非最后一题的单选 `Space` 或 `Enter` 会在答案完整后 resolve 当前题，让 renderer 自动复用同一卡片进入下一题；最后一题仍需要 `Enter` 或提交按钮，避免误提交。`all` grouped 模式下，选项上的 `Enter` 只更新当前选项，不直接提交整组问题，完整性校验仍由提交按钮路径负责。多选题的 `Space` / `Enter` 只切换 checkbox，不自动前进或提交。自定义输入保留原生 `Enter` / 方向键 / `Home` / `End` / `Space` 编辑行为，`Escape` 仍作为 request-level reject 快捷键。

## 注意事项

- 这个模块不负责调用 `replyToQuestion()` 或 `rejectQuestion()`；最终 service 回传现在由 `QuestionResolutionFlowCoordinator` 处理
- 已回答/已拒绝的 resolved question 回顾卡片内容与协调分别由 `QuestionResolutionCardRenderer.ts` / `QuestionResolutionCoordinator.ts` 负责，本模块继续提供共享容器复用与待回答 inline card 交互
- host wiring 现在通常由 `QuestionRuntimeHostAdapter.ts` 统一提供，不要再把 active tab / runtime / pin-to-bottom 三段回调重新散落回 view
- Question card root 设置 `data-question-card="true"`，提交和拒绝按钮分别设置 `data-question-action="submit|reject"`，供自动化测试和诊断探针稳定定位卡片与操作
- 不要在这里复制 streaming shell 查询或 reveal 逻辑，统一继续走 `StreamingInlineCardRenderer`
- sequential 模式必须复用并清空同一个 question card，避免破坏当前 scroll/pin 行为
- keyboard 行为必须复用现有 `QuestionInputState` 与 `collectAnswerFromInputState()`，不要引入第二套答案解析
- `AskUserQuestion` option 如果携带 `preview` 文本，会在选项列表下方放置一个共享的 `.opencodian-question-inline-option-preview` 容器。该容器初始隐藏，仅在选项获得焦点或悬停时显示当前对应 option 的 preview 文本。预览统一以纯文本显示，HTML 不会被解析渲染，也不通过 CSS 伪元素注入未本地化的前缀标签，避免潜在的安全风险

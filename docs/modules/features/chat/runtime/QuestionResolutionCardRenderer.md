# QuestionResolutionCardRenderer

> **源码**: `src/features/chat/runtime/QuestionResolutionCardRenderer.ts`
> **状态**: [REVIEW]

## 概述

`QuestionResolutionCardRenderer` 是 resolved question summary helper。它把 answered/rejected 回顾卡片的 DOM 构造、持久化 assistant message 中 resolved card 的插入前后块分组、持久化卡片的显示门控，以及对应的 markdown 摘要文本构造，从 `OpenCodianView` 中抽离出来，统一复用同一套 question-resolution 文案与列表格式。

## 公开接口

- `appendQuestionResolutionCard()`：在父容器中创建 resolved question card 外层容器，并立即调用 `populateQuestionResolutionCard()` 填充内容
- `appendQuestionResolutionCardFromRenderPlan()`：仅在 render plan 已携带可见 resolved card 时向父容器插入卡片
- `buildQuestionResolutionCardRenderPlan()`：把 structured assistant message 拆成 resolved card 前的 non-text blocks 与后的 text blocks，并同时决定当前持久化卡片是否应该显示
- `populateQuestionResolutionCard()`：向已创建的 resolved question card 容器写入 details/header/body/list DOM
- `buildQuestionAnswerMarkdown()`：生成 answered question 的 markdown 摘要
- `buildQuestionRejectedMarkdown()`：生成 rejected question 的 markdown 摘要

## 设计目的

- 让 `QuestionResolutionCoordinator` / `OpenCodianView` 不再拼装 resolved question card 的细节 DOM
- 让 `OpenCodianView` 不再自己判断 resolved card 应该插在 non-text blocks 与 text blocks 的边界位置
- 让 `OpenCodianView` 不再直接持有 “message 上有 resolution 且设置允许显示” 的持久化卡片门控判断
- 把 answered/rejected 的标题、正文和列表值格式集中到单一 helper，减少视图内重复判断
- 让 question-resolution 的 DOM 与 markdown 摘要可以独立做小范围单测

## 注意事项

- 这个模块只负责 question-resolution 摘要的展示与文本构造，不负责 `replyToQuestion()` / `rejectQuestion()` 的 service 回传
- inline question request 的 grouped/sequential 收集逻辑仍由 `QuestionInlineCardRenderer.ts` 负责
- `pendingQuestionResolution` 写入、卡片 clear/render 分支与贴底滚动现由 `QuestionResolutionCoordinator.ts` 负责
- `appendQuestionResolutionCard()` 只服务持久化 assistant message 的静态插入；复用 inline card 容器的运行态卡片仍由 `QuestionResolutionCoordinator.ts` 先取得容器后调用 `populateQuestionResolutionCard()`
- `buildQuestionResolutionCardRenderPlan()` 保持当前既有行为：一旦存在 `contentBlocks`，所有非 text blocks 先渲染，再插 resolved card，最后统一渲染 text blocks；同时会把持久化卡片的显示门控折叠进 render plan 的 `resolvedCardResolution`

# QuestionResolutionCoordinator

> **源码**: `src/features/chat/runtime/QuestionResolutionCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionResolutionCoordinator` 是 resolved question 的运行时协调 helper。它承接 `OpenCodianView` 里的 `applyResolvedQuestionState()` / `renderQuestionResolutionCard()` 逻辑，统一处理 `pendingQuestionResolution` 写入、是否展示 answered/rejected 回顾卡片的判断，以及复用 inline card 容器后的贴底滚动。

## 公开接口

- `applyResolvedQuestionState()`：同步写入当前 tab 的 `pendingQuestionResolution`，并根据设置决定清理或渲染 resolved question card

## 设计目的

- 让 `OpenCodianView` 只保留 question service 结果路由，不再自己编排 resolved question 的 runtime bridge
- 把“写 pending state / clear inline card / 复用容器并贴底滚动”集中到一个更窄的 helper
- 让 question-resolution 的协调逻辑可以脱离视图做小范围单测

## 注意事项

- 这个模块不负责 `replyToQuestion()` / `rejectQuestion()` 的 service 调用，只消费已经确定的 resolution
- 回顾卡片的 details/header/body/list DOM 仍由 `QuestionResolutionCardRenderer.ts` 负责
- question card 容器的创建、复用与清理仍委托给 `QuestionInlineCardRenderer.ts`

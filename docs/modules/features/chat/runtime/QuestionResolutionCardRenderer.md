# QuestionResolutionCardRenderer

> **源码**: `src/features/chat/runtime/QuestionResolutionCardRenderer.ts`
> **状态**: [REVIEW]

## 概述

`QuestionResolutionCardRenderer` 是 resolved question summary helper。它把 answered/rejected 回顾卡片的 DOM 构造，以及对应的 markdown 摘要文本构造，从 `OpenCodianView` 中抽离出来，统一复用同一套 question-resolution 文案与列表格式。

## 公开接口

- `populateQuestionResolutionCard()`：向已创建的 resolved question card 容器写入 details/header/body/list DOM
- `buildQuestionAnswerMarkdown()`：生成 answered question 的 markdown 摘要
- `buildQuestionRejectedMarkdown()`：生成 rejected question 的 markdown 摘要

## 设计目的

- 让 `OpenCodianView` 只决定何时展示 resolved question card，而不再拼装其细节 DOM
- 把 answered/rejected 的标题、正文和列表值格式集中到单一 helper，减少视图内重复判断
- 让 question-resolution 的 DOM 与 markdown 摘要可以独立做小范围单测

## 注意事项

- 这个模块只负责 question-resolution 摘要的展示与文本构造，不负责 `replyToQuestion()` / `rejectQuestion()` 的 service 回传
- inline question request 的 grouped/sequential 收集逻辑仍由 `QuestionInlineCardRenderer.ts` 负责
- 这里输出的是 resolved summary 的静态内容；卡片 placement、容器复用和贴底滚动仍由上层 view / inline-card helper 决定

# 可维护性改进：第十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-12.md`

本轮继续沿着第十二阶段留下的 question inline card 边界推进，只做一个切口：**把 grouped/sequential question inline card 的内容构造、容器复用、按钮等待和答案收集从 `OpenCodianView` 抽到 `QuestionInlineCardRenderer`，并继续复用 `StreamingInlineCardRenderer` 的 placement/reveal 能力**。本轮没有改动 question service 回传、above-input `QuestionDock`、resolved question 回顾卡片或 stream router 行为。

## 1. 本轮范围

本轮只处理待回答 question inline card 的 render/wait 子职责：

- 新增 `src/features/chat/runtime/QuestionInlineCardRenderer.ts`
  - 统一管理当前 tab 的可复用 question inline card 容器
  - 统一渲染 grouped 模式下的多问题内容、选项、自定义输入与提交/拒绝按钮
  - 统一渲染 sequential 模式下的单题内容、进度、下一步/提交/拒绝按钮
  - 统一收集单选、多选和自定义答案，并保留缺失答案时的 notice 行为
- `OpenCodianView.showQuestionDialog()` 不再直接持有 grouped/sequential DOM 构造与点击等待逻辑，只保留：
  - above-input `QuestionDock` 分支
  - 调用 `QuestionInlineCardRenderer.collectAction()`
  - 在拿到结果后调用 `replyToQuestion()` / `rejectQuestion()`
  - 应用 answered/rejected resolution 状态
- `StreamingInlineCardRenderer` 继续只负责 placement/reveal，不承载 question-specific 内容职责

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/QuestionInlineCardRenderer.ts`
- `tests/unit/features/chat/QuestionInlineCardRenderer.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md`
- `docs/modules/features/chat/runtime/StreamingInlineCardRenderer.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runTestsByPath tests/unit/features/chat/QuestionInlineCardRenderer.test.ts`
- `npm test`
- `npm run build`

说明：第一次运行 focused test 暴露了 sequential 点击后的异步推进断言 tick 不足；已做一次 focused repair 后重跑通过。

## 4. 部署结果

`npm run build` 成功后，已按仓库约定顺序部署：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

已校验 Test Vault 中的 `main.js` 包含最新 `BUILD_ID`：

- `autopilot-maintainability.202604111919`

## 5. 下一步建议

下一轮最推荐继续沿着 question inline card 边界，把 **resolved question 回顾卡片与 answered/rejected markdown 摘要构造从 `OpenCodianView` 挪到独立 helper**，优先处理：

- `populateQuestionResolutionCard()` 的 details/header/body/list DOM 构造
- `buildQuestionAnswerMarkdown()` / `buildQuestionRejectedMarkdown()` 的摘要文本构造
- 保持 `OpenCodianView` 只负责决定是否展示 resolved card、更新 runtime resolution 状态，以及调用 helper

一句话总结第十三阶段本轮：

> 第十二阶段把 permission inline card 的内容渲染移出大视图；第十三阶段继续把待回答 question inline card 的 grouped/sequential 内容渲染与按钮等待移到 `QuestionInlineCardRenderer`，让 `OpenCodianView` 更接近只负责 interaction/service bridge。

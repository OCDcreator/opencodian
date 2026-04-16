# 可维护性改进：第十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-16.md`

本轮继续沿着第十六阶段留下的 resolved question assistant-message 渲染边界推进，只做一个切口：**把 `renderAssistantMessageContent()` 里“resolved question card 应该插在 non-text blocks 和 text blocks 之间”的分组与插入顺序判断，抽到 `QuestionResolutionCardRenderer` 的纯 helper `buildQuestionResolutionCardRenderPlan()`**。本轮没有改动 resolved question card 的 DOM 结构、文案、设置开关、plain-text fallback 渲染，或各类 content block 的既有显示顺序。

## 1. 本轮范围

本轮只处理 persisted assistant message 中 resolved question card 的插入顺序决策：

- `src/features/chat/runtime/QuestionResolutionCardRenderer.ts`
  - 新增 `buildQuestionResolutionCardRenderPlan()`
  - 统一把 structured assistant message 拆成 resolved card 前的 non-text blocks 与后的 text blocks
  - 让 resolved question card 的插入位置规则离开 `OpenCodianView`
- `src/features/chat/OpenCodianView.ts`
  - `renderAssistantMessageContent()` 不再自己过滤 non-text / text block 决定 resolved card 的位置
  - 改为消费 render plan，再按既有顺序渲染前后块并插入卡片
- 单测补充 render plan 的结构化块分组覆盖

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/QuestionResolutionCardRenderer.ts`
- `tests/unit/features/chat/QuestionResolutionCardRenderer.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/QuestionResolutionCardRenderer.md`
- `docs/status/maintainability-phase-17.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runTestsByPath tests/unit/features/chat/QuestionResolutionCardRenderer.test.ts`
- `npm test`
- `npm run build`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定顺序部署：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

已校验 Test Vault 中的 `main.js` 包含最新 `BUILD_ID`：

- `autopilot-maintainability.202604111958`

## 5. 下一步建议

下一轮最推荐继续沿着 persisted assistant-message 的 resolved question 渲染边界推进，把 **“是否需要插入 resolved question card”** 也抽成更窄的 helper，让 `OpenCodianView` 只保留块渲染分派与 plain-text 渲染，而不再同时持有 resolved card 的显示条件判断。

一句话总结第十七阶段本轮：

> 第十六阶段把 resolved card 容器创建与填充移出大视图；第十七阶段继续把 structured assistant message 中 resolved card 的插入顺序决策提炼成 `buildQuestionResolutionCardRenderPlan()`，进一步收缩 `OpenCodianView` 的消息布局职责。

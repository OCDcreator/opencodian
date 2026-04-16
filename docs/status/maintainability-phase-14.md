# 可维护性改进：第十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-13.md`

本轮继续沿着第十三阶段留下的 resolved question 边界推进，只做一个切口：**把 answered/rejected question 回顾卡片的 DOM 构造，以及配套的 answered/rejected markdown 摘要构造，从 `OpenCodianView` 抽到独立的 `QuestionResolutionCardRenderer` helper**。本轮没有改动 question request 的 grouped/sequential 收集流程、`QuestionDock`、service 回传或 stream placement 规则。

## 1. 本轮范围

本轮只处理 resolved question summary 的展示职责：

- 新增 `src/features/chat/runtime/QuestionResolutionCardRenderer.ts`
  - 统一生成 answered/rejected question 回顾卡片的 details/header/body/list DOM
  - 统一生成 answered/rejected question markdown 摘要文本
  - 集中维护 answered/rejected 的 icon/title/body/list value 文案分支
- `OpenCodianView` 不再直接持有 resolved question 回顾卡片的 DOM 构造细节，只保留：
  - 决定何时渲染 resolved question card
  - 通过 `QuestionInlineCardRenderer` 复用/清理 inline card 容器
  - 保持当前 tab 的贴底滚动行为
- 新增针对 resolved question helper 的单测，覆盖：
  - answered 回顾卡片渲染与 collapse hint 切换
  - rejected 回顾卡片渲染
  - answered/rejected markdown 摘要文本构造

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/QuestionResolutionCardRenderer.ts`
- `tests/unit/features/chat/QuestionResolutionCardRenderer.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md`
- `docs/modules/features/chat/runtime/QuestionResolutionCardRenderer.md`
- `docs/status/maintainability-phase-14.md`

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

- `autopilot-maintainability.202604111933`

## 5. 下一步建议

下一轮最推荐继续沿着 resolved question 边界，把 **question-resolution 的展示决策与 runtime bridge 从 `OpenCodianView` 挪到更窄的协调 helper**，优先处理：

- `applyResolvedQuestionState()` 中的 pending state 写入与 clear/render 分支
- `renderQuestionResolutionCard()` 的卡片复用、pin-to-bottom 与 active-tab bridge
- 保持 `OpenCodianView` 只负责 question service 结果路由，不再同时承担 resolved question 的展示编排

一句话总结第十四阶段本轮：

> 第十三阶段把待回答 question inline card 的内容渲染移出大视图；第十四阶段继续把 resolved question 回顾卡片与摘要文本构造移到 `QuestionResolutionCardRenderer`，让 `OpenCodianView` 更接近只保留 question-resolution 的时机判断与 runtime bridge。

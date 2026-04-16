# 可维护性改进：第十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-14.md`

本轮继续沿着第十四阶段留下的 resolved question 边界推进，只做一个切口：**把 `applyResolvedQuestionState()` / `renderQuestionResolutionCard()` 的 pending state 写入、clear/render 分支，以及复用 inline card 容器后的贴底滚动，从 `OpenCodianView` 抽到独立的 `QuestionResolutionCoordinator` helper**。本轮没有改动 answered/rejected 回顾卡片的 DOM 文案构造、question request 的 grouped/sequential 收集流程，或 question service 的 reply/reject 调用时机。

## 1. 本轮范围

本轮只处理 resolved question 的 runtime bridge：

- 新增 `src/features/chat/runtime/QuestionResolutionCoordinator.ts`
  - 统一写入当前 tab 的 `pendingQuestionResolution`
  - 统一处理 `showAnsweredQuestionCards` 对应的 clear/render 分支
  - 统一复用 `QuestionInlineCardRenderer` 提供的共享卡片容器，并在渲染后保持当前 tab 的贴底滚动
- `OpenCodianView` 不再直接持有 resolved question state/render 协调细节，只保留：
  - question service 结果路由
  - resolved question card 在消息渲染路径中的既有静态插入分支
  - 贴底滚动底层能力与 helper host 装配
- 新增针对新 helper 的单测，覆盖：
  - 关闭 answered card 时仍写入 pending state，并清理 inline card
  - 打开 answered card 时复用共享容器并渲染 resolved summary
  - 没有可用容器时仍保留 pending state，不误触发贴底滚动

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/QuestionResolutionCoordinator.ts`
- `tests/unit/features/chat/QuestionResolutionCoordinator.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md`
- `docs/modules/features/chat/runtime/QuestionResolutionCardRenderer.md`
- `docs/modules/features/chat/runtime/QuestionResolutionCoordinator.md`
- `docs/status/maintainability-phase-15.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runTestsByPath tests/unit/features/chat/QuestionResolutionCoordinator.test.ts`
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

- `autopilot-maintainability.202604111944`

## 5. 下一步建议

下一轮最推荐继续沿着 resolved question 的 assistant-message 渲染边界推进，把 `renderAssistantMessageContent()` 里两处 **“create resolved question card container + `populateQuestionResolutionCard()`”** 的重复分支抽到更窄的渲染 helper，这样 `OpenCodianView` 就能进一步收缩为只负责消息分派，而不是同时承担 resolved question 的消息内插入细节。

一句话总结第十五阶段本轮：

> 第十四阶段把 resolved question 回顾卡片的 DOM/markdown 构造移出大视图；第十五阶段继续把 resolved question 的 pending state 与 clear/render 协调移到 `QuestionResolutionCoordinator`，让 `OpenCodianView` 更接近只保留 question 结果路由与 host 装配。

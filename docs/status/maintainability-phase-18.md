# 可维护性改进：第十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-17.md`

本轮继续沿着第十七阶段留下的 persisted assistant-message resolved question 渲染边界推进，只做一个切口：**把“持久化 resolved question card 是否应该显示”的门控判断，折叠进 `QuestionResolutionCardRenderer` 的 render plan，并补一个只按 render plan 追加卡片的 helper**。本轮没有改动 resolved question card 的 DOM 结构、文案、设置项语义、structured block 顺序，或 plain-text fallback 的既有渲染结果。

## 1. 本轮范围

本轮只处理 persisted assistant message 中 resolved question card 的可见性判断与插入调用：

- `src/features/chat/runtime/QuestionResolutionCardRenderer.ts`
  - 给 `QuestionResolutionCardRenderPlan` 增加 `resolvedCardResolution`
  - 让 `buildQuestionResolutionCardRenderPlan()` 同时接收 `questionResolution` 与显示开关，并统一产出卡片可见性结果
  - 新增 `appendQuestionResolutionCardFromRenderPlan()`，把“有计划才插卡片”的分支收回 helper
- `src/features/chat/OpenCodianView.ts`
  - `renderAssistantMessageContent()` 不再直接判断 `message.questionResolution && this.shouldRenderQuestionResolutionCards()`
  - 改为只消费 render plan，并在两个 assistant 渲染分支里调用 `appendQuestionResolutionCardFromRenderPlan()`
- 单测补充 persisted resolved card visibility gate 的覆盖

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/QuestionResolutionCardRenderer.ts`
- `tests/unit/features/chat/QuestionResolutionCardRenderer.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/QuestionResolutionCardRenderer.md`
- `docs/status/maintainability-phase-18.md`

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

- `autopilot-maintainability.202604112004`

## 5. 下一步建议

下一轮最推荐继续沿着 persisted assistant-message 的 resolved question 渲染边界推进，把 **“无 structured blocks 时的 resolved card + plain-text fallback 渲染”** 再抽成更窄的 helper，让 `OpenCodianView` 只保留 assistant 消息渲染时机与 footer/timestamp 收尾，而不再同时持有历史 assistant 正文与 resolved card 的拼装顺序。

一句话总结第十八阶段本轮：

> 第十七阶段把 persisted resolved card 的插入顺序折叠成 render plan；第十八阶段继续把持久化 resolved card 的显示门控也并入 render plan，并让 `OpenCodianView` 通过专门 helper 消费计划、缩小 assistant 历史消息渲染分支里的条件判断职责。

# 可维护性改进：第二十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-19.md`

本轮继续沿着第十九阶段留下的 assistant 正文渲染边界推进，只做一个切口：**把 `renderAssistantMessageContent()` 中 structured `contentBlocks` 的 resolved-card 插入分支抽到专门 helper**。本轮没有改变 `buildQuestionResolutionCardRenderPlan()` 的分组规则、resolved question card DOM、plain-text fallback、`renderContentBlock()` 的 block-type 分发，或 timestamp/copy button 收尾语义。

## 1. 本轮范围

本轮只处理 persisted assistant message 的 structured `contentBlocks` 渲染顺序：

- `src/features/chat/runtime/AssistantStructuredContentRenderer.ts`
  - 新增 `renderAssistantStructuredContent()`
  - 消费 `QuestionResolutionCardRenderPlan`
  - 统一执行 “`blocksBeforeCard` -> resolved card -> `blocksAfterCard`” 的渲染顺序
  - 通过调用方注入的 `renderContentBlock` adapter 复用既有 text/thinking/tool block 渲染
- `src/features/chat/OpenCodianView.ts`
  - `renderAssistantMessageContent()` 的 structured 分支改为委托新 helper
  - 保留 render plan 构建、structured vs fallback 分支选择，与 timestamp/copy button 收尾在 view 内
- 单测覆盖新 helper 的 resolved-card 插入顺序，以及可见性 gate 关闭时的无卡片路径
- 只更新直接相关 chat/runtime 模块文档

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/AssistantStructuredContentRenderer.ts`
- `tests/unit/features/chat/AssistantStructuredContentRenderer.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/AssistantPlainTextFallbackRenderer.md`
- `docs/modules/features/chat/runtime/AssistantStructuredContentRenderer.md`
- `docs/status/maintainability-phase-20.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runTestsByPath tests/unit/features/chat/AssistantStructuredContentRenderer.test.ts`
- `npm test -- --runTestsByPath tests/unit/features/chat/AssistantPlainTextFallbackRenderer.test.ts`
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

- `autopilot-maintainability.202604112018`

## 5. 下一步建议

下一轮最推荐继续缩窄 assistant 渲染收尾：把 **`getAssistantCopyContent()` 里“structured text block 提取 vs `message.content` fallback”的 copy-source 选择逻辑** 抽成一个小 helper。这样 `renderAssistantMessageContent()` 与其他 assistant footer 调用点可以复用同一个 copy-content 组装边界，让 `OpenCodianView` 再少持有一段 persisted assistant 正文导出细节。

一句话总结第二十阶段本轮：

> 第十九阶段先抽离了无 structured blocks 的 plain-text fallback；第二十阶段继续把 structured `contentBlocks` 的 resolved-card 插卡顺序抽成独立 runtime helper，让 `OpenCodianView` 只保留 render plan 构建、分支选择和 footer 收尾。

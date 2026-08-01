# 可维护性改进：第十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-18.md`

本轮继续沿着第十八阶段留下的 persisted assistant-message fallback 边界推进，只做一个切口：**把 `renderAssistantMessageContent()` 中“无 structured blocks 时先追加 resolved card、再渲染普通 `message.content`”的分支抽到专门 helper**。本轮没有改变 resolved question card DOM、markdown 渲染路径、plain-text fallback、structured block 顺序、timestamp/copy button 收尾，或设置项语义。

## 1. 本轮范围

本轮只处理 assistant 历史消息里无 `contentBlocks` 的 fallback 渲染：

- `src/features/chat/runtime/AssistantPlainTextFallbackRenderer.ts`
  - 新增 `renderAssistantPlainTextFallbackContent()`
  - 先按 `QuestionResolutionCardRenderPlan` 追加可见的 persisted resolved card
  - 再在存在 `messageContent` 时创建 `opencodian-message-text` 并复用 `MarkdownRenderService`
  - 在 `markdownService === null` 时保留直接写入 `textContent` 的旧行为
- `src/features/chat/OpenCodianView.ts`
  - `renderAssistantMessageContent()` 的 no-structured-block 分支改为委托新 helper
  - 保留 structured block 分支与 timestamp/copy button 收尾在 view 内
- 单测覆盖新 helper 的 resolved card 顺序、markdown 渲染路径与 plain-text fallback

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/AssistantPlainTextFallbackRenderer.ts`
- `tests/unit/features/chat/AssistantPlainTextFallbackRenderer.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/AssistantPlainTextFallbackRenderer.md`
- `docs/status/maintainability-phase-19.md`

## 3. 验证

本轮实际执行并通过：

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

- `autopilot-maintainability.202604112011`

## 5. 下一步建议

下一轮最推荐继续缩窄 `renderAssistantMessageContent()`：把 **structured `contentBlocks` 分支里的“先渲染 card 前 blocks、插入 resolved card、再渲染 card 后 text blocks”** 抽成一个专门 helper/adapter。这样 view 方法可以只负责创建 render plan、选择 structured vs fallback 分支，以及统一 timestamp/copy button 收尾。

一句话总结第十九阶段本轮：

> 第十八阶段把 persisted resolved card 的显示门控折叠进 render plan；第十九阶段继续把无 structured blocks 的 resolved-card + plain-text fallback 分支抽出到独立 runtime helper，让 `OpenCodianView` 少持有一段历史 assistant 正文拼装细节。

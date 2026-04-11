# 可维护性改进：第三十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-35.md`

本轮继续沿着第三十五阶段收窄 `ConversationRenderService.resolveTrailingAssistantPatchPreflight()` 的职责，只做一个切口：**把 `missing-container-or-inactive-tab` 的 preflight guard 抽成独立 helper**。本轮没有改动 rendered message 收集与数量校验、non-tail signature mismatch 判定、尾部 mergeability 判定、尾部 DOM target 解析、patch 执行流程、debug 日志字段或失败时回退 full rerender 的条件。

## 1. 本轮范围

本轮只处理 trailing assistant patch preflight 里的 tab/container 预检：

- `src/features/chat/services/ConversationRenderService.ts`
  - 新增 `TrailingAssistantPatchContainerResult`
  - 以 `resolveTrailingAssistantPatchActiveContainer()` 取代 preflight 内联的 messages container / active tab guard
  - 让 `resolveTrailingAssistantPatchPreflight()` 继续朝“按步骤编排 preflight 子判定”的骨架收窄
- `tests/unit/features/chat/ConversationRenderService.test.ts`
  - 增加 focused 单测，确认缺失 messages container 时仍记录 `missing-container-or-inactive-tab` skipped payload 并返回 `false`
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 补充 trailing assistant patch preflight 的 `missing-container-or-inactive-tab` 预检现已由独立 helper 收口

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `tests/unit/features/chat/ConversationRenderService.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/status/maintainability-phase-36.md`

## 3. 验证

本轮实际执行并通过：

- `npx jest tests/unit/features/chat/ConversationRenderService.test.ts --runInBand`
- `npm test`
- `npm run build`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定顺序部署：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含最新 `BUILD_ID`：

- `autopilot-maintainability.202604112221`

## 5. 下一步建议

下一轮最推荐继续收窄 trailing assistant patch 的 preflight 入口：把 `tail-message-not-mergeable-assistant` 的尾部消息选择与失败结果组装抽成独立 helper，让 preflight 更接近只串联各子检查结果的 orchestrator。

一句话总结第三十六阶段本轮：

> 第三十五阶段先把 non-tail signature mismatch 的失败结果抽离；第三十六阶段继续把 tab/container 预检抽离，让 `resolveTrailingAssistantPatchPreflight()` 更接近逐步组合的预检入口。

# 可维护性改进：第三十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-36.md`

本轮继续沿着第三十六阶段收窄 `ConversationRenderService.resolveTrailingAssistantPatchPreflight()` 的职责，只做一个切口：**把 `tail-message-not-mergeable-assistant` 的 rendered tail 选择与失败结果组装抽成独立 helper**。本轮没有改动 tab/container 预检、rendered message 收集与数量校验、non-tail signature mismatch 判定、尾部 DOM target 解析、patch 执行流程、debug 日志字段或失败时回退 full rerender 的条件。

## 1. 本轮范围

本轮只处理 trailing assistant patch preflight 里的尾部消息选择与非 mergeable 失败分支：

- `src/features/chat/services/ConversationRenderService.ts`
  - 新增 `TrailingAssistantPatchTailMessagesResult`
  - 以 `resolveTrailingAssistantPatchTailMessages()` 取代 preflight 内联的 rendered tail 选择与 `tail-message-not-mergeable-assistant` 失败结果组装
  - 让 `resolveTrailingAssistantPatchPreflight()` 继续朝“只串联各个 preflight 子判定”的 orchestration 骨架收窄
- `tests/unit/features/chat/ConversationRenderService.test.ts`
  - 强化 focused 单测，确认当 `getMessagesForRender()` 过滤掉原始尾消息时，skipped payload 仍然总结的是 rendered tail，而不是原始数组末尾元素
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 补充 trailing assistant patch preflight 的 tail 选择与失败 payload/result 已由独立 helper 收口

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `tests/unit/features/chat/ConversationRenderService.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/status/maintainability-phase-37.md`

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

- `autopilot-maintainability.202604112228`

## 5. 下一步建议

下一轮最推荐继续收窄 trailing assistant patch 的 preflight 入口：把成功分支里 runtime、turn body 与 `shouldStickToBottom` 的最终 preflight 成功结果组装抽成独立 helper，让 `resolveTrailingAssistantPatchPreflight()` 更接近纯粹按顺序连接 guard 与结果的 orchestrator。

一句话总结第三十七阶段本轮：

> 第三十六阶段先把 tab/container 预检抽离；第三十七阶段继续把 rendered tail 选择与非 mergeable 失败结果抽离，让 `resolveTrailingAssistantPatchPreflight()` 更接近只负责编排子检查的入口。

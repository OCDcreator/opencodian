# 可维护性改进：第一百三十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-135.md`

本轮继续沿着上一阶段的 focus hint，只做了一个低风险的小切片：**把 `ConversationRenderService` 里 `buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext()` 的 completion-debug planning-context source 装配抽到纯 `TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper`，让 service 继续退出 `...planningContext`、`tailStatePlan` 与摘要函数的字段拼装。**

这次改动没有改变 completion-debug plan 的 shape、`tailStatePlan.shouldStickToBottom` 的来源、tail-message summary 的计算方式、debug log 的触发时机，或 trailing-assistant patch 成功后的执行顺序；只是把 completion-debug planning-context 的最后一层 source contract 组装从 service 挪到独立 helper，并让原有 planning-context helper 继续只负责 source → planning-context 的纯收束。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.ts`
  - 新增纯 source helper
  - 集中装配 completion-debug planning-context 所需的 `{ ...planningContext, tailStatePlan, summarizeChatMessageForDebug }` contract
- `src/features/chat/services/ConversationRenderService.ts`
  - 删除 service 内部 completion-debug source 的手工字段展开
  - 改为直接委托纯 helper 返回稳定 source，再交给既有 planning-context / plan helper 链
- `tests/unit/features/chat/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.test.ts`
  - 新增纯 helper 单测，覆盖 tail-outcome inputs → completion-debug source 的装配
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 completion-debug 路径现在先经过新的 source helper
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.md`
  - 同步说明其输入 source 已由新的 source helper 统一装配
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.md`
  - 新增纯 helper 模块文档

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.md`
- `docs/status/maintainability-phase-136.md`

## 3. 验证

本轮实际执行并通过：

- `npm test`
- `npm run build`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604120837`

## 5. 下一步建议

下一轮可以继续留在同一条 completion-debug 收口链里，评估是否把 `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 里的 summary-plan 装配再抽成纯 helper，让 planning-context helper 更接近只负责组合 `shouldStickToBottom` 与 summary 子结果。

一句话总结第一百三十六阶段本轮：

> 第一百三十六阶段把 completion-debug planning-context 的 source 装配从 `ConversationRenderService` 抽到独立 helper，继续把 service 压回 trailing-assistant completion-debug 的编排边界。

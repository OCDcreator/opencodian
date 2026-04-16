# 可维护性改进：第一百四十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-139.md`

本轮继续沿着上一阶段的 completion-debug 收口链，只做了一个低风险的小切片：**让 `ConversationRenderService` 直接调用纯 `TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper`，删除已经只剩转发职责的 `TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper` facade。**

这次改动没有改变 completion-debug planning-context source 的字段 shape、`tailStatePlan.shouldStickToBottom` 的来源、tail-message summary 的计算方式、`completionDebugPlan` 的最终结构，或 trailing-assistant patch 成功后的执行顺序；只是去掉了一层纯转发 helper，让 completion-debug source contract 的唯一装配边界更直接地暴露给调用方。

## 1. 本轮范围

- `src/features/chat/services/ConversationRenderService.ts`
  - 改为直接依赖 `buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract()`
  - 不再经过 pass-through `TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper`
- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.ts`
  - 删除只保留转发职责的 facade helper
- `tests/unit/features/chat/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.test.ts`
  - 删除对应 facade helper 的冗余单测
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 completion-debug source contract 现在由 service 直接委托给 source-contract helper
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.md`
  - 同步说明上游 source 现由 `ConversationRenderService` 直接通过 contract helper 装配
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper.md`
  - 同步说明它现在是唯一的 completion-debug source contract 装配边界
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugSummaryPlanHelper.md`
  - 同步修正其上游依赖描述
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.md`
  - 删除对应 facade helper 的模块文档

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugSummaryPlanHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.md`
- `docs/status/maintainability-phase-140.md`

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

- `autopilot-maintainability.202604120902`

## 5. 下一步建议

下一轮可以继续留在同一条 trailing-assistant completion-debug 收口链里，评估是否把 `ConversationRenderService` 中仍然保留的 `buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext()` 再下沉成更窄的纯 helper，让 service 继续退出 completion-debug 计划编排细节。

一句话总结第一百四十阶段本轮：

> 第一百四十阶段删除了 completion-debug source 的 pass-through facade helper，让 `ConversationRenderService` 直接依赖唯一的 source-contract 装配边界。

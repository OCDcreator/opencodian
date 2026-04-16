# 可维护性改进：第一百三十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-134.md`

本轮继续沿着上一阶段的 focus hint，只做了一个低风险的小切片：**把 `ConversationRenderService` 里 `buildTrailingAssistantPatchTailOutcomePlans()` 的最终 `{ tailStatePlan, completionDebugPlan }` shape 装配抽到纯 `TrailingAssistantPatchTailOutcomePlanHelper`，让 service 继续退出 trailing-assistant tail-outcome 顶层字段拼装。**

这次改动没有改变 trailing-assistant tail-outcome 的 contract、tail-state 与 completion-debug 的计算来源、`shouldStickToBottom` 语义、tail-message summary 内容或 patch 成功后的执行顺序；只是把最终返回 shape 的纯装配从 service 挪到独立 helper，并让原有 tail-outcome planning-context helper 继续只负责上游 contract 收束。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanHelper.ts`
  - 新增纯 tail-outcome plan helper
  - 集中装配最终 `{ tailStatePlan, completionDebugPlan }` shape
- `src/features/chat/services/ConversationRenderService.ts`
  - 删除 service 内部私有 `buildTrailingAssistantPatchTailOutcomePlans()`
  - 改为直接委托纯 helper 返回 tail-outcome 顶层 plan
- `tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanHelper.test.ts`
  - 新增纯 helper 单测，覆盖最终 tail-outcome shape 装配
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 tail-outcome 顶层返回现在由新 helper 收口
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.md`
  - 同步说明下游最终 consumer 已切换为新的 tail-outcome plan helper
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanHelper.md`
  - 新增纯 helper 模块文档

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanHelper.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanHelper.md`
- `docs/status/maintainability-phase-135.md`

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

- `autopilot-maintainability.202604120831`

## 5. 下一步建议

下一轮可以继续留在同一段 trailing-assistant tail-outcome 收口链里，评估是否把 `buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext()` 里的 logging-context source 装配继续抽成纯 helper，让 `ConversationRenderService` 再退出一层 completion-debug 专用入参拼装。

一句话总结第一百三十五阶段本轮：

> 第一百三十五阶段把 tail-outcome plan 的最终顶层 shape 装配从 `ConversationRenderService` 抽到独立 helper，继续把 service 压回 trailing-assistant tail-outcome 的编排边界。

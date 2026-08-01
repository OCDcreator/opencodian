# 可维护性改进：第一百三十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-138.md`

本轮继续沿着上一阶段的 completion-debug 收口链，只做了一个低风险的小切片：**把 `TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper` 里最后的 `{ ...planningContext, tailStatePlan, summarizeChatMessageForDebug }` source contract 装配抽到新的纯 `TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper`，让 source helper 更接近只保留 service 侧桥接职责。**

这次改动没有改变 completion-debug planning-context source 的 shape、`tailStatePlan.shouldStickToBottom` 的来源、tail-message summary 的计算方式、`completionDebugPlan` 的最终结构，或 trailing-assistant patch 成功后的执行顺序；只是把 source contract 的最后一层纯装配继续下沉到单一职责 helper，并补齐对应单测与模块文档。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper.ts`
  - 新增纯 source-contract helper
  - 集中装配最终 `{ ...planningContext, tailStatePlan, summarizeChatMessageForDebug }` completion-debug source contract
- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.ts`
  - 删除内部最终 source contract 的手工装配
  - 改为只保留面向 `ConversationRenderService` 的桥接入口，并委托新的 contract helper 返回稳定 contract
- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.ts`
  - `TrailingAssistantPatchCompletionDebugPlanningContextSource` 类型改为从新的 source-contract helper 复用
  - 保持自身聚焦在 source → planning-context 的收束
- `tests/unit/features/chat/TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper.test.ts`
  - 新增纯 helper 单测，覆盖最终 source contract 装配
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper.md`
  - 新增纯 helper 模块文档
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.md`
  - 同步说明 source helper 现在把最终 contract 装配委托给独立 helper
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.md`
  - 同步说明 completion-debug planning-context helper 现在复用新的 source-contract helper 所定义的稳定 source contract

## 2. 变更文件

- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper.ts`
- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.ts`
- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper.test.ts`
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.md`
- `docs/status/maintainability-phase-139.md`

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

- `autopilot-maintainability.202604120857`

## 5. 下一步建议

下一轮可以继续留在同一条 completion-debug 收口链里，评估是否让 `ConversationRenderService` 直接依赖新的 `TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper`，并收敛 `TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper` 这层仅保留转发的 facade。

一句话总结第一百三十九阶段本轮：

> 第一百三十九阶段把 completion-debug source 的最终 contract 装配从 `TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper` 抽到独立 helper，继续压缩 source helper 的职责边界。

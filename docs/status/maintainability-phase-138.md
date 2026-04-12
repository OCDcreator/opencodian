# 可维护性改进：第一百三十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-137.md`

本轮继续沿着上一阶段的 completion-debug 收口链，只做了一个低风险的小切片：**把 `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 里最后的 `{ shouldStickToBottom, summaryPlan }` planning-context shape 装配抽到新的纯 `TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper`，让 planning-context helper 更接近只负责从 source 收束 inputs。**

这次改动没有改变 completion-debug planning-context 的 shape、`tailStatePlan.shouldStickToBottom` 的来源、tail-message summary 的计算方式、`completionDebugPlan` 的最终结构，或 trailing-assistant patch 成功后的执行顺序；只是把最终 planning-context shape 的纯装配继续下沉到单一职责 helper，并补齐对应单测与模块文档。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper.ts`
  - 新增纯 planning-context shape helper
  - 集中装配最终 `{ shouldStickToBottom, summaryPlan }` completion-debug planning-context contract
- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.ts`
  - 删除内部最终 planning-context shape 的手工装配
  - 改为只保留 source -> inputs 收束，并委托新的 shape helper 返回最终 contract
- `tests/unit/features/chat/TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper.test.ts`
  - 新增纯 helper 单测，覆盖最终 planning-context shape 装配与 `summaryPlan` 透传
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper.md`
  - 新增纯 helper 模块文档
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.md`
  - 同步说明 planning-context helper 现在继续委托独立 shape helper 完成最终 contract 装配

## 2. 变更文件

- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper.ts`
- `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper.test.ts`
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.md`
- `docs/status/maintainability-phase-138.md`

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

- `autopilot-maintainability.202604120850`

## 5. 下一步建议

下一轮可以继续留在同一条 completion-debug 收口链里，评估是否把 `TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper` 里最后的 `planningContext + tailStatePlan + summarizeChatMessageForDebug` source contract 装配再抽成更窄的纯 parts/helper，让 source helper 更接近只保留桥接职责。

一句话总结第一百三十八阶段本轮：

> 第一百三十八阶段把 completion-debug planning-context 的最终 `{ shouldStickToBottom, summaryPlan }` shape 装配从 `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 抽到独立 helper，继续压缩 completion-debug planning-context helper 的职责边界。

# 可维护性改进：第一百三十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-130.md`

本轮继续沿着上一阶段的 focus hint，只做了一个低风险的小切片：**把 `ConversationRenderService` 里 trailing-assistant tail-outcome 的 inputs / planning-context 装配抽到纯 `TrailingAssistantPatchTailOutcomePlanningContextHelper`，让 service 进一步退出 tail-outcome input orchestration。**

这次改动没有改变 trailing-assistant patch 的 preflight 判定、execution-tail planning-context 收口、footer-only / rerender-content 分支决策、tail state 应用、completion debug summary 生成或最终 patch 执行时序；只是把 tail-outcome contract 在进入 `tailStatePlan` 与 `completionDebugPlan` 之前的纯输入收束从 service 中剥离出来，并继续让下游 builder 消费同一份窄 contract。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.ts`
  - 新增纯 tail-outcome planning-context helper
  - 集中处理 `patchTarget.messageEl`、tail messages 与 `shouldStickToBottom` 的 input assembly
  - 统一返回 tail-state / completion-debug 共用的窄 planning-context
- `src/features/chat/services/ConversationRenderService.ts`
  - 删除 service 内部的 `buildTrailingAssistantPatchTailOutcomeInputs()` 与 `buildTrailingAssistantPatchTailOutcomePlanningContext()`
  - tail-outcome plan 收集改为直接委托纯 helper 构建 planning-context
- `tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanningContextHelper.test.ts`
  - 新增纯 helper 单测，覆盖从更宽的 execution-tail planning-context 收窄为 tail-outcome contract 的路径
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 tail-outcome planning-context 已交给独立纯 helper 装配
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.md`
  - 新增纯 helper 模块文档

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanningContextHelper.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.md`
- `docs/status/maintainability-phase-131.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runInBand TrailingAssistantPatchTailOutcomePlanningContextHelper.test.ts ConversationRenderService.test.ts`
- `npm test`
- `git diff --check`
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

- `autopilot-maintainability.202604120806`

## 5. 下一步建议

下一轮可以继续留在同一段 trailing-assistant tail-outcome 收口链里，评估是否把 `buildTrailingAssistantPatchTailStatePlanningContext()` 抽成纯 helper，让 `ConversationRenderService` 进一步退出 tail-state 输入整形细节。

一句话总结第一百三十一阶段本轮：

> 第一百三十一阶段把 trailing-assistant tail-outcome 的纯 planning-context 装配从 `ConversationRenderService` 抽到独立 helper，继续把 service 压回 success-plan orchestration 边界。

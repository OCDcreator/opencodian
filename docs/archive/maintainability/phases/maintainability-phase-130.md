# 可维护性改进：第一百三十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-129.md`

本轮继续沿着上一阶段的 focus hint，只挑了一个低风险的小切片：**把 `ConversationRenderService` 里 trailing-assistant success-plan 的 execution-tail planning-context 装配抽到纯 `TrailingAssistantPatchExecutionTailPlanningContextHelper`，让 service 不再自己编排 execution-tail inputs 与 planning-context 收口。**

这次改动没有改变 trailing-assistant patch 的 preflight 判定、正文签名比较、`finalize-footer` / `rerender-content` 分支选择、tail outcome plan 的生成方式，或 patch 完成后的 debug / tail-state 行为；只是把 execution plan 与 tail outcome 共用的 planning-context 输入装配从 service 中剥离出来，并保留现有 builder 继续消费同一份窄 contract。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchExecutionTailPlanningContextHelper.ts`
  - 新增纯 execution-tail planning-context helper
  - 集中处理 `previousTailMessage`、`nextTailMessage`、`patchTarget` 与 `shouldStickToBottom` 的 input assembly
  - 统一返回 execution plan / tail outcome 共用的窄 planning-context
- `src/features/chat/services/ConversationRenderService.ts`
  - 删除 service 内部的 `buildTrailingAssistantPatchExecutionTailInputs()` 与 `buildTrailingAssistantPatchExecutionTailPlanningContext()`
  - execution-tail plan-parts 收集改为直接委托纯 helper 构建 shared planning-context
- `tests/unit/features/chat/TrailingAssistantPatchExecutionTailPlanningContextHelper.test.ts`
  - 新增纯 helper 单测，覆盖从更宽的 success planning-context 收窄为 execution-tail contract 的路径
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 execution-tail planning-context 已交给独立纯 helper 装配
- `docs/modules/features/chat/services/TrailingAssistantPatchExecutionTailPlanningContextHelper.md`
  - 新增纯 helper 模块文档

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/TrailingAssistantPatchExecutionTailPlanningContextHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchExecutionTailPlanningContextHelper.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchExecutionTailPlanningContextHelper.md`
- `docs/status/maintainability-phase-130.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runInBand TrailingAssistantPatchExecutionTailPlanningContextHelper.test.ts ConversationRenderService.test.ts`
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

- `autopilot-maintainability.202604120759`

## 5. 下一步建议

下一轮可以继续留在同一段 trailing-assistant success-plan 收口链里，评估是否把 `buildTrailingAssistantPatchTailOutcomeInputs()` 与 `buildTrailingAssistantPatchTailOutcomePlanningContext()` 下沉到纯 helper，让 `ConversationRenderService` 进一步退出 tail-outcome input orchestration 细节。

一句话总结第一百三十阶段本轮：

> 第一百三十阶段把 trailing-assistant execution-tail 的纯 planning-context 装配从 `ConversationRenderService` 抽到独立 helper，继续把 service 压回 success-plan orchestration 边界。

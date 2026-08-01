# 可维护性改进：第一百五十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-153.md`

本轮延续上一阶段建议，只做了一个低风险切片：**把 `TrailingAssistantPatchTailOutcomePlanningContextHelper` 内部的 tail-outcome inputs 装配下沉到新的纯 `TrailingAssistantPatchTailOutcomePlanningContextInputsHelper`。**

这次改动没有改变 tail-outcome planning-context 的最终 shape、`patchTarget.messageEl` 的来源，或 `tailStatePlan` / `completionDebugPlan` 下游消费的 contract；只是让 planning-context helper 更接近只负责编排 `source -> inputs -> final shape`。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper.ts`
  - 新增纯 helper，定义 `TrailingAssistantPatchTailOutcomePlanningContextInputsSource`
  - 统一承接 “tail messages + patchTarget + shouldStickToBottom → tail-outcome inputs” 的最窄装配
- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.ts`
  - 删除本地 `buildTrailingAssistantPatchTailOutcomeInputs()`
  - 改为委托新的 inputs helper，再继续装配最终 planning-context shape
- `tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper.test.ts`
  - 新增覆盖，验证新的 inputs helper 会稳定返回既有 `{ previousTailMessage, nextTailMessage, messageEl, shouldStickToBottom }` inputs，并保留 message 引用
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.md`
  - 同步记录新的 inputs helper 边界，以及它与 planning-context helper 的上下游关系

## 2. 变更文件

- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.ts`
- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper.test.ts`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper.md`
- `docs/status/maintainability-phase-154.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper.test.ts tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanningContextHelper.test.ts`
- `npm test`
- `npm run build`
- `git diff --check`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604121048`

## 5. 下一步建议

下一轮可以继续沿着相邻的 trailing-assistant planning-context helpers 前进，优先评估 `TrailingAssistantPatchTailStatePlanningContextHelper` 内部的本地 inputs 装配是否也适合下沉成更窄 helper，让该模块进一步收敛到只保留 `source -> inputs -> final shape` 的编排。

一句话总结第一百五十四阶段本轮：

> 第一百五十四阶段把 tail-outcome planning-context 的局部 inputs 装配，从 planning-context helper 下沉到了独立纯 helper。

# 可维护性改进：第一百五十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-156.md`

本轮延续上一阶段建议，只做了一个低风险切片：**把 `TrailingAssistantPatchTailOutcomePlanningContextHelper` 里剩余的 `inputs -> final shape` 装配下沉到新的纯 `TrailingAssistantPatchTailOutcomePlanningContextShapeHelper`。**

这次改动没有改变 tail-outcome planning-context 的最终 contract，或 `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 下游消费方式；只是让 planning-context helper 进一步收敛成纯编排入口。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextShapeHelper.ts`
  - 新增纯 helper，承接 `previousTailMessage`、`nextTailMessage`、`messageEl` 与 `shouldStickToBottom` 的最终 shape 装配
- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.ts`
  - 删除本地 `inputs -> final shape` 私有装配
  - 改为只编排 `source -> inputs -> final shape`，并委托新的 shape helper
- `tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanningContextShapeHelper.test.ts`
  - 新增覆盖，验证 shape helper 稳定返回既有 tail-outcome planning-context contract
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextShapeHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper.md`
  - 同步记录新的 shape helper 边界，以及 planning-context helper 与 inputs helper 的最新职责关系

## 2. 变更文件

- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.ts`
- `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextShapeHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanningContextShapeHelper.test.ts`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextShapeHelper.md`
- `docs/status/maintainability-phase-157.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper.test.ts tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanningContextShapeHelper.test.ts tests/unit/features/chat/TrailingAssistantPatchTailOutcomePlanningContextHelper.test.ts`
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

- `autopilot-maintainability.202604121105`

## 5. 下一步建议

下一轮可以继续沿着 tail-outcome 之后的单职责边界收口，优先评估是否把 `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 中 tail-state / completion-debug 双分支的顶层结果装配再下沉一层，让该 helper 更接近只负责 orchestrate 子 plan。

一句话总结第一百五十七阶段本轮：

> 第一百五十七阶段把 tail-outcome planning-context 的最终 shape 装配，从 planning-context helper 下沉到了独立 pure helper。

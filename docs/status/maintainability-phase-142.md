# 可维护性改进：第一百四十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-141.md`

本轮沿着上一阶段建议继续收口 trailing-assistant success-plan 的 tail-outcome 子链，只做了一个低风险切片：**把 `ConversationRenderService` 内部的 `buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext()` 下沉成纯 `TrailingAssistantPatchTailStateTailOutcomePlanHelper`。**

这次改动没有改变 tail-outcome planning-context 的来源、`tailStatePlan` 的最终字段 shape、tail-state 副作用执行路径，或 completion-debug plan 的装配方式；只是让 tail-outcome plan parts builder 不再同时承担 tail-state planning-context 缩减与 final plan shape 展开。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchTailStateTailOutcomePlanHelper.ts`
  - 新增纯 helper，接收 tail-outcome planning-context
  - 在 helper 内部串联 `TrailingAssistantPatchTailStatePlanningContextHelper` 与最终 `tailStatePlan` shape
- `src/features/chat/services/ConversationRenderService.ts`
  - 删除 private `buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext()`
  - 删除只被该路径使用的 private `buildTrailingAssistantPatchTailStatePlan()`
  - 在 tail-outcome plan parts 装配处直接委托新的 pure helper
- `tests/unit/features/chat/TrailingAssistantPatchTailStateTailOutcomePlanHelper.test.ts`
  - 覆盖新 helper 对 `messageId`、`sourceMessageId ?? null` 与 `shouldStickToBottom` 的保持
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 tail-state tail-outcome 子链现在由新 helper 统一编排
- `docs/modules/features/chat/services/TrailingAssistantPatchTailStatePlanningContextHelper.md`
  - 同步说明该 helper 的直接上游从 service 变为新 tail-state tail-outcome helper
- `docs/modules/features/chat/services/TrailingAssistantPatchTailStateApplierHelper.md`
  - 同步说明 `tailStatePlan` 的预计算职责已不再留在 service
- `docs/modules/features/chat/services/TrailingAssistantPatchTailStateTailOutcomePlanHelper.md`
  - 新增模块文档，记录 helper 边界、公开接口与上下游关系

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/TrailingAssistantPatchTailStateTailOutcomePlanHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchTailStateTailOutcomePlanHelper.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailStatePlanningContextHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailStateApplierHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailStateTailOutcomePlanHelper.md`
- `docs/status/maintainability-phase-142.md`

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

- `autopilot-maintainability.202604120918`

## 5. 下一步建议

下一轮可以继续停留在 trailing-assistant success-plan 的 tail-outcome / success-plan 收口链里，评估是否把 `buildTrailingAssistantPatchSuccessPlanFromParts()` 也下沉成更窄的纯 helper，让 `ConversationRenderService` 在 success-plan 装配阶段只协调 execution、tail-outcome 与 turn-body scope 三个既成子计划。

一句话总结第一百四十二阶段本轮：

> 第一百四十二阶段把 tail-state tail-outcome plan 的 planning-context 缩减与 final plan shape 从 `ConversationRenderService` 下沉到独立纯 helper。

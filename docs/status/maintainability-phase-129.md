# 可维护性改进：第一百二十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-128.md`

本轮继续沿着上一阶段的 focus hint，只挑了一个低风险的小切片：**把 `ConversationRenderService` 内部 trailing-assistant success-plan 里的 turn-body scope plan 构建与 input assembly 下沉到纯 `TrailingAssistantPatchTurnBodyScopePlanHelper`，让 service 不再直接承载这段 scope-plan 细节。**

这次改动没有改变 trailing-assistant patch 在有/无 render runtime 时的行为、`restoreTurnBodyEl` 的回退规则、正文 patch 期间的 `currentTurnBodyEl` 临时切换时机，或异常路径下的恢复保证；只是把 scope-plan 的纯装配逻辑从 service 中剥离出来，并保留现有副作用 helper 负责执行。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchTurnBodyScopePlanHelper.ts`
  - 新增纯 plan helper
  - 集中处理 turn-body scope source 的 input assembly
  - 统一构建 `turnBodyScopePlan`，并收口 `restoreTurnBodyEl` 的默认回退逻辑
- `src/features/chat/services/ConversationRenderService.ts`
  - 删除 service 内部的 `buildTrailingAssistantPatchTurnBodyScopeInputs()` 与 `buildTrailingAssistantPatchTurnBodyScopePlan()`
  - success-plan parts 改为直接委托纯 helper 构建 `turnBodyScopePlan`
- `tests/unit/features/chat/TrailingAssistantPatchTurnBodyScopePlanHelper.test.ts`
  - 新增纯 helper 单测，覆盖 no-runtime、沿用既有 turn body 与回退到 `parentEl`
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 turn-body scope source 已交给独立纯 helper 装配
- `docs/modules/features/chat/services/TrailingAssistantPatchTurnBodyScopeHelper.md`
  - 同步说明副作用 helper 不再负责 scope plan 构建
- `docs/modules/features/chat/services/TrailingAssistantPatchTurnBodyScopePlanHelper.md`
  - 新增纯 helper 模块文档

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/TrailingAssistantPatchTurnBodyScopePlanHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchTurnBodyScopePlanHelper.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTurnBodyScopeHelper.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTurnBodyScopePlanHelper.md`
- `docs/status/maintainability-phase-129.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runInBand TrailingAssistantPatchTurnBodyScopePlanHelper.test.ts ConversationRenderService.test.ts`
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

- `autopilot-maintainability.202604120751`

## 5. 下一步建议

下一轮可以继续留在同一段 trailing-assistant success-plan 收口链里，评估是否把 `buildTrailingAssistantPatchExecutionTailInputs()` 与对应 planning-context 装配下沉到纯 helper，让 `ConversationRenderService` 进一步退出 execution-tail input orchestration 细节。

一句话总结第一百二十九阶段本轮：

> 第一百二十九阶段把 trailing-assistant turn-body scope 的纯计划构建从 `ConversationRenderService` 抽到独立 helper，进一步把 service 压回 orchestration 边界。

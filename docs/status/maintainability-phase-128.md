# 可维护性改进：第一百二十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-127.md`

本轮继续沿着上一阶段的 focus hint，只挑了一个低风险的小切片：**把 `ConversationRenderService` 内部的 `withTrailingAssistantTurnBodyScope()` 提取为独立的 `TrailingAssistantPatchTurnBodyScopeHelper`，让 service 在 trailing-assistant patch 成功路径里更接近只保留 orchestration。**

这次改动没有改变 trailing-assistant patch 期间 `currentTurnBodyEl` 的暂时切换时机、恢复逻辑、无 runtime 时的直通行为，或异常路径下的恢复保证；只是把这段 turn-body scope 副作用从 service 中下沉到了一个更窄的 helper。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchTurnBodyScopeHelper.ts`
  - 新增 turn-body scope helper
  - 集中处理 `currentTurnBodyEl` 的临时切换、异常安全恢复与 no-runtime 直通
- `src/features/chat/services/ConversationRenderService.ts`
  - 删除 service 内部的 `withTrailingAssistantTurnBodyScope()` 私有方法
  - trailing-assistant patch 成功路径改为把预建的 `turnBodyScopePlan` 交给新 helper 执行
- `tests/unit/features/chat/TrailingAssistantPatchTurnBodyScopeHelper.test.ts`
  - 新增 helper 单测，覆盖 no-runtime、成功恢复与失败恢复
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 turn-body scope 副作用已迁到独立 helper
- `docs/modules/features/chat/services/TrailingAssistantPatchTurnBodyScopeHelper.md`
  - 新增 turn-body scope helper 模块文档

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/TrailingAssistantPatchTurnBodyScopeHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchTurnBodyScopeHelper.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTurnBodyScopeHelper.md`
- `docs/status/maintainability-phase-128.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runInBand TrailingAssistantPatchTurnBodyScopeHelper.test.ts ConversationRenderService.test.ts`
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

- `autopilot-maintainability.202604120743`

## 5. 下一步建议

下一轮可以继续留在同一段 trailing-assistant patch success-plan 收口链里，评估是否把 `buildTrailingAssistantPatchTurnBodyScopePlan()` 及其输入装配也下沉到同一 helper 或配套的纯 plan helper，让 `ConversationRenderService` 连 scope-plan 细节都不再直接承载。

一句话总结第一百二十八阶段本轮：

> 第一百二十八阶段把 trailing-assistant patch 期间的 turn-body scope 切换/恢复副作用抽到独立 helper，进一步缩小了 `ConversationRenderService` 的职责面。

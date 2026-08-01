# 可维护性改进：第一百二十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-126.md`

本轮继续沿着上一阶段给出的 focus hint，在 trailing-assistant patch 成功路径里再切出一个很小的副作用边界：**把 `ConversationRenderService` 内部的 `applyTrailingAssistantPatchTailState()` 提取为独立的 `TrailingAssistantPatchTailStateApplierHelper`，让 service 只保留 patch 主流程控制与 plan 编排。**

这次改动没有改变 trailing-assistant patch 成功后的 `messageId` / `sourceMessageId` dataset 写入、动画禁用、`scrollToBottom({ tabId })` 触发条件，或 `tailStatePlan` 的生成方式；只是把这组尾部 DOM 副作用从 service 中下沉到了一个更窄的小型 helper。

## 1. 本轮范围

- `src/features/chat/services/TrailingAssistantPatchTailStateApplierHelper.ts`
  - 新增 tail-state applier helper
  - 集中处理尾部 message dataset 更新、动画重置与按需 scroll-to-bottom
- `src/features/chat/services/ConversationRenderService.ts`
  - 删除 service 内部的 `applyTrailingAssistantPatchTailState()` 私有方法
  - patch 成功路径改为把预建 `tailStatePlan` 交给新 helper 执行
- `tests/unit/features/chat/TrailingAssistantPatchTailStateApplierHelper.test.ts`
  - 新增 helper 单测，覆盖 dataset 更新 / 清理、动画重置与 stick-to-bottom scroll
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 tail state 副作用已迁到独立 helper
- `docs/modules/features/chat/services/TrailingAssistantPatchTailStateApplierHelper.md`
  - 新增 tail-state applier helper 模块文档

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `src/features/chat/services/TrailingAssistantPatchTailStateApplierHelper.ts`
- `tests/unit/features/chat/TrailingAssistantPatchTailStateApplierHelper.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/modules/features/chat/services/TrailingAssistantPatchTailStateApplierHelper.md`
- `docs/status/maintainability-phase-127.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runInBand TrailingAssistantPatchTailStateApplierHelper.test.ts ConversationRenderService.test.ts`
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

- `autopilot-maintainability.202604120736`

## 5. 下一步建议

下一轮仍可留在同一段 trailing-assistant patch 收口链里，继续挑一个低风险副作用边界：评估是否把 `ConversationRenderService` 里的 `withTrailingAssistantTurnBodyScope()` 暂时切换 / 恢复 `currentTurnBodyEl` 逻辑抽成小型 scope helper，让 service 更接近只保留 patch orchestration。

一句话总结第一百二十七阶段本轮：

> 第一百二十七阶段把 trailing-assistant patch 成功后的 tail-state DOM 副作用抽到独立 applier helper，进一步缩小了 `ConversationRenderService` 的职责面。

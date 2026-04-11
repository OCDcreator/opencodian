# 可维护性改进：第四十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-42.md`

本轮延续第四十二阶段对 trailing assistant patch 成功态的收口，只做一个切口：**把 turn-body scope 切换/恢复所需的 runtime 与目标节点预先收敛成更窄的 `turnBodyScopePlan`，让 `withTrailingAssistantTurnBodyScope()` 不再读取整份 preflight 成功结果**。本轮没有改动 tab/container 预检、rendered message 收集与数量校验、non-tail signature mismatch 判定、tail-message-not-mergeable 失败结果组装、DOM patch target 收集、`executionPlan` 判定、`completionDebugPlan` 组装、`tailStatePlan` apply、副作用顺序、footer finalization 或正文重渲策略。

## 1. 本轮范围

本轮只处理 trailing assistant patch 成功分支里的 turn-body scope 输入收束：

- `src/features/chat/services/ConversationRenderService.ts`
  - 新增 `TrailingAssistantPatchTurnBodyScopePlan`，把 scope 切换/恢复需要的 runtime、作用域 turn body 与恢复目标预计算成更窄结果
  - 在 `buildSuccessfulTrailingAssistantPatchPreflight()` 成功分支里提前组装 `turnBodyScopePlan`
  - 让 `withTrailingAssistantTurnBodyScope()` 改为只消费 `turnBodyScopePlan`，不再读取整份 preflight 成功结果
  - 收窄 `patchTarget`，移除 turn-body scope helper 不再需要的 `turnBodyEl`
- `tests/unit/features/chat/ConversationRenderService.test.ts`
  - 新增回归测试，验证在没有 previous turn body 的情况下，trailing assistant patch 仍会恢复到预计算的 patch turn body
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 补充 turn-body scope 现在会先预计算成 `turnBodyScopePlan`

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `tests/unit/features/chat/ConversationRenderService.test.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/status/maintainability-phase-43.md`

## 3. 验证

本轮实际执行并通过：

- `npx jest tests/unit/features/chat/ConversationRenderService.test.ts --runInBand`
- `npm test`
- `npm run build`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定顺序部署：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含最新 `BUILD_ID`：

- `autopilot-maintainability.202604112300`

## 5. 下一步建议

下一轮最推荐继续收窄 trailing assistant patch 成功态的执行边界：把 `executeTrailingAssistantPatch()` 的调用点改为直接消费 `executionPlan`，让 patch executor 彻底脱离整份 preflight 成功结果。

一句话总结第四十三阶段本轮：

> 第四十二阶段先把 patch-complete 日志依赖收敛成 `completionDebugPlan`；第四十三阶段继续把 turn-body scope 切换/恢复输入前移成 `turnBodyScopePlan`，让 scope helper 更接近“只执行，不取数”。

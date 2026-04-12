# 可维护性改进：第二百二十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-220.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（question resolve flow coordinator / dock-or-inline runtime orchestration）

本轮继续先按 master plan 复审，仍优先选择能直接削弱 `OpenCodianView` question/todo/background-task ownership 的 P2 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `QuestionResolutionFlowCoordinator`，把 `OpenCodianView.showQuestionDialog()` 中仍直接持有的 dock-or-inline fallback、OpenCode `reply/reject` 调用、resolved-request suppress、resolved-state follow-up 与 error notice 收束到 dedicated service，并通过 `QuestionRuntimeHostAdapter` 接回现有 question runtime bundle。**

这次改动没有改变现有语义：启用上方 dock 时，question request 仍优先交给 `QuestionDockCoordinator.waitForDockResolutionIfEnabled()`；未启用 dock 时，仍由 `QuestionInlineCardRenderer.collectAction()` 负责 grouped/sequential inline 交互；answered/rejected runtime state 仍由 `QuestionResolutionCoordinator` 写入并决定是否渲染 resolved card。变化点只是把这段 resolve flow orchestration 从 `OpenCodianView` 下沉到专门的 coordinator，同时删除 view 内独立存在的 `showQuestionDialog()` 与 `suppressResolvedQuestionRequest()`。

## 1. 本轮范围

- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
  - 新增 question resolve flow coordinator，统一承接 dock-or-inline fallback、OpenCode `reply/reject` 调用、resolved-request suppress，以及 answered/rejected state bridge
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 把 `QuestionResolutionFlowCoordinator` 装配进现有 question runtime bundle，保持 `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockCoordinator` 与新 coordinator 共用一份 view host
- `src/features/chat/OpenCodianView.ts`
  - send pipeline 改为直接调用 `questionRuntimeServices.resolutionFlowCoordinator.showQuestionDialog()`
  - 删除 view 内部的 `showQuestionDialog()` 与 `suppressResolvedQuestionRequest()`
- 测试
  - 新增 `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/QuestionResolutionFlowCoordinator.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionResolutionFlowCoordinator.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-221.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionResolutionFlowCoordinator QuestionRuntimeHostAdapter`
- `npm test`
- `npm run build`

补充检查：

- `rg -n "autopilot-maintainability\\.202604130015" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604130015`

## 5. 下一步建议

`QuestionResolutionFlowCoordinator` 迁出后，`OpenCodianView` 在 P2 question 子链上仍直接持有 `QuestionDock` 的 mount/destroy/render trigger、`shouldUseAboveInputQuestionDock()` 设置门控，以及 question dock slot 的 UI lifecycle。**下一轮建议继续留在 P2，把 `QuestionDock` 的 slot lifecycle 与 render trigger 收束成 dedicated lifecycle/host module，继续减少 view 直接持有的 question UI runtime 装配。**

一句话总结第二百二十一阶段本轮：

> 第二百二十一阶段新增 `QuestionResolutionFlowCoordinator` 收束 dock-or-inline question resolve flow，并把 `showQuestionDialog()` 的 OpenCode 调用与 resolved-state follow-up 从 `OpenCodianView` 下沉到统一的 question runtime bundle，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。

# 可维护性改进：第二百二十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-219.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（question runtime host adapter / pending-question refresh-clear routing）

本轮继续先按 master plan 复审，仍优先选择能直接削弱 `OpenCodianView` question/todo/background-task ownership 的 P2 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `QuestionRuntimeHostAdapter`，把 `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockCoordinator` 三段 question runtime 的 host factory 与 service instantiation 收束成同一个 adapter/service bundle，并让 pending-question refresh / clear 直接经由这份 bundle 路由，不再额外经过 `OpenCodianView` 的 forwarding 方法。**

这次改动没有改变现有语义：`QuestionDockCoordinator` 仍负责 pending-question refresh、上方 dock render 与 resolve follow-up，`QuestionInlineCardRenderer` 仍负责 inline question card 交互，`QuestionResolutionCoordinator` 仍负责 resolved-question runtime state / 回顾卡片桥接。变化点只是把三者的 shared host assembly 从 `OpenCodianView` 下沉到统一 adapter，并去掉 view 内单独存在的 `createQuestionInlineCardRendererHost()`、`createQuestionResolutionCoordinatorHost()`、`createQuestionDockCoordinatorHost()`、`clearPendingQuestionsForTab()` 与 `refreshPendingQuestionsForTab()` forwarding。

## 1. 本轮范围

- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - 新增 question runtime host adapter / service bundle，统一从单一 `QuestionRuntimeViewHost` 派生 inline-card、resolution、dock 三组 host，并顺序装配 `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockCoordinator`
- `src/features/chat/OpenCodianView.ts`
  - 改为通过 `createQuestionRuntimeServices()` 获取 question runtime bundle
  - 删除分散的 `createQuestionInlineCardRendererHost()`、`createQuestionResolutionCoordinatorHost()`、`createQuestionDockCoordinatorHost()`
  - 让 `QuestionTodoBackgroundTaskRefreshViewHost` 与 `TabConversationStateBridgeHost` 直接经由 question runtime bundle 调用 pending-question refresh / clear，删除对应 forwarding 方法
- 测试
  - 新增 `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - 更新 `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md`
  - 更新 `docs/modules/features/chat/runtime/QuestionResolutionCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md`
- `docs/modules/features/chat/runtime/QuestionResolutionCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-220.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionRuntimeHostAdapter QuestionDockCoordinator QuestionTodoBackgroundTaskRefreshHostAdapter`
- `npm test`
- `npm run build`

补充检查：

- `rg -n "autopilot-maintainability\\.202604130003" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604130003`

## 5. 下一步建议

`QuestionRuntimeHostAdapter` 迁出后，`OpenCodianView` 在 P2 question 子链上仍直接持有 `showQuestionDialog()` 的 dock-or-inline fallback、OpenCode `reply/reject` 调用、error notice，以及 resolved-state follow-up 路由。**下一轮建议继续留在 P2，但把这段 question resolve runtime flow 收束成 dedicated coordinator/service，继续减少 view 直接持有的 question runtime orchestration。**

一句话总结第二百二十阶段本轮：

> 第二百二十阶段新增 `QuestionRuntimeHostAdapter` 收束 question dock / inline card / resolution 三段共享 wiring，并把 pending-question refresh-clear 路由从 `OpenCodianView` forwarding 下沉到统一 question runtime bundle，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。

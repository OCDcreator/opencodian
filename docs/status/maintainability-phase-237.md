# 可维护性改进：第二百三十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-236.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（activation/open-side question-todo refresh coordinator）

本轮继续按 master plan 与 lane map 优先复审 P2 首查入口，先回到 `OpenCodianView` 里的 question/todo/background-task host factory 与 activation/open wiring，再检查相邻的 `QuestionTodoStatusRefreshCoordinator` 以及 activation 相关 bridge。最终选择的单一切片是：**把 activation/open 侧反复出现的 question dock render、session todo dock writeback，以及 supplemental status/question/todo refresh 顺序抽成独立的 `QuestionTodoActivationRefreshCoordinator`，让 `TabViewActivationBridge` 与 `TabConversationActivationBridge` 共用同一条 question/todo refresh 链。**

这次改动保持 tab activation preflight、streaming fast-path、empty-tab activation、loaded-conversation post-render，以及 current-tab open conversation 的既有刷新顺序不变；变化点只在于 question/todo 相关的 dock writeback 与 activation-side supplemental refresh 不再分别散落在两个 bridge 和 `OpenCodianView` host surface 里，而是统一落到新的 P2 coordinator。

## 1. 本轮范围

- `src/features/chat/services/QuestionTodoActivationRefreshCoordinator.ts`
  - 新增 activation/open 侧的 question/todo refresh coordinator
  - 统一 preflight question dock + todo dock writeback，以及 conversation activation 后的 todo dock → question dock → supplemental refresh 顺序
- `src/features/chat/runtime/TabViewActivationBridge.ts`
  - 改为把 question/todo 相关 activation outcome 委托给新 coordinator
  - 缩窄 bridge host，只保留 pane、background-task indicator、layout、selector/context、send-button 写回
- `src/features/chat/runtime/TabConversationActivationBridge.ts`
  - current-tab open conversation 路径改为复用新 coordinator
  - 缩窄 bridge host，去掉直接 question/todo dock callback
- `src/features/chat/OpenCodianView.ts`
  - 新增 `QuestionTodoActivationRefreshCoordinator` 装配
  - 将 activation/open 侧 question/todo host wiring 收束到单一 coordinator host
- 测试
  - 新增 `tests/unit/features/chat/QuestionTodoActivationRefreshCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/TabViewActivationBridge.test.ts`
  - 更新 `tests/unit/features/chat/TabConversationActivationBridge.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionTodoActivationRefreshCoordinator.md`
  - 更新 `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
  - 更新 `docs/modules/features/chat/runtime/TabConversationActivationBridge.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/QuestionTodoActivationRefreshCoordinator.ts`
- `src/features/chat/runtime/TabViewActivationBridge.ts`
- `src/features/chat/runtime/TabConversationActivationBridge.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/QuestionTodoActivationRefreshCoordinator.test.ts`
- `tests/unit/features/chat/TabViewActivationBridge.test.ts`
- `tests/unit/features/chat/TabConversationActivationBridge.test.ts`
- `docs/modules/features/chat/services/QuestionTodoActivationRefreshCoordinator.md`
- `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
- `docs/modules/features/chat/runtime/TabConversationActivationBridge.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-237.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionTodoActivationRefreshCoordinator`
- `npm test -- TabViewActivationBridge`
- `npm test -- TabConversationActivationBridge`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130306`

未执行完整 `npm test`：本轮改动未命中 `src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 `esbuild.config.mjs` 等高风险路径，且 attempt `232` 不能被 5 整除。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续按 master plan 优先复审 P2 首查入口，选择一个相邻但独立的 activation/open-side host-wiring 切片，例如把 current-tab open 或 loaded-conversation hydration 后剩余的 background-task indicator/context usage writeback 再下沉到专门 coordinator，或把 question/todo 以外的 activation-side host surface 继续收窄；若没有低风险切口，再回到 P3 context/composer/retained-selection 链路。

一句话总结第二百三十七阶段本轮：

> 第二百三十七阶段新增 `QuestionTodoActivationRefreshCoordinator`，把 activation/open 侧的 question dock render、session todo dock writeback 与 supplemental refresh 顺序从两个 activation bridge 和 `OpenCodianView` host surface 中下沉到单一 P2 coordinator。

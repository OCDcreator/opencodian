# 可维护性改进：第二百五十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-257.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（visible sync state-commit coordinator 化）

本轮继续遵循 lane map 的 P2 首查顺序，先看 `OpenCodianView` 中 question/todo/background-task 的 service wiring，再复审 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator`、`SessionTodoHostAdapter` 与 `ConversationSyncHostAdapter` 的既有 host adapter 模式，没有重新广扫其它 chat runtime 大片上下文。

确认的低风险问题是：上一轮已经把 background refresh policy 收口到 `PostSyncQuestionTodoRefreshFacade`，但 `BackgroundTaskPostSyncCoordinator` 仍同时承担 visible conversation sync 的 current-conversation match、`currentConversationRevertState` 写回、active-tab sync fingerprint 更新，以及 hidden/background sync 的 authoritative mark / attention 判定。这让 post-sync coordinator 继续拥有一段 current-conversation runtime bridge 规则。

因此本轮只做一个窄切片：**把 visible conversation post-sync state commit 判定抽到 `VisibleConversationPostSyncStateCoordinator`。** `BackgroundTaskPostSyncCoordinator` 现在先委托 facade 执行 visible question/todo refresh，再把 expected conversation、tab id 与 sync result 交给新 coordinator 生成 apply/indicator outcome。signal sync 与 background-tab sync 的 authoritative mark、refresh routing 和 attention 判定保持不变。

## 1. 本轮范围

- `src/features/chat/services/VisibleConversationPostSyncStateCoordinator.ts`
  - 新增 visible conversation post-sync state commit coordinator
  - 集中 current-conversation match gate、revert-state 写回、changed-only fingerprint 更新与 render outcome 判定
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 移除 current-conversation state-commit host surface
  - visible sync 完成 refresh 后只调用 `VisibleConversationPostSyncStateCoordinator` 的窄 port
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - 从同一份 refresh view host 额外派生 visible state coordinator host
  - 在 P2 refresh service bundle 中顺序装配新 coordinator，再传给 background post-sync coordinator
- 测试
  - 新增 `tests/unit/features/chat/VisibleConversationPostSyncStateCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/VisibleConversationPostSyncStateCoordinator.md`
  - 更新 `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
  - 更新 `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`

## 2. 变更文件

- `src/features/chat/services/VisibleConversationPostSyncStateCoordinator.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `tests/unit/features/chat/VisibleConversationPostSyncStateCoordinator.test.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `docs/modules/features/chat/services/VisibleConversationPostSyncStateCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/status/maintainability-phase-258.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskPostSyncCoordinator VisibleConversationPostSyncStateCoordinator QuestionTodoBackgroundTaskRefreshHostAdapter ConversationSyncBridge`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130620`

本轮未执行完整 `npm test` 的原因：

- attempt `253` 不可被 `5` 整除，且改动未命中仓库规则要求完整测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议不要继续拆同一条 visible sync state-commit 规则。可沿 lane map 首查链路再看 P2 host factory 是否还剩低风险的 current-conversation / runtime-state bridge 组装；如果没有明显可迁出的 ownership，则按 focus hint 切到 P3 `context / composer / retained-selection`，优先检查 composer context builder、context catalog 与 retained-selection runtime 的边界。

一句话总结第二百五十八阶段本轮：

> 第二百五十八阶段把 visible conversation post-sync 的 current-conversation state commit 判定从 `BackgroundTaskPostSyncCoordinator` 移到 `VisibleConversationPostSyncStateCoordinator`，让 background post-sync coordinator 更专注于 refresh routing、authoritative mark 与 attention 判定。

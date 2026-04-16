# 可维护性改进：第二百五十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-256.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（background refresh policy facade 化）

本轮继续遵循 lane map 的 P2 首查顺序，先看 `OpenCodianView` 中 question/todo/background-task 的 service wiring，再复审 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 与既有 host adapter 模式，没有重新广扫其它 chat runtime 大片上下文。

确认的低风险问题是：上一轮已经把 background-task rebuild/writeback 从 facade host 中收拢到 dedicated post-sync refresh port，但 `BackgroundTaskPostSyncCoordinator` 仍把 signal sync 与 background-tab sync 的 `forceTodoStatusRefresh` 原始布尔策略传给 `PostSyncQuestionTodoRefreshFacade`。这让 coordinator 继续知道“signal 只在 tab 仍有 background task 时强制刷新、background-tab 固定强制刷新”的 todo/status refresh 策略细节。

因此本轮只做一个窄切片：**把 background conversation 的 todo/status force-refresh 判定改成 `PostSyncQuestionTodoRefreshFacade` 内部持有的 refresh policy。** `BackgroundTaskPostSyncCoordinator` 现在只传递同步来源与必要的 signal metadata；facade 再把 `signal-sync` / `background-tab` policy 映射为 `QuestionTodoStatusRefreshCoordinator.refreshAfterPostSync()` 的 `forceTodoStatusRefresh`。原有顺序保持不变：pending-question refresh 之后触发 background-task runtime rebuild，再进入 todo/status refresh gate，最后 flush completion notice 与 stream-like writeback。

## 1. 本轮范围

- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
  - 新增 `BackgroundConversationTodoStatusRefreshPolicy`
  - 在 facade 内部集中映射 signal/background-tab 的 todo/status 强制刷新策略
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 不再向 facade 传递原始 `forceTodoStatusRefresh` 布尔值
  - 改传 `signal-sync` / `background-tab` refresh policy 与必要的 signal metadata
- 测试
  - 更新 `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts`
  - 覆盖 signal policy 不强制刷新与 background-tab policy 强制刷新的映射
- 直接相关文档
  - 更新 `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
  - 更新 `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`

## 2. 变更文件

- `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/status/maintainability-phase-257.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskPostSyncCoordinator PostSyncQuestionTodoRefreshFacade QuestionTodoBackgroundTaskRefreshHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130611`

本轮未执行完整 `npm test` 的原因：

- attempt `252` 不可被 `5` 整除，且改动未命中仓库规则要求完整测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续优先看 master-plan 的 P2 `question / todo / background task` lane，但不要继续机械拆分同一条 policy。可沿 lane map 首查链路复审 `QuestionTodoBackgroundTaskRefreshHostAdapter` 与 `OpenCodianView` 的 P2 host factory，寻找是否还能把剩余的 current-conversation / runtime-state bridge 装配收束成更窄的 facade-owned port；如果没有低风险收益，则切到 P3 context/composer。

一句话总结第二百五十七阶段本轮：

> 第二百五十七阶段把 signal/background-tab 的 todo/status force-refresh 原始布尔策略从 `BackgroundTaskPostSyncCoordinator` 移到 `PostSyncQuestionTodoRefreshFacade` 的 background refresh policy 中，让 post-sync coordinator 更专注于 authoritative mark、attention 与 visible sync state-commit 判定。

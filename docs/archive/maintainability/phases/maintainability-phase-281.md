# 可维护性改进：第二百八十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-280.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（background attention seam）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 hidden signal/background-tab post-sync 路径里的 fingerprint 对比与 attention outcome handling 从 `BackgroundTaskPostSyncCoordinator` 抽到独立的 `BackgroundConversationAttentionCoordinator`。**

这样 `BackgroundTaskPostSyncCoordinator` 继续保留 visible/background refresh routing 与 signal authoritative-sync mark，而 background sync 的变化判定和 tab attention policy 则集中到专门的 seam，和上一轮抽出的 background refresh executor 形成并列边界。

## 1. 本轮范围

- `src/features/chat/services/BackgroundConversationAttentionCoordinator.ts`
  - 新增 background attention seam
  - 集中 signal/background-tab sync 的 fingerprint 对比与 attention 写回规则
  - 保留既有语义：signal sync 在 active tab 写回 `false`、hidden tab 写回 `true`；background-tab sync 在有变化时写回 `true`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
  - 删除 background sync fingerprint/attention 细节
  - 改为把 signal/background-tab 的 attention outcome 委托给新 coordinator
  - 仅保留 signal authoritative-sync mark、visible refresh/state handoff 与 background refresh routing
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - 在 shared refresh service bundle 中新增 `BackgroundConversationAttentionCoordinator`
  - 把 attention host 与 authoritative-sync host 分拆成两条更窄的 post-sync bridge
- 测试
  - 新增 `tests/unit/features/chat/BackgroundConversationAttentionCoordinator.test.ts`
  - 更新 `BackgroundTaskPostSyncCoordinator` 与 `QuestionTodoBackgroundTaskRefreshHostAdapter` focused tests，覆盖新的 host/service seam
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/BackgroundConversationAttentionCoordinator.md`
  - 更新 background post-sync coordinator / refresh host adapter / visible refresh facade 文档，明确 background attention 的新职责边界

## 2. 变更文件

- `src/features/chat/services/BackgroundConversationAttentionCoordinator.ts`
- `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `tests/unit/features/chat/BackgroundConversationAttentionCoordinator.test.ts`
- `tests/unit/features/chat/BackgroundTaskPostSyncCoordinator.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `docs/modules/features/chat/services/BackgroundConversationAttentionCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskPostSyncCoordinator.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/PostSyncQuestionTodoRefreshFacade.md`
- `docs/status/maintainability-phase-281.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundConversationAttentionCoordinator BackgroundTaskPostSyncCoordinator QuestionTodoBackgroundTaskRefreshHostAdapter`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131051`

本轮未执行全量 `npm test` 的原因：

- attempt `279` 不能被 `5` 整除
- 改动未命中仓库规则要求补跑全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续留在高优先级 P2，优先考虑把 `BackgroundTaskPostSyncCoordinator` 里剩余的 signal authoritative-sync mark 也收窄到 dedicated background signal state seam，让 coordinator 更接近纯粹的 visible/background refresh router。

一句话总结第二百八十一阶段本轮：

> 第二百八十一阶段把 hidden signal/background-tab post-sync 路径里的 fingerprint 对比与 tab attention policy 从 `BackgroundTaskPostSyncCoordinator` 抽到新的 `BackgroundConversationAttentionCoordinator`，让 background refresh 与 background attention 成为并列的独立 post-sync seam。

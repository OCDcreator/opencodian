# 可维护性改进：第三百一十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-315.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`
> **完成的 roadmap queue item**: `R1 - 收束 P2 runtime provider 链`

本轮严格按 roadmap 的第一个 `[NEXT]` 项执行，只检查 `QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`、`QuestionTodoBackgroundTaskRuntimeHostProvider.ts`、`QuestionTodoBackgroundTaskRuntimeViewHostFactory.ts` 及其在 `OpenCodianView.ts` 的接线入口。结论是这条主调用链已经出现收益递减的双重转发：`OpenCodianView -> QuestionTodoBackgroundTaskRuntimeServiceBundle -> QuestionTodoBackgroundTaskRuntimeHostProvider -> QuestionTodoBackgroundTaskRuntimeViewHostFactory -> adapter/services`。本轮选择最小可行的收束切片：**把 provider 与 view-host factory 直接并回 `QuestionTodoBackgroundTaskRuntimeServiceBundle`，让 bundle 同时拥有 flat runtime seam 消费、shared view-host 组装、以及既有 refresh/activation/visible-state service instantiation。**

这样 question / todo / background-task 的主装配链缩短为：

- `OpenCodianView -> QuestionTodoBackgroundTaskRuntimeServiceBundle -> adapter/services`

本轮刻意**没有**触碰 `QuestionDock.ts` UI markup、stream routing、settings/core，也没有改动 question/todo/background-task 的业务语义，只移除了低价值的 provider/factory 跳转层。

## 1. 本轮范围

- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
  - 并入原 `RuntimeHostProvider` 与 `RuntimeViewHostFactory` 的扁平 seam 消费、shared view-host 组装与 host 类型
- `src/features/chat/OpenCodianView.ts`
  - 改为直接提供 `QuestionTodoBackgroundTaskRuntimeServiceBundleHost`
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.ts`
  - 删除；其 grouped-port forwarding 已并回 service bundle
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.ts`
  - 删除；其 shared view-host assembly 已并回 service bundle
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
  - 更新 bundle 装配断言
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts`
  - 新增 focused coverage，直接验证并回后的 shared view-host late-bound 行为
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeHostProvider.test.ts`
  - 删除；旧 provider seam 已不存在
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHostFactory.test.ts`
  - 删除；旧 factory seam 已不存在
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.md`
  - 更新模块边界，说明 bundle 现已直接拥有 shared host assembly
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncStateHostAdapter.md`
- `docs/modules/features/chat/services/TabConversationSyncFingerprintPortProvider.md`
  - 同步更新直接相关边界描述
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.md`
  - 删除；模块已合并
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.md`
  - 删除；模块已合并

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.md`
- `docs/modules/features/chat/services/VisibleConversationPostSyncStateHostAdapter.md`
- `docs/modules/features/chat/services/TabConversationSyncFingerprintPortProvider.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-phase-316.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts tests/unit/features/chat/VisibleConversationPostSyncStateHostAdapter.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131735`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮应按 roadmap 推进新的 `[NEXT]` 项：`R2 - Question dock 生命周期协调`。建议优先把 pending requests、draft answers、active indexes 与 submit/reject 后处理继续收束进较厚的 question lifecycle coordinator，让 `OpenCodianView` 不再直接维护 question runtime map 的主要读写。

一句话总结第三百一十六阶段本轮：

> 第三百一十六阶段把 question/todo/background-task 的 runtime provider 与 view-host factory 并回 `QuestionTodoBackgroundTaskRuntimeServiceBundle`，把主装配链从五段跨文件跳转缩短到三段，并保持既有行为不变。

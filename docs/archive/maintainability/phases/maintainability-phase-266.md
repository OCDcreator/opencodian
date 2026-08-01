# 可维护性改进：第二百六十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-265.md`
> **推进的 master-plan lane**: P2 `question / todo / background task wiring 与 post-sync/activation 协调`（shared view-host factory）

本轮回到 master plan 与 lane map 更高优先级的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 `OpenCodianView` 里 question/todo/background-task activation 与 post-sync 共用的 view-host 派生，从两段平行的 private host factory 收束到共享的 `QuestionTodoBackgroundTaskViewHostFactory`。**

这样 activation-side 的 dock/indicator host 与 refresh-side 的 post-sync/runtime host 现在都从同一份更窄的 view-level seam 派生；`OpenCodianView` 只保留单一的 question/todo/background-task state writeback host，而不再分别维护 activation/post-sync 两段近似重复的闭包工厂。

## 1. 本轮范围

- `src/features/chat/services/QuestionTodoBackgroundTaskViewHostFactory.ts`
  - 新增 shared factory，同时派生 activation-side 与 refresh-side adapter host
  - 统一 current-conversation/runtime/background-task rebuild、revert-state/fingerprint writeback、todo dock render 与 indicator reset/render seam
- `src/features/chat/OpenCodianView.ts`
  - 改为通过 shared factory 生成 question/todo/background-task activation/post-sync host
  - 删除分散的 activation/refresh host factory，收缩为单一 question/todo/background-task host writeback 入口
- 测试
  - 新增 `tests/unit/features/chat/QuestionTodoBackgroundTaskViewHostFactory.test.ts`
  - 继续用 host-adapter 邻近用例覆盖 activation/post-sync wiring 回归
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionTodoBackgroundTaskViewHostFactory.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskViewHostFactory.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskViewHostFactory.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskViewHostFactory.md`
- `docs/status/maintainability-phase-266.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionTodoBackgroundTaskViewHostFactory QuestionTodoBackgroundTaskActivationHostAdapter QuestionTodoBackgroundTaskRefreshHostAdapter`
- `npm run build`

本轮未执行完整 `npm test`。

原因：

- attempt `261` 不可被 `5` 整除
- 改动未命中仓库约定的 full-test 高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮继续留在高优先级 P1 / P2：从 activation/post-sync 首查入口继续挑一个共享 wiring 切片，优先考虑把 `OpenCodianView` 中 question runtime 或 conversation activation 相邻的 late-bound host/read-write seam，再下沉到 dedicated factory / bridge，而不是回到低收益的 trailing-assistant helper 细拆。

一句话总结第二百六十六阶段本轮：

> 第二百六十六阶段把 question/todo/background-task activation 与 post-sync 共用的 view-host 派生收束到 shared factory，让 `OpenCodianView` 的这组 P2 host wiring 进一步压缩成单一写回入口。

# 可维护性改进：第二百六十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-267.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（question runtime late-bound host factory）

本轮遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 `OpenCodianView` 里 question runtime 相邻的 late-bound host assembly，收束到独立的 `QuestionRuntimeViewHostFactory`。**

这样 question runtime 对 `QuestionDockSlotCoordinator`、OpenCode question API、`TabRuntimeStateBridge`、`ConversationSyncBridge` 与 `SessionTodoStatusRefreshService` 的相邻装配，不再继续并排写在 view 构造函数里；`OpenCodianView` 只保留一份更窄的 factory host，而实际的 `QuestionRuntimeViewHost` 生成则先经由 dedicated factory，再复用既有 adapter。

## 1. 本轮范围

- `src/features/chat/services/QuestionRuntimeViewHostFactory.ts`
  - 新增 question runtime host factory，从单一 shared host 派生 `QuestionRuntimeViewHost`
  - 用 getter 收束 dock/API/attention/sync/status 这几组相邻 late-bound port，并继续复用 `QuestionRuntimeViewHostAdapter`
- `src/features/chat/OpenCodianView.ts`
  - 改为通过 `QuestionRuntimeViewHostFactory` 组装 question runtime host
  - 删除构造函数里内联的 question runtime 多口依赖拼装，只保留更窄的 factory host 入口
- 测试
  - 新增 `tests/unit/features/chat/QuestionRuntimeViewHostFactory.test.ts`
  - 继续保留 `QuestionRuntimeViewHostAdapter` 与 `QuestionRuntimeHostAdapter` 邻近用例覆盖行为回归
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/QuestionRuntimeViewHostFactory.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionRuntimeViewHostFactory.ts`
- `tests/unit/features/chat/QuestionRuntimeViewHostFactory.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/QuestionRuntimeViewHostFactory.md`
- `docs/modules/features/chat/services/QuestionRuntimeViewHostAdapter.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/status/maintainability-phase-268.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionRuntimeViewHostFactory QuestionRuntimeViewHostAdapter QuestionRuntimeHostAdapter`
- `npm run build`

本轮未执行完整 `npm test`。

原因：

- attempt `263` 不可被 `5` 整除
- 改动未命中仓库约定的 full-test 高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮继续留在高优先级 P2：沿 question/todo/background-task 首查入口继续挑一个共享写回 seam，优先考虑把 question post-resolution 或 pending-refresh 相邻的剩余 runtime/writeback host，进一步下沉到 dedicated factory / facade，而不是回到低收益的 helper 细拆。

一句话总结第二百六十八阶段本轮：

> 第二百六十八阶段把 question runtime 相邻的 late-bound host 装配收束到 `QuestionRuntimeViewHostFactory`，让 `OpenCodianView` 的这组 P2 question wiring 进一步压缩成单一 factory seam。

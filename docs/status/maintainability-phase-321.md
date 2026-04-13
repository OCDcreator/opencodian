# 可维护性改进：第三百二十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-320.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`
> **完成的 roadmap queue item**: `R6 - P2 集成测试与文档回收`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R6 - P2 集成测试与文档回收`。本轮没有继续拆新的 owner，而是围绕 R1-R5 已经收束出的 question dock、todo refresh/status、background completion notice 以及 session signal/runtime handoff 补齐 focused regression coverage，并把 lane map / roadmap 明确切换到“P2 queue 已完成、后续只保留回归 watchpoints”的状态。这样本轮削弱的是 **P2 链路对人工记忆的依赖**：question dock 清理、post-sync todo/status gate、background completion notice 聚合/去重、以及 stale refresh guard 都落进了现有 owner 的单测，而不是继续散落在 `OpenCodianView` 附近靠人工回归兜底。

本轮刻意**没有**继续打开新的重构切口，也没有碰 `OpenCodianView`、settings/core、stream parser、question/todo/background-task 的既有 runtime owner 边界。`docs/modules/**` 本轮只做了审阅，没有强行改动：R1-R5 已同步过模块边界，本轮按仓库规则把文档更新集中在状态文档，避免为了“文档回收”再次制造无意义的模块文档 churn。

## 1. 本轮范围

- 更新 focused tests
  - `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
    - 补了 background tab 丢失 session 时，`refreshPendingQuestionsForTab()` 统一清空 waiter / draft / active selection / resolved-id 的回归用例
  - `tests/unit/features/chat/QuestionTodoStatusRefreshCoordinator.test.ts`
    - 补了 `backgroundTaskLaunches` 仍活跃时也必须触发 todo/status post-sync refresh 的 gate 用例
  - `tests/unit/features/chat/SessionTodoCoordinator.test.ts`
    - 补了 session status refresh 的 stale request-id guard 用例，和 todo refresh 的 guard 对齐
  - `tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts`
    - 补了同一 anchor 多次 queue 后再 flush 时的 reminder/task 聚合、排序与时间戳回归用例
- 更新状态文档
  - `docs/status/maintainability-lane-map.md`
    - 把 P2 标记为 regression-only，明确剩余风险与下一轮首查入口已经切到 P3
  - `docs/status/maintainability-round-roadmap.md`
    - 标记 `R6` 为 `[DONE]`
    - 提升 `R7 - P3 context/composer/retained-selection ownership` 为新的 `[NEXT]`
    - 记录 P2 queue 已完成与剩余 regression 风险
  - `docs/status/maintainability-phase-321.md`
    - 记录本轮范围、验证结果、部署结论与下一步建议

## 2. 变更文件

- Tests
  - `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - `tests/unit/features/chat/QuestionTodoStatusRefreshCoordinator.test.ts`
  - `tests/unit/features/chat/SessionTodoCoordinator.test.ts`
  - `tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts`
- Status
  - `docs/status/maintainability-lane-map.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-phase-321.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/QuestionDockCoordinator.test.ts tests/unit/features/chat/QuestionTodoStatusRefreshCoordinator.test.ts tests/unit/features/chat/SessionTodoCoordinator.test.ts tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131907`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动只涉及 tests 与状态文档，没有命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮应按 roadmap 推进新的 `[NEXT]` 项：`R7 - P3 context/composer/retained-selection ownership`。建议从 composer/context builder、context catalog 与 retained-selection runtime 里挑一块完整 lifecycle ownership 迁出，避免回到已经完成 queue 的 P2 再开新拆分切口。

一句话总结第三百二十一阶段本轮：

> 第三百二十一阶段为 P2 最终 owner 补齐 focused regression coverage，并把 roadmap/lane map 明确推进到“P2 queue 完成、下一轮转向 R7/P3”的状态。

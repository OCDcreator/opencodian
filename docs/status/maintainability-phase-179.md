# 可维护性改进：第一百七十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-178.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` 链路（question dock / pending question orchestration）

本轮遵循 master plan 的 P2，继续优先削弱 `OpenCodianView` 在 question / background-task 相邻链路上的 ownership，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**新增 `QuestionDockCoordinator`，把上方 question dock 的 pending-question refresh、draft answer/runtime map、dock render callbacks、waiter 保活，以及提交/拒绝后的 follow-up 编排从 `OpenCodianView` 迁走。**

这次改动没有改变 question display mode、resolved suppression、active/background tab attention、inline question card fallback，或 question answered/rejected resolution card 的既有行为；只是把上方 dock 与 pending question 的主编排边界收束到 dedicated service，继续降低 `OpenCodianView` 的 runtime/UI ownership。

## 1. 本轮范围

- `src/features/chat/services/QuestionDockCoordinator.ts`
  - 新增 dedicated coordinator，统一持有上方 question dock 的 pending-question refresh、draft answer sanitize、group/index state、waiter 生命周期，以及提交/拒绝后的 post-resolution follow-up
  - 集中处理 active-tab dock render gate、session 过滤、background tab attention 与 active visible sync follow-up
- `src/features/chat/OpenCodianView.ts`
  - 用 `QuestionDockCoordinator` 替换内联的 question dock/pending question 逻辑
  - 新增 `createQuestionDockCoordinatorHost()`，把 view 侧剩余能力收束成单一 host bridge
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - 覆盖上方 dock 提交后的 resolved follow-up
  - 覆盖 waiter-owned pending request 在 background refresh 中的保活
  - 覆盖 dock disabled 时的空态渲染
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - `docs/modules/features/chat/ui/QuestionDock.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/QuestionDockCoordinator.md`
- `docs/modules/features/chat/ui/QuestionDock.md`
- `docs/status/maintainability-phase-179.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionDockCoordinator`
- `npm test`
- `npm run build`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604121507`

## 5. 下一步建议

下一轮如果继续沿 master plan 的 P2 收缩 `OpenCodianView` ownership，较高价值的相邻切片是把 **background-task post-sync 与 question/todo follow-up 之间仍留在 view 的装配桥** 再往 dedicated coordinator 收束，优先审查 background-task follow-up notice / stale follow-up / question refresh 的协作边界，而不是回到 trailing-assistant helper 链。

一句话总结第一百七十九阶段本轮：

> 第一百七十九阶段新增 `QuestionDockCoordinator`，把上方 question dock 与 pending-question refresh / resolution follow-up 的主编排从 `OpenCodianView` 下沉到 dedicated service，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。

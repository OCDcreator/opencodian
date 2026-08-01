# 可维护性改进：第二百三十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-235.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（post-sync refresh view-host adapter）

本轮按 master plan 与 lane map 回到 P2，先从 lane map 指定的 `OpenCodianView` question/todo/background-task host factory 与 wiring 入口切入，再检查 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 以及参考的 host-adapter 模式。最终选择的单一切片是：**在既有 `QuestionTodoBackgroundTaskRefreshHostAdapter` seam 内新增 view-host adapter，把完整 `QuestionTodoBackgroundTaskRefreshViewHost` 的 collaborator wiring 从 `OpenCodianView` 下沉到服务装配模块。**

这次改动保持 post-sync refresh、pending-question refresh、todo/status refresh、background-task completion notice、stream-like 写回、authoritative-sync 标记与 tab attention 写回语义不变；变化点只在于 `OpenCodianView` 不再直接组装完整 refresh view host，而是只保留 current-conversation / tab-runtime / fingerprint writeback 等 view-local 落点，并通过 late-bound getter 安全引用构造期稍后才初始化的 collaborators。

## 1. 本轮范围

- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - 新增 `QuestionTodoBackgroundTaskRefreshViewHostAdapterHost` 与 `createQuestionTodoBackgroundTaskRefreshViewHostAdapter()`
  - 把 question dock、session todo state/status refresh、background-task indicator/live-signal 与 tab runtime bridge 的 wiring 统一收束到既有 P2 host adapter seam
  - 保留 `createQuestionTodoBackgroundTaskRefreshHosts()` 与 `createQuestionTodoBackgroundTaskRefreshServices()` 的既有 coordinator/facade 业务边界
- `src/features/chat/OpenCodianView.ts`
  - 构造 post-sync refresh bundle 时改为调用新增 view-host adapter
  - 将 view-local host 缩窄为 current conversation、tab runtime、background-task state rebuild 与 sync fingerprint/revert-state 写回
- 测试
  - 扩展 `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`，覆盖 late-bound collaborator ports 到完整 refresh view host 的适配行为
- 直接相关文档
  - 更新 `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-236.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- QuestionTodoBackgroundTaskRefreshHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130250`

未执行完整 `npm test`：本轮改动未命中 `src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 `esbuild.config.mjs` 等高风险路径，且 attempt `231` 不能被 5 整除。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续按 master plan 优先复审 P2 首查入口，选择一个相邻但独立的 question/todo/background-task host-wiring 切片，例如把 activation/open 侧剩余的 question dock / todo dock refresh writeback 再下沉到已有 coordinator 或 facade seam；若没有低风险切口，再回到 P3 context/composer/retained-selection 链路。

一句话总结第二百三十六阶段本轮：

> 第二百三十六阶段在既有 `QuestionTodoBackgroundTaskRefreshHostAdapter` seam 内新增 refresh view-host adapter，把 question/todo/background-task post-sync collaborator wiring 从 `OpenCodianView` 下沉到 P2 服务装配模块，并保持现有 post-sync refresh 与 background-task follow-up 行为不变。

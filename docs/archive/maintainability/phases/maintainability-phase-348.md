# 可维护性改进：第三百四十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-347.md`
> **推进的 master-plan lane**: Lint cleanup
> **完成的 roadmap queue item**: `L1 - ESLint autofix sweep`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`L1 - ESLint autofix sweep`。本轮只做 `eslint --fix` 级别的统一清理与状态文档推进，没有借机开启新的 owner 拆分，也没有把 warning cleanup 提前扩展成新的 maintainability 赛道。结果是先把仓库中自动可修的 import/export 排序、type-only import 归位与部分 `prefer-const` 类改动一次性收掉，并把剩余 lint 基线交给下一轮 `L2` 继续处理。

## 1. 本轮范围

- 对当前 lint 脚本覆盖范围执行 `npm run lint -- --fix`
  - 改动以 autofix 为主，累计命中 **109** 个源码/测试文件，主要集中在 `src/core/opencode/**`、`src/features/chat/**`、`tests/unit/core/opencode/**`、`tests/unit/features/chat/**`
  - 变更内容以 import 排序、type import 规范化、局部 `const`/只读写法整理为主；没有新增模块、没有改变现有 owner 边界
- 更新受控队列状态
  - `docs/status/maintainability-round-roadmap.md`：将 `L1` 标记为 `[DONE]`，把 `L2` 提升为 `[NEXT]`
  - `docs/status/maintainability-lane-map.md`：同步当前 `[NEXT]` 指向 `L2`

## 2. Autofix 后的 lint 基线

- `npm run lint` 当前结果：**44 errors / 119 warnings**
- 主要剩余 error 热点：
  - `src/core/opencode/OpenCodeService.ts`：unused symbol
  - `src/features/chat/services/ComposerContextViewFacade.ts`：`prefer-const`
  - `src/features/chat/services/ConversationSyncBackgroundPostSyncRouter.ts`、`ConversationSyncBridge.ts`、`QuestionTodoBackgroundTaskRefreshHostAdapter.ts`、`SessionTodoHostAdapter.ts`：unused imports / `no-empty-object-type`
  - `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`：`no-useless-escape`
  - `tests/unit/features/chat/**` 多个 suite：`prefer-const`、unused vars/imports
- 主要剩余 warning 热点仍是既有的大文件与高复杂度 owner：
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/core/opencode/OpenCodeService.ts`
  - `src/utils/icons/ProviderIconService.ts`
  - 若干既有大测试文件

## 3. 刻意没有动的边界

- 没有做任何非 autofix 驱动的结构调整；`L2` 再处理剩余 lint errors
- 没有新增或拆分新的 service / coordinator / adapter owner
- 没有读取或更新 `docs/modules/**`，因为本轮没有模块边界变化
- 没有部署到 Test Vault；虽然本轮改动了代码与测试并运行了 build，但未命中 `src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/` 这些 deploy-relevant 路径

## 4. 验证

- Targeted:
  - `npm test -- tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/features/chat/QuestionDockCoordinator.test.ts tests/unit/features/chat/QuestionTodoStatusRefreshCoordinator.test.ts tests/unit/features/chat/SessionTodoCoordinator.test.ts tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts tests/unit/features/chat/ConversationSessionSignalRuntime.test.ts`
- Full:
  - `npm run lint -- --fix`
  - `npm run lint`
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604141501`

## 5. 文件变更

- Autofix-only 源码改动：
  - `src/core/config/ModelCatalogStateService.ts`
  - `src/core/opencode/*.ts` 下本轮命中的 coordinator / service / mapper 文件
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/runtime/*.ts`
  - `src/features/chat/services/*.ts`
- Autofix-only 测试改动：
  - `tests/unit/core/opencode/*.test.ts`
  - `tests/unit/features/chat/*.test.ts`
- 状态文档：
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - `docs/status/maintainability-phase-348.md`

## 6. 下一步建议

下一轮应按 roadmap 执行 `L2 - Non-autofix error cleanup`，优先清掉 `src/core/opencode/OpenCodeService.ts`、`src/features/chat/services/**` 与 `tests/unit/features/chat/**` 中当前剩余的 `no-unused-vars`、`prefer-const`、`no-empty-object-type`、`no-useless-escape` errors，再次确认 `npm run lint` 是否已无 error。

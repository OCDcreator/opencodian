# 可维护性改进：第三百四十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-348.md`
> **推进的 master-plan lane**: Lint cleanup
> **完成的 roadmap queue item**: `L2 - Non-autofix error cleanup`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`L2 - Non-autofix error cleanup`。范围仅限清掉当前仓库中无法由 autofix 自动处理的 ESLint errors，没有借机启动新的 owner 拆分，也没有提前进入 warning cleanup。结果是把仓库从 `44 errors / 119 warnings` 拉到 `0 errors / 119 warnings`，并把受控队列推进到 `L3 - Lint green checkpoint`。

## 1. 本轮范围

- 清理 `src/core/opencode/**`、`src/features/chat/services/**` 与相关 tests 中的非 autofix lint errors
  - 删除 `OpenCodeService.ts` 中未使用的结构化错误名称 helper
  - 将空接口改为等价 type alias，消除 `no-empty-object-type`
  - 删除未使用 imports / vars，并把若干 test fixture 的一次性 `let` 绑定改成 late-bound object holder 或 `const`
  - 去掉 `OpenCodeStreamEventTransformer.test.ts` 中无意义的字符串转义
- 同步受控队列状态
  - `docs/status/maintainability-round-roadmap.md`：将 `L2` 标记为 `[DONE]`，把 `L3` 提升为 `[NEXT]`
  - `docs/status/maintainability-lane-map.md`：同步当前 `[NEXT]` 指向 `L3`

## 2. Lint 结果

- `npm run lint` 当前结果：**0 errors / 119 warnings**
- 本轮清理的 error 类型：
  - `@typescript-eslint/no-unused-vars`
  - `prefer-const`
  - `@typescript-eslint/no-empty-object-type`
  - `no-useless-escape`
- warnings 仍保持上一轮基线的 **119** 条，热点仍集中在既有大文件与高复杂度 owner（例如 `src/core/opencode/OpenCodeService.ts`、`src/features/chat/OpenCodianView.ts`、`src/features/settings/OpenCodianSettings.ts`）

## 3. 变更文件

- 源码：
  - `src/core/opencode/OpenCodeService.ts`
  - `src/features/chat/services/ComposerContextViewFacade.ts`
  - `src/features/chat/services/ConversationSyncBackgroundPostSyncRouter.ts`
  - `src/features/chat/services/ConversationSyncBridge.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
  - `src/features/chat/services/SessionTodoHostAdapter.ts`
- 测试：
  - `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
  - `tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts`
  - `tests/unit/features/chat/BackgroundTaskIndicatorCoordinator.test.ts`
  - `tests/unit/features/chat/ConversationRenderService.test.ts`
  - `tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts`
  - `tests/unit/features/chat/QuestionRuntimeViewHostAdapter.test.ts`
  - `tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts`
  - `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
- 状态文档：
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - `docs/status/maintainability-phase-349.md`

## 4. 验证

- Targeted:
  - `npm test -- tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/features/chat/BackgroundConversationPostSyncHandoffHostAdapter.test.ts tests/unit/features/chat/BackgroundTaskIndicatorCoordinator.test.ts tests/unit/features/chat/ConversationRenderService.test.ts tests/unit/features/chat/PostSyncQuestionTodoRefreshFacade.test.ts tests/unit/features/chat/QuestionRuntimeViewHostAdapter.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskActivationHostAdapter.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts tests/unit/features/chat/SessionTodoHostAdapter.test.ts tests/unit/features/chat/ConversationSyncBridge.test.ts tests/unit/features/chat/ConversationSyncHostAdapter.test.ts`
  - `npm run lint`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604141514`

## 5. 部署

- 未部署到 Test Vault；本轮未命中 `src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/` 等 deploy-relevant 路径

## 6. 下一步建议

下一轮应按 roadmap 执行 `L3 - Lint green checkpoint`，围绕当前 `0 errors / 119 warnings` 基线做 checkpoint 文档确认，只在需要维持 lint 绿灯时补最小修改，并给出剩余 warnings 的真实热点分布。

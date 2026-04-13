# 可维护性改进：第二百九十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-290.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（stale session-todo pass-through 清理）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**删除 `OpenCodianView` 里残留的 stale session-todo 薄 pass-through，彻底把这组 suppress/build 细节固定在 `SessionTodoStateService`。**

这样 `OpenCodianView` 不再保留只用于测试或历史过渡的 stale session-todo helper，session todo 的 stale suppression / notice 文案 ownership 继续收束在既有 service 边界内。

## 1. 本轮范围

- `src/features/chat/OpenCodianView.ts`
  - 删除未再被生产代码消费的 `hasIncompleteTodos()`、`suppressStaleSessionTodosIfNeeded()` 与 `buildStaleSessionTodoNoticeContent()` 薄转发
  - 保留已有 `SessionTodoStateService` / `SessionTodoHostAdapter` 边界，不再让主视图暴露 stale session-todo helper shim
- `tests/unit/features/chat/staleSessionTodoState.test.ts`
  - 删除重复验证 `SessionTodoStateService` stale suppression / persisted notice restore 的旧 view-level 测试
  - 相关行为继续由已有 `tests/unit/features/chat/SessionTodoStateService.test.ts` 覆盖
- `docs/status/maintainability-phase-291.md`
  - 记录本轮切片、验证结果与下一步建议

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/staleSessionTodoState.test.ts`
- `docs/status/maintainability-phase-291.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- SessionTodoStateService`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131231`

本轮未执行全量 `npm test`。

原因：attempt `289` 不能被 `5` 整除，且改动未命中仓库规则中要求全量测试的 high-risk 路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 `esbuild.config.mjs`）。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续沿 P2 首查入口复审 question-resolution follow-up：优先检查 `QuestionPostResolutionRuntimeFacade` 与 `QuestionRuntimeViewHostFactory` 周围是否还存在仅为 status refresh / visible sync 组合而保留的 view-side pass-through；若没有同等级切口，再转向 P1 的 activation / sync runtime bridge host assembly。

一句话总结第二百九十一阶段本轮：

> 第二百九十一阶段删除了 `OpenCodianView` 里残留的 stale session-todo helper 转发与重复 view-level 测试，让这组 suppress/build 责任继续稳定留在 `SessionTodoStateService`。

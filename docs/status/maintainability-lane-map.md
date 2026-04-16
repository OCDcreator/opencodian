# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [PAUSED] `R162` 已完成；当前没有可自动执行的后续任务。

## 当前优先级

- **当前 `[NEXT]`**：当前没有可自动执行的后续任务
- **本批目标**：`R160-R162` 已完成最后一批受控 closeout，并以高可维护性 checkpoint 停机
- **当前 lint 基线**：`0 errors / 0 warnings`
- **当前 typecheck 基线**：通过
- **热点顺序**：
  1. 当前没有可自动执行的后续任务；如需继续，先人工续排新的受控 queue

## 本批边界

- 当前 queue 已关闭；不得自动扩展 `R163+`
- 不新增薄 helper / adapter / provider / factory；优先把过薄文件并回相邻厚 owner，禁止并回 `OpenCodianView` / `OpenCodeService` 主文件本体
- `OpenCodianView` / `OpenCodeService` 的改动必须带来可见的 line count、import surface 或 assembly surface 收缩，不能只做“换文件不减复杂度”
- tests / glass / demo cleanup 只允许作为阻塞修复；不允许删断言、减覆盖或把实验特性暴露到 stable UI path
- 当前 maintainability 批次默认不部署；部署只在用户后续明确要求时才允许恢复
- 每轮必须保持 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build` 全绿

## 远端实测热点提示

- `src/features/chat/OpenCodianView.ts`：`R160` 后约 `4857` 行、`88` 条 import；question post-resolution thin adapter 已并回 `QuestionRuntimeHostAdapter`
- `src/core/opencode/OpenCodeService.ts`：`R161` 后约 `1358` 行、`24` 条 import；diagnostics 已并回 `OpenCodeSdkFacade`，session lifecycle 不再依赖 service-local CRUD adapter，`R162` 已确认足以停机
- `src/features/chat/services/`：只作为并回/收束目标周边证据，不为清理碎片新增新的薄层
- 当前质量门槛已经全绿，任何 round 若不能维持 `0 errors / 0 warnings` 与 typecheck/test/build 通过，必须最小修复或失败回滚

## 回归观察点

- `OpenCodianView`：并发 tab/session streaming、hydration/auth-sync gate、background-task completion notice、scroll restore、question card resolution 不回归
- chat services：background-task timeline、authoritative sync、question/todo runtime、input panel theme、model/permission selector 语义不变
- `OpenCodeService` / streaming：SDK-first / legacy fallback、session-scoped abort/detach、managed server adoption/restart、sync-event bridge 语义不变
- tests / glass / demo：heavy suites coverage、opt-in glass 行为与 experimental demo guardrail 不变
- lint/typecheck/test/build：整批必须全绿

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-497.md`
- 最近 checkpoint：`docs/status/maintainability-phase-497.md`

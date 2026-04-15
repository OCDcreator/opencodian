# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [READY] `R102-R137` 长队列继续推进；当前 `[NEXT]` 为 `R102 - Checkpoint after chat services seams`。

## 当前优先级

- **当前 `[NEXT]`**：`R102 - Checkpoint after chat services seams`
- **本批目标**：先完成 chat services checkpoint，再转 batch 4 的 question / todo / background-task seams，随后才回到 opencode core、secondary core / settings / startup
- **当前 lint 基线**：`0 errors / 65 warnings`
- **热点顺序**：
  1. `docs/status/maintainability-master-plan.md`
  2. `docs/status/maintainability-round-roadmap.md`
  3. `docs/status/maintainability-phase-436.md`
  4. `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
  5. `src/features/chat/services/QuestionResolutionExecutionFacade.ts`
  6. `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
  7. `src/features/chat/services/QuestionTodoActivationRefreshCoordinator.ts`
  8. `src/core/opencode/OpenCodeService.ts`

## 本批边界

- autopilot 只能按 `R90 -> R137` 顺序推进
- 不新增薄 helper / adapter / provider / factory；新 owner 必须覆盖完整 lifecycle / runtime seam
- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 的 maintainability 仅允许在 queue 明示项内继续推进
- heavy tests follow-up 只允许按责任域收口，不允许为了降 warning 去篡改覆盖语义
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验
- 恢复运行必须使用外部 profile `/Users/dht/.config/opencodian/mac-autopilot-profile.json`

## 回归观察点

- `OpenCodianView`：并发 tab/session streaming、hydration/auth-sync gate、background-task completion notice、scroll restore、question card resolution 不回归
- chat services：background-task timeline、model selection、input panel theme、session todo stale notice、question dock 行为不变
- `OpenCodeService` / streaming：SDK-first / legacy fallback、session-scoped abort/detach、final response completion、sync-event bridge 语义不变
- settings / startup：settings normalization、provider/model disable layering、conversation restore preload、locale/theme startup 不回归
- lint：整批都必须维持 `0 errors`

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-436.md`
- 最近 checkpoint：`docs/status/maintainability-phase-432.md`

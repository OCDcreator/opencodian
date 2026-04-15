# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [REVIEW_REQUIRED] `R137` 已完成；当前没有可自动执行的 `[NEXT]`。

## 当前优先级

- **当前 `[NEXT]`**：当前没有可自动执行的 `[NEXT]`
- **本批目标**：`R137` 已完成 final checkpoint / queue closeout；当前停回人工确认态，等待是否续排新 queue
- **当前 lint 基线**：`0 errors / 57 warnings`
- **热点顺序**：
  1. `docs/status/maintainability-phase-472.md`
  2. `docs/status/maintainability-master-plan.md`
  3. `docs/status/maintainability-round-roadmap.md`

## 本批边界

- `R128 -> R137` 已全部完成；恢复 autopilot 前必须先人工补写新的 `[QUEUED]` 项
- 不新增薄 helper / adapter / provider / factory；新 owner 必须覆盖完整 lifecycle / runtime seam
- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 的 maintainability 仅允许在 queue 明示项内继续推进
- warning closeout 只允许沿现有厚 seam 收口，不允许为了降 warning 去篡改覆盖语义或制造薄碎片模块
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验
- 恢复运行必须使用外部 profile `/Users/dht/.config/opencodian/mac-autopilot-profile.json`，且不得自动生成 `R138+`

## 回归观察点

- `OpenCodianView`：并发 tab/session streaming、hydration/auth-sync gate、background-task completion notice、scroll restore、question card resolution 不回归
- chat services：background-task timeline、model selection、input panel theme、session todo stale notice、question dock 行为不变
- `OpenCodeService` / streaming：SDK-first / legacy fallback、session-scoped abort/detach、final response completion、sync-event bridge 语义不变
- settings / startup：settings normalization、provider/model disable layering、conversation restore preload、locale/theme startup 不回归
- lint：整批都必须维持 `0 errors`

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-472.md`
- 最近 checkpoint：`docs/status/maintainability-phase-472.md`

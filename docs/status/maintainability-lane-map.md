# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [WAITING] `R138-R152` 已完成；当前没有可自动执行的 `[NEXT]`，等待人工续排。

## 当前优先级

- **当前 `[NEXT]`**：当前没有可自动执行的 `[NEXT]`
- **本批目标**：`R138-R152` 的三批 residual 收束与 continuation checkpoint 已完成，当前只保留人工续排前的 hotspot 复盘
- **当前 lint 基线**：`0 errors / 36 warnings`
- **热点顺序**：
  1. 人工续排前先在 `tests/**`、`src/features/chat/**`、`src/utils/glass/**`、`src/features/settings/**` 与 `src/core/opencode/**` 之间重排 residual 成本

## 本批边界

- `R138 -> R152` 队列已完成；当前不得自动扩展 `R153+`
- 不新增薄 helper / adapter / provider / factory；新 owner 必须覆盖完整 lifecycle / runtime seam
- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 的 maintainability 仅允许在 queue 明示项内继续推进
- warning closeout 只允许沿现有厚 seam 收口，不允许为了降 warning 去篡改覆盖语义或制造薄碎片模块
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
- 最近成功 phase：`docs/status/maintainability-phase-487.md`
- 最近 checkpoint：`docs/status/maintainability-phase-487.md`

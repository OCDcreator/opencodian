# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [ACTIVE] 已人工续排 `R138-R152`；当前唯一 `[NEXT]` 是 `R139`。

## 当前优先级

- **当前 `[NEXT]`**：`R139 - Conversation authoritative sync residual seam`
- **本批目标**：`R138-R152` 分三批继续收束 live residual：chat runtime/service → settings/model/startup → opencode/streaming/persistence/glass-test cleanup
- **当前 lint 基线**：`0 errors / 57 warnings`
- **热点顺序**：
  1. `R139-R141`: `src/features/chat/OpenCodianView.ts` 与 chat service residual（当前 chat 约 `13` warnings）
  2. `R143-R146`: `src/features/settings/**`、`src/core/config/**`、`src/main.ts`、locale/settings normalization residual
  3. `R148-R150`: `src/core/opencode/**`、streaming utils、storage/provider-icon persistence residual
  4. `R151`: 仅在 live hotspot 仍支撑时处理 heavy tests / opt-in glass warning cleanup
  5. `R142`、`R147`、`R152`: 批次边界 checkpoint

## 本批边界

- `R138 -> R152` 是唯一新续排 queue；不得自动扩展 `R153+`
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
- 最近成功 phase：`docs/status/maintainability-phase-473.md`
- 最近 checkpoint：`docs/status/maintainability-phase-472.md`

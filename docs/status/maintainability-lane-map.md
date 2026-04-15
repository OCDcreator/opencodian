# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [READY] `R90-R137` 长队列继续推进；当前 `[NEXT]` 为 `R90 - OpenCodianView message render/update residual seam`。

## 当前优先级

- **当前 `[NEXT]`**：`R90 - OpenCodianView message render/update residual seam`
- **本批目标**：继续 residual chat runtime / services 与 opencode core，再转 secondary core / settings / startup，最后做 heavy tests follow-up、warning closeout 与最终 checkpoint
- **当前 lint 基线**：`0 errors / 64 warnings`
- **热点顺序**：
  1. `src/features/chat/OpenCodianView.ts`
  2. `src/features/chat/services/ConversationRenderService.ts`
  3. `src/features/chat/services/MessageFinalizationService.ts`
  4. `src/features/chat/services/ConversationSyncBridge.ts`
  5. `src/features/chat/services/ContextUsageService.ts`
  6. `src/core/opencode/OpenCodeService.ts`
  7. `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  8. `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
  9. `src/core/storage/StorageService.ts`
  10. `src/core/types/settings.ts`
  11. `src/features/settings/SettingsModelSection.ts`
  12. `src/main.ts`

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
- 最近成功 phase：`docs/status/maintainability-phase-424.md`
- 最近 checkpoint：`docs/status/maintainability-phase-423.md`

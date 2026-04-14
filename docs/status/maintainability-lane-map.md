# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [QUEUED] 新的 `R38-R41` 队列已写入；当前 `[NEXT]` 为 `R38 - Import-sort lint housekeeping`。

## 当前优先级

- **当前 `[NEXT]`**：`R38 - Import-sort lint housekeeping`
- **本批结论**：先修复 `R36` 留下的两条 import-sort error，然后回到 `OpenCodianSettings` 的 server / security 厚切口
- **当前 lint 基线**：`2 errors / 89 warnings`
- **本批热点顺序**：
  1. `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
  2. `src/core/opencode/OpenCodeService.ts`
  3. `src/features/settings/OpenCodianSettings.ts:359`
  4. `src/features/settings/OpenCodianSettings.ts:1865`
  5. checkpoint 后再判断是否切回 `OpenCodianView` / `OpenCodeService`

## 本批边界

- `R38` 只是 lint housekeeping，不得借机做新的 `OpenCodeService` 拆分
- `R39-R40` 只准处理 `OpenCodianSettings` 的 server / security section seam，不自动扩展到 style、model catalog、chat 或 opencode 其他热点
- 不新增薄 helper / adapter / factory 文件；新 owner 必须覆盖完整 section / lifecycle
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验

## 回归观察点

- `OpenCodeService`：继续保持 SDK-first / legacy fallback、scoped-directory、tool catalog query 语义不变
- `OpenCodianSettings`：不要把已迁出的 background section 责任搬回主类；server / security 的收束必须保留现有 save / restart / permission 行为
- lint：`R38` 完成后应恢复到 `0 errors`；若未恢复，不得推进 `R39`

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-372.md`

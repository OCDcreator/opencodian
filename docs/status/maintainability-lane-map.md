# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [READY] 已人工补入 `R46-R50` queue；当前首个 `[NEXT]` 为新的 `R46` lint unblocker。

## 当前优先级

- **当前 `[NEXT]`**：`R46 - Lint blocker housekeeping after R43-R45`
- **本批目标**：先恢复 lint error 为零，再顺序推进 `OpenCodeService` settings reconfiguration、`OpenCodianSettings` model/style 两个厚切口，最后 checkpoint
- **当前 lint 基线**：`5 errors / 90 warnings`
- **热点顺序**：
  1. 当前 live lint blocker（import-sort / unused symbol）
  2. `src/core/opencode/OpenCodeService.ts` settings reconfiguration seam
  3. `src/features/settings/OpenCodianSettings.ts` model section owner seam
  4. `src/features/settings/OpenCodianSettings.ts` style section lifecycle seam

## 本批边界

- 上一轮连续运行已在 `stopped_failures` 停机；恢复无人值守前必须先按新 queue 吸收 lint error
- 不新增薄 helper / adapter / provider / factory 文件；新 owner 必须覆盖完整 section / lifecycle
- 不回到 freestyle settings 拆分；settings 只按 `model -> style` 的既定顺序推进
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验

## 回归观察点

- `OpenCodeService`：SDK-first / legacy fallback、session-scoped abort/detach、stream finalization、managed server adoption/restart、directory scope 语义不变
- `OpenCodianView`：本批只允许处理 lint unblocker，不把 history/sync/model-selection 已收出的 owner 搬回主 view
- `OpenCodianSettings`：不要把已迁出的 background/server/security section 责任搬回主类；model/style 仅能按完整 section owner seam 推进
- lint：先恢复到 `0 errors / 90 warnings`；若再次出现 error，先解除阻塞再继续 queue

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-380.md`
- 停机线索：`automation/runtime/history.jsonl` 中 round `392-393` 的 failure 记录

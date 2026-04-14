# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [READY] `R47` settings reconfiguration seam 已完成；当前首个 `[NEXT]` 为 `R48` model section owner seam。

## 当前优先级

- **当前 `[NEXT]`**：`R48 - OpenCodianSettings model section owner seam`
- **本批目标**：沿既定顺序推进 `OpenCodianSettings` model/style 两个厚切口，最后 checkpoint
- **当前 lint 基线**：`0 errors / 90 warnings`
- **热点顺序**：
  1. `src/features/settings/OpenCodianSettings.ts` model section owner seam
  2. `src/features/settings/OpenCodianSettings.ts` style section lifecycle seam
  3. `R50` checkpoint

## 本批边界

- `R47` 已完成 `OpenCodeService` settings reconfiguration seam；后续 queue 不允许把这组 lifecycle 责任搬回主服务
- 不新增薄 helper / adapter / provider / factory 文件；新 owner 必须覆盖完整 section / lifecycle
- 不回到 freestyle settings 拆分；settings 只按 `model -> style` 的既定顺序推进
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验

## 回归观察点

- `OpenCodeService`：保持新的 settings reconfiguration owner 边界，同时继续维持 SDK-first / legacy fallback、managed server adoption/restart 与 directory scope 语义不变
- `OpenCodianView`：不要把 history/sync/model-selection 已收出的 owner 搬回主 view
- `OpenCodianSettings`：不要把已迁出的 background/server/security section 责任搬回主类；model/style 仅能按完整 section owner seam 推进
- lint：当前已恢复到 `0 errors / 90 warnings`；若再次出现 error，先解除阻塞再继续 queue

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-382.md`
- 停机线索：`automation/runtime/history.jsonl` 中 round `392-393` 的 failure 记录

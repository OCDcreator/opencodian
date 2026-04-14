# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [READY] `R42-R46` queue 已写入；当前首个 `[NEXT]` 为 `R42`。

## 当前优先级

- **当前 `[NEXT]`**：`R42 - OpenCodianView conversation history/actions seam`
- **本批目标**：先收 `OpenCodianView` 的 conversation-management / authoritative-sync / model-selection 三个厚切口，再收 `OpenCodeService` streaming transport seam，最后 checkpoint
- **当前 lint 基线**：`0 errors / 86 warnings`
- **热点顺序**：
  1. `src/features/chat/OpenCodianView.ts` conversation history/actions
  2. `src/features/chat/OpenCodianView.ts` authoritative sync merge
  3. `src/features/chat/OpenCodianView.ts` model catalog/selection
  4. `src/core/opencode/OpenCodeService.ts` streaming transport

## 本批边界

- 本次已完成 queue 文档化，但未直接恢复 autopilot freestyle 执行
- 不新增薄 helper / adapter / provider / factory 文件；新 owner 必须覆盖完整 section / lifecycle
- 不在本批内继续 settings residual seam，除非前四项被正确性或验证成本阻塞
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验

## 回归观察点

- `OpenCodianView`：并发 tab/session streaming、hydration/auth-sync gate、background-task completion notice、scroll restore 不回归
- `OpenCodeService`：SDK-first / legacy fallback、session-scoped abort/detach、stream finalization 语义不变
- `OpenCodianSettings`：不要把已迁出的 background/server/security section 责任搬回主类；本批默认不继续 settings 残余切口
- lint：当前已恢复到 `0 errors / 86 warnings`；若再次出现 error，先解除阻塞再推进后续轮次

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-376.md`

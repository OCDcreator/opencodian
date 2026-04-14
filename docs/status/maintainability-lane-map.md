# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [DONE] `R41 - Maintainability checkpoint` 已完成；当前没有可自动执行的 `[NEXT]`。

## 当前优先级

- **当前 `[NEXT]`**：无；等待人工确认新的 roadmap queue
- **本批结论**：`R38-R40` 已完成 lint unblocker + settings server/security owner seam，lint 基线稳定在 `0 errors / 86 warnings`
- **当前 lint 基线**：`0 errors / 86 warnings`
- **人工建议热点顺序**：
  1. `src/features/chat/OpenCodianView.ts`
  2. `src/core/opencode/OpenCodeService.ts`
  3. `src/features/settings/OpenCodianSettings.ts`（仅在人工确认 settings 仍是更高收益切口时）

## 本批边界

- 当前已无自动 `[NEXT]`；继续推进前必须先人工补充新的 queue
- 不新增薄 helper / adapter / factory 文件；新 owner 必须覆盖完整 section / lifecycle
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验

## 回归观察点

- `OpenCodeService`：`R38` 后继续保持 SDK-first / legacy fallback、scoped-directory、tool catalog query 语义不变
- `OpenCodianSettings`：不要把已迁出的 background/server/security section 责任搬回主类；后续如继续 settings，优先看 `addModelSettings` / `addStyleSettings` 是否能形成完整厚切口
- `OpenCodianView` / `OpenCodeService`：下一批人工 queue 若切回主热点，优先选择完整 runtime lifecycle seam，而不是回到 warning-only cleanup
- lint：当前已恢复到 `0 errors / 86 warnings`；若再次出现 error，先解除阻塞再推进后续轮次

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-376.md`

# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [QUEUED] 当前队列为 `R41`；当前 `[NEXT]` 为 `R41 - Maintainability checkpoint`。

## 当前优先级

- **当前 `[NEXT]`**：`R41 - Maintainability checkpoint`
- **本批结论**：`R40` 已把 security section lifecycle 收口到 `SettingsSecuritySection`，并把 lint 基线进一步压到 `0 errors / 86 warnings`
- **当前 lint 基线**：`0 errors / 86 warnings`
- **本批热点顺序**：
  1. `docs/status/maintainability-master-plan.md`
  2. `docs/status/maintainability-round-roadmap.md`
  3. `docs/status/maintainability-lane-map.md`
  4. checkpoint 后再判断是否切回 `OpenCodianView` / `OpenCodeService`

## 本批边界

- `R41` 只准做 checkpoint 文档与下一批建议，不自动扩展新的 owner seam 或 warning cleanup
- 不新增薄 helper / adapter / factory 文件；新 owner 必须覆盖完整 section / lifecycle
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验

## 回归观察点

- `OpenCodeService`：`R38` 后继续保持 SDK-first / legacy fallback、scoped-directory、tool catalog query 语义不变
- `OpenCodianSettings`：不要把已迁出的 background/server/security section 责任搬回主类；后续 checkpoint 先看剩余收益再决定是否继续拆 settings
- lint：当前已恢复到 `0 errors / 86 warnings`；若再次出现 error，先解除阻塞再推进后续轮次

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-372.md`

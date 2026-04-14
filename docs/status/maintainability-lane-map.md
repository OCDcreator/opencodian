# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [READY] `R49` style section owner seam 已完成；当前首个 `[NEXT]` 为 `R50` checkpoint。

## 当前优先级

- **当前 `[NEXT]`**：`R50 - Maintainability checkpoint`
- **本批目标**：复盘 `R46-R49` 的 lint / owner 收益、验证成本与下一批方向
- **当前 lint 基线**：`0 errors / 90 warnings`
- **热点顺序**：
  1. `docs/status/maintainability-master-plan.md`
  2. `docs/status/maintainability-round-roadmap.md`
  3. `docs/status/maintainability-lane-map.md`

## 本批边界

- `R48-R49` 已完成 `OpenCodianSettings` 的 model/style owner seam；后续 queue 不允许把 source mode / refresh / workspace / icon cache / style lifecycle 搬回主类
- 不新增薄 helper / adapter / provider / factory 文件；新 owner 必须覆盖完整 section / lifecycle
- 不回到 freestyle settings 拆分；settings checkpoint 之后是否继续推进必须以文档证据为准
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验

## 回归观察点

- `OpenCodeService`：保持新的 settings reconfiguration owner 边界，同时继续维持 SDK-first / legacy fallback、managed server adoption/restart 与 directory scope 语义不变
- `OpenCodianView`：不要把 history/sync/model-selection 已收出的 owner 搬回主 view
- `OpenCodianSettings`：不要把已迁出的 model/style/server/security section 责任搬回主类；style 内部继续优先扩展 `SettingsStyleSection`
- lint：当前已恢复到 `0 errors / 90 warnings`；若再次出现 error，先解除阻塞再继续 queue

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-383.md`
- 停机线索：`automation/runtime/history.jsonl` 中 round `392-393` 的 failure 记录

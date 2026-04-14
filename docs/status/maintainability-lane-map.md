# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [CONFIRMED_NEXT_BATCH] `W10 - ToolCallRenderer summary complexity trim` 已完成；当前 `[NEXT]` 是 `W11 - Warning cleanup route checkpoint`，后续已排队 `W12-W15`。

## 当前优先级

- **当前 `[NEXT]`**：`W11 - Warning cleanup route checkpoint`
- **本批目标**：先复盘 `W10`，再按 `W12-W14` 依次处理三个现有 owner 内的 complexity warning，最后 `W15` checkpoint 后暂停
- **当前 lint 基线**：`0 errors / 94 warnings`
- **本批热点顺序**：
  1. `docs/status/maintainability-phase-362.md`
  2. `src/core/storage/StorageService.ts`
  3. `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
  4. `src/features/chat/services/BackgroundTaskTimelineService.ts`
  5. `docs/status/maintainability-master-plan.md` / `docs/status/maintainability-round-roadmap.md` / `docs/status/maintainability-lane-map.md`
- **下一暂停点**：`W15 - Warning cleanup checkpoint`；完成后若无人工追加 queue item，则重新停回无 `[NEXT]` 状态
- **观察但暂不自动切入**：`src/features/settings/OpenCodianSettings.ts`、`tests/unit/core/opencode/OpenCodeService.test.ts`

## 本批边界

- 不自动恢复 `R33+` maintainability queue
- 不新增薄 helper / adapter / factory 文件
- 允许在现有 owner 内做局部 helper、guard clause、参数收束、条件分支整理
- 如遇到必须扩大为 owner 拆分的大改动，立即停止并在 phase 文档里说明原因

## 回归观察点

- `OpenCodianView`：W8 已收掉消息同步复杂度 warnings；本批只允许在 W14 触达 `BackgroundTaskTimelineService`，不要改 view runtime ownership
- `main.ts`：settings 加载、初始化顺序、conversation preload 行为
- settings 相关 owner：`ModelConfigModal` 已完成 W6 render trim；不要把 model catalog / section lifecycle 已迁出的责任搬回主类
- `OpenCodeService`：保持 SDK-first / legacy fallback 与 scoped-directory 兼容语义不变

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-361.md`

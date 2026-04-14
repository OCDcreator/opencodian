# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [CONFIRMED_NEXT_BATCH] `W13 - OpenCodeMessageNormalizationMapper complexity trim` 已完成；当前 `[NEXT]` 是 `W14 - BackgroundTaskTimelineService collectSegments trim`，后续已排队 `W15`。

## 当前优先级

- **当前 `[NEXT]`**：`W14 - BackgroundTaskTimelineService collectSegments trim`
- **本批目标**：先在 `BackgroundTaskTimelineService` 现有 owner 内收掉 background-task timeline 的 complexity warning，再按 `W15` 完成 checkpoint 后暂停
- **当前 lint 基线**：`0 errors / 92 warnings`
- **本批热点顺序**：
  1. `src/features/chat/services/BackgroundTaskTimelineService.ts`
  2. `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`
  3. `tests/unit/features/chat/backgroundTaskTimeline.test.ts`
  4. `docs/status/maintainability-phase-365.md`
  5. `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
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
- 最近 checkpoint：`docs/status/maintainability-phase-365.md`

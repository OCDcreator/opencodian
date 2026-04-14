# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [PAUSED_PENDING_CONFIRMATION] `W15 - Warning cleanup checkpoint` 已完成；当前没有可自动执行的 `[NEXT]`，等待人工追加队列后再继续。

## 当前优先级

- **当前 `[NEXT]`**：无（`W15 - Warning cleanup checkpoint` 已完成）
- **本批目标**：`W12-W14` 的 warning cleanup 收益已完成复盘；自动推进当前暂停，等待人工决定是继续 warning cleanup 还是准备新的 maintainability queue 提案
- **当前 lint 基线**：`0 errors / 91 warnings`
- **本批热点顺序**：
  1. `docs/status/maintainability-master-plan.md`
  2. `docs/status/maintainability-round-roadmap.md`
  3. `docs/status/maintainability-lane-map.md`
  4. `docs/status/maintainability-phase-366.md`
  5. 最新 lint 输出
- **下一暂停点**：已到达 `W15 - Warning cleanup checkpoint`；当前已重新停回无 `[NEXT]` 状态
- **观察但暂不自动切入**：`src/features/settings/OpenCodianSettings.ts`、`tests/unit/core/opencode/OpenCodeService.test.ts`

## 本批边界

- 不自动恢复 `R33+` maintainability queue
- 不新增薄 helper / adapter / factory 文件
- 允许在现有 owner 内做局部 helper、guard clause、参数收束、条件分支整理
- 如遇到必须扩大为 owner 拆分的大改动，立即停止并在 phase 文档里说明原因

## 回归观察点

- `OpenCodianView`：W8 已收掉消息同步复杂度 warnings；W14 已收掉 `BackgroundTaskTimelineService.collectSegments` 的 complexity warning，不要改 view runtime ownership
- `main.ts`：settings 加载、初始化顺序、conversation preload 行为
- settings 相关 owner：`ModelConfigModal` 已完成 W6 render trim；不要把 model catalog / section lifecycle 已迁出的责任搬回主类
- `OpenCodeService`：保持 SDK-first / legacy fallback 与 scoped-directory 兼容语义不变

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-365.md`

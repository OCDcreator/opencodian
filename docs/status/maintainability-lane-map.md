# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [CONFIRMED_NEXT_BATCH] `R33-R37` maintainability queue 已确认；`R33` 已完成，当前 `[NEXT]` 是 `R34 - Settings model catalog presenter render lifecycle`。

## 当前优先级

- **当前 `[NEXT]`**：`R34 - Settings model catalog presenter render lifecycle`
- **本批目标**：继续沿较厚 owner 收束推进 settings 热点，然后再处理 chat constructor/runtime wiring，最后条件性评估 OpenCodeService
- **当前 lint 基线**：`0 errors / 91 warnings`
- **本批热点顺序**：
  1. `src/features/settings/SettingsModelCatalogPresenter.ts` render lifecycle
  2. `src/features/chat/OpenCodianView.ts` constructor/runtime wiring
  3. `src/core/opencode/OpenCodeService.ts` residual seam feasibility
  4. `src/features/settings/OpenCodianSettings.ts` remaining style/settings host responsibilities（观察项，不自动回退 background owner）
  5. `docs/status/maintainability-master-plan.md` / `docs/status/maintainability-round-roadmap.md` / `docs/status/maintainability-lane-map.md`
- **下一暂停点**：`R37 - Maintainability checkpoint`；完成后若无人工追加 queue item，则重新停回无 `[NEXT]` 状态
- **观察但暂不自动切入**：`tests/unit/core/opencode/OpenCodeService.test.ts`、remaining warning-only file-size cleanup

## 本批边界

- 已恢复 `R33-R37` maintainability queue，但不得自动扩展 `R38+`
- 不新增薄 helper / adapter / factory 文件；新 owner 必须覆盖完整 lifecycle / section / runtime seam
- 允许在现有 owner 内做同文件私有 helper、较厚 coordinator/presenter 加厚、参数收束和条件分支整理
- 如遇到必须扩大到跨域大改动，立即停止并在 phase 文档里说明原因

## 回归观察点

- `OpenCodianView`：W8 已收掉消息同步复杂度 warnings；W14 已收掉 `BackgroundTaskTimelineService.collectSegments` 的 complexity warning，不要改 view runtime ownership
- `main.ts`：settings 加载、初始化顺序、conversation preload 行为
- settings 相关 owner：`ModelConfigModal` 已完成 W6 render trim，`SettingsStyleBackgroundSection` 已接管聊天背景 subsection lifecycle；不要把 model catalog / background section 已迁出的责任搬回主类
- `OpenCodeService`：保持 SDK-first / legacy fallback 与 scoped-directory 兼容语义不变

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-365.md`

# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [CONFIRMED_NEXT_BATCH] `R33-R37` maintainability queue 已确认；`R33-R36` 已完成，当前 `[NEXT]` 是 `R37 - Maintainability checkpoint`。

## 当前优先级

- **当前 `[NEXT]`**：`R37 - Maintainability checkpoint`
- **本批目标**：复盘 `R33-R36` 的 owner 收束收益、验证成本与下一批方向，并在本批结束后停回人工确认态
- **当前 lint 基线**：`0 errors / 91 warnings`
- **本批热点顺序**：
  1. `docs/status/maintainability-master-plan.md` / `docs/status/maintainability-round-roadmap.md` / `docs/status/maintainability-lane-map.md`
  2. 最新 phase 文档与 `npm test` / `npm run build` 输出
  3. `src/core/opencode/OpenCodeService.ts` + `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`（已完成，checkpoint 只复盘收益）
  4. `src/features/chat/OpenCodianView.ts` 与 `src/features/settings/OpenCodianSettings.ts` 既有 owner 收束回归观察
- **下一暂停点**：`R37` 本身；完成后若无人工追加 queue item，则重新停回无 `[NEXT]` 状态
- **观察但暂不自动切入**：`tests/unit/core/opencode/OpenCodeService.test.ts`、remaining warning-only file-size cleanup

## 本批边界

- 已恢复 `R33-R37` maintainability queue，但不得自动扩展 `R38+`
- 不新增薄 helper / adapter / factory 文件；新 owner 必须覆盖完整 lifecycle / section / runtime seam
- 允许在现有 owner 内做同文件私有 helper、较厚 coordinator/presenter 加厚、参数收束和条件分支整理
- 如遇到必须扩大到跨域大改动，立即停止并在 phase 文档里说明原因

## 回归观察点

- `OpenCodianView`：W8 已收掉消息同步复杂度 warnings；W14 已收掉 `BackgroundTaskTimelineService.collectSegments` 的 complexity warning；R35 已收束 constructor/runtime wiring，后续不要改 view runtime ownership
- `main.ts`：settings 加载、初始化顺序、conversation preload 行为
- settings 相关 owner：`ModelConfigModal` 已完成 W6 render trim，`SettingsStyleBackgroundSection` 已接管聊天背景 subsection lifecycle；不要把 model catalog / background section 已迁出的责任搬回主类
- `OpenCodeService`：R36 已把 directory-scoped config/tool-catalog residual seam 收束到 `OpenCodeCatalogQueryCoordinator`；继续保持 SDK-first / legacy fallback 与 scoped-directory 兼容语义不变

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-365.md`

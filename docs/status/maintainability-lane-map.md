# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [REVIEW_REQUIRED] `R33-R37` maintainability queue 已完成；`R37 - Maintainability checkpoint` 已完成复盘，当前没有可自动执行的 `[NEXT]`。

## 当前优先级

- **当前 `[NEXT]`**：无
- **本批结论**：`R33-R36` 的 owner 收束收益与验证成本已完成复盘，autopilot 已停回人工确认态
- **当前 lint 基线**：`2 errors / 89 warnings`
- **本批热点顺序**：
  1. `docs/status/maintainability-master-plan.md` / `docs/status/maintainability-round-roadmap.md` / `docs/status/maintainability-lane-map.md`
  2. 最新 phase 文档与 `npm run lint` / `npm test` / `npm run build` 输出
  3. `src/core/opencode/OpenCodeService.ts` + `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts` 的 import-sort lint 回归（只观察，不自动修复）
  4. `src/features/chat/OpenCodianView.ts` 与 `src/features/settings/OpenCodianSettings.ts` 的既有大 owner 热点
- **下一暂停点**：已到达；等待人工追加 queue item 后再恢复 autopilot
- **观察但暂不自动切入**：`tests/unit/core/opencode/OpenCodeService.test.ts`、remaining warning-only file-size cleanup、R36 相关 import-sort lint housekeeping

## 本批边界

- `R33-R37` maintainability queue 已完成，但不得自动扩展 `R38+`
- 不新增薄 helper / adapter / factory 文件；新 owner 必须覆盖完整 lifecycle / section / runtime seam
- 允许在现有 owner 内做同文件私有 helper、较厚 coordinator/presenter 加厚、参数收束和条件分支整理
- 如遇到必须扩大到跨域大改动，立即停止并在 phase 文档里说明原因

## 回归观察点

- `OpenCodianView`：W8 已收掉消息同步复杂度 warnings；W14 已收掉 `BackgroundTaskTimelineService.collectSegments` 的 complexity warning；R35 已收束 constructor/runtime wiring，后续不要改 view runtime ownership
- `main.ts`：settings 加载、初始化顺序、conversation preload 行为
- settings 相关 owner：`ModelConfigModal` 已完成 W6 render trim，`SettingsStyleBackgroundSection` 已接管聊天背景 subsection lifecycle；不要把 model catalog / background section 已迁出的责任搬回主类
- `OpenCodeService`：R36 已把 directory-scoped config/tool-catalog residual seam 收束到 `OpenCodeCatalogQueryCoordinator`；继续保持 SDK-first / legacy fallback 与 scoped-directory 兼容语义不变
- lint 回归观察：当前 live lint 新增两条 import-sort error，均位于 `OpenCodeCatalogQueryCoordinator` / `OpenCodeService`；除非人工把它们写入新 queue，否则本轮后不自动修复

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-372.md`

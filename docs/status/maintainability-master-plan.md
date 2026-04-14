# Maintainability Master Plan

> **状态**: [READY]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `W6-W15`、`R33-R41` 与 `R42` 已归档；当前受控 queue 顺序为 `R43 -> R44 -> R45 -> R46`。

## 1. 当前判断

**`R42` 已按 queue 完成。** conversation history/actions seam 现已从 `OpenCodianView` 主类里收束到独立 owner，证明 chat 主视图的厚切口仍然可以按既定顺序推进。当前建议 queue 为：`R43 -> R44 -> R45 -> R46`，继续收 authoritative-sync / model-selection，再收 opencode streaming transport，最后 checkpoint。

## 2. 当前基线

- **lint**: `0 errors / 86 warnings`（沿用 `R41` checkpoint 的最近一次基线）
- **验证**:
  - `npm test` 通过，`255 passed, 255 total` suites；`1083 passed, 1083 total` tests
  - `npm run build` 通过，`BUILD_ID` `autopilot-maintainability.202604142343`
- **下一批高确定性切口**:
  - `R43`: `OpenCodianView` authoritative sync / hydration merge seam
  - `R44`: `OpenCodianView` model catalog / selection seam
  - `R45`: `OpenCodeService` streaming transport seam
  - `R46`: checkpoint
- **历史摘要**: 见 `docs/status/maintainability-completed-batches.md`

## 3. 最近完成摘要

- **W6-W15**: 在现有 owner 内完成受控 warning cleanup，把 lint 从 `0 errors / 103 warnings` 压到 `0 errors / 91 warnings`
- **R33-R40**: 完成 settings background、settings catalog presenter、chat constructor wiring、opencode catalog query seam、import-sort housekeeping 解锁，以及 settings server / security section owner seam
- **R41**: 完成 checkpoint，确认 `R38-R40` 已把 lint 基线稳定在 `0 errors / 86 warnings`，并把 autopilot 切回人工确认态
- **R42**: `ConversationHistoryActionsCoordinator` 接管 history dropdown、rename/delete confirm、dropdown positioning 与 cleanup lifecycle，`OpenCodianView` 不再直接铺开这段 conversation-management UI
- **R43-R46**: 继续保持既定 queue 顺序，下一轮从 authoritative sync merge seam 开始

## 4. 本批结论

1. **queue 顺序**：默认执行 `R43 -> R44 -> R45 -> R46`，不插入新的 settings 队列。
2. **热点判断**：当前 live owner 热点仍主要集中在 `src/features/chat/OpenCodianView.ts` 与 `src/core/opencode/OpenCodeService.ts`，其中 chat 主视图现已完成 conversation-management seam，下一刀应继续 authoritative sync merge。
3. **策略判断**：继续优先完整 lifecycle / runtime seam，不回到 warning-only cleanup，也不回到 logging-only / helper-only 的碎片拆分。
4. **执行状态**：autopilot 已恢复到 roadmap 顺序推进态；本轮完成 `R42` 后，下一轮应直接执行 `R43`。

## 5. 长期边界

- 不为清 warning 或“看起来更模块化”而新增薄 facade / adapter / provider / factory 文件
- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 只有在 roadmap 明确写出后才允许继续 maintainability 拆分
- 优先选择完整 section / lifecycle / runtime seam；避免再回到长串低收益 warning-only 队列
- `OpenCodianView` / `OpenCodeService` 的后续 maintainability 拆分，只允许围绕完整 lifecycle/runtime seam，不允许回退成 logging-only、helper-only、或局部小函数粉碎
- 命中 deploy-relevant paths 时，继续严格遵守 build → Test Vault deploy → `BUILD_ID` 校验顺序

## 6. 阅读顺序

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. `docs/status/maintainability-round-roadmap.md`
4. 最近的 `docs/status/maintainability-phase-XXX.md`
5. 如需历史上下文，再读 `docs/status/maintainability-completed-batches.md`

# Maintainability Master Plan

> **状态**: [READY]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `W6-W15` 与 `R33-R41` 已归档；人工已完成 `R42-R46` queue 设计并写入 roadmap，但本次会话只补文档，不直接恢复 autopilot 执行。

## 1. 当前判断

**`R41` checkpoint 后的人工 queue 设计已完成。** `R38-R40` 已完成 lint unblocker + settings server/security 两个厚切口，证明最近这批 owner 收束有效；下一批不再自动 freestyle 拆 settings，而是按既定顺序切回 `OpenCodianView` / `OpenCodeService` 的厚 owner seam。当前建议 queue 为：`R42 -> R43 -> R44 -> R45 -> R46`，先收 chat conversation-management / authoritative-sync / model-selection，再收 opencode streaming transport，最后 checkpoint。

## 2. 当前基线

- **lint**: `0 errors / 86 warnings`
- **验证**:
  - `npm run lint` 通过，`0 errors / 86 warnings`
  - `npm test` 通过，`254 passed, 254 total` suites；`1082 passed, 1082 total` tests
  - `npm run build` 通过，`BUILD_ID` `autopilot-maintainability.202604142237`
- **下一批高确定性切口**:
  - `R42`: `OpenCodianView` conversation history / rename / delete / dropdown lifecycle seam
  - `R43`: `OpenCodianView` authoritative sync / hydration merge seam
  - `R44`: `OpenCodianView` model catalog / selection seam
  - `R45`: `OpenCodeService` streaming transport seam
  - `R46`: checkpoint
- **历史摘要**: 见 `docs/status/maintainability-completed-batches.md`

## 3. 最近完成摘要

- **W6-W15**: 在现有 owner 内完成受控 warning cleanup，把 lint 从 `0 errors / 103 warnings` 压到 `0 errors / 91 warnings`
- **R33-R40**: 完成 settings background、settings catalog presenter、chat constructor wiring、opencode catalog query seam、import-sort housekeeping 解锁，以及 settings server / security section owner seam
- **R41**: 完成 checkpoint，确认 `R38-R40` 已把 lint 基线稳定在 `0 errors / 86 warnings`，并把 autopilot 切回人工确认态
- **R42-R46**: 本次人工已完成 queue 设计并写入 roadmap，但尚未执行任何新 round

## 4. 本批结论

1. **queue 顺序**：默认执行 `R42 -> R43 -> R44 -> R45 -> R46`，不插入新的 settings 队列。
2. **热点判断**：当前 live warnings 与 owner 热点仍主要集中在 `src/features/chat/OpenCodianView.ts`、`src/core/opencode/OpenCodeService.ts` 与残余 settings/model UI owner，其中 chat 主视图仍是更高确定性的先手切口。
3. **策略判断**：优先继续完整 lifecycle / runtime seam，不回到 warning-only cleanup，也不回到 logging-only / helper-only 的碎片拆分。
4. **执行状态**：本轮只是把新 queue 正式写入文档；是否恢复 autopilot 执行，仍由人工单独触发。

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

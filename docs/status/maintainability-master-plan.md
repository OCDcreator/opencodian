# Maintainability Master Plan

> **状态**: [DONE]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `W6-W15` 与 `R33-R41` 已归档；当前没有可自动执行的 `[NEXT]`。如需恢复 autopilot，必须先由人工补充新的 roadmap queue，再继续执行。

## 1. 当前判断

**`R41` checkpoint 已完成，autopilot 先回到人工确认态。** `R38-R40` 已完成 lint unblocker + settings server/security 两个厚切口，证明最近这批 owner 收束有效；但下一批不应自动继续 freestyle 拆 settings，而应先根据 live lint 基线与剩余热点决定新的受控 queue。当前建议是：人工优先设计切回 `OpenCodianView` / `OpenCodeService` 的厚 owner seam，再考虑 settings 残余 section。

## 2. 当前基线

- **lint**: `0 errors / 86 warnings`
- **验证**:
  - `npm run lint` 通过，`0 errors / 86 warnings`
  - `npm test` 通过，`254 passed, 254 total` suites；`1082 passed, 1082 total` tests
  - `npm run build` 通过，`BUILD_ID` `autopilot-maintainability.202604142237`
- **下一批高确定性切口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
- **历史摘要**: 见 `docs/status/maintainability-completed-batches.md`

## 3. 最近完成摘要

- **W6-W15**: 在现有 owner 内完成受控 warning cleanup，把 lint 从 `0 errors / 103 warnings` 压到 `0 errors / 91 warnings`
- **R33-R40**: 完成 settings background、settings catalog presenter、chat constructor wiring、opencode catalog query seam、import-sort housekeeping 解锁，以及 settings server / security section owner seam
- **R41**: 完成 checkpoint，确认 `R38-R40` 已把 lint 基线稳定在 `0 errors / 86 warnings`，并把 autopilot 切回“当前没有可自动执行的 `[NEXT]`”的人工确认态

## 4. Checkpoint 结论

1. **本轮结论**：`R38` 恢复了 lint error 为零，`R39-R40` 分别把 server/security section lifecycle 收口到厚 owner；settings 最近连续切口已经证明“完整 section owner seam”是高收益模式。
2. **热点判断**：当前 live warnings 仍主要集中在 `src/features/chat/OpenCodianView.ts`、`src/core/opencode/OpenCodeService.ts` 与残余 settings/model UI owner；继续自动拆 settings 的确定性开始下降。
3. **人工下一批建议**：优先设计切回 chat / opencode 主热点的厚 queue（先 `OpenCodianView`，后 `OpenCodeService`），只有在人工确认收益更高时才继续 settings 残余 section。
4. **自动推进状态**：本轮不自动扩展 `R42+`；继续 maintainability autopilot 前，先人工补充新的 queue 定义。

## 5. 长期边界

- 不为清 warning 或“看起来更模块化”而新增薄 facade / adapter / provider / factory 文件
- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 只有在 roadmap 明确写出后才允许继续 maintainability 拆分
- 优先选择完整 section / lifecycle / runtime seam；避免再回到长串低收益 warning-only 队列
- 命中 deploy-relevant paths 时，继续严格遵守 build → Test Vault deploy → `BUILD_ID` 校验顺序

## 6. 阅读顺序

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. `docs/status/maintainability-round-roadmap.md`
4. 最近的 `docs/status/maintainability-phase-XXX.md`
5. 如需历史上下文，再读 `docs/status/maintainability-completed-batches.md`

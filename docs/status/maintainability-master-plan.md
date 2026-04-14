# Maintainability Master Plan

> **状态**: [QUEUED]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `W6-W15` 与 `R33-R40` 已归档，当前人工确认的新队列为 `R41`。如需恢复 autopilot，严格从 `R41` 开始，不得跳题。

## 1. 当前判断

**当前应先进入 checkpoint，而不是继续 freestyle 拆 settings。** 原因很直接：`W6-W15` 已把 warning cleanup 的高收益切口吃掉，而 `R33-R40` 连续完成了 settings 的 background / catalog / server / security 几个厚切口；此时更有价值的是先复盘 owner 收益、lint 基线与剩余热点，再决定下一批继续 settings 残余 section，还是切回 chat / opencode 主热点。

## 2. 当前基线

- **lint**: `0 errors / 86 warnings`
- **验证**:
  - `npm run lint` 通过，`0 errors / 86 warnings`
  - `npm test` 通过
  - `npm run build` 通过
- **下一批高确定性切口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
- **历史摘要**: 见 `docs/status/maintainability-completed-batches.md`

## 3. 最近完成摘要

- **W6-W15**: 在现有 owner 内完成受控 warning cleanup，把 lint 从 `0 errors / 103 warnings` 压到 `0 errors / 91 warnings`
- **R33-R40**: 完成 settings background、settings catalog presenter、chat constructor wiring、opencode catalog query seam、import-sort housekeeping 解锁，以及 settings server / security section owner seam
- **当前推进状态**: `R40` 已完成，队列已推进到 checkpoint `R41`

## 4. R41 路线

1. **R41 - Maintainability checkpoint**：复盘 `R39-R40` 的 owner 收益、lint 基线与验证成本，并决定下一批是继续 settings 残余 section，还是切回 chat / opencode 主热点

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

# Maintainability Master Plan

> **状态**: [QUEUED]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `W6-W15` 与 `R33-R39` 已归档，当前人工确认的新队列为 `R40-R41`。如需恢复 autopilot，严格从 `R40` 开始，不得跳题。

## 1. 当前判断

**当前更适合继续沿着 settings 厚切口推进，而不是回到长串 warning cleanup。** 原因很直接：`W6-W15` 已把 warning cleanup 的高收益切口吃掉，而 `R33-R39` 证明了较厚 owner 收束配合最小 housekeeping 解锁在当前仓库里更高效。`R39` 已把 server section lifecycle 收口到 `SettingsServerSection`，并顺带把 lint 基线压到 `0 errors / 87 warnings`，因此下一步应继续相邻的 security 主热点。

## 2. 当前基线

- **lint**: `0 errors / 87 warnings`
- **验证**:
  - `npm run lint` 通过，`0 errors / 87 warnings`
  - `npm test` 通过
  - `npm run build` 通过
- **下一批高确定性切口**:
  - `src/features/settings/OpenCodianSettings.ts:1865` `addSecuritySettings`
  - `docs/status/maintainability-master-plan.md`
- **历史摘要**: 见 `docs/status/maintainability-completed-batches.md`

## 3. 最近完成摘要

- **W6-W15**: 在现有 owner 内完成受控 warning cleanup，把 lint 从 `0 errors / 103 warnings` 压到 `0 errors / 91 warnings`
- **R33-R39**: 完成 settings background、settings catalog presenter、chat constructor wiring、opencode catalog query seam、import-sort housekeeping 解锁，以及 settings server section owner seam
- **当前推进状态**: `R39` 已完成，队列已推进到 `OpenCodianSettings` 的 security 厚切口

## 4. R40-R41 路线

1. **R40 - OpenCodianSettings security section lifecycle seam**：从 `addSecuritySettings` 中提炼完整 security/config lifecycle，优先收束 config status、permission mode、restart flow 与 blocklist/export path 组装
2. **R41 - Maintainability checkpoint**：复盘 `R39-R40` 的收益，并决定下一批是继续 settings 残余 section，还是切回 chat / opencode 主热点

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

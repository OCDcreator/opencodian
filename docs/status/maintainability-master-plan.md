# Maintainability Master Plan

> **状态**: [PAUSED]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R159` 已完成；当前没有可自动执行的后续任务。

## 1. 当前判断

当前分支已完成 `R153-R159` 的 chat / opencode defragmentation、typecheck gate recovery、zero-warning closeout、view residual seam 回并、`OpenCodeService` lifecycle/settings residual 回并与本批 checkpoint 复盘。当前最新实测为：`npm run lint -- --format unix` 通过、`npm run typecheck` 通过、`npm test` 通过（`283` 个 suites / `1187` 个 tests）、`npm run build` 通过。因此本批 queue 已在绿灯下完成 `R155-R159`，checkpoint 结论为：暂停 autopilot，等待人工续排是否还要继续处理 residual hotspot。

当前 residual 观察点不是为了立刻自动续跑，而是为人工续排提供 checkpoint 依据：

- `src/features/chat/OpenCodianView.ts` 约 `4859` 行，仍直接装配大量 chat runtime owner，需在 checkpoint 中复盘是否继续
- `src/core/opencode/OpenCodeService.ts` 当前约 `1475` 行；`R158` 已把 settings reconfiguration residual 并入 `OpenCodeServiceLifecycleCoordinator`，删除独立 reconfiguration coordinator，并把 server status / diagnostics proxy 也收进 lifecycle owner
- `src/features/chat/services/` 里仍可见明显碎片化迹象：按文件名统计约有 `15` 个 `Adapter`、`7` 个 `Provider`、`5` 个 `Factory`、`23` 个 `Host` 命名文件，且存在一批 `40` 行以下的极薄文件
- lint/typecheck/test/build gate 已稳定全绿；当前 residual hotspot 主要仍在 `OpenCodianView` / `OpenCodeService` 主 owner 与其相邻装配面，但尚未形成新的受控 queue

因此，当前 checkpoint 的策略结论为：**保持 `lint/typecheck/test/build` 全绿，停止自动扩展 `R160+`；只有在人工确认新的受控 queue 后，才继续压缩 `OpenCodianView` / `OpenCodeService` residual thick owner。**

## 2. 当前基线

- **lint**: `0 errors / 0 warnings`
- **typecheck**: 通过
- **最近验证**: `npm run lint -- --format unix` 通过、`npm run typecheck` 通过、`npm test` 通过（`283 passed, 283 total` suites / `1187 passed, 1187 total` tests）、`npm run build` 通过
- **部署策略**: 当前 maintainability 批次不做 Test Vault 部署，除非用户后续明确要求
- **当前 `[NEXT]`**: 当前没有可自动执行的后续任务
- **主热点**:
  - `R155` 已恢复根仓库 `typecheck` 绿灯，并把 live lint 从 `39` 条 warning 收束到 `38` 条
  - `R156` 已把 live lint warning 从 `38` 条压到 `0`
  - `R157` 已把 conversation hydration / sync load 的薄 host-provider 链回并进既有 factory owner，使 `OpenCodianView.ts` 从 `4869` 行降到 `4859` 行，import statements 从 `91` 条降到 `89` 条
  - `R158` 已把 `OpenCodeSettingsReconfigurationCoordinator` 并回 `OpenCodeServiceLifecycleCoordinator`，`OpenCodeService.ts` 从 `1480` 行降到 `1475` 行，direct lifecycle fields 从 `serverManager` / `serviceLifecycle` / `settingsReconfiguration` 收束为单一 `serviceLifecycle`
  - `R159` 已确认当前 queue 在绿灯下完成 checkpoint；建议停止 autopilot，等待人工判断是否值得继续开新批次

## 3. 本批执行规则

1. `R155 -> R156 -> R157 -> R158 -> R159` 已按顺序完成；在没有新的人工续排项前，不得自动扩展 `R160+`。
2. 每一轮都必须运行全量 `npm run lint`、`npm run typecheck`、`npm test` 与 `npm run build`。
3. 当前批次不做 Test Vault 部署，除非用户后续明确要求。
4. 新一批的第一目标是恢复**绿色质量门槛**；在 `lint/typecheck/test/build` 全绿之前，不扩大 maintainability 范围。
5. `OpenCodianView` / `OpenCodeService` 的 maintainability 处理必须带来可见的 assembly/import surface 收缩；不能只把体量平移到更多小文件，也不能为追数字制造薄碎片。
6. 恢复 autopilot 时必须使用外部 profile：`/Users/dht/.config/opencodian/mac-autopilot-profile.json`。

## 4. 回归观察点

1. `OpenCodianView`：并发 tab/session streaming、hydration/auth-sync gate、background-task completion notice、scroll restore、question card resolution 不回归。
2. chat services：question/todo/background-task runtime、tab activation、authoritative sync、context usage、model/permission/input panel 语义不回归。
3. `OpenCodeService` / streaming：SDK-first / legacy fallback、session-scoped abort/detach、managed server adoption/restart、sync-event bridge 与 final response completion 语义不回归。
4. tests / glass / demo：opt-in glass 行为、demo 不进入 stable UI path、heavy suites 覆盖语义不回归。

## 5. 长期边界

- 不为清 warning 或“看起来更模块化”而新增薄 facade / adapter / provider / factory 文件
- 新抽出的独立 owner / module 通常至少应覆盖约 `100` 行以上的真实责任，或暴露 `3+` 个稳定 public APIs；若只是很薄的桥接层，应优先并回调用方
- 任何候选改动如果只是把一个碎片链重命名、再包一层 host/provider/factory，默认视为不合格
- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 只有在 roadmap 明确写出后才允许继续 maintainability 拆分
- 优先选择完整 section / lifecycle / runtime seam；避免回到 logging-only、helper-only、warning-only 的低收益碎片化拆分
- 当前 maintainability 批次默认不部署；部署只在用户后续明确要求时才允许恢复
- 恢复 autopilot 时必须使用外部 profile `/Users/dht/.config/opencodian/mac-autopilot-profile.json`

## 6. 阅读顺序

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. `docs/status/maintainability-round-roadmap.md`
4. 最近的 `docs/status/maintainability-phase-XXX.md`
5. 如需历史上下文，再读 `docs/status/maintainability-completed-batches.md`

# Maintainability Master Plan

> **状态**: [ACTIVE]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R157` 已完成；当前 `[NEXT]` 为 `R158 - OpenCodeService residual thick-owner reduction under green gates`。

## 1. 当前判断

**当前分支已完成 `R153-R157` 的 chat / opencode defragmentation、typecheck gate recovery、zero-warning closeout 与首个 residual thick-owner 回并。当前最新实测为：`npm run lint` 通过、`npm run typecheck` 通过、`npm test` 通过（`284` 个 suites / `1187` 个 tests）、`npm run build` 通过。因此本批现已在绿灯下完成 `OpenCodianView` 的一条 residual seam 回并，接下来转入 `R158-R159` 继续处理 `OpenCodeService` 与 checkpoint。**

当前继续 maintainability 的理由不是 warning 数本身，而是远端仓库仍存在两类高价值 residual：

- `src/features/chat/OpenCodianView.ts` 仍约 `4866` 行，且直接装配大量 chat runtime owner
- `src/core/opencode/OpenCodeService.ts` 当前约 `1437` 行；`R154` 已把 `OpenCodeQueryGateway` 并回 `OpenCodeCatalogQueryCoordinator`，但 residual hotspot 仍需在 checkpoint 中复盘
- `src/features/chat/services/` 里仍可见明显碎片化迹象：按文件名统计约有 `15` 个 `Adapter`、`7` 个 `Provider`、`5` 个 `Factory`、`23` 个 `Host` 命名文件，且存在一批 `40` 行以下的极薄文件
- lint gate 已清零；当前 residual hotspot 回到 `OpenCodianView` / `OpenCodeService` 主 owner 与其相邻装配面

因此，新一批 queue 的策略调整为：**保持 `lint/typecheck/test/build` 全绿，再继续压缩 `OpenCodianView` / `OpenCodeService` 的 residual thick owner；整个过程不部署、不制造薄碎片。**

## 2. 当前基线

- **lint**: `0 errors / 0 warnings`
- **typecheck**: 通过
- **最近验证**: `npm run lint` 通过、`npm run typecheck` 通过、`npm test` 通过（`284 passed, 284 total` suites / `1187 passed, 1187 total` tests）、`npm run build` 通过
- **部署策略**: 当前 maintainability 批次不做 Test Vault 部署，除非用户后续明确要求
- **当前 `[NEXT]`**: `R158 - OpenCodeService residual thick-owner reduction under green gates`
- **主热点**:
  - `R157` 已把 conversation hydration / sync load 的薄 host-provider 链回并进既有 factory owner，使 `OpenCodianView.ts` 从 `4869` 行降到 `4859` 行，import statements 从 `91` 条降到 `89` 条
  - `OpenCodeService.ts` 当前约 `1437` 行，constructor/import surface 已继续收束，但 residual coordinator assembly 仍需后续轮次继续压缩

## 3. 本批执行规则

1. 只能按 `R155 -> R156 -> R157 -> R158 -> R159` 顺序执行，不能跳题。
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

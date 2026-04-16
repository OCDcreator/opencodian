# Maintainability Master Plan

> **状态**: [ACTIVE]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R154` 已完成；当前 `[NEXT]` 为 `R155 - Typecheck gate recovery before zero-warning closeout`。

## 1. 当前判断

**当前分支已完成 `R153-R154` 的 chat / opencode defragmentation，但远端真实基线仍未达到用户要求的 `0 errors / 0 warnings + typecheck 通过 + 全量测试通过`。当前最新实测为：`npm test` 通过（`286` 个 suites / `1190` 个 tests）、`npm run build` 通过，但 `npm run lint -- --format unix` 仍有 `39` 条 warnings，`npm run typecheck` 当前失败。因此本批接下来先恢复绿色质量门槛，再继续削减 residual thick owner。**

当前继续 maintainability 的理由不是 warning 数本身，而是远端仓库仍存在两类高价值 residual：

- `src/features/chat/OpenCodianView.ts` 仍约 `4866` 行，且直接装配大量 chat runtime owner
- `src/core/opencode/OpenCodeService.ts` 当前约 `1437` 行；`R154` 已把 `OpenCodeQueryGateway` 并回 `OpenCodeCatalogQueryCoordinator`，但 residual hotspot 仍需在 checkpoint 中复盘
- `src/features/chat/services/` 里仍可见明显碎片化迹象：按文件名统计约有 `15` 个 `Adapter`、`7` 个 `Provider`、`5` 个 `Factory`、`23` 个 `Host` 命名文件，且存在一批 `40` 行以下的极薄文件
- live hotspot 仍落在 `tests/**`、`src/features/chat/**`、`src/utils/glass/**` 与 `src/core/opencode/**`

因此，新一批 queue 的策略调整为：**先把 typecheck 与 lint 清到全绿，再在绿色门槛上继续压缩 `OpenCodianView` / `OpenCodeService` 的 residual thick owner；整个过程不部署、不制造薄碎片。**

## 2. 当前基线

- **lint**: `0 errors / 39 warnings`
- **typecheck**: 当前失败；远端红线集中在 `OpenCodianView`、background-task services、settings 运行时类型对齐与 `src/types/jsx-shim.ts`
- **最近验证**: 远端最新实测 `npm test` 通过（`286 passed, 286 total` suites / `1190 passed, 1190 total` tests），`npm run build` 通过；但 `npm run lint -- --format unix` 仍有 `39 problems`，`npm run typecheck` 当前失败
- **部署策略**: 当前 maintainability 批次不做 Test Vault 部署，除非用户后续明确要求
- **当前 `[NEXT]`**: `R155 - Typecheck gate recovery before zero-warning closeout`
- **主热点**:
  - `R154` 已删除 `1` 个 opencode query gateway 薄层，并把 provider/project/file/find/path/VCS/formatter/LSP 与 MCP status/auth surface 并回 `OpenCodeCatalogQueryCoordinator`
  - `OpenCodeService.ts` 行数从 `1454` 降到 `1437`，direct coordinator/import surface 继续收缩
  - `tests/**` 约 `8` 条 warnings、`src/features/chat/**` 约 `7` 条、`src/utils/glass/**` 约 `6` 条、`src/features/settings/**` 约 `4` 条、`src/core/opencode/**` 约 `4` 条

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

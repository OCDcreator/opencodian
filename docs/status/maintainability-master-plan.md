# Maintainability Master Plan

> **状态**: [ACTIVE]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R153` 已完成；当前 `[NEXT]` 为 `R154 - OpenCodeService coordinator stack defragmentation seam`。

## 1. 当前判断

**当前分支已完成 `R88-R152`，并在远端实测维持 `0 errors / 36 warnings`、`286` 个 suites / `1190` 个 tests 通过。接下来不再沿既有碎片链继续“再拆一层”，而是进入一个受控的 defragmentation 批次：优先回并 `OpenCodianView` 周边过薄 host/provider/adapter/factory 链与 `OpenCodeService` 周边过薄 coordinator/wrapper 链，先把 assembly 噪音和大文件体量压回更稳定的厚 owner。**

当前继续 maintainability 的理由不是 warning 数本身，而是远端仓库仍存在两类高价值 residual：

- `src/features/chat/OpenCodianView.ts` 仍约 `4877` 行，且直接装配大量 chat runtime owner
- `src/core/opencode/OpenCodeService.ts` 仍约 `1454` 行，constructor / runtime wiring 仍聚集多层 opencode owner
- `src/features/chat/services/` 里仍可见明显碎片化迹象：按文件名统计约有 `15` 个 `Adapter`、`7` 个 `Provider`、`5` 个 `Factory`、`23` 个 `Host` 命名文件，且存在一批 `40` 行以下的极薄文件
- live hotspot 仍落在 `tests/**`、`src/features/chat/**`、`src/utils/glass/**` 与 `src/core/opencode/**`

因此，新一批 queue 的策略不是继续扩散 owner 数量，而是：**先回并碎片，再瘦身两个大文件，最后只在仍有真实收益时处理 heavy tests / glass/demo 热点。**

## 2. 当前基线

- **lint**: `0 errors / 36 warnings`
- **最近验证**: `R153` 运行 focused `npm test -- BackgroundTaskLiveSignalCoordinator ConversationSyncBridge TabActivationRuntimeViewHostFactory`、全量 `npm run lint -- --format unix`、全量 `npm test` 与 `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M); echo "$BUILD_ID"; BUILD_ID="$BUILD_ID" npm run build`；结果维持 `0 errors / 36 warnings`、`286 passed, 286 total` suites / `1190 passed, 1190 total` tests，通过构建的最新 `BUILD_ID` 为 `autopilot-maintainability.202604161442`
- **最近 Test Vault 部署**: `R146`，`BUILD_ID` `autopilot-maintainability.202604160757`
- **当前 `[NEXT]`**: `R154 - OpenCodeService coordinator stack defragmentation seam`
- **主热点**:
  - `R153` 已删除 `4` 个 view-adjacent 纯转发薄层，并把 background live-signal / sync-port assembly 并回既有 owner
  - `OpenCodianView` 仍约 `4866` 行，下一步需转向 `OpenCodeService` 周边 coordinator/wrapper 装配厚度
  - `tests/**` 约 `8` 条 warnings、`src/features/chat/**` 约 `7` 条、`src/utils/glass/**` 约 `6` 条、`src/features/settings/**` 约 `4` 条、`src/core/opencode/**` 约 `4` 条

## 3. 本批执行规则

1. 只能按 `R153 -> R154 -> R155 -> R156` 顺序执行，不能跳题。
2. 每一轮都必须运行全量 `npm test` 与 `npm run build`；命中 deploy-relevant paths 时必须按仓库规则做 Test Vault 部署与 `BUILD_ID` 校验。
3. 新一批的第一目标是**回并碎片**：优先把过薄 host/provider/adapter/factory/wrapper 文件并回相邻的既有厚 owner，而不是并回 `OpenCodianView` / `OpenCodeService` 主文件本体，也不是再新增一层薄文件。
4. `OpenCodianView` / `OpenCodeService` 的 maintainability 处理必须带来可见的 assembly/import surface 收缩；不能只把体量平移到更多小文件。
5. `R155` 的 tests / glass / demo cleanup 只能在 `R153-R154` 完成后、且 live hotspot 仍真实存在时推进；不允许删断言、减覆盖、弱化实验特性保护边界。
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
- 命中 deploy-relevant paths 时，继续严格遵守 build → Test Vault deploy → `BUILD_ID` 校验顺序
- 恢复 autopilot 时必须使用外部 profile `/Users/dht/.config/opencodian/mac-autopilot-profile.json`

## 6. 阅读顺序

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. `docs/status/maintainability-round-roadmap.md`
4. 最近的 `docs/status/maintainability-phase-XXX.md`
5. 如需历史上下文，再读 `docs/status/maintainability-completed-batches.md`

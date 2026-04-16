# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [ACTIVE] `R155` 已完成；当前 `[NEXT]` 为 `R156 - Zero-warning hotspot closeout after typecheck recovery`。

## 当前优先级

- **当前 `[NEXT]`**：`R156 - Zero-warning hotspot closeout after typecheck recovery`
- **本批目标**：先恢复 `typecheck` 绿灯，再把 lint 清到 `0 errors / 0 warnings`，然后继续压缩 `OpenCodianView` / `OpenCodeService` 的 residual thick owner，最后进入 checkpoint
- **当前 lint 基线**：`0 errors / 38 warnings`
- **当前 typecheck 基线**：通过
- **热点顺序**：
  1. `R156` zero-warning hotspot closeout
  2. `R157-R158` 核心厚 owner residual 收缩
  3. `R159` checkpoint；当前不得自动扩展 `R160+`

## 本批边界

- 只允许执行 `R155 -> R156 -> R157 -> R158 -> R159`；当前不得自动扩展 `R160+`
- 不新增薄 helper / adapter / provider / factory；优先把过薄文件并回相邻厚 owner，禁止并回 `OpenCodianView` / `OpenCodeService` 主文件本体
- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 的 maintainability 仅允许在 queue 明示项内继续推进
- `OpenCodianView` / `OpenCodeService` 的改动必须带来可见的 import surface / assembly 收缩，不能只做“换文件不减复杂度”，也不能把碎片回灌进主文件
- tests / glass / demo cleanup 只允许沿现有 suite / owner 内部整理，不允许删断言、减覆盖或把实验特性暴露到 stable UI path
- 当前 maintainability 批次默认不部署；部署只在用户后续明确要求时才允许恢复
- 恢复运行必须使用外部 profile `/Users/dht/.config/opencodian/mac-autopilot-profile.json`

## 远端实测热点提示

- `src/features/chat/OpenCodianView.ts`：当前约 `4866` 行
- `src/core/opencode/OpenCodeService.ts`：`R154` 已把 `OpenCodeQueryGateway` 并回 `OpenCodeCatalogQueryCoordinator`，当前约 `1437` 行
- `src/features/chat/services/`：`R153` 后命名上约为 `Adapter 15 / Provider 4 / Factory 4 / Host 21 / Runtime 21 / Coordinator 33 / Facade 7`；view-adjacent 纯转发薄层已先收掉 `4` 个
- `tests/**` 约 `8` 条 warning、`src/features/chat/**` 约 `7` 条、`src/utils/glass/**` 约 `6` 条、`src/features/settings/**` 约 `4` 条、`src/core/opencode/**` 约 `4` 条
- `R155` 已恢复 typecheck；remaining lint hotspot 继续集中在 `tests/**`、`src/features/chat/**`、`src/utils/glass/**`、`src/features/settings/**` 与 `src/core/opencode/**`

## 回归观察点

- `OpenCodianView`：并发 tab/session streaming、hydration/auth-sync gate、background-task completion notice、scroll restore、question card resolution 不回归
- chat services：background-task timeline、authoritative sync、question/todo runtime、input panel theme、model/permission selector 语义不变
- `OpenCodeService` / streaming：SDK-first / legacy fallback、session-scoped abort/detach、managed server adoption/restart、sync-event bridge 语义不变
- tests / glass / demo：heavy suites coverage、opt-in glass 行为与 experimental demo guardrail 不变
- lint：整批都必须维持 `0 errors`

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-490.md`
- 最近 checkpoint：`docs/status/maintainability-phase-487.md`

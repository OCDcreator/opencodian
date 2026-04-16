# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [ACTIVE] `R153-R156` 已人工续排；当前 `[NEXT]` 为 `R153 - OpenCodianView host/provider defragmentation seam`。

## 当前优先级

- **当前 `[NEXT]`**：`R153 - OpenCodianView host/provider defragmentation seam`
- **本批目标**：先回并碎片化装配链，再压缩 `OpenCodianView` / `OpenCodeService` 这两个核心大文件，最后只在热点仍存在时处理 heavy tests / glass/demo 残余
- **当前 lint 基线**：`0 errors / 36 warnings`
- **热点顺序**：
  1. `OpenCodianView` + chat services 的 host/provider/adapter/factory 碎片化链
  2. `OpenCodeService` + opencode coordinator/wrapper stack 的装配厚度
  3. heavy tests / glass/demo 热点（仅在前两步后仍为 live hotspot 时推进）

## 本批边界

- 只允许执行 `R153 -> R154 -> R155 -> R156`；当前不得自动扩展 `R157+`
- 不新增薄 helper / adapter / provider / factory；优先把过薄文件并回相邻厚 owner，禁止并回 `OpenCodianView` / `OpenCodeService` 主文件本体
- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 的 maintainability 仅允许在 queue 明示项内继续推进
- `OpenCodianView` / `OpenCodeService` 的改动必须带来可见的 import surface / assembly 收缩，不能只做“换文件不减复杂度”，也不能把碎片回灌进主文件
- tests / glass / demo cleanup 只允许沿现有 suite / owner 内部整理，不允许删断言、减覆盖或把实验特性暴露到 stable UI path
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验
- 恢复运行必须使用外部 profile `/Users/dht/.config/opencodian/mac-autopilot-profile.json`

## 远端实测热点提示

- `src/features/chat/OpenCodianView.ts`：约 `4877` 行
- `src/core/opencode/OpenCodeService.ts`：约 `1454` 行
- `src/features/chat/services/`：命名上约有 `15` 个 `Adapter`、`7` 个 `Provider`、`5` 个 `Factory`、`23` 个 `Host` 文件；其中存在一批 `40` 行以下薄文件
- `tests/**` 约 `8` 条 warning、`src/features/chat/**` 约 `7` 条、`src/utils/glass/**` 约 `6` 条、`src/features/settings/**` 约 `4` 条、`src/core/opencode/**` 约 `4` 条

## 回归观察点

- `OpenCodianView`：并发 tab/session streaming、hydration/auth-sync gate、background-task completion notice、scroll restore、question card resolution 不回归
- chat services：background-task timeline、authoritative sync、question/todo runtime、input panel theme、model/permission selector 语义不变
- `OpenCodeService` / streaming：SDK-first / legacy fallback、session-scoped abort/detach、managed server adoption/restart、sync-event bridge 语义不变
- tests / glass / demo：heavy suites coverage、opt-in glass 行为与 experimental demo guardrail 不变
- lint：整批都必须维持 `0 errors`

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-487.md`
- 最近 checkpoint：`docs/status/maintainability-phase-487.md`

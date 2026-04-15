# Maintainability Master Plan

> **状态**: [READY]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R89` 已完成；当前已人工续排 `R90-R137` 长队列。恢复 autopilot 后只能从首个 `[NEXT]`（`R90`）顺序执行，不允许 freestyle。

## 1. 当前判断

**当前分支已完成 `R68-R87` 并把 live lint 从 `0 errors / 79 warnings` 压到 `0 errors / 64 warnings`；现在已接续新的“50 轮漂亮版”长队列 `R88-R137`。** 新批次不重复已完成 seam，而是继续围绕最新 checkpoint 仍然高收益的 residual seams：先吃 `OpenCodianView`/chat render/sync/services 残余，再吃 `OpenCodeService`/streaming residual，再转 secondary core / settings / startup，最后做 heavy tests follow-up、warning closeout 与最终 checkpoint。

## 2. 当前基线

- **lint**: `0 errors / 64 warnings`
- **最近验证**: `R89` 已确认 focused `npm test -- ConversationLoadRecoveryCoordinator`、focused `npm test -- persistedTabRestore`、全量 `npm test` 与 `npm run build` 通过，`BUILD_ID` 为 `autopilot-maintainability.202604152008`
- **最近 Test Vault 部署**: `R64`，`BUILD_ID` `autopilot-maintainability.202604150602`
- **当前 `[NEXT]`**: `R90 - OpenCodianView message render/update residual seam`
- **主热点**: `src/features/chat/**` 仍是最大生产热点，`src/core/opencode/**` 仍是第二梯队热点

## 3. 本批执行规则

1. 只能按 `[NEXT] -> [QUEUED]` 顺序执行，不能跳题。
2. 每一轮都必须运行全量 `npm test` 与 `npm run build`；命中 deploy-relevant paths 时必须按仓库规则做 Test Vault 部署与 `BUILD_ID` 校验。
3. 不允许制造微碎片模块；不得为了清 warning 新增薄 helper / adapter / provider / factory。
4. `OpenCodeService` / `OpenCodianView` / `OpenCodianSettings` 的 maintainability 处理只能按 queue 明示项推进。
5. heavy tests follow-up 只能按责任拆，不允许删断言、减覆盖、弱化场景。
6. 恢复 autopilot 时必须使用外部 profile：`/Users/dht/.config/opencodian/mac-autopilot-profile.json`。

## 4. 回归观察点

1. `OpenCodianView`：并发 tab/session streaming、hydration/auth-sync gate、background-task completion notice、scroll restore、question card resolution 不回归。
2. chat services：background-task timeline、model selection、input panel theme、session todo stale notice、question dock 语义不回归。
3. `OpenCodeService` / streaming：SDK-first / legacy fallback、session-scoped abort/detach、final response completion、sync-event bridge 语义不回归。
4. settings / startup：settings normalization、conversation restore preload、locale/theme startup、provider/model disable layering 不回归。

## 5. 长期边界

- 不为清 warning 或“看起来更模块化”而新增薄 facade / adapter / provider / factory 文件
- 新抽出的独立 owner / module 通常至少应覆盖约 `100` 行以上的真实责任，或暴露 `3+` 个稳定 public APIs；若只是很薄的桥接层，应优先并回调用方
- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 只有在 roadmap 明确写出后才允许继续 maintainability 拆分
- 优先选择完整 section / lifecycle / runtime seam；避免回到 logging-only、helper-only、warning-only 的低收益碎片化拆分
- 对 question / todo / background-task runtime provider chain 的后续处理，默认先复查是否已经过薄，再决定是继续收束还是回并
- 命中 deploy-relevant paths 时，继续严格遵守 build → Test Vault deploy → `BUILD_ID` 校验顺序
- 恢复 autopilot 时必须使用外部 profile `/Users/dht/.config/opencodian/mac-autopilot-profile.json`

## 6. 阅读顺序

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. `docs/status/maintainability-round-roadmap.md`
4. 最近的 `docs/status/maintainability-phase-XXX.md`
5. 如需历史上下文，再读 `docs/status/maintainability-completed-batches.md`

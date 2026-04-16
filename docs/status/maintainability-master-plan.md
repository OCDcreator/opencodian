# Maintainability Master Plan

> **状态**: [ACTIVE]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: 已人工续排 `R138-R152`；当前唯一可自动执行的 `[NEXT]` 是 `R150`。

## 1. 当前判断

**当前分支已完成 `R88-R149` 并已人工续排 `R150-R152`。`R149` 已完成 streaming tool-render summary residual，把 `ToolCallRenderer` 内联的 MCP 摘要分类/字段回退收束回 `mcpSummaryConfig` 统一入口，保持 tool-call rendering 与 MCP/custom summary 语义不变，并把 live lint 推进到 `0 errors / 39 warnings`；当前 queue 已进入 `R150` 的 storage/provider asset persistence residual，随后仅在热点仍支撑时处理 `R151` heavy cleanup，并在 `R152` 做 continuation checkpoint。**

## 2. 当前基线

- **lint**: `0 errors / 39 warnings`
- **最近验证**: `R149` 运行 targeted `npx eslint --format unix src/core/opencode/OpenCodeStreamEventTransformer.ts src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts src/utils/streaming/StreamController.ts src/utils/streaming/ToolCallRenderer.ts tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`、focused `npm test -- ToolCallRenderer.test.ts`、全量 `npm run lint -- --format unix`、全量 `npm test` 与 `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M) npm run build`；targeted streaming lint 从 `5` 个 warning 降到 `4` 个，整体 lint 维持 `0 errors / 39 warnings`，`npm test` 为 `286 passed, 286 total` suites / `1190 passed, 1190 total` tests，最新 `BUILD_ID` 为 `autopilot-maintainability.202604160825`
- **最近 Test Vault 部署**: `R146`，`BUILD_ID` `autopilot-maintainability.202604160757`
- **当前 `[NEXT]`**: `R150 - Storage/provider asset persistence residual seam`
- **主热点**: live lint 仍为 `39` warnings，其中 `tests/**` 约 `9`、`src/features/chat/**` 约 `7`、`src/utils/glass/**` 约 `6`、`src/core/opencode/**` 约 `4`，另有 storage/provider-icon persistence residual；当前先完成 `R150`，再视 live hotspot 决定是否执行 `R151`

## 3. 本批执行规则

1. 只能按 `[NEXT] -> [QUEUED]` 顺序执行，不能跳题。
2. 每一轮都必须运行全量 `npm test` 与 `npm run build`；命中 deploy-relevant paths 时必须按仓库规则做 Test Vault 部署与 `BUILD_ID` 校验。
3. 不允许制造微碎片模块；不得为了清 warning 新增薄 helper / adapter / provider / factory。
4. `OpenCodeService` / `OpenCodianView` / `OpenCodianSettings` 的 maintainability 处理只能按 queue 明示项推进。
5. warning closeout 只能沿现有厚 seam 收口，不允许删断言、减覆盖、弱化场景，也不允许借机新增薄 helper / adapter / provider / factory。
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

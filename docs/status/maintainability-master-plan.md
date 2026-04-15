# Maintainability Master Plan

> **状态**: [ACTIVE]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: 已人工续排 `R138-R152`；当前唯一可自动执行的 `[NEXT]` 是 `R146`。

## 1. 当前判断

**当前分支已完成 `R88-R145` 并已人工续排 `R146-R152`。`R145` 已把原 `modelConfig.ts` 大文件收束为 shared/catalog/availability/assembly/selection 相邻 owner，并拆分 model config focused suites，live lint 从 `0 errors / 48 warnings` 收敛到 `0 errors / 44 warnings`；当前 queue 进入 `R146` startup locale/settings normalization residual，再继续按 startup residual → opencode/streaming/persistence/glass-test residual 两批推进，并只在 `R147`、`R152` 设置后续 checkpoint。**

## 2. 当前基线

- **lint**: `0 errors / 44 warnings`
- **最近验证**: `R145` 运行 focused `npm test -- modelConfig.test.ts modelConfigCatalog.test.ts ModelConfigService.test.ts ModelConfigServiceRuntimeScope.test.ts`、全量 `npm run lint -- --format unix`、全量 `npm test` 与 `npm run build`；lint 维持 `0 errors / 44 warnings`，`npm test` 为 `285 passed, 285 total` suites / `1189 passed, 1189 total` tests，最新 `BUILD_ID` 为 `autopilot-maintainability.202604160734`
- **最近 Test Vault 部署**: `R144`，`BUILD_ID` `autopilot-maintainability.202604160711`
- **当前 `[NEXT]`**: `R146 - Startup locale/settings normalization residual seam`
- **主热点**: live lint 仍为 `44` warnings，其中 `tests/**` 约 `12`、`src/features/chat/**` 约 `7`、`src/utils/glass/**` 约 `6`、`src/core/opencode/**` 约 `5`，另有 settings modal/startup/locale/settings-types/provider-icon residual；`R146` 先处理 startup normalization seam，然后继续 `R148-R150` 的 opencode/streaming/persistence residual

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

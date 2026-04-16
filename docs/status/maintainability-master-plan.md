# Maintainability Master Plan

> **状态**: [ACTIVE]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: 已人工续排 `R138-R152`；当前唯一可自动执行的 `[NEXT]` 是 `R152`。

## 1. 当前判断

**当前分支已完成 `R88-R151` 并已人工续排 `R151-R152`。`R151` 已完成 heavy tests / opt-in glass residual 的首个受控 closeout：把 `tests/unit/utils/glass/shuding.test.ts` 按 defaults/sampling 与 mount lifecycle 分组，并把 `roundedRectSdf()` test helper 收束为 geometry 参数形态，保持 shuding adapter 的默认采样路径、URL-backed filter、mount/unmount style restore 与 opt-in glass 行为不变，并把 live lint 从 `0 errors / 38 warnings` 推进到 `0 errors / 36 warnings`；当前 queue 已进入 `R152` 的 continuation checkpoint。**

## 2. 当前基线

- **lint**: `0 errors / 36 warnings`
- **最近验证**: `R151` 运行 focused `npm test -- shuding.test.ts`、targeted `npx eslint --format unix tests/unit/utils/glass/shuding.test.ts`、全量 `npm run lint -- --format unix`、全量 `npm test` 与 `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M); echo "$BUILD_ID"; BUILD_ID=$BUILD_ID npm run build`；targeted shuding lint 归零，整体 lint 从 `0 errors / 38 warnings` 降到 `0 errors / 36 warnings`，`npm test` 为 `286 passed, 286 total` suites / `1190 passed, 1190 total` tests，最新 `BUILD_ID` 为 `autopilot-maintainability.202604160857`
- **最近 Test Vault 部署**: `R146`，`BUILD_ID` `autopilot-maintainability.202604160757`
- **当前 `[NEXT]`**: `R152 - Continuation checkpoint after R138-R151`
- **主热点**: live lint 仍为 `36` warnings，其中 `tests/**` 约 `8`、`src/features/chat/**` 约 `7`、`src/utils/glass/**` 约 `6`、`src/core/opencode/**` 约 `4`；`R151` 已完成 shuding heavy test residual cleanup，当前转入 `R152` continuation checkpoint

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

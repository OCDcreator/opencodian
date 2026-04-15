# Maintainability Master Plan

> **状态**: [READY]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R131` 已完成 Chat heavy suite split follow-up B；当前继续按 `R132-R137` 长队列顺序推进。恢复 autopilot 后只能从首个 `[NEXT]`（`R132`）顺序执行，不允许 freestyle。

## 1. 当前判断

**当前分支已完成 `R68-R131` 并把 live lint 记录基线保持在 `0 errors / 65 warnings`；`R131` 已把 question/todo/background-task runtime view host 邻域的 residual heavy suite 按 forwarding 与 late-binding 两个责任域拆开，并清掉 composer 入口的 import-sort 残留。** 接下来先执行 `R132` checkpoint，复盘 `R128-R131` 的 heavy test split 收益，再按 warning closeout 与最终 checkpoint 顺序推进。

## 2. 当前基线

- **lint**: `0 errors / 65 warnings`
- **最近验证**: `R131` 已确认 focused lint、focused tests、全量 `npm test` 与 `npm run build` 通过，`BUILD_ID` 为 `autopilot-maintainability.202604160346`
- **最近 Test Vault 部署**: `R126`，`BUILD_ID` `autopilot-maintainability.202604160258`（`R127` 仅改 checkpoint 文档，未触发部署）
- **当前 `[NEXT]`**: `R132 - Checkpoint after heavy test split wave`
- **主热点**: Batch 9 heavy suite split wave 已完成；下一步先复盘 `R128-R131` 的 heavy-suite ownership 收益，并确认 Batch 10 warning closeout 的入口顺序

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

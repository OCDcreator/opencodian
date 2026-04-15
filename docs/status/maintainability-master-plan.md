# Maintainability Master Plan

> **状态**: [READY]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R119` 已完成 `core types settings normalization seam A`；当前继续按 `R120-R137` 长队列顺序推进。恢复 autopilot 后只能从首个 `[NEXT]`（`R120`）顺序执行，不允许 freestyle。

## 1. 当前判断

**当前分支已完成 `R68-R119` 并把 live lint 稳定在 `0 errors / 65 warnings`；`R119` 已把 question card cluster、input panel theme family/variant/adapter 映射与 chat appearance 第一组 normalization residual 收束到更集中的 settings owner path。** 接下来继续 secondary core / settings / startup，先执行 `R120-R121` 的 settings normalization 与 modelConfig residual，再做 heavy tests follow-up、warning closeout 与最终 checkpoint。

## 2. 当前基线

- **lint**: `0 errors / 65 warnings`
- **最近验证**: `R119` 已确认 focused `tests/unit/core/types/settings.test.ts`、`tests/unit/features/settings/OpenCodianStyleSettings.test.ts`、`tests/unit/features/chat/inputPanelTheme.test.ts`、`tests/unit/main/themeSettingsMigration.test.ts`、全量 `npm test` 与 `npm run build` 通过，`BUILD_ID` 为 `autopilot-maintainability.202604160142`
- **最近 Test Vault 部署**: `R119`，`BUILD_ID` `autopilot-maintainability.202604160142`
- **当前 `[NEXT]`**: `R120 - core types settings normalization seam B`
- **主热点**: `R119` 已完成 settings normalization seam A；下一步聚焦 `src/core/types/settings.ts` 与 `src/features/settings/OpenCodianSettings.ts`，继续收束 provider/model/plugin/debug normalization residual

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

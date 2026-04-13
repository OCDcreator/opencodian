# 可维护性改进：第三百二十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-326.md`
> **推进的 master-plan lane**: Checkpoint
> **完成的 roadmap queue item**: `R12 - Maintainability checkpoint`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R12 - Maintainability checkpoint`。本轮没有开启新的代码重构，只做受控队列的复盘、指标统计和状态文档调整。目标是确认 R1-R11 对 `OpenCodianView`、`OpenCodianSettings`、`OpenCodeService` 三个 hotspot 的影响，并把 autopilot 状态切换为需要人工确认后再继续。

本轮刻意**没有**新增 `[QUEUED]` 或 `[NEXT]` 项，也没有继续拆任何 helper / provider / adapter。R12 完成后，当前受控队列已经结束；下一批 roadmap 必须由人工确认后再写入。

## 1. 本轮范围

- 复盘最近 11 个 phase 文档
  - R1-R6：P2 question/todo/background-task 链路收束与回归覆盖
  - R7：P3 composer-context bundle / builder / catalog ownership 收进 `ComposerContextViewFacade`
  - R8：P4 persisted assistant shell / notice / footer / timestamp 组装收进 `AssistantShellViewHostAdapter`
  - R9-R10：settings section lifecycle 与 model catalog presenter 从 `OpenCodianSettings` 迁出
  - R11：core catalog state / provider-model availability API 收进 `ModelCatalogStateService`
- 统计 checkpoint hotspot 体量
  - `src/features/chat/OpenCodianView.ts`：当前 7732 行；R1 前 baseline 7785 行
  - `src/features/settings/OpenCodianSettings.ts`：当前 4989 行；R9 前 baseline 6756 行
  - `src/core/opencode/OpenCodeService.ts`：当前 4733 行；本批 baseline 4733 行
- 更新状态文档
  - `docs/status/maintainability-master-plan.md` 改为 [REVIEW_REQUIRED]，明确 R1-R12 完成后等待人工确认
  - `docs/status/maintainability-round-roadmap.md` 将 R12 标为 `[DONE]`，不提升新的 `[NEXT]`
  - `docs/status/maintainability-lane-map.md` 同步当前没有可自动执行 queue 的状态

## 2. Hotspot 复盘

### `OpenCodianView`

- R1-R5 把 P2 的 provider/factory、question lifecycle、session todo refresh/status、background completion notice queue、session signal routing 迁入较厚 owner，并删除多段薄转发 seam。
- R6 把 P2 切到 regression-only，避免继续在 question/todo/background-task 周边开新拆分。
- R7-R8 把 composer-context bundle 创建和 persisted assistant shell / notice / footer / timestamp 组装迁出，让 view 更接近 host seam 与正文渲染回调。
- 当前剩余风险：tab activation / pane sync / runtime bridge、header/input/appearance/model-permission、pseudo-stream reveal 与少量本地错误/server-prompt UI 壳层仍在 view 内；下一批不应回到已完成的 P2/P3/P4 边界做低收益细拆。

### `OpenCodianSettings`

- R9 把 section lifecycle、quick-nav、scroll restoration 迁入 `SettingsSectionCoordinator`。
- R10 把 provider/model accordion、search、bulk toggle、probe presentation 迁入 `SettingsModelCatalogPresenter`。
- R11 把 `baseEffective` / `effective` / `currentEnabledProviderIds` 和 provider/model availability writeback 收进 `ModelCatalogStateService`。
- 当前剩余风险：settings tab 仍承担 section composition、settings persistence、modal launch 和多处分区业务装配；继续拆分前应先确认是否比 chat/core hotspot 更高优先级。

### `OpenCodeService`

- 本批 roadmap 没有直接修改 `OpenCodeService`，体量保持 4733 行。
- 当前复杂度仍集中在 SDK v2 facade consumption、legacy HTTP/SSE fallback、sync event bridge、message/question/tool normalization、session/config API glue。
- 下一批若处理该 owner，应先定义兼容边界，避免破坏 SDK-first 与 legacy fallback 双路径。

## 3. 边界确认

- 本轮没有改变任何 TypeScript runtime、tests、styles、manifest 或 bundled assets。
- 本轮没有读取或更新 `docs/modules/**`，因为没有模块边界变化。
- 本轮没有部署到 Test Vault，因为只修改状态文档，未命中 deploy-relevant runtime 路径。

## 4. 验证

本轮按 roadmap 的 queue 规则实际执行并通过：

- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604132052`

## 5. 下一步建议

当前没有自动下一轮。建议人工先确认下一批 roadmap 是否继续以 `OpenCodianView` 的 tab activation / runtime bridge / header-appearance-model 边界为主，或改为处理 `OpenCodeService` 的 SDK/legacy/sync-event 高风险边界；确认前 autopilot 不应自动扩展新队列。

一句话总结第三百二十七阶段本轮：

> 第三百二十七阶段完成 R12 checkpoint，把 R1-R12 受控队列收束为 [REVIEW_REQUIRED] 状态，并要求人工确认后才能开启下一批 maintainability roadmap。

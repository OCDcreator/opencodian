# Maintainability Master Plan

> **状态**: [READY]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `W6-W15`、`R33-R41` 与 `R42-R45` 已归档；上一轮连续运行在 `R46` checkpoint 上因验证结果契约连续失败而停在 `stopped_failures`，现已人工补入新的 `R46-R50` queue 以恢复无人值守推进。

## 1. 当前判断

**当前分支实际停在 `R45` 完成后的可继续状态。** `R42-R45` 已连续完成 conversation history/actions、authoritative sync merge、model catalog/selection 与 streaming transport 四个厚切口；但上一轮 autopilot 在 docs-only checkpoint 上连续三次停在结果校验，且 live lint 已回升到 `5 errors / 90 warnings`。按照这套无人值守逻辑，下一批必须先吸收当前 lint blocker，再继续补新的厚 owner seam。当前建议 queue 为：`R46 -> R47 -> R48 -> R49 -> R50`，先做 lint unblocker，再做 `OpenCodeService` settings reconfiguration，随后回到 `OpenCodianSettings` 的 model/style 两个残余 section，最后 checkpoint。

## 2. 当前基线

- **lint**: `5 errors / 90 warnings`
- **验证**:
  - `npm run lint` 当前失败，`5 errors / 90 warnings`
  - 当前 HEAD 仍是 `R45` 成功后的代码状态；最近一次已确认的全量验证仍为：`npm test` 通过，`256 passed, 256 total` suites；`1089 passed, 1089 total` tests
  - 最近一次已确认的构建通过：`npm run build`，`BUILD_ID` `autopilot-maintainability.202604150119`
- **下一批高确定性切口**:
  - `R46`: lint blocker housekeeping for post-R43/R44/R45 regressions
  - `R47`: `OpenCodeService` settings reconfiguration seam
  - `R48`: `OpenCodianSettings` model section owner seam
  - `R49`: `OpenCodianSettings` style section lifecycle seam
  - `R50`: checkpoint
- **历史摘要**: 见 `docs/status/maintainability-completed-batches.md`

## 3. 最近完成摘要

- **W6-W15**: 在现有 owner 内完成受控 warning cleanup，把 lint 从 `0 errors / 103 warnings` 压到 `0 errors / 91 warnings`
- **R33-R40**: 完成 settings background、settings catalog presenter、chat constructor wiring、opencode catalog query seam、import-sort housekeeping 解锁，以及 settings server / security section owner seam
- **R41**: 完成 checkpoint，确认 `R38-R40` 已把 lint 基线稳定在 `0 errors / 86 warnings`，并把 autopilot 切回人工确认态
- **R42**: `ConversationHistoryActionsCoordinator` 接管 history dropdown、rename/delete confirm、dropdown positioning 与 cleanup lifecycle
- **R43**: `ConversationAuthoritativeSyncCoordinator` 接管 authoritative sync merge、latest-user hydration、client-only preservation 与 sync logging assembly
- **R44**: `ChatSelectionControlsCoordinator` 接管 model catalog cache、requested/current/resolved selection、switch-model override 与 unavailable follow-up
- **R45**: `OpenCodeStreamingRuntimeCoordinator` 接管 SDK stream、legacy SSE fallback、reader lifecycle 与 final response completion
- **失败复盘**: `R46` checkpoint 的连续重试没有留下分支提交；真正阻塞后续无人值守推进的不是代码正确性，而是 live lint blocker 与 docs-only round 的结果契约失配

## 4. 本批结论

1. **队列策略**：无人值守逻辑会在 `max_consecutive_failures=3` 后自动停机，所以新 queue 必须先把 live lint error 吸收掉，不能再直接把 checkpoint 放在队首。
2. **切口顺序**：`OpenCodeService` 的下一刀优先是 settings reconfiguration seam；`OpenCodianSettings` 的 `addModelSettings()` / `addStyleSettings()` 作为高确定性的后续厚切口跟进。
3. **策略边界**：继续优先完整 lifecycle / runtime seam，不回到 warning-only cleanup，也不回到 logging-only / helper-only 的碎片拆分。
4. **执行状态**：本轮只是把新的 `R46-R50` queue 正式写入文档；写完后应重新启动 autopilot，让它顺序吃完这批 queue。

## 5. 长期边界

- 不为清 warning 或“看起来更模块化”而新增薄 facade / adapter / provider / factory 文件
- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 只有在 roadmap 明确写出后才允许继续 maintainability 拆分
- 优先选择完整 section / lifecycle / runtime seam；避免再回到长串低收益 warning-only 队列
- `OpenCodianView` / `OpenCodeService` 的后续 maintainability 拆分，只允许围绕完整 lifecycle/runtime seam，不允许回退成 logging-only、helper-only、或局部小函数粉碎
- 命中 deploy-relevant paths 时，继续严格遵守 build → Test Vault deploy → `BUILD_ID` 校验顺序

## 6. 阅读顺序

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. `docs/status/maintainability-round-roadmap.md`
4. 最近的 `docs/status/maintainability-phase-XXX.md`
5. 如需历史上下文，再读 `docs/status/maintainability-completed-batches.md`

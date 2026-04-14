# Maintainability Master Plan

> **状态**: [READY]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `W6-W15`、`R33-R41` 与 `R42-R46` 已归档；`R46` 已完成 lint unblocker，当前 queue 顺序推进到 `R47-R50`。

## 1. 当前判断

**当前分支已完成 `R46` 并恢复到可继续推进 `R47` 的状态。** `R42-R45` 已连续完成 conversation history/actions、authoritative sync merge、model catalog/selection 与 streaming transport 四个厚切口，本轮再用最小 lint housekeeping 吸收了 post-R43/R44/R45 的 live lint blocker，把基线恢复到 `0 errors / 90 warnings`。按照既定 queue，下一批继续回到厚 owner seam：`R47 -> R48 -> R49 -> R50`，先做 `OpenCodeService` settings reconfiguration，再做 `OpenCodianSettings` 的 model/style 两个残余 section，最后 checkpoint。

## 2. 当前基线

- **lint**: `0 errors / 90 warnings`
- **验证**:
  - `npm run lint` 已恢复通过，`0 errors / 90 warnings`
  - 最近一次已确认的全量验证为：`npm test` 通过，`256 passed, 256 total` suites；`1089 passed, 1089 total` tests
  - 最近一次已确认的构建通过：`npm run build`，`BUILD_ID` `autopilot-maintainability.202604150156`
- **下一批高确定性切口**:
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
- **R46**: 完成 post-R43/R44/R45 的 import-sort / unused import housekeeping，把 live lint 恢复到 `0 errors / 90 warnings`

## 4. 本批结论

1. **lint 阻塞已解除**：`R46` 已把 live lint 从 `5 errors / 90 warnings` 恢复到 `0 errors / 90 warnings`，无人值守 queue 可以重新顺序推进。
2. **切口顺序**：`OpenCodeService` 的下一刀仍然优先是 settings reconfiguration seam；`OpenCodianSettings` 的 `addModelSettings()` / `addStyleSettings()` 继续作为高确定性的后续厚切口。
3. **策略边界**：继续优先完整 lifecycle / runtime seam，不回到 warning-only cleanup，也不回到 logging-only / helper-only 的碎片拆分。
4. **执行状态**：本轮完成的是最小 lint unblocker；下一轮应直接进入 `R47`，不要再重做 checkpoint 或插入新的 freestyle 清理轮。

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

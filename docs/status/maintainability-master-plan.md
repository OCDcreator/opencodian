# Maintainability Master Plan

> **状态**: [READY]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `W6-W15`、`R33-R41` 与 `R42-R45` 已归档；当前受控 queue 顺序为 `R46`。

## 1. 当前判断

**`R45` 已按 queue 完成。** SDK stream、legacy SSE fallback、reader lifecycle 与 final response completion 现已从 `OpenCodeService` 主类里收束到 `OpenCodeStreamingRuntimeCoordinator`，说明 opencode transport seam 也能继续按既定顺序推进。当前建议 queue 为：`R46` checkpoint，先复盘 `R42-R45` 的 owner 收益，再决定下一批切口。

## 2. 当前基线

- **lint**: `0 errors / 86 warnings`（沿用 `R41` checkpoint 的最近一次基线）
- **验证**:
  - `npm test` 通过，`256 passed, 256 total` suites；`1089 passed, 1089 total` tests
  - `npm run build` 通过，`BUILD_ID` `autopilot-maintainability.202604150119`
- **下一批高确定性切口**:
  - `R46`: checkpoint
- **历史摘要**: 见 `docs/status/maintainability-completed-batches.md`

## 3. 最近完成摘要

- **W6-W15**: 在现有 owner 内完成受控 warning cleanup，把 lint 从 `0 errors / 103 warnings` 压到 `0 errors / 91 warnings`
- **R33-R40**: 完成 settings background、settings catalog presenter、chat constructor wiring、opencode catalog query seam、import-sort housekeeping 解锁，以及 settings server / security section owner seam
- **R41**: 完成 checkpoint，确认 `R38-R40` 已把 lint 基线稳定在 `0 errors / 86 warnings`，并把 autopilot 切回人工确认态
- **R42**: `ConversationHistoryActionsCoordinator` 接管 history dropdown、rename/delete confirm、dropdown positioning 与 cleanup lifecycle，`OpenCodianView` 不再直接铺开这段 conversation-management UI
- **R43**: `ConversationAuthoritativeSyncCoordinator` 接管 authoritative sync merge、latest-user hydration、client-only preservation 与 sync logging assembly，`OpenCodianView` 不再直接铺开这整段 sync lifecycle
- **R44**: `ChatSelectionControlsCoordinator` 接管 model catalog cache、requested/current/resolved selection、switch-model override 与 unavailable follow-up，`OpenCodianView` 不再直接铺开这整段 model-selection lifecycle
- **R45**: `OpenCodeStreamingRuntimeCoordinator` 接管 SDK stream、legacy SSE fallback、reader lifecycle 与 final response completion，`OpenCodeService` 不再直接铺开整段 transport/fallback/read/finalize 细节
- **R46**: 继续保持既定 queue 顺序，下一轮进入 checkpoint

## 4. 本批结论

1. **queue 顺序**：默认执行 `R46` checkpoint，不插入新的 settings 队列。
2. **热点判断**：`OpenCodeService` 的 streaming transport 已完成 owner 收束；下一步应先复盘 `R42-R45` 的收益，再决定回到 `OpenCodeService` settings reconfiguration seam，还是回切 residual settings/model UI seam。
3. **策略判断**：继续优先完整 lifecycle / runtime seam，不回到 warning-only cleanup，也不回到 logging-only / helper-only 的碎片拆分。
4. **执行状态**：autopilot 仍处于 roadmap 顺序推进态；本轮完成 `R45` 后，下一轮应直接执行 `R46`。

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

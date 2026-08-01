# 可维护性改进：第四百零八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-407.md`
> **推进的 master-plan lane**: Maintainability / chat model selection
> **完成的 roadmap queue item**: `R73 - ChatSelectionControlsCoordinator selection runtime seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项 `R73 - ChatSelectionControlsCoordinator selection runtime seam`，只收束聊天工具栏的 model selection runtime；没有混入 settings model catalog、send pipeline、provider icon fallback 或 disabled model filtering 语义改动。

## 1. 本轮范围

- 新增 `src/features/chat/services/ModelSelectionRuntime.ts`，承接 model catalog snapshot、active-tab requested/default selection、current/resolved model 推导、base catalog metadata fallback、server availability follow-up、active-tab override writeback 与 switch notice。
- 将 `ChatSelectionControlsCoordinator` 中的 selection state/writeback/unavailable follow-up 分支改为委托 runtime，保留其 DOM/dropdown/search/render/provider-icon/permission selector ownership。
- 将 permission trigger display 收束为 display-state 与 apply delegate，减少 coordinator 内直接状态分支。
- 为 runtime 补充 focused tests，覆盖 effective catalog fallback、base metadata lookup、active-tab writeback accepted/rejected path，以及 source-mode/unconfigured unavailable follow-up copy。
- 更新直接相关模块文档、docs index 与 maintainability 路线文档，把 `R73` 标记完成并将 `R74` 提升为新的 `[NEXT]`。

## 2. 结果

- `ChatSelectionControlsCoordinator` 现在只保留 selector UI lifecycle：mount/dropdown/search/list render、trigger/icon refresh、permission selector display 与 escape close handler。
- `ModelSelectionRuntime` 集中维护 requested/current/resolved model selection 与 unavailable follow-up lifecycle，使 active-tab override writeback、catalog resolution 和 send 前 availability check 不再散落在 UI coordinator 中。
- 既有语义保持不变：provider icon fallback、disabled model filtering、session override writeback accepted/rejected behavior、server availability check 与 unavailable follow-up copy 均沿用原逻辑。

## 3. 验证

- Focused: `npm test -- ChatSelectionControlsCoordinator ModelSelectionRuntime`
- Full: `npm test`
- Build: `npm run build`

验证结果：

- focused selector/runtime suites 通过，`2 passed, 2 total` suites；`7 passed, 7 total` tests
- `npm test` 通过，`267 passed, 267 total` suites；`1142 passed, 1142 total` tests
- `npm run build` 通过，`BUILD_ID` 为 `autopilot-maintainability.202604151448`

## 4. 部署

- 本轮变更命中 `src/features/chat/services/**`、tests 与 docs，未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署。

## 5. 文件变更

- `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
- `src/features/chat/services/ModelSelectionRuntime.ts`
- `tests/unit/features/chat/ModelSelectionRuntime.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/services/ChatSelectionControlsCoordinator.md`
- `docs/modules/features/chat/services/ModelSelectionRuntime.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-408.md`

## 6. 队列推进

- `R73 - ChatSelectionControlsCoordinator selection runtime seam` 已标记为 `[DONE]`
- `R74 - InputPanelAppearanceCoordinator theme/runtime seam` 已提升为新的 `[NEXT]`

## 7. 下一步

- 下一推荐切片：`R74 - InputPanelAppearanceCoordinator theme/runtime seam`
- 优先从 `src/features/chat/services/InputPanelAppearanceCoordinator.ts` 收束 input panel theme selection、appearance sync、layout refresh 与 sticky UI follow-up，不混入 settings style section 改动。

一句话总结第四百零八阶段本轮：

> 第四百零八阶段完成 `R73`，把 chat model selection state/writeback/unavailable follow-up 从 selector UI coordinator 收束到 `ModelSelectionRuntime`，并把 roadmap 的首个 `[NEXT]` 推进到 `R74`。

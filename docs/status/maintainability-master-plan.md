# Maintainability Master Plan

> **状态**: [PAUSED]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R87` checkpoint 已完成；`R68-R87` 长队列已全部执行，当前没有可自动执行的 `[NEXT]`，等待人工续排。

## 1. 当前判断

**当前分支已完成 `R68-R87` 的整批受控 queue，并将 live lint 从 `0 errors / 79 warnings` 压到 `0 errors / 64 warnings`。** 这批 queue 按既定顺序完成了 `OpenCodianView` residual seams、chat services、opencode core、heavy test splits 与 residual warning cleanup；自动推进现已回到 checkpoint 后的人工续排态。

这批已完成 queue 的收益可以概括为：

- `R68-R70` 收掉 `OpenCodianView` 的 tab runtime、conversation load/recovery 与 message render/update 三个厚 seam
- `R71-R76` 收掉 chat services 六个 runtime seam，避免把 selection/theme/todo/question lifecycle 再塞回 view owner
- `R77-R80` 收掉 opencode sync/stream transform/finalization/SSE 四个 runtime seam，维持 SDK-first / legacy fallback 语义不变
- `R81-R84` 显式拆分 opencode/chat heavy suites，把 warning cleanup 留在受控 test lane，而不是顺手删断言
- `R85-R86` 再把 live lint 从 checkpoint 起点的 `79` 压到 `64`，完成本批 residual warning cleanup 收尾

## 2. 当前基线

- **lint**: `0 errors / 64 warnings`
- **规则结构**:
  - `max-lines` `37`
  - `max-lines-per-function` `14`
  - `max-params` `12`
  - `complexity` `1`
- **验证**:
  - 最近一次已确认的全量测试为 `R87` checkpoint：`npm test` 通过，`278 passed, 278 total` suites；`1148 passed, 1148 total` tests；用时 `5.702 s`
  - 最近一次已确认的构建通过为 `R87` checkpoint：`npm run build`，`BUILD_ID` `autopilot-maintainability.202604151805`
  - 最近一次 Test Vault 部署仍为 `R64`：`BUILD_ID` `autopilot-maintainability.202604150602`
- **剩余热点**:
  - `src/features/chat/**` `19` 条 warning，仍是最大生产代码热点
  - `src/core/opencode/**` `7` 条 warning，仍是第二梯队生产代码热点
  - `src/features/settings/**` `6`、`src/utils/glass/**` `6`、`src/**` 根层 residual `7`，构成次级 file-size residual
  - tests 侧已明显收敛：`tests/unit/core/opencode/**` 降到 `1`、`tests/unit/features/chat/**` 降到 `3`
- **历史摘要**: 见 `docs/status/maintainability-completed-batches.md`

## 3. 最近完成摘要

- **R68-R70**: 完成 `OpenCodianView` tab pane/runtime、conversation load/recovery、message render/update seams
- **R71-R76**: 完成 `ConversationRenderService`、`BackgroundTaskTimelineService`、`ChatSelectionControlsCoordinator`、`InputPanelAppearanceCoordinator`、`SessionTodoStateService`、`QuestionDockCoordinator` runtime seams
- **R77-R80**: 完成 `OpenCodeService` sync subscription、`OpenCodeStreamEventTransformer` event classification，以及 `OpenCodeStreamingRuntimeCoordinator` finalization / SSE reader seams
- **R81-R84**: 完成 opencode/chat heavy suite split，保留原 coverage 断言并显著压缩 test-warning 热点
- **R85-R86**: 完成 chat/opencode residual 与 secondary residual warning cleanup，把 lint 从 `0 errors / 79 warnings` 压到 `0 errors / 64 warnings`
- **R87**: checkpoint 确认本批 queue 已闭环完成，自动队列自然耗尽

## 4. 本批结论

1. **本批 queue 达成了最初规划的完整闭环**：先 owner seam，再 heavy tests，再 residual warning cleanup，最后 checkpoint，没有中途 freestyle 回切。
2. **warning 净下降 `15` 条**：`79 -> 64`；其中规则层面以 `max-lines-per-function` 的收缩最明显（`25 -> 14`），说明重型 lifecycle regrouping 与 test split 的收益高于零散 lint 修补。
3. **生产热点仍集中在 chat 与 opencode**：`src/features/chat/**` `19` 条、`src/core/opencode/**` `7` 条，表明下一批若继续 maintainability，仍应优先找完整 runtime seam，而不是直接扫次级 residual。
4. **test hotspot 已显著下降**：对比 `R67` checkpoint，`tests/unit/core/opencode/**` 从 `8` 条降到 `1` 条，`tests/unit/features/chat/**` 从 `9` 条降到 `3` 条，说明 `R81-R84` 的责任域拆分达到了预期。
5. **自动推进现在必须停回人工续排态**：不要自动扩展 `R88+`；如需继续 maintainability，应先人工把新的 queue 写入 roadmap，并优先评估 chat/opencode residual owner seam，其次才考虑 secondary residual 或 opt-in demo route。

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

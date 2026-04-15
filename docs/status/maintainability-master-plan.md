# Maintainability Master Plan

> **状态**: [READY]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R67` checkpoint 已完成；当前已人工续排新的 `R68-R87` 长队列。恢复 autopilot 后只能从 roadmap 首个 `[NEXT]` 顺序执行，不允许 freestyle。

## 1. 当前判断

**当前分支已完成 `R50-R67` 的整批受控 queue，并将 live lint 稳定在 `0 errors / 79 warnings`。** 新一批应继续遵守 checkpoint 结论：优先攻 chat runtime / services 与 opencode core 的高密度 file-size seam，再把 heavy tests 和 residual warnings 作为显式队列处理，而不是隐式顺手清理。

这批新队列 `R68-R87` 的主线是：

- 先收 `OpenCodianView` 剩余的 tab / conversation-load / render 三个高确定性厚切口
- 再收 chat services：`ConversationRenderService`、`BackgroundTaskTimelineService`、`ChatSelectionControlsCoordinator`、`InputPanelAppearanceCoordinator`、`SessionTodoStateService`、`QuestionDockCoordinator`
- 再收 opencode core：`OpenCodeService` sync lifecycle、`OpenCodeStreamEventTransformer`、`OpenCodeStreamingRuntimeCoordinator`
- 再显式拆分 heavy tests 与 warning cleanup
- 最后做 checkpoint，而不是中途再次自动停住

## 2. 当前基线

- **lint**: `0 errors / 79 warnings`
- **验证**:
  - 最近一次已确认的全量测试为 `R67` checkpoint：`npm test` 通过，`264 passed, 264 total` suites；`1126 passed, 1126 total` tests
  - 最近一次已确认的构建通过为 `R67` checkpoint：`npm run build`，`BUILD_ID` `autopilot-maintainability.202604150638`
  - 最近一次 Test Vault 部署仍为 `R64`：`BUILD_ID` `autopilot-maintainability.202604150602`
- **本批目标**:
  - 保持 `0 errors`
  - 继续从 chat runtime / opencode core 吞掉高收益厚切口
  - 把 warning baseline 从 `79` 继续往更低区间推进；如果 `R87` 仍未明显下降，需要明确记录阻塞点
- **下一批高确定性切口**:
  - `R68-R70`: `OpenCodianView` tab / conversation-load / render residual seams
  - `R71-R76`: chat service runtime seams
  - `R77-R80`: opencode runtime seams
  - `R81-R84`: heavy test suite splits
  - `R85-R86`: warning cleanup batches
  - `R87`: checkpoint
- **历史摘要**: 见 `docs/status/maintainability-completed-batches.md`

## 3. 最近完成摘要

- **R50-R54**: 收尾 `R49` lint blocker，并完成 `OpenCodianSettings` conversation / plugin / UI / debug section seams
- **R55-R57**: 完成 `ServerManager` 的 adoption、launch、shutdown lifecycle seams
- **R58-R63**: 完成 `ModelConfigService`、`OpenCodeMessageNormalizationMapper`、`ProviderIconService` 的核心 seams
- **R64-R66**: 通过 settings / config-core / server-icons 三个 warning cleanup batch 把 lint 从 `0 errors / 92 warnings` 压到 `0 errors / 79 warnings`
- **R67**: checkpoint 确认剩余 warning 最大聚集区已转为 `src/features/chat/**` 与 `src/core/opencode/**`

## 4. 本批结论

1. **新 batch 应直接转向 chat runtime / opencode core**：上一批已经把 settings / server / config / mapper / icons 的高确定性 seams 吃掉，现在最大的 file-size 密集区在 chat 和 opencode。
2. **`OpenCodianView` 仍有足够厚的 residual seam**：tab runtime、conversation load/recovery、message render/update 仍可围绕完整 lifecycle 继续收口，不需要回退成小 helper 粉碎。
3. **tests 现在要显式入 queue**：`OpenCodeService.test.ts`、部分 chat heavy suites 已经成为 warning 密集区；本批把 test split 写成明确轮次，而不是附带动作。
4. **warning reduction 继续受控执行**：`R85-R86` 明确承担 warning cleanup，不允许在前面各轮顺手大扫除、打乱路线。
5. **本批故意拉长**：`R68-R87` 共 20 轮，目标是支持连续无人值守，而不是很快回到人工续排态。

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

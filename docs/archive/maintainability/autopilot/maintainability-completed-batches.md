# Maintainability Completed Batches

> **用途**: 这是已完成 maintainability / lint / warning-cleanup 批次的压缩归档。主执行文档只保留当前状态、长期边界与可执行 queue；完整轮次细节继续保存在各 `phase` 文档与 `automation/runtime/history.jsonl`。

## 已完成批次摘要

- **R1-R12**: 完成 P2 / P3 / P4 / settings scaffolding / core config 的第一批收束；checkpoint 见 `docs/status/maintainability-phase-327.md`
- **R13-R18**: 完成 `OpenCodianView` UI/runtime shell 收束；checkpoint 见 `docs/status/maintainability-phase-333.md`
- **R19-R27**: 完成 `OpenCodeService` 第一批 runtime / state / builder / mapper 收束；checkpoint 见 `docs/status/maintainability-phase-342.md`
- **R28-R32**: 完成 `OpenCodeService` session / control / negotiation / conditional gateway 收束；checkpoint 见 `docs/status/maintainability-phase-347.md`
- **L1-L5**: 完成 lint error 清零与 warning cleanup 起跑准备；checkpoint 见 `docs/status/maintainability-phase-352.md`
- **W1-W5**: 第二批低风险 warning cleanup，把 lint 从 `0 errors / 116 warnings` 收敛到 `0 errors / 103 warnings`；checkpoint 见 `docs/status/maintainability-phase-357.md`
- **W6-W15**: 继续在现有 owner 内做受控 warning cleanup，完成 `ModelConfigModal`、`main.ts`、`OpenCodianView` sync、`ToolCallRenderer`、`StorageService`、`OpenCodeMessageNormalizationMapper`、`BackgroundTaskTimelineService` 的局部收束，把 lint 从 `0 errors / 103 warnings` 收敛到 `0 errors / 91 warnings`；checkpoint 见 `docs/status/maintainability-phase-367.md`
- **R33-R37**: 恢复较厚 maintainability queue，完成 `SettingsStyleBackgroundSection`、`SettingsModelCatalogPresenter` render lifecycle、`OpenCodianView` constructor/runtime wiring、`OpenCodeCatalogQueryCoordinator`，随后在 checkpoint 暂停 autopilot；checkpoint 见 `docs/status/maintainability-phase-372.md`

## 当前历史结论

- warning cleanup 已证明在现有 owner 内仍能稳定降噪，但继续往下的单 warning 收益明显变低，不适合作为默认主路线
- `R33-R37` 已验证“厚 owner seam + 完整验证”的节奏更适合当前阶段；后续更应优先选择完整 section / lifecycle / runtime seam，而不是回到零碎切片
- 当前 live lint 为 `2 errors / 89 warnings`，两条 error 都是 `R36` 带来的 import-sort 回归；`npm test` 与 `npm run build` 仍保持通过

## 继续追溯时优先查看

- `docs/status/maintainability-phase-367.md`
- `docs/status/maintainability-phase-372.md`
- `automation/runtime/history.jsonl`

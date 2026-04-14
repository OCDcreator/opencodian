# Maintainability Master Plan

> **状态**: [READY]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R52` 已完成 plugin section owner seam；当前首个 `[NEXT]` 为 `R53 - OpenCodianSettings UI section lifecycle seam`，恢复运行时必须继续按 roadmap 队列顺序执行，不允许 freestyle。

## 1. 当前判断

**当前分支已完成 `R52`，把 `OpenCodianSettings` 的 plugin section owner seam 收口到专属 owner。** 当前 lint 基线保持在 `0 errors / 92 warnings`，后续应继续按 queue 推进 settings residual seams、基础服务热点与显式 warning reduction。

这批夜间队列的主线是：

- 已用 `R50` 恢复 lint 到 `0 errors`
- 继续 `OpenCodianSettings` 残余的大 section owner seam：UI、debug
- 再推进基础热点：`ServerManager`、`ModelConfigService`、`OpenCodeMessageNormalizationMapper`、`ProviderIconService`
- 最后显式跑三轮 warning cleanup，再做 checkpoint

## 2. 当前基线

- **lint**: `0 errors / 92 warnings`
- **验证**:
  - 最近一次已确认的全量测试为 `R52`：`npm test` 通过，`260 passed, 260 total` suites；`1102 passed, 1102 total` tests
  - 最近一次已确认的构建通过为 `R52`：`npm run build`，`BUILD_ID` `autopilot-maintainability.202604150350`
  - 最近一次已确认的 Test Vault 部署也来自 `R52`
- **本批目标**:
  - 保持 `0 errors`
  - 在保持受控 queue 的前提下继续做高确定性 maintainability seam
  - 把 warning baseline 从当前 `92` 继续往低八十区间推进；若未达成，`R67` checkpoint 必须明确说明剩余高成本阻塞
- **下一批高确定性切口**:
  - `R53-R54`: `OpenCodianSettings` residual thick section seams
  - `R55-R63`: `ServerManager` / `ModelConfigService` / `OpenCodeMessageNormalizationMapper` / `ProviderIconService` 热点
  - `R64-R66`: warning cleanup batches
  - `R67`: checkpoint
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
- **R47**: `OpenCodeSettingsReconfigurationCoordinator` 接管 `updateSettings()` 的 plan/restart-stop/subscription/rollback lifecycle，并补齐直接相关测试与模块文档
- **R48**: `SettingsModelSection` 接管 `OpenCodianSettings.addModelSettings()` 的 source mode、availability refresh、workspace 卡片、catalog host 与 icon cache lifecycle，并补齐直接相关测试与模块文档
- **R49**: `SettingsStyleSection` 接管 `OpenCodianSettings.addStyleSettings()` 的 theme preset、background owner 装配、input panel appearance、glass/liquid glass 参数与 custom CSS lifecycle，并补齐直接相关测试与模块文档
- **R50**: 吸收 `R49` 收尾留下的 `SettingsStyleSection` unused symbol 与 `SettingsModelSection` test import-sort lint error，把 live lint 恢复到 `0 errors / 92 warnings`
- **R51**: `SettingsConversationSection` 接管 `OpenCodianSettings.addConversationSettings()` 的 title mode/model picker、question card display/position、answered-card toggle 与 user-markup render lifecycle，并补齐直接相关测试与模块文档
- **R52**: `SettingsPluginSection` 接管 `OpenCodianSettings.addPluginSettings()` 的 plugin environment snapshot、project config plugin editor、isolation mode、project plugin directory 与 OMO config lifecycle，并补齐直接相关测试与模块文档

## 4. 本批结论

1. **停机态已经确认**：`R49` 已提交，stop sentinel 已将 runtime state 标记为 `stopped_after_next_commit`，当前 `lock: none`，可以安全重排后续长队列。
2. **settings 残余热点仍然足够厚**：`OpenCodianSettings` 目前仍保留 UI、debug 两块高确定性 section，可以继续按完整 lifecycle seam 收口。
3. **warning reduction 不再隐含进行**：本批把 lint/error 恢复与 warning cleanup 明确写成 `R50`、`R64-R66`，避免 checkpoint 轮再次因为基线口径不清而卡住。
4. **本批长度故意拉长**：`R50-R67` 共 18 轮，目标就是支持夜间连续无人值守，而不是跑完 3-5 轮就回到人工确认态。
5. **当前不单列 user section seam**：`OpenCodianSettings` 的 user section 规模偏小，暂不单独拆成薄 owner；若后续仍有收益，应优先与更完整 lifecycle 一起处理，而不是为了凑轮次制造碎片模块。

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

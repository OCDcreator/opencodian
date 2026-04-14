# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个标记为 `[NEXT]` 的任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成 `[NEXT]`；如果不存在后续 `[QUEUED]`，则必须明确写成“当前没有可自动执行的 `[NEXT]`”。
> **当前状态**: [CONFIRMED_NEXT_BATCH] `W13 - OpenCodeMessageNormalizationMapper complexity trim` 已完成；当前可自动执行的 `[NEXT]` 是 `W14 - BackgroundTaskTimelineService collectSegments trim`。后续已排队 `W15`，`W15` 完成后必须再次暂停并等待人工确认。

## 控制规则

- 不允许跳过当前 `[NEXT]` 去做“顺手的小抽取”
- 如果当前 `[NEXT]` 已经在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个
- 如果当前 `[NEXT]` 被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道
- 新增文件必须满足 master plan 的粒度规则；默认优先合并薄 provider / factory / adapter
- 每个成功 queue item 都必须运行全量 `npm test` 与 `npm run build`
- warning cleanup 允许 focused validation，但不得省略全量验证

## 当前背景

- 已完成批次归档：`docs/status/maintainability-completed-batches.md`
- 当前 lint 基线：`0 errors / 92 warnings`
- checkpoint 建议：下一批继续一小批现有 owner 内的 warning cleanup，而不是自动恢复 `R33+`
- 当前可自动执行的 `[NEXT]`：`W14 - BackgroundTaskTimelineService collectSegments trim`
- `W13` 已在 `OpenCodeMessageNormalizationMapper` 现有 owner 内收掉 `openCodeMessageToChatMessage` 的 1 条 `complexity` warning，当前 lint 基线更新为 `0 errors / 92 warnings`
- 后续已排队 `W15`；`W15` 完成后若无人追加 queue item，则必须重新写回“当前没有可自动执行的 `[NEXT]`”

## Queue

### [DONE] W6 - ModelConfigModal render trim

- **Lane**: Warning cleanup / settings hotspot
- **目标**: 只处理 `src/features/settings/ModelConfigModal.ts` 中 `renderEditor` 与 `renderModelCard` 的长度 / 复杂度热点；优先通过同文件内的局部 helper、片段提取或条件分支收束，把 warning 控制在现有 owner 内消化。
- **优先入口**:
  - `src/features/settings/ModelConfigModal.ts`
  - 直接相关 settings tests
- **允许边界**:
  - 允许在 `ModelConfigModal` 现有 owner 内提取同文件私有 helper 或局部渲染片段
  - 允许更新直接相关 tests
- **禁止项**:
  - 不新增 settings 子文件
  - 不把本轮扩展成 `OpenCodianSettings` 或 model catalog 新拆分
- **验收**:
  - 至少收掉 `renderEditor` 的 `max-lines-per-function` / `complexity`，并尽量收掉 `renderModelCard` 的 `max-lines-per-function`
  - 运行 focused validation、全量 `npm test`、`npm run build`

### [DONE] W7 - main.ts loadSettings trim

- **Lane**: Warning cleanup / bootstrap hotspot
- **目标**: 只处理 `src/main.ts` 中 `loadSettings` 的 `max-lines-per-function` 与 `complexity` warning，优先通过初始化步骤分段、guard clause 与同文件私有 helper 收束流程。
- **优先入口**:
  - `src/main.ts`
  - 直接相关 main/settings tests
- **允许边界**:
  - 允许在 `main.ts` 内提取同文件私有 helper
  - 允许更新直接相关 tests
- **禁止项**:
  - 不改变 preload 顺序、conversation restore 前置要求或 deploy 之外的运行语义
  - 不借机开启新的 bootstrap owner 拆分
- **验收**:
  - `loadSettings` 的 `max-lines-per-function` 与 `complexity` warning 消失
  - 运行 focused validation、全量 `npm test`、`npm run build`
  - 若命中 deploy 规则，执行 Test Vault 部署验证

### [DONE] W8 - OpenCodianView sync complexity trim

- **Lane**: Warning cleanup / chat hotspot
- **目标**: 只处理 `src/features/chat/OpenCodianView.ts` 中三处消息同步复杂度热点：`mergeClientOnlyMessageFields`、`syncLatestUserMessageFromServer`、`syncConversationMessagesFromServer`。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - 直接相关 chat sync tests
- **允许边界**:
  - 允许在 `OpenCodianView` 内提取同文件私有 helper 或 guard clause
  - 允许更新直接相关 tests
- **禁止项**:
  - 不新增 chat runtime / service 薄文件
  - 不把本轮扩展成新的 `OpenCodianView` owner 收束批次
- **验收**:
  - 至少收掉上述三处 `complexity` warning
  - 运行 focused validation、全量 `npm test`、`npm run build`

### [DONE] W9 - Warning cleanup checkpoint

- **Lane**: Checkpoint
- **目标**: 复盘 `W6-W8` 的 warning cleanup 收益，并决定下一批是继续 warning cleanup，还是恢复新的 maintainability queue。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - 最新 `phase` 文档与 lint 输出
- **允许边界**:
  - 只做文档、指标和下一批建议
- **禁止项**:
  - 不自动扩展 `W10+` 或恢复 `R33+`
- **验收**:
  - phase 文档明确记录 `W6-W8` 的 warning 收益与下一批建议

### [DONE] W10 - ToolCallRenderer summary complexity trim

- **Lane**: Warning cleanup / tool streaming hotspot
- **目标**: 只处理 `src/utils/streaming/ToolCallRenderer.ts` 中 `defaultGetToolSummary` 的 `complexity` warning；优先通过同文件内的局部 helper、guard clause 或 typed dispatch 收束分支，保持 MCP summary 分类、`custom` 工具行为，以及只检查顶层 input fields 的现有规则不变。
- **优先入口**:
  - `src/utils/streaming/ToolCallRenderer.ts`
  - `tests/unit/utils/streaming/ToolCallRenderer.test.ts`
- **允许边界**:
  - 允许在 `ToolCallRenderer` 现有 owner 内提取同文件私有 helper
  - 允许更新直接相关 tests
- **禁止项**:
  - 不新增新的 streaming / tool-summary 子文件
  - 不改 `toolIdentity`、`mcpSummaryConfig`、tool kind/icon fallback 或 `custom` tool 语义
  - 不把本轮扩展到 `StreamController`、`OpenCodianView` 或新的 maintainability 拆分
- **验收**:
  - `defaultGetToolSummary` 的 `complexity` warning 消失
  - 运行 focused validation、全量 `npm test`、`npm run build`

### [DONE] W11 - Warning cleanup route checkpoint

- **Lane**: Checkpoint
- **目标**: 复盘 `W10` 的 warning cleanup 收益，并确认后续 `W12-W15` 仍沿受控 warning cleanup 小批次推进，而不是恢复 `R33+`。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - 最新 `phase` 文档与 lint 输出
- **允许边界**:
  - 只做文档、指标和路线确认
- **禁止项**:
  - 不自动扩展 `W16+` 或恢复 `R33+`
- **验收**:
  - phase 文档明确记录 `W10` 的 warning 收益，并把 `W12 - StorageService theme background mime trim` 提升为 `[NEXT]`

### [DONE] W12 - StorageService theme background mime trim

- **Lane**: Warning cleanup / storage hotspot
- **目标**: 只处理 `src/core/storage/StorageService.ts` 中 `detectThemeBackgroundMimeType` 的 `complexity` warning；优先通过同文件内的局部 helper、guard clause 或 small classifier 收束分支，保持 theme background MIME detection 与 persisted storage 语义不变。
- **优先入口**:
  - `src/core/storage/StorageService.ts`
  - `tests/unit/core/storage/StorageService.test.ts`
- **允许边界**:
  - 允许在 `StorageService` 现有 owner 内提取同文件私有 helper
  - 允许更新直接相关 storage tests
- **禁止项**:
  - 不新增 storage 子文件
  - 不把本轮扩展到 `loadSettingsFile` 的 `max-params` 或 theme/background 设置重构
  - 不改变 theme background asset persistence 或 MIME fallback 顺序
- **验收**:
  - `detectThemeBackgroundMimeType` 的 `complexity` warning 消失
  - 运行 focused validation、全量 `npm test`、`npm run build`

### [DONE] W13 - OpenCodeMessageNormalizationMapper complexity trim

- **Lane**: Warning cleanup / opencode normalization hotspot
- **目标**: 只处理 `src/core/opencode/OpenCodeMessageNormalizationMapper.ts` 中 `openCodeMessageToChatMessage` 的 `complexity` warning；优先通过同文件内的局部 helper 或 guard clause 收束角色/part/metadata 分支，保持 OMO compatibility 与 message normalization 输出语义不变。
- **优先入口**:
  - `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
  - `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`
- **允许边界**:
  - 允许在 mapper 现有 owner 内提取同文件私有 helper
  - 允许更新直接相关 normalization tests
- **禁止项**:
  - 不新增 mapper 子文件
  - 不改 `OpenCodeService`、OMO compat、stream event transformer 或 SDK facade 行为
  - 不把本轮扩展成新的 opencode maintainability owner 拆分
- **验收**:
  - `openCodeMessageToChatMessage` 的 `complexity` warning 消失
  - 运行 focused validation、全量 `npm test`、`npm run build`

### [NEXT] W14 - BackgroundTaskTimelineService collectSegments trim

- **Lane**: Warning cleanup / chat background-task hotspot
- **目标**: 只处理 `src/features/chat/services/BackgroundTaskTimelineService.ts` 中 `collectSegments` 的 `complexity` warning；优先通过同文件内的局部 helper 或 guard clause 收束 segment creation、tool launch collection 与 completion reminder matching，保持 hydration、suppression 与 background-task timeline 语义不变。
- **优先入口**:
  - `src/features/chat/services/BackgroundTaskTimelineService.ts`
  - `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`
  - `tests/unit/features/chat/backgroundTaskTimeline.test.ts`
- **允许边界**:
  - 允许在 `BackgroundTaskTimelineService` 现有 owner 内提取同文件私有 helper
  - 允许更新直接相关 background-task timeline tests
- **禁止项**:
  - 不新增 chat runtime / background-task service 薄文件
  - 不改 `OpenCodianView`、completion notice queue、live signal routing 或 question/todo runtime ownership
  - 不改变 conversation hydration 的 authoritative sync gate 行为
- **验收**:
  - `collectSegments` 的 `complexity` warning 消失
  - 运行 focused validation、全量 `npm test`、`npm run build`

### [QUEUED] W15 - Warning cleanup checkpoint

- **Lane**: Checkpoint
- **目标**: 复盘 `W12-W14` 的 warning cleanup 收益，并决定下一批是继续 warning cleanup，还是恢复新的 maintainability queue 提案准备。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - 最新 `phase` 文档与 lint 输出
- **允许边界**:
  - 只做文档、指标和下一批建议
- **禁止项**:
  - 不自动扩展 `W16+` 或恢复 `R33+`
- **验收**:
  - phase 文档明确记录 `W12-W14` 的 warning 收益与下一批建议

## 当前自动队列状态

当前可自动执行的 `[NEXT]` 是 `W14 - BackgroundTaskTimelineService collectSegments trim`。后续已排队 `W15`；`W15` 完成后若没有新的人工追加 queue item，则必须重新写明“当前没有可自动执行的 `[NEXT]`”。

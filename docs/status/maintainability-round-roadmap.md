# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个标记为 `[NEXT]` 的任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成 `[NEXT]`；如果不存在后续 `[QUEUED]`，则必须明确写成“当前没有可自动执行的 `[NEXT]`”。
> **当前状态**: [CONFIRMED_NEXT_BATCH] `R33-R37` maintainability queue 已确认；`R33-R34` 已完成，当前可自动执行的 `[NEXT]` 是 `R35 - OpenCodianView constructor runtime wiring`。`R37` 完成后必须再次暂停并等待人工确认。

## 控制规则

- 不允许跳过当前 `[NEXT]` 去做“顺手的小抽取”
- 如果当前 `[NEXT]` 已经在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个
- 如果当前 `[NEXT]` 被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道
- 新增文件必须满足 master plan 的粒度规则；默认优先合并薄 provider / factory / adapter
- 每个成功 queue item 都必须运行全量 `npm test` 与 `npm run build`
- warning cleanup 允许 focused validation，但不得省略全量验证

## 当前背景

- 已完成批次归档：`docs/status/maintainability-completed-batches.md`
- 当前 lint 基线：`0 errors / 91 warnings`
- checkpoint 建议：`W12-W14` 的逐条 warning cleanup 收益已确认；下一批人工确认切回较厚 maintainability owner 收束
- 当前可自动执行的 `[NEXT]`：`R35 - OpenCodianView constructor runtime wiring`
- 本批按 `R33 -> R34 -> R35 -> R36 -> R37` 顺序推进，不允许跳过当前 `[NEXT]`
- `R37` 完成后若无人追加 queue item，则必须重新写回“当前没有可自动执行的 `[NEXT]`”

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

### [DONE] W14 - BackgroundTaskTimelineService collectSegments trim

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

### [DONE] W15 - Warning cleanup checkpoint

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

### [DONE] R33 - Settings style/background owner seam

- **Lane**: Maintainability / settings style-background owner
- **目标**: 从 `src/features/settings/OpenCodianSettings.ts` 的 style/background section 中挑出一个完整、较厚的 owner seam，优先削弱 `addStyleSettings` / `renderBackgroundStyleGroup` 周边的大段 UI 组装与状态写回；目标是降低 settings 主类职责集中度，而不是只为清单条 warning。
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/core/types/settings.ts`
  - `src/style/` 与生成的 `styles.css`（仅当行为/变量需要同步）
  - `tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
  - 相关 locale 文件（仅当 UI 文案变化）
- **允许边界**:
  - 允许新增或加厚一个覆盖完整 style/background subsection lifecycle 的 settings owner
  - 允许更新直接相关 tests、module docs、locale/default/normalization/style 同步项
- **禁止项**:
  - 不新增只包一层的 settings adapter/provider/factory
  - 不把 model catalog、server settings、安全 settings 或 unrelated style preset 重构混入本轮
  - 不改变 Test Vault 部署规则；若命中 deploy-relevant paths，按 AGENTS 执行 build 后部署验证
- **验收**:
  - `OpenCodianSettings` 对 style/background section 的直接 DOM/state 组装明显减少，或一个完整 subsection lifecycle 迁入较厚 owner
  - 相关 focused tests、全量 `npm test`、`npm run build` 通过

### [DONE] R34 - Settings model catalog presenter render lifecycle

- **Lane**: Maintainability / settings model catalog owner
- **目标**: 加厚或重组 `src/features/settings/SettingsModelCatalogPresenter.ts` 内的 render lifecycle，把 provider/model accordion、search/filter、bulk-toggle/probe presentation 中仍缠在 `render` 的成块逻辑收束到同 owner 的明确生命周期 helper 或较厚子组件边界。
- **优先入口**:
  - `src/features/settings/SettingsModelCatalogPresenter.ts`
  - `tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts`
  - `docs/modules/features/settings/SettingsModelCatalogPresenter.md`
- **允许边界**:
  - 允许在现有 presenter 内提取同文件私有 helper 或加厚现有 presenter-owned structure
  - 只有形成完整 lifecycle 时才允许新增子文件；否则保持同文件收束
- **禁止项**:
  - 不把 catalog state availability 逻辑从 `ModelCatalogStateService` 搬回 UI
  - 不修改 provider/model availability 语义、`baseEffective` vs `effective` 区分或 icon fallback
  - 不扩展到 `OpenCodianSettings` 其他 section
- **验收**:
  - `SettingsModelCatalogPresenter.render` 的直接复杂度/长度明显下降，且调用方 API 保持稳定
  - focused tests、全量 `npm test`、`npm run build` 通过

### [NEXT] R35 - OpenCodianView constructor runtime wiring

- **Lane**: Maintainability / chat runtime wiring
- **目标**: 只处理 `src/features/chat/OpenCodianView.ts` constructor 与 service/runtime wiring 的 ownership 集中问题，把初始化步骤或相关 runtime host assembly 收束到现有较厚 owner 或同文件私有 lifecycle helper，减少 constructor 对 service fan-out 的直接持有。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - 已存在的 chat runtime/coordinator owner（优先加厚而不是新增薄层）
  - 直接相关 chat tests
- **允许边界**:
  - 允许同文件 helper、加厚现有 coordinator/facade，或把完整 initialization lifecycle 迁入已有 owner
  - 允许更新直接相关 tests 与 module docs
- **禁止项**:
  - 不改变 concurrent tab/session streaming、hydration/auth-sync、scroll restore 或 background-task completion notice 语义
  - 不新增只转发 constructor 参数的 provider/factory/adapter
  - 不混入 message rendering、send pipeline 或 settings UI 重构
- **验收**:
  - `OpenCodianView` constructor/runtime wiring 更薄，service initialization responsibility 明确落到较厚 owner/helper
  - focused tests、全量 `npm test`、`npm run build` 通过

### [QUEUED] R36 - OpenCodeService residual seam feasibility

- **Lane**: Maintainability / OpenCodeService residual seam
- **目标**: 评估 `src/core/opencode/OpenCodeService.ts` 剩余 transport/config/finalize/tool-catalog seam 是否还能形成一个较厚 owner；只有当候选覆盖完整 lifecycle 且不会粉碎对外 façade 时才做代码收束，否则只记录跳过原因并推进 R37。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeSdkFacade.ts`
  - `src/core/opencode/ServerManager.ts`（只读/边界确认，非默认修改对象）
  - 直接相关 opencode tests
- **允许边界**:
  - 允许在 `OpenCodeService` 内做同文件 helper/host seam 收束
  - 允许新增较厚 owner，但必须覆盖完整 lifecycle 且保持 `OpenCodeService` 作为对外 façade
  - 若无法形成厚 owner，允许 docs-only skip checkpoint 并推进 R37
- **禁止项**:
  - 不移除 SDK-first / legacy HTTP/SSE fallback
  - 不改变 scoped-directory config semantics、managed server adoption/restart rules 或 public API shape
  - 不新增一组只转发到 SDK facade 的薄 wrapper
- **验收**:
  - 代码路径：明确削弱一个 residual seam，并通过 focused tests、全量 `npm test`、`npm run build`
  - 跳过路径：phase 文档说明为何当前 seam 不适合拆分，并推进 R37

### [QUEUED] R37 - Maintainability checkpoint

- **Lane**: Checkpoint
- **目标**: 复盘 `R33-R36` 的 owner 收束收益、验证成本与下一批方向，判断是否继续 `R38+`、回到 warning cleanup，或暂停等待人工新路线。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - 最新 phase 文档与 lint/build/test 输出
- **允许边界**:
  - 只做文档、指标和下一批建议
- **禁止项**:
  - 不自动扩展 `R38+` 或 `W16+`
- **验收**:
  - phase 文档明确记录 `R33-R36` 的收益与下一批建议
  - 若无人工追加 queue item，明确写回“当前没有可自动执行的 `[NEXT]`”

## 当前自动队列状态

当前可自动执行的 `[NEXT]` 是 `R35 - OpenCodianView constructor runtime wiring`。后续已排队 `R36-R37`；`R37` 完成后若没有新的人工追加 queue item，则必须重新写明“当前没有可自动执行的 `[NEXT]`”。

# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个活动任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成活动任务；如果不存在后续 `[QUEUED]`，则必须明确写成“当前没有可自动执行的后续任务”。
> **当前状态**: [ACTIVE] `R161` 已完成；当前 `[NEXT]` 为 `R162 - Final high-maintainability checkpoint`。

## 控制规则

- 不允许跳过当前活动任务去做“顺手的小抽取”
- 如果当前活动任务已在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个
- 如果当前活动任务被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道
- 新增文件必须满足 master plan 的粒度规则；默认优先在现有 owner 内收束，避免薄 helper / adapter / factory
- 每个成功 queue item 都必须运行全量 `npm run lint`、`npm run typecheck`、`npm test` 与 `npm run build`
- 本批 maintainability 默认不做 Test Vault 部署；只有用户后续明确要求部署时才允许执行部署与 `BUILD_ID` 校验

## 当前背景

- 已完成批次归档：`docs/status/maintainability-completed-batches.md`
- 当前 live lint 基线：`0 errors / 0 warnings`
- 当前 typecheck 基线：已恢复通过
- 最近成功 phase：`docs/status/maintainability-phase-495.md`
- 当前路线判断：`R153-R161` 已完成并保持 `lint/typecheck/test/build` 全绿；`OpenCodianView` 与 `OpenCodeService` 两个 residual thick seam 已按 queue 完成 closeout，当前只剩 `R162` checkpoint，并要求继续保持 `0` 碎片、`0` 错误、`0` 警告、typecheck 全绿与全量测试全过。

## Queue
## Queue

### [DONE] R46 - Lint blocker housekeeping after R43-R45

- **Lane**: Lint housekeeping / unblocker
- **目标**: 只吸收当前 live lint error，恢复 lint error 为零，解除无人值守 queue 的继续执行阻塞；本轮不做新的 owner seam。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
  - `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts`
  - `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts`
- **允许边界**:
  - 允许仅为 import-sort、unused import/unused symbol 进行最小修复
  - 允许同步更新直接相关测试 import 与 type-only import 形式
- **禁止项**:
  - 不展开新的 `OpenCodeService` / `OpenCodianView` / `OpenCodianSettings` maintainability 拆分
  - 不借机修改 runtime 语义、验证基线口径或 queue 顺序
- **验收**:
  - `npm run lint` 至少恢复到 `0 errors / 90 warnings`
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R47 - OpenCodeService settings reconfiguration seam

- **Lane**: Maintainability / opencode settings reconfiguration
- **目标**: 从 `src/core/opencode/OpenCodeService.ts` 一带收束 `updateSettings()`、settings update plan、managed server restart/stop 决策、subscription pause/resume 与 rollback/restore lifecycle，优先形成单一厚 owner。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/ServerManager.ts`
  - 直接相关 opencode tests
- **允许边界**:
  - 允许新增覆盖完整 settings reconfiguration lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 managed server adoption/restart 规则、auth fallback、directory scope、sync/open-code event restart 条件或 public API shape
  - 不混入 catalog query、session control、streaming transport 或 settings UI 改动
- **验收**:
  - `OpenCodeService` 不再直接铺开 settings reconfiguration / rollback / subscription lifecycle 细节
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R48 - OpenCodianSettings model section owner seam

- **Lane**: Maintainability / settings model section
- **目标**: 从 `src/features/settings/OpenCodianSettings.ts` 的 `addModelSettings()` 中收束完整 model section lifecycle，优先整理 source mode、provider/model disable、refresh/test action、catalog presenter 与 workspace 关联装配。
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/settings/SettingsModelCatalogPresenter.ts`
  - 直接相关 settings tests
- **允许边界**:
  - 允许在现有 owner 内提取完整 model section owner，或新增覆盖完整 model section lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests / locale
- **禁止项**:
  - 不改变 model availability layering、disabled model filtering、provider icon fallback、title-generation fallback 或 project-local override 语义
  - 不把 style/security/server 或 opencode transport 混入本轮
- **验收**:
  - `OpenCodianSettings` 对 model section DOM/state/catalog 细节的直接装配明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过
  - 执行 Test Vault 部署并校验 `BUILD_ID`

### [DONE] R49 - OpenCodianSettings style section lifecycle seam

- **Lane**: Maintainability / settings style section
- **目标**: 从 `src/features/settings/OpenCodianSettings.ts` 的 `addStyleSettings()` 中收束完整 style/theme lifecycle，优先整理 preset、background、glass / input panel appearance、custom CSS 与 preview/reload 相关装配。
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/core/theme/`
  - 直接相关 settings tests
- **允许边界**:
  - 允许在现有 owner 内提取完整 style section owner，或新增覆盖完整 style lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests / locale
- **禁止项**:
  - 不改变 theme preset 语义、background persistence、glass adapter fallback、input panel appearance normalization 或 preview 行为
  - 不把 model/security/server 或 chat runtime seam 混入本轮
- **验收**:
  - `OpenCodianSettings` 对 style section 的 DOM/state/theme wiring 明显收缩
  - focused validation、全量 `npm test`、`npm run build` 通过
  - 执行 Test Vault 部署并校验 `BUILD_ID`

### [DONE] R50 - Lint error restore after R49

- **Lane**: Lint housekeeping / unblocker
- **目标**: 只吸收 `R49` 收尾留下的 live lint error，优先修复 `src/features/settings/SettingsStyleSection.ts` 与 `tests/unit/features/settings/SettingsModelSection.test.ts` 的最小问题，把基线恢复到 `0 errors / 92 warnings`，本轮不做新的 owner seam。
- **优先入口**:
  - `src/features/settings/SettingsStyleSection.ts`
  - `tests/unit/features/settings/SettingsModelSection.test.ts`
  - 直接相关 settings suites
- **允许边界**:
  - 允许仅为 import-sort、unused symbol、type-only import 或 test typing 做最小修复
  - 允许同步更新直接相关 phase/master/roadmap/lane docs 的 lint 口径
- **禁止项**:
  - 不借机继续 settings section 拆分
  - 不改变 style/model section runtime 语义、Test Vault 部署规则或 queue 顺序
- **验收**:
  - `npm run lint` 恢复到 `0 errors / 92 warnings`
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R51 - OpenCodianSettings conversation section owner seam

- **Lane**: Maintainability / settings conversation section
- **目标**: 从 `src/features/settings/OpenCodianSettings.ts:addConversationSettings()` 收束 title mode/model picker、question card display/position、answered-card toggle 与 user-markup render toggle 的完整 section lifecycle，减少主类直接持有的 conversation settings wiring。
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - 直接相关 settings / model picker tests
- **允许边界**:
  - 允许新增覆盖完整 conversation section lifecycle 的较厚 owner，或在现有 owner 内完成同等级收口
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 title model fallback、question card refresh 时机、follow-current 语义或 conversation rendering 触发条件
  - 不把 plugin/style/debug/server 安全设置混入本轮
- **验收**:
  - `OpenCodianSettings` 对 conversation section 的 DOM/state/model-picker 装配明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过
  - 执行 Test Vault 部署并校验 `BUILD_ID`

### [DONE] R52 - OpenCodianSettings plugin section owner seam

- **Lane**: Maintainability / settings plugin management
- **目标**: 从 `src/features/settings/OpenCodianSettings.ts:addPluginSettings()` 收束 snapshot refresh、project config editor、isolation mode、project directory 与 OMO 管理的完整 plugin section lifecycle，优先形成单一厚 owner。
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/settings/PluginManagementService.ts`
  - `src/core/config/OpencodeConfigManager.ts`
  - 直接相关 settings tests
- **允许边界**:
  - 允许新增覆盖完整 plugin section lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 plugin snapshot 来源、project/global 解析顺序、restart notice 语义或 OMO 配置创建规则
  - 不把 server lifecycle、model catalog 或 warning cleanup 混入本轮
- **验收**:
  - `OpenCodianSettings` 不再直接铺开 plugin snapshot / editor / OMO lifecycle 细节
  - focused validation、全量 `npm test`、`npm run build` 通过
  - 执行 Test Vault 部署并校验 `BUILD_ID`

### [DONE] R53 - OpenCodianSettings UI section lifecycle seam

- **Lane**: Maintainability / settings UI section
- **目标**: 从 `src/features/settings/OpenCodianSettings.ts:addUISettings()` 收束 max tabs、tab position/layout、auto scroll、chat scroll mode 与 open-in-main-tab 的完整 section lifecycle，减少主类直接维护的 UI setting wiring。
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - 直接相关 settings tests
- **允许边界**:
  - 允许新增覆盖完整 UI section lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests / locale
- **禁止项**:
  - 不改变 tab bar layout 语义、scroll mode 语义、默认值或保存时机
  - 不混入 style、conversation、debug 或 chat runtime 改动
- **验收**:
  - `OpenCodianSettings` 对 UI section 的直接装配明显收缩
  - focused validation、全量 `npm test`、`npm run build` 通过
  - 执行 Test Vault 部署并校验 `BUILD_ID`

### [DONE] R54 - OpenCodianSettings debug section lifecycle seam

- **Lane**: Maintainability / settings debug section
- **目标**: 从 `src/features/settings/OpenCodianSettings.ts:addDebugSettings()` 收束 debug toggles、log path picker、diagnostic copy/generate 与 console help block 的完整 debug lifecycle，优先把路径/导出/帮助说明装配集中到单一厚 owner。
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - 直接相关 settings tests
- **允许边界**:
  - 允许新增覆盖完整 debug section lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests / locale
- **禁止项**:
  - 不改变 platform path fallback、directory picker、diagnostic report / file generation 或 debug logging 触发语义
  - 不把 user section 单独拆成薄 owner，也不混入 plugin/server/runtime 改动
- **验收**:
  - `OpenCodianSettings` 不再直接铺开 debug log path / export / help UI 细节
  - focused validation、全量 `npm test`、`npm run build` 通过
  - 执行 Test Vault 部署并校验 `BUILD_ID`

### [DONE] R55 - ServerManager managed adoption/conflict seam

- **Lane**: Maintainability / server lifecycle adoption
- **目标**: 从 `src/core/opencode/ServerManager.ts` 收束 previously managed local server adoption、signature drift 判定、stale managed restart 与 orphan reporting 一整段 lifecycle，先把“接管还是重启”的决策收口。
- **优先入口**:
  - `src/core/opencode/ServerManager.ts`
  - 直接相关 server manager tests
- **允许边界**:
  - 允许在现有 owner 内继续收束，或新增覆盖完整 adoption/conflict lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 local `4096` managed-server adoption 规则、signature 比较口径、orphan restart 语义或 public API shape
  - 不混入 launch tail、stop/restart teardown 或 settings UI 改动
- **验收**:
  - `ServerManager` 对 adoption/restart conflict 细节的直接铺开明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R56 - ServerManager launch diagnostics seam

- **Lane**: Maintainability / server launch runtime
- **目标**: 从 `src/core/opencode/ServerManager.ts` 收束 local launch、stdout/stderr tail、launch snapshot、health wait 与 launch failure reporting 的完整 runtime seam，降低 `doStart()` 的复杂度压力。
- **优先入口**:
  - `src/core/opencode/ServerManager.ts`
  - 直接相关 server manager tests
- **允许边界**:
  - 允许在现有 owner 内抽出完整 launch runtime seam
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 launch command、health wait、output tail 保留数量、failure notice 或 mode-specific 行为
  - 不混入 managed adoption 或 stop/restart teardown 改动
- **验收**:
  - `ServerManager.doStart()` / launch diagnostics 直接分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R57 - ServerManager stop/restart lifecycle seam

- **Lane**: Maintainability / server shutdown lifecycle
- **目标**: 从 `src/core/opencode/ServerManager.ts` 收束 adopted pid terminate、process tree kill、restart / reset 与 managed state cleanup 的完整 shutdown lifecycle，优先形成单一厚 seam。
- **优先入口**:
  - `src/core/opencode/ServerManager.ts`
  - 直接相关 server manager tests
- **允许边界**:
  - 允许在现有 owner 内或新的较厚 owner 中覆盖完整 stop/restart lifecycle
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 SIGTERM/SIGKILL、Windows process tree 终止、managed state 回写或 restart 语义
  - 不混入 launch/adoption 或 settings config 改动
- **验收**:
  - `ServerManager` 对 stop/restart cleanup 的直接铺开明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R58 - ModelConfigService inherited config resolution seam

- **Lane**: Maintainability / model config inheritance
- **目标**: 从 `src/core/config/ModelConfigService.ts` 收束 inherited server config 解析、scope merge、provider enable/disable layering 与 local override 的完整 resolution lifecycle。
- **优先入口**:
  - `src/core/config/ModelConfigService.ts`
  - `src/core/config/modelConfig.ts`
  - 直接相关 model config tests
- **允许边界**:
  - 允许在现有 owner 内提取完整 resolution seam
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 `baseEffective` / `effective` 区分、scoped disabled provider 语义、project-local override 行为或 server/default scope 合并顺序
  - 不混入 provider icon 或 settings UI 改动
- **验收**:
  - `ModelConfigService` 对 inherited-config merge / scope layering 的直接装配明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R59 - ModelConfigService server catalog assembly seam

- **Lane**: Maintainability / model catalog assembly
- **目标**: 从 `src/core/config/ModelConfigService.ts` 收束 runtime/server catalog merge、provider availability probe、default model resolution 与 filtered effective catalog assembly 的完整 catalog seam。
- **优先入口**:
  - `src/core/config/ModelConfigService.ts`
  - 直接相关 model config tests
- **允许边界**:
  - 允许继续在现有 owner 内或新的较厚 owner 中收口 catalog assembly lifecycle
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 provider availability probe 结果、default model fallback、catalog filtering 语义或 public API shape
  - 不混入 settings conversation/plugin section 改动
- **验收**:
  - `ModelConfigService` 对 catalog assembly / probe / default resolution 的直接铺开明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R60 - OpenCodeMessageNormalizationMapper tool/content seam

- **Lane**: Maintainability / message normalization tool mapping
- **目标**: 从 `src/core/opencode/OpenCodeMessageNormalizationMapper.ts` 收束 tool part collection、pending tool calls、tool-use content block 构造与 renderable content assembly 的完整 seam。
- **优先入口**:
  - `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
  - 直接相关 mapper tests
- **允许边界**:
  - 允许在现有 owner 内继续收束，或新增覆盖完整 tool/content lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 tool status 解析、tool result transform、custom tool 行为或 content block shape
  - 不混入 context attachment / OMO 改动
- **验收**:
  - mapper 对 tool/content assembly 的直接分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R61 - OpenCodeMessageNormalizationMapper context attachment and OMO seam

- **Lane**: Maintainability / message normalization context
- **目标**: 从 `src/core/opencode/OpenCodeMessageNormalizationMapper.ts` 收束 text-part normalization、file/context attachment、inline read parsing 与 OMO content normalization 的完整 lifecycle。
- **优先入口**:
  - `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
  - `src/shared/contextPath.ts`
  - 直接相关 mapper tests
- **允许边界**:
  - 允许在现有 owner 内收口完整 context/OMO seam
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 obsidian context tag 解析、file/url path normalization、attachment dedupe 或 OMO displayStyle / noticeTone 语义
  - 不混入 tool content block 改动
- **验收**:
  - mapper 对 context attachment / OMO normalization 的直接铺开明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R62 - ProviderIconService default and effective entry resolution seam

- **Lane**: Maintainability / provider icon entry resolution
- **目标**: 从 `src/utils/icons/ProviderIconService.ts` 收束 default entry、editable entries、library provider id 映射、effective entry list 与 preview metadata 解析的完整 resolution seam。
- **优先入口**:
  - `src/utils/icons/ProviderIconService.ts`
  - `src/utils/icons/builtinIconRegistry.ts`
  - 直接相关 provider icon tests
- **允许边界**:
  - 允许在现有 owner 内或新的较厚 owner 中收口完整 entry-resolution lifecycle
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 builtin/LobeHub/custom fallback 顺序、editable entry 语义、provider-id 映射规则或 preview 标签行为
  - 不混入实际 asset fetch/cache pipeline 改动
- **验收**:
  - `ProviderIconService` 对 default/effective entry resolution 的直接分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R63 - ProviderIconService asset loading and custom cache seam

- **Lane**: Maintainability / provider icon asset runtime
- **目标**: 从 `src/utils/icons/ProviderIconService.ts` 收束 cached asset 读取、LobeHub / builtin / custom source asset loading、cache write/read 与 preview fallback 的完整 asset-runtime seam。
- **优先入口**:
  - `src/utils/icons/ProviderIconService.ts`
  - 直接相关 provider icon tests
- **允许边界**:
  - 允许继续在现有 owner 内或新的较厚 owner 中收口完整 cache/asset lifecycle
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 cache path 规则、retryFailed 语义、mime detection 顺序、preview fallback 或 runtime URL cache 行为
  - 不混入 default entry resolution 改动
- **验收**:
  - `ProviderIconService` 不再直接铺开大段 asset fetch/cache/fallback 细节
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R64 - Warning cleanup batch A (settings residuals)

- **Lane**: Warning cleanup / settings residuals
- **目标**: 受控削减 settings 邻域 warning，优先命中 `OpenCodianSettings.ts`、`SettingsStyleSection.ts`、`SettingsModelSection.ts` 与直接相关 settings tests 的 `max-lines` / `max-lines-per-function` 残余。
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/settings/SettingsStyleSection.ts`
  - `src/features/settings/SettingsModelSection.ts`
  - 直接相关 settings tests
- **允许边界**:
  - 允许在现有 owner 内做同文件 regrouping，或沿已存在厚 owner 继续收口
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不新增为了清 warning 而存在的薄 helper / adapter
  - 不改变 settings runtime 语义、默认值、持久化或部署规则
- **验收**:
  - settings 邻域 warning 至少有可量化下降
  - `npm run lint` 维持 `0 errors`
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R65 - Warning cleanup batch B (config and opencode core)

- **Lane**: Warning cleanup / config-core
- **目标**: 受控削减 config/opencode core warning，优先命中 `ModelConfigService.ts`、`modelConfig.ts`、`OpenCodeMessageNormalizationMapper.ts` 与直接相关 tests 的 `max-lines` / `complexity` 残余。
- **优先入口**:
  - `src/core/config/ModelConfigService.ts`
  - `src/core/config/modelConfig.ts`
  - `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
  - 直接相关 tests
- **允许边界**:
  - 允许在现有 owner 内重组或沿上一批 seam 继续收口
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 model merge 语义、message normalization 结果或 external API shape
  - 不借机切换到 settings/icon 赛道
- **验收**:
  - config/opencode core warning 至少有可量化下降
  - `npm run lint` 维持 `0 errors`
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R66 - Warning cleanup batch C (server, icons, and heavy tests)

- **Lane**: Warning cleanup / runtime and tests
- **目标**: 继续削减 `ServerManager.ts`、`ProviderIconService.ts` 及其直接相关 heavy tests 的 warning，优先处理 file-size / complexity / max-lines-per-function 残余。
- **优先入口**:
  - `src/core/opencode/ServerManager.ts`
  - `src/utils/icons/ProviderIconService.ts`
  - `tests/unit/core/opencode/ServerManager.test.ts`
  - `tests/unit/utils/icons/ProviderIconService.test.ts`
- **允许边界**:
  - 允许沿上一批已建立的厚 seam 继续收口
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 server lifecycle、icon fallback/cache 语义或 platform-specific 行为
  - 不回退成大范围纯测试重写
- **验收**:
  - server/icon 邻域 warning 至少有可量化下降
  - `npm run lint` 维持 `0 errors`
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R67 - Maintainability and warning checkpoint

- **Lane**: Checkpoint
- **目标**: 复盘 `R50-R66` 的 owner 收益、warning 减少量、验证成本与剩余高成本热点，决定下一批是继续深挖 settings residuals / service seams，还是转入新的 warning route。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - 最新 lint / test / build 输出与 phase 文档
- **允许边界**:
  - 只做文档、指标与下一批建议
- **禁止项**:
  - 不自动扩展 `R68+`
  - 不回切 freestyle cleanup
- **验收**:
  - phase 文档明确记录 `R50-R66` 收益、最新 lint 基线、warning 下降量与后续建议
  - 如果 warning 未进入低八十区间，需要明确说明原因与后续优先级


### [DONE] R68 - OpenCodianView tab pane/runtime lifecycle seam

- **Lane**: Maintainability / chat tab runtime
- **目标**: 从 `src/features/chat/OpenCodianView.ts:2566` 一带收束 tab pane state、active pane switching、tab manager wiring、stream-like tab state sync 与 persist/restore lifecycle，优先把 tab runtime 责任继续压回现有 coordinator/owner，而不是留在 view 内散落。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationViewStateService.ts`
  - `src/features/chat/services/TabMessagesPaneCoordinator.ts`
  - 直接相关 chat tab tests
- **允许边界**:
  - 允许扩展现有 tab/runtime owner，或新增覆盖完整 tab pane lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变并发 tabs、foreground busy gating、stream-like state、persisted tab restore 或 tab-attention 语义
  - 不混入 message render、send pipeline 或 opencode transport 改动
- **验收**:
  - `OpenCodianView` 对 tab pane/runtime state 的直接装配明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R69 - OpenCodianView conversation load and recovery lifecycle seam

- **Lane**: Maintainability / chat conversation load
- **目标**: 从 `src/features/chat/OpenCodianView.ts:3445` 一带收束 create/load/fork/rewind、restore bootstrap、missing-conversation recovery 与 activation follow-up 的完整 conversation lifecycle。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationViewStateService.ts`
  - `src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator.ts`
  - 直接相关 chat load/recovery tests
- **允许边界**:
  - 允许继续扩展现有 conversation load/recovery owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 restore bootstrap 顺序、rewind/fork 语义、fallback tab recovery 或 forceServerSync 触发条件
  - 不混入 render seam、question dock 或 settings UI 改动
- **验收**:
  - `OpenCodianView` 对 conversation load/recovery 分支的直接持有明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R70 - OpenCodianView message render/update seam

- **Lane**: Maintainability / chat render update
- **目标**: 从 `src/features/chat/OpenCodianView.ts:3805` 一带收束 renderMessage/renderMessages/renderContentBlock、user/assistant body update、tail patch 与 pseudo-stream update 的残余 render lifecycle。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationRenderService.ts`
  - 直接相关 chat render tests
- **允许边界**:
  - 允许继续扩展现有 render owner，或新增覆盖完整 render/update lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 structured content blocks、assistant footer、copy content、pseudo-stream reveal 或 empty-conversation notice 语义
  - 不混入 send pipeline、tab lifecycle 或 opencode stream transform 改动
- **验收**:
  - `OpenCodianView` 对 message render/update 细节的直接铺开明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R71 - ConversationRenderService assistant/body render seam

- **Lane**: Maintainability / chat render service
- **目标**: 从 `src/features/chat/services/ConversationRenderService.ts` 收束 assistant shell/body patch、content-block dispatch、tail rerender 与 synced update apply 的完整 render-service seam。
- **优先入口**:
  - `src/features/chat/services/ConversationRenderService.ts`
  - 直接相关 render tests
- **允许边界**:
  - 允许在现有 service 内继续收口，或新增覆盖完整 render-service lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 synced visual fingerprint、tail patch fallback、assistant shell 或 structured renderer 语义
  - 不混入 background-task timeline 或 question dock 改动
- **验收**:
  - `ConversationRenderService` 的直接 render/update 分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R72 - BackgroundTaskTimelineService segment assembly seam

- **Lane**: Maintainability / background task timeline
- **目标**: 从 `src/features/chat/services/BackgroundTaskTimelineService.ts:347` 一带收束 launch collection、completion reminder matching、runtime merge、segment finalize 与 pending-filter lifecycle。
- **优先入口**:
  - `src/features/chat/services/BackgroundTaskTimelineService.ts`
  - 直接相关 background-task timeline tests
- **允许边界**:
  - 允许在现有 service 内继续收口完整 timeline assembly seam
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 hydration anchor、suppressed inline segments、search-mode placeholder 或 completion reminder 语义
  - 不混入 indicator rendering 或 send pipeline 改动
- **验收**:
  - timeline service 的 segment assembly 分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R73 - ChatSelectionControlsCoordinator selection runtime seam

- **Lane**: Maintainability / chat model selection
- **目标**: 从 `src/features/chat/services/ChatSelectionControlsCoordinator.ts` 收束 active-tab selection state、requested/current/resolved model writeback、permission display 与 unavailable follow-up lifecycle。
- **优先入口**:
  - `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
  - 直接相关 selector/model tests
- **允许边界**:
  - 允许继续扩展现有 selection coordinator/runtime seam
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 provider icon fallback、disabled model filtering、session override 或 unavailable follow-up 语义
  - 不混入 settings model catalog 或 send pipeline 改动
- **验收**:
  - selection coordinator 的直接状态分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R74 - InputPanelAppearanceCoordinator theme/runtime seam

- **Lane**: Maintainability / chat input appearance
- **目标**: 从 `src/features/chat/services/InputPanelAppearanceCoordinator.ts` 收束 input panel theme selection、appearance sync、layout refresh 与 sticky UI follow-up 的完整 runtime seam。
- **优先入口**:
  - `src/features/chat/services/InputPanelAppearanceCoordinator.ts`
  - 直接相关 input-panel/theme tests
- **允许边界**:
  - 允许在现有 coordinator 内继续收口完整 theme/runtime lifecycle
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 input panel theme normalization、liquid glass / refraction state、sticky layout 或 rerender 语义
  - 不混入 settings style section 改动
- **验收**:
  - input panel appearance coordinator 的直接状态分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R75 - SessionTodoStateService stale notice seam

- **Lane**: Maintainability / session todo runtime
- **目标**: 从 `src/features/chat/services/SessionTodoStateService.ts` 收束 todo normalization、stale-age/suppression、persisted stale restore 与 stale-notice append lifecycle。
- **优先入口**:
  - `src/features/chat/services/SessionTodoStateService.ts`
  - 直接相关 session todo tests
- **允许边界**:
  - 允许在现有 service 内继续收口完整 stale-notice/runtime seam
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 stale suppression、pending snapshot hide、persisted stale restore 或 notice append 语义
  - 不混入 question dock 或 background-task indicator 改动
- **验收**:
  - session todo service 的 stale-state 分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R76 - QuestionDockCoordinator pending runtime seam

- **Lane**: Maintainability / question dock runtime
- **目标**: 从 `src/features/chat/services/QuestionDockCoordinator.ts:137` 一带收束 pending question refresh、draft answer merge、resolution action apply 与 active-tab writeback lifecycle。
- **优先入口**:
  - `src/features/chat/services/QuestionDockCoordinator.ts`
  - 直接相关 question dock tests
- **允许边界**:
  - 允许在现有 coordinator 内继续收口完整 pending-question lifecycle
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 dock wait behavior、resolution action semantics、draft answer persistence 或 active-tab gating
  - 不混入 inline question card renderer 或 session todo runtime 改动
- **验收**:
  - question dock coordinator 的直接 runtime 分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R77 - OpenCodeService sync subscription lifecycle seam

- **Lane**: Maintainability / opencode sync runtime
- **目标**: 从 `src/core/opencode/OpenCodeService.ts:235` 一带收束 sync event subscription、initialize/start/stop、autoFetchModels 与 health/bootstrap follow-up 的完整 service lifecycle。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
  - 直接相关 opencode tests
- **允许边界**:
  - 允许继续扩展现有 sync/runtime owner，或新增覆盖完整 subscription lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 SDK sync-event fallback、health probe fallback、server start/stop ordering 或 model auto-fetch 语义
  - 不混入 streaming transport / settings reconfiguration 改动
- **验收**:
  - `OpenCodeService` 对 sync/bootstrap lifecycle 的直接铺开明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R78 - OpenCodeStreamEventTransformer event classification seam

- **Lane**: Maintainability / opencode stream transform
- **目标**: 从 `src/core/opencode/OpenCodeStreamEventTransformer.ts:183` 一带收束 session event、question event、tool event、usage update 与 part-type tracking 的完整 event-classification seam。
- **优先入口**:
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - 直接相关 stream transformer tests
- **允许边界**:
  - 允许在现有 transformer 内继续收口完整 event-classification lifecycle
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 tool-call chunk shape、question request transform、session idle/error handling 或 part-type tracking 语义
  - 不混入 SSE reader 或 OpenCodeService sync bootstrap 改动
- **验收**:
  - stream transformer 的直接 event 分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R79 - OpenCodeStreamingRuntimeCoordinator finalization seam

- **Lane**: Maintainability / opencode stream finalization
- **目标**: 从 `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts:409` 一带收束 finishStreamingResponse、assistant tail lookup、fallback final content/error completion 与 final debug logging 的完整 finalization seam。
- **优先入口**:
  - `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
  - 直接相关 streaming runtime tests
- **允许边界**:
  - 允许在现有 runtime coordinator 内继续收口完整 finalization lifecycle
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 final assistant lookup、stream error fallback、session message completion 或 final chunk shape
  - 不混入 SSE reader parsing 改动
- **验收**:
  - streaming runtime coordinator 的 finalization 分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R80 - OpenCodeStreamingRuntimeCoordinator SSE reader seam

- **Lane**: Maintainability / opencode SSE reader
- **目标**: 从 `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts:524` 一带收束 connectSSE、reader open/abort、chunk read、buffer parse 与 remaining-event flush 的完整 SSE lifecycle。
- **优先入口**:
  - `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - 直接相关 streaming runtime tests
- **允许边界**:
  - 允许在现有 runtime coordinator 内继续收口完整 SSE reader lifecycle
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 legacy SSE fallback、abort/detach 语义、buffer parse 顺序或 remaining-event flush 语义
  - 不混入 finalization 或 sync bootstrap 改动
- **验收**:
  - streaming runtime coordinator 的 SSE reader 分支明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R81 - OpenCodeService heavy suite split A

- **Lane**: Warning cleanup / opencode tests
- **目标**: 把 `tests/unit/core/opencode/OpenCodeService.test.ts` 的 session/control/runtime 相关大块断言按责任拆成更窄 suite files，优先降低单文件与单 describe 规模。
- **优先入口**:
  - `tests/unit/core/opencode/OpenCodeService.test.ts`
  - `tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts`
- **允许边界**:
  - 允许按 session lifecycle、question/runtime、catalog/sync 等责任拆分 tests
  - 允许同步更新直接相关 test helpers / docs
- **禁止项**:
  - 不改变 production runtime 语义
  - 不通过删除断言、降低覆盖或改写验证口径来换取 warning 下降
- **验收**:
  - `OpenCodeService` heavy suite 的 warning 有可量化下降
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R82 - OpenCodeService heavy suite split B

- **Lane**: Warning cleanup / opencode tests
- **目标**: 继续把 `tests/unit/core/opencode/OpenCodeService.test.ts` 与 `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts` 的 streaming / compatibility / fallback 大块断言按责任拆开。
- **优先入口**:
  - `tests/unit/core/opencode/OpenCodeService.test.ts`
  - `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
  - `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
- **允许边界**:
  - 允许按 transport、fallback、compatibility、stream finalization 责任拆分 suites
  - 允许同步更新直接相关 test helpers / docs
- **禁止项**:
  - 不改变 production runtime 语义
  - 不用弱化断言或减少场景覆盖来清 warning
- **验收**:
  - opencode heavy test 邻域 warning 有可量化下降
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R83 - Chat heavy suite split A

- **Lane**: Warning cleanup / chat tests
- **目标**: 把 `tests/unit/features/chat/ConversationRenderService.test.ts`、`tests/unit/features/chat/ConversationSyncOrchestrationService.test.ts` 与 `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts` 的大块断言按责任拆分。
- **优先入口**:
  - `tests/unit/features/chat/ConversationRenderService.test.ts`
  - `tests/unit/features/chat/ConversationSyncOrchestrationService.test.ts`
  - `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`
- **允许边界**:
  - 允许按 render/update、sync routing、timeline assembly 等责任拆分 suites
  - 允许同步更新直接相关 test helpers / docs
- **禁止项**:
  - 不改变 production runtime 语义
  - 不通过删除断言、合并场景或降覆盖来清 warning
- **验收**:
  - chat heavy suite 邻域 warning 有可量化下降
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R84 - Chat heavy suite split B

- **Lane**: Warning cleanup / chat tests
- **目标**: 继续把 `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`、`tests/unit/features/chat/inputPanelTheme.test.ts` 与相关 question/todo runtime suites 按责任拆分收口。
- **优先入口**:
  - `tests/unit/features/chat/QuestionTodoBackgroundTaskRefreshHostAdapter.test.ts`
  - `tests/unit/features/chat/inputPanelTheme.test.ts`
  - `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- **允许边界**:
  - 允许按 refresh host、input theme、question resolution/runtime bridge 责任拆分 suites
  - 允许同步更新直接相关 test helpers / docs
- **禁止项**:
  - 不改变 production runtime 语义
  - 不通过降低覆盖或删场景来清 warning
- **验收**:
  - question/todo/input chat tests 的 warning 有可量化下降
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R85 - Warning cleanup batch D (chat and opencode residuals)

- **Lane**: Warning cleanup / runtime residuals
- **目标**: 受控削减 chat 与 opencode 剩余 warning，优先命中 `OpenCodianView.ts`、chat services、`OpenCodeService.ts`、`OpenCodeStreamEventTransformer.ts`、`OpenCodeStreamingRuntimeCoordinator.ts` 的 file-size / complexity / max-params 残余。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/`
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
- **允许边界**:
  - 允许沿本批已建立的厚 seam 继续收口
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不新增薄 helper / adapter / provider
  - 不改变 chat runtime、stream transform 或 transport 语义
- **验收**:
  - chat/opencode 邻域 warning 至少有可量化下降
  - `npm run lint` 维持 `0 errors`
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R86 - Warning cleanup batch E (secondary residuals)

- **Lane**: Warning cleanup / secondary residuals
- **目标**: 继续削减 secondary residual warnings，优先命中 `src/core/types/settings.ts`、`src/core/storage/StorageService.ts`、`src/core/config/modelConfig.ts`、`src/features/settings/SettingsStyleSection.ts`、`src/features/settings/SettingsModelSection.ts` 与直接相关 tests。
- **优先入口**:
  - `src/core/types/settings.ts`
  - `src/core/storage/StorageService.ts`
  - `src/core/config/modelConfig.ts`
  - `src/features/settings/SettingsStyleSection.ts`
  - `src/features/settings/SettingsModelSection.ts`
- **允许边界**:
  - 允许在现有 owner 内做同文件 regrouping，或沿既有厚 seam 继续收口
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不回切 glass demo 邻域
  - 不为清 warning 而制造新的薄 owner
- **验收**:
  - secondary residual warning 至少有可量化下降
  - `npm run lint` 维持 `0 errors`
  - focused validation、全量 `npm test`、`npm run build` 通过

### [DONE] R87 - Maintainability checkpoint

- **Lane**: Checkpoint
- **目标**: 复盘 `R68-R86` 的 owner 收益、warning 变化、验证成本与剩余热点，决定下一批是否继续深挖 chat/opencode residuals，还是转入 secondary residual / opt-in demo route。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - 最新 lint / test / build 输出与 phase 文档
- **允许边界**:
  - 只做文档、指标与下一批建议
- **禁止项**:
  - 不自动扩展 `R88+`
  - 不回切 freestyle cleanup
- **验收**:
  - phase 文档明确记录 `R68-R86` 收益、最新 lint 基线、warning 下降量与后续建议

## Batch 1: OpenCodianView residual runtime seams

- **批次目标**: 继续处理 OpenCodianView residual lifecycle/runtime seam，只沿既有 owner 周边收口。

### [DONE] R88 - OpenCodianView tab pane/runtime residual seam

- **Lane**: Maintainability / chat runtime
- **目标**: 继续围绕 tab pane/runtime lifecycle residual 收口，只沿现有 coordinator 压缩 view 直连。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`
- **禁止项**: 不改变并发 tab/session streaming、hydration/auth-sync gate、scroll restore 与 background-task completion notice。
- **验收**: view 对 tab runtime 的残余直连继续减少。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R89 - OpenCodianView conversation load/recovery residual seam

- **Lane**: Maintainability / chat runtime
- **目标**: 继续收束 create/load/fork/rewind/delete recovery 的 post-load apply 与 restore gating residual。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts`
- **禁止项**: 不改变 restore preload、fork/rewind、active-tab recovery 语义。
- **验收**: conversation load/recovery residual 分支继续下降。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R90 - OpenCodianView message render/update residual seam

- **Lane**: Maintainability / chat rendering
- **目标**: 继续把 persisted-message apply、incremental update follow-up 与 rerender fallback 向 render owner 收拢。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationRenderService.ts`
- **禁止项**: 不改变 assistant tail patch、question card resolution、background-task timeline 呈现。
- **验收**: message render/update residual 装配继续收缩。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R91 - OpenCodianView send/composer interaction seam

- **Lane**: Maintainability / chat composer runtime
- **目标**: 从 view 收束 send action、composer draft/runtime context、submit follow-up 的完整 seam。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ComposerContextCoordinator.ts`
- **禁止项**: 不改变 model selection、input panel theme、question/todo 附着语义。
- **验收**: send/composer interaction 责任更集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R92 - Checkpoint after OpenCodianView residual seams

- **Lane**: Checkpoint
- **目标**: 复盘 R88-R91 的 residual 收益、lint 变化与验证成本。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘。
- **验收**: phase 文档明确记录 R88-R91 收益与下一批入口。；并通过全量 `npm test` 与 `npm run build`。

## Batch 2: chat render / sync / finalization seams

- **批次目标**: 继续处理 render、tail patch、post-sync 与 finalization residual。

### [DONE] R93 - ConversationRenderService assistant/body residual seam

- **Lane**: Maintainability / chat rendering
- **目标**: 继续收束 assistant/body render path、persisted/user branching 与 tail-patch 前置组装 residual。
- **优先入口**:
  - `src/features/chat/services/ConversationRenderService.ts`
  - `tests/unit/features/chat/ConversationRenderService.test.ts`
- **禁止项**: 不改变 assistant body render、pseudo-stream reveal、trailing patch 语义。
- **验收**: render service residual 分支继续收敛。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R94 - OpenCodianView synced-apply / tail patch residual seam

- **Lane**: Maintainability / chat sync apply
- **目标**: 继续收束 synced-apply、tail patch trigger、fallback rerender 与 scroll follow-up residual。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationRenderService.ts`
- **禁止项**: 不改变 authoritative sync、assistant tail patch、scroll restore 语义。
- **验收**: view 对 synced-apply / tail patch 的直控继续减少。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R95 - MessageFinalizationService sync-after-stream seam

- **Lane**: Maintainability / chat finalization
- **目标**: 收束 stream completion 后的 sync follow-up、persisted update apply 与 completion notice lifecycle。
- **优先入口**:
  - `src/features/chat/services/MessageFinalizationService.ts`
  - `src/features/chat/services/ConversationSyncBridge.ts`
- **禁止项**: 不改变 final response completion、persisted completion notice、question/todo refresh 语义。
- **验收**: message finalization 的 sync-after-stream lifecycle 更集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R96 - ConversationSyncBridge post-sync routing seam

- **Lane**: Maintainability / chat sync routing
- **目标**: 继续收束 visible/background post-sync route、refresh follow-up 与 host 分发 residual。
- **优先入口**:
  - `src/features/chat/services/ConversationSyncBridge.ts`
  - `src/features/chat/services/ConversationSyncVisiblePostSyncRouter.ts`
- **禁止项**: 不改变 foreground/background sync route、question/todo refresh、active-tab writeback 语义。
- **验收**: post-sync routing 更清晰集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R97 - Checkpoint after chat render/sync seams

- **Lane**: Checkpoint
- **目标**: 复盘 R93-R96 的 render/sync/finalization residual 收益。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘。
- **验收**: phase 文档明确记录 render/sync residual 收益。；并通过全量 `npm test` 与 `npm run build`。

## Batch 3: chat services runtime seams

- **批次目标**: 继续处理 ContextUsage、composer context、background post-sync 与 background-task trigger residual。

### [DONE] R98 - ContextUsageService usage-breakdown seam

- **Lane**: Maintainability / chat services
- **目标**: 收束 usage snapshot、breakdown assembly、display-state merge 与 refresh follow-up lifecycle。
- **优先入口**:
  - `src/features/chat/services/ContextUsageService.ts`
  - `tests/unit/features/chat/ContextUsageService.test.ts`
- **禁止项**: 不改变 context usage 统计口径、display 值或 refresh 时机。
- **验收**: usage-breakdown 责任更集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R99 - ComposerContext coordinator/view runtime seam

- **Lane**: Maintainability / chat composer runtime
- **目标**: 整合 composer coordinator/runtime store/view facade 之间的 residual runtime 交界。
- **优先入口**:
  - `src/features/chat/services/ComposerContextCoordinator.ts`
  - `src/features/chat/services/ComposerContextRuntimeStore.ts`
- **禁止项**: 不改变 chips、picker actions、draft state、view host 语义；不拆成更多薄 adapter。
- **验收**: composer context runtime 边界更清晰。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R100 - BackgroundConversation post-sync handoff seam

- **Lane**: Maintainability / chat background sync
- **目标**: 继续收束 background conversation 的 post-sync handoff、attention/signal follow-up 与 host adapter 交界。
- **优先入口**:
  - `src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator.ts`
  - `src/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.ts`
- **禁止项**: 不改变 background-task timeline、attention routing、signal sync state 语义。
- **验收**: background post-sync handoff seam 更集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R101 - BackgroundTaskStreamTriggerCoordinator runtime seam

- **Lane**: Maintainability / chat background runtime
- **目标**: 收束 trigger arm/disarm、pending-task detection、stream follow-up 与 completion handoff residual。
- **优先入口**:
  - `src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
- **禁止项**: 不改变 background-task completion notice、foreground runner 状态或 stream trigger 语义。
- **验收**: background-task trigger runtime residual 继续收缩。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R102 - Checkpoint after chat services seams

- **Lane**: Checkpoint
- **目标**: 复盘 R98-R101 的服务层 residual 收益与 remaining hotspots。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘。
- **验收**: phase 文档明确记录 chat services residual 收益。；并通过全量 `npm test` 与 `npm run build`。

## Batch 4: question / todo / background-task seams

- **批次目标**: 继续处理 question resolution、todo refresh、stale notice 与 dock pending-resolution residual。

### [DONE] R103 - QuestionResolutionFlowCoordinator post-resolution seam

- **Lane**: Maintainability / question runtime
- **目标**: 收束 resolution execute、post-resolution apply、card refresh 与 background follow-up lifecycle。
- **优先入口**:
  - `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
  - `src/features/chat/services/QuestionResolutionExecutionFacade.ts`
- **禁止项**: 不改变 resolution action、card renderer、background follow-up 或 answered-card 语义。
- **验收**: post-resolution lifecycle 更集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R104 - QuestionTodo status/refresh runtime seam

- **Lane**: Maintainability / question todo runtime
- **目标**: 整合 status refresh、activation refresh、post-sync refresh plan 与 background-task runtime 的 residual 交界。
- **优先入口**:
  - `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
  - `src/features/chat/services/QuestionTodoActivationRefreshCoordinator.ts`
- **禁止项**: 不改变 todo refresh trigger、activation timing、background-task notice 语义。
- **验收**: question/todo refresh runtime 残余桥接继续减少。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R105 - SessionTodoStateService stale-notice residual seam

- **Lane**: Maintainability / todo runtime
- **目标**: 继续收束 stale snapshot fingerprint、suppression visibility、persisted stale restore 与 append-target residual。
- **优先入口**:
  - `src/features/chat/services/SessionTodoStateService.ts`
  - `tests/unit/features/chat/SessionTodoStateService.test.ts`
- **禁止项**: 不改变 stale notice 显示时机、suppression 语义、append-dedupe 行为。
- **验收**: stale-notice residual 分支继续收敛。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R106 - QuestionDockCoordinator pending-resolution residual seam

- **Lane**: Maintainability / question dock runtime
- **目标**: 继续收束 pending-question presentation、resolution apply follow-up 与 active/background writeback residual。
- **优先入口**:
  - `src/features/chat/services/QuestionDockCoordinator.ts`
  - `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- **禁止项**: 不改变 pending dock visibility、resolution semantics、draft answer persistence 或 active-tab gating。
- **验收**: question dock pending-resolution residual 继续减少。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R107 - Checkpoint after question/todo seams

- **Lane**: Checkpoint
- **目标**: 复盘 R103-R106 的 question/todo/background-task residual 收益。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘。
- **验收**: phase 文档明确记录 question/todo residual 收益。；并通过全量 `npm test` 与 `npm run build`。

## Batch 5: OpenCodeService residual seams

- **批次目标**: 继续处理 OpenCodeService lifecycle / fallback / diagnostics residual。

### [DONE] R108 - OpenCodeService sync/bootstrap residual lifecycle seam

- **Lane**: Maintainability / opencode service lifecycle
- **目标**: 沿现有 lifecycle owner 继续收束 sync restart、bootstrap follow-up、catalog/model refresh residual。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts`
- **禁止项**: 不改变 SDK-first bootstrap、health probe ordering、sync-event bridge 语义。
- **验收**: OpenCodeService 对 sync/bootstrap residual orchestration 继续减少。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R109 - OpenCodeService health / legacy fallback seam

- **Lane**: Maintainability / opencode fallback runtime
- **目标**: 收束 health retry、legacy HTTP/SSE fallback 入口与 degraded-state follow-up residual。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `tests/unit/core/opencode/OpenCodeService.httpRuntime.test.ts`
- **禁止项**: 不改变 SDK-first / legacy fallback 判定、HTTP/SSE fallback 语义。
- **验收**: health / legacy fallback residual 分支明显减少。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R110 - OpenCodeService session abort/get fallback seam

- **Lane**: Maintainability / opencode session runtime
- **目标**: 继续收束 session get/abort、session-scoped detach、fallback query 与 runtime follow-up residual。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts`
- **禁止项**: 不改变 session-scoped abort/detach、get fallback、conversation reload 语义。
- **验收**: session abort/get fallback 残余控制流继续收敛。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R111 - OpenCodeService transient logging/error normalization seam

- **Lane**: Maintainability / opencode diagnostics
- **目标**: 把 transient debug logging、error shaping 与 normalize follow-up 继续收束到集中点。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeSdkFacade.ts`
- **禁止项**: 不改变错误归一化口径、logging 开关、SDK facade 注入规则。
- **验收**: logging/error normalization 更集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R112 - Checkpoint after OpenCodeService residual seams

- **Lane**: Checkpoint
- **目标**: 复盘 R108-R111 的 residual service 收益与 streaming lane 准备度。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘。
- **验收**: phase 文档明确记录 OpenCodeService residual 收益。；并通过全量 `npm test` 与 `npm run build`。

## Batch 6: streaming transform / runtime seams

- **批次目标**: 继续处理 event classification、payload parse、finalization 与 cancel-detach residual。

### [DONE] R113 - OpenCodeStreamEventTransformer event-classification residual seam

- **Lane**: Maintainability / opencode stream transform
- **目标**: 继续收束 permission/file/session/question/tool/result 分支的 residual classification 责任。
- **优先入口**:
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
- **禁止项**: 不改变 event classification、tool/result dedupe、part-type tracking 或 usage update 语义。
- **验收**: event-classification residual 分支继续减少。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R114 - OpenCodeStreamEventTransformer payload/SSE-parse seam

- **Lane**: Maintainability / opencode stream parsing
- **目标**: 收束 raw payload decode、SSE payload parse、invalid-chunk shielding 与 parse error normalization residual。
- **优先入口**:
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
- **禁止项**: 不改变 raw chunk parse 顺序、invalid event 容错、legacy SSE fallback 语义。
- **验收**: payload/SSE-parse residual 责任更集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R115 - OpenCodeStreamingRuntimeCoordinator finalization residual seam

- **Lane**: Maintainability / opencode stream finalization
- **目标**: 继续收束 final assistant lookup、completion fallback、final debug logging 与 post-finish cleanup residual。
- **优先入口**:
  - `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
  - `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts`
- **禁止项**: 不改变 final response completion、structured assistant-error fallback、message completion 语义。
- **验收**: finalization residual orchestration 继续减少。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R116 - OpenCodeStreamingRuntimeCoordinator active-context / cancel-detach seam

- **Lane**: Maintainability / opencode stream runtime
- **目标**: 收束 active-context register/cleanup、cancel-detach、abort follow-up 与 runtime disposal residual。
- **优先入口**:
  - `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
  - `src/core/opencode/OpenCodeService.ts`
- **禁止项**: 不改变 session-scoped cancel/detach、abort ordering、active-context cleanup 语义。
- **验收**: active-context / cancel-detach 生命周期更集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R117 - Checkpoint after streaming residual seams

- **Lane**: Checkpoint
- **目标**: 复盘 R113-R116 的 streaming residual 收益与 secondary core 入口。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘。
- **验收**: phase 文档明确记录 streaming residual 收益。；并通过全量 `npm test` 与 `npm run build`。

## Batch 7: secondary core seams

- **批次目标**: 处理 StorageService、settings.ts 与 modelConfig residual。

### [DONE] R118 - StorageService settings-file lifecycle seam

- **Lane**: Maintainability / secondary core
- **目标**: 收束 settings-file load/save/merge、fallback path、error report 与 migration follow-up residual。
- **优先入口**:
  - `src/core/storage/StorageService.ts`
  - `tests/unit/core/storage/StorageService.test.ts`
- **禁止项**: 不改变 local-first persistence、settings-file 路径、migration 语义。
- **验收**: settings-file lifecycle 更集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R119 - core types settings normalization seam A

- **Lane**: Maintainability / settings normalization
- **目标**: 优先收束 chat appearance、question/todo、input panel 相关 normalization residual。
- **优先入口**:
  - `src/core/types/settings.ts`
  - `src/features/settings/SettingsStyleSection.ts`
- **禁止项**: 不改变默认值、迁移语义、theme/background/glass normalization。
- **验收**: settings normalization 第一组 residual 规则更集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R120 - core types settings normalization seam B

- **Lane**: Maintainability / settings normalization
- **目标**: 继续收束 provider/model/plugin/debug 相关 normalization residual。
- **优先入口**:
  - `src/core/types/settings.ts`
  - `src/features/settings/OpenCodianSettings.ts`
- **禁止项**: 不改变 disabled model refs、provider toggle、project/global override 或 debug/export 语义。
- **验收**: settings normalization 第二组 residual 规则继续收敛。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R121 - modelConfig residual merge/assembly seam

- **Lane**: Maintainability / config assembly
- **目标**: 继续在 modelConfig 内收束 merge/assembly residual，包括 supplement、effective projection 与 provider resolution follow-up。
- **优先入口**:
  - `src/core/config/modelConfig.ts`
  - `src/core/config/ModelConfigService.ts`
- **禁止项**: 不改变 baseEffective/effective 区分、provider layering、default model fallback 语义。
- **验收**: modelConfig merge/assembly residual 继续下降。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R122 - Checkpoint after secondary core seams

- **Lane**: Checkpoint
- **目标**: 复盘 R118-R121 的 secondary core residual 收益与 settings/main lane 准备度。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘。
- **验收**: phase 文档明确记录 secondary core 收益。；并通过全量 `npm test` 与 `npm run build`。

## Batch 8: residual settings / main seams

- **批次目标**: 处理 settings section attach、modal 编辑渲染与 main.ts startup residual。

### [DONE] R123 - SettingsModelSection attach residual seam

- **Lane**: Maintainability / settings runtime
- **目标**: 继续收束 SettingsModelSection.attach 内的 attach、refresh wiring、action follow-up 与 presenter residual。
- **优先入口**:
  - `src/features/settings/SettingsModelSection.ts`
  - `tests/unit/features/settings/SettingsModelSection.test.ts`
- **禁止项**: 不改变 model availability layering、disabled model refs、title-generation fallback 或 provider icon refresh 语义。
- **验收**: model section attach residual 装配继续减少。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R124 - SettingsStyleSection attach residual seam

- **Lane**: Maintainability / settings runtime
- **目标**: 继续收束 SettingsStyleSection.attach 的 preset/background/glass/custom CSS/preview wiring residual。
- **优先入口**:
  - `src/features/settings/SettingsStyleSection.ts`
  - `docs/modules/features/settings/SettingsStyleSection.md`
- **禁止项**: 不改变 theme preset、background persistence、glass/input panel appearance normalization 或 preview 行为。
- **验收**: style section attach residual 装配继续减少。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R125 - ModelConfigModal editor/render seam

- **Lane**: Maintainability / settings modal
- **目标**: 从 ModelConfigModal 收束 editor state、render branching、save/apply follow-up 与 validation feedback seam。
- **优先入口**:
  - `src/features/settings/ModelConfigModal.ts`
  - `tests/unit/features/settings/ModelConfigModal.test.ts`
- **禁止项**: 不改变 modal 编辑语义、validation 反馈、provider/model 保存逻辑。
- **验收**: modal editor/render seam 更集中。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R126 - main.ts residual startup normalization seam

- **Lane**: Maintainability / plugin startup
- **目标**: 继续收束 main.ts 中 settings normalize、storage preload、locale/theme/bootstrap follow-up residual。
- **优先入口**:
  - `src/main.ts`
  - `src/core/types/settings.ts`
- **禁止项**: 不改变 preload 顺序、conversation restore 前置条件、locale/theme startup 或 command/view registration 语义。
- **验收**: main.ts startup residual orchestration 进一步减少。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R127 - Checkpoint after settings/main seams

- **Lane**: Checkpoint
- **目标**: 复盘 R123-R126 的 settings/main residual 收益与 heavy test lane 入口。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘。
- **验收**: phase 文档明确记录 settings/main residual 收益。；并通过全量 `npm test` 与 `npm run build`。

## Batch 9: heavy test split wave

- **批次目标**: 只按责任拆重型测试，不删断言、不弱化场景。

### [DONE] R128 - OpenCodeService heavy suite split follow-up A

- **Lane**: Warning cleanup / opencode tests
- **目标**: 继续把 OpenCodeService residual heavy suites 按 bootstrap/lifecycle/session runtime 责任拆细。
- **优先入口**:
  - `tests/unit/core/opencode/OpenCodeService.test.ts`
  - `tests/unit/core/opencode/OpenCodeServiceLifecycleCoordinator.test.ts`
- **禁止项**: 不改变 production runtime 语义；不删断言、不减覆盖。
- **验收**: opencode heavy suite residual warning 有可量化下降。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R129 - OpenCodeService heavy suite split follow-up B

- **Lane**: Warning cleanup / opencode tests
- **目标**: 继续把 compat/stream/fallback 邻域重型 tests 按责任域拆分收口。
- **优先入口**:
  - `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
  - `tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts`
- **禁止项**: 不改变 production runtime 语义；不弱化 compatibility/fallback 覆盖。
- **验收**: compat/stream heavy tests 的 residual warning 继续下降。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R130 - Chat heavy suite split follow-up A

- **Lane**: Warning cleanup / chat tests
- **目标**: 继续把 chat runtime/render/sync 邻域的残余大测试按责任拆分。
- **优先入口**:
  - `tests/unit/features/chat/ConversationRenderService.test.ts`
  - `tests/unit/features/chat/ConversationSyncOrchestrationService.test.ts`
- **禁止项**: 不改变 production runtime 语义；不删断言、不弱化场景。
- **验收**: chat render/sync heavy suites 的 residual warning 有可量化下降。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R131 - Chat heavy suite split follow-up B

- **Lane**: Warning cleanup / chat tests
- **目标**: 继续把 question/todo/composer/background-task 邻域的残余大测试按责任拆分。
- **优先入口**:
  - `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - `tests/unit/features/chat/ComposerContextCoordinator.test.ts`
- **禁止项**: 不改变 production runtime 语义；不通过降覆盖换低 warning。
- **验收**: question/todo/composer heavy tests residual warning 继续下降。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R132 - Checkpoint after heavy test split wave

- **Lane**: Checkpoint
- **目标**: 复盘 R128-R131 的 heavy suite split 收益与 final warning lane 入口。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘。
- **验收**: phase 文档明确记录 heavy test split 收益。；并通过全量 `npm test` 与 `npm run build`。

## Batch 10: warning cleanup and closeout

- **批次目标**: 只沿已有厚 seam 收尾 warning，并以最终 checkpoint 收口。

### [DONE] R133 - Warning cleanup batch F (chat/opencode residuals)

- **Lane**: Warning cleanup / runtime residuals
- **目标**: 沿 OpenCodianView、chat services、OpenCodeService 与 streaming owners 继续收尾 residual warnings。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/core/opencode/OpenCodeService.ts`
- **禁止项**: 不新增薄 helper/adapter/provider/factory；不改变 chat/opencode runtime 语义。
- **验收**: chat/opencode 邻域 warning 至少有可量化下降且 lint 维持 0 errors。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R134 - Warning cleanup batch G (core/types/settings residuals)

- **Lane**: Warning cleanup / secondary residuals
- **目标**: 沿 storage、settings normalization、settings sections 与 main.ts 继续受控收尾 residual warnings。
- **优先入口**:
  - `src/core/storage/StorageService.ts`
  - `src/core/types/settings.ts`
- **禁止项**: 不为了清 warning 回切大规模 settings/startup 重构；不新增薄 normalize/provider 文件。
- **验收**: secondary residual warning 有可量化下降且 lint 维持 0 errors。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R135 - Warning cleanup batch H (tests residuals)

- **Lane**: Warning cleanup / tests residuals
- **目标**: 继续清理剩余 tests lint 热点，仅允许按责任重排与最小 typing/import 收口。
- **优先入口**:
  - `tests/unit/core/opencode/`
  - `tests/unit/features/chat/`
- **禁止项**: 不删除断言、不降低覆盖、不改变验证口径。
- **验收**: tests residual warning 有可量化下降且 coverage 语义保持不变。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R136 - Warning cleanup batch I (final non-demo residuals)

- **Lane**: Warning cleanup / final residuals
- **目标**: 只在非 demo 路径内处理最后一批 residual warnings，优先命中仍偏厚的 owner 与 root-level files。
- **优先入口**:
  - `src/`
  - `docs/modules/`
- **禁止项**: 不回切 demo/experimental visual 邻域；不制造薄碎片模块。
- **验收**: final non-demo residual warning 继续下降且仍维持 0 errors。；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R137 - Final beautiful-version checkpoint / queue closeout

- **Lane**: Checkpoint
- **目标**: 复盘 R88-R136 的完整收益、warning 轨迹、验证成本与剩余热点，决定是否结束本批 maintainability autopilot。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
- **禁止项**: 只做 checkpoint 文档与关闭队列；不自动扩展 R138+。
- **验收**: phase 文档明确记录 R88-R136 收益与是否仍需人工续排。；并通过全量 `npm test` 与 `npm run build`。

## Batch 11: chat runtime residual seams

- **批次目标**: 先处理当前 production residual 中收益最高的 chat runtime/service seams；只沿既有厚 owner 收束，不制造薄 helper / adapter / provider / factory。

### [DONE] R138 - OpenCodianView turn lifecycle residual seam

- **Lane**: Maintainability / chat runtime
- **目标**: 从 `OpenCodianView` 的 foreground turn、background status、hydration/auth-sync 边界中收束仍直接铺开的 turn lifecycle residual，优先复用既有 runtime/service owner。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`
  - `src/features/chat/services/MessageSendPreparationService.ts`
  - `src/features/chat/services/MessageFinalizationService.ts`
  - `src/features/chat/services/ConversationSyncBridge.ts`
- **禁止项**: 不改变并发 tab/session streaming、background-task completion notice、hydration/auth-sync gate、scroll restore 或 question card resolution 语义；不新增薄 helper / adapter / provider / factory。
- **验收**: `OpenCodianView` 直接持有的 turn lifecycle wiring 有可量化收缩，lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R139 - Conversation authoritative sync residual seam

- **Lane**: Maintainability / chat sync
- **目标**: 沿 `ConversationAuthoritativeSyncCoordinator` 与 sync bridge 处理 hydration/reload/auth-sync residual，减少大文件内部混杂的 sync decision、stale guard 与 message refresh 细节。
- **优先入口**:
  - `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts`
  - `src/features/chat/services/ConversationSyncBridge.ts`
  - `tests/unit/features/chat/ConversationAuthoritativeSyncCoordinator.test.ts`
  - `tests/unit/features/chat/ConversationSyncBridge.test.ts`
- **禁止项**: 不提前降级 background tasks 为 stale，不改变 authoritative message sync 完成门槛，不弱化 reload/scroll restore 场景覆盖。
- **验收**: authoritative sync owner 的职责边界更清晰，相关 warning 有可量化下降且 lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R140 - Background timeline/context usage residual seam

- **Lane**: Maintainability / chat services
- **目标**: 沿 `BackgroundTaskTimelineService`、`ContextUsageService` 与相邻 tests 收束 background-task timeline、context usage render/update residual，保持已有 service owner 厚度。
- **优先入口**:
  - `src/features/chat/services/BackgroundTaskTimelineService.ts`
  - `src/features/chat/services/ContextUsageService.ts`
  - `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`
  - `tests/unit/features/chat/ContextUsageService.test.ts`
- **禁止项**: 不改变 background-task persisted completion notice、context usage threshold/formatting、session todo stale notice 或 model selection 语义。
- **验收**: background/context service residual warning 有可量化下降且 lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R141 - Conversation render/history controls residual seam

- **Lane**: Maintainability / chat render
- **目标**: 沿 `ConversationRenderService`、history actions 与 selection controls 收束 render/history/control residual，把 DOM render flow、history command state 与 selection controls 的边界继续压回既有 owner。
- **优先入口**:
  - `src/features/chat/services/ConversationRenderService.ts`
  - `src/features/chat/services/ConversationHistoryActionsCoordinator.ts`
  - `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
  - `tests/unit/features/chat/ConversationRenderService*.test.ts`
  - `tests/unit/features/chat/ConversationHistoryActionsCoordinator.test.ts`
- **禁止项**: 不改变 message render ordering、trailing assistant patch、selection state、history action enablement 或 user markup rendering 语义。
- **验收**: render/history/control residual warning 有可量化下降且 lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R142 - Checkpoint after chat residual seams

- **Lane**: Checkpoint
- **目标**: 复盘 `R138-R141` 的 chat residual 收益、warning 变化、验证成本与下一批 settings/model/startup 入口。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘；不展开新的代码 refactor，不自动重排 `R143-R152`。
- **验收**: phase 文档明确记录 chat residual 收益与 remaining hotspots；并通过全量 `npm test` 与 `npm run build`。

## Batch 12: settings, model, and startup residual seams

- **批次目标**: 在 chat checkpoint 后处理 settings/model/startup production residual；命中 deploy-relevant paths 时严格执行 build → Test Vault deploy → `BUILD_ID` 校验。

### [DONE] R143 - Settings model catalog/provider icon residual seam

- **Lane**: Maintainability / settings model catalog
- **目标**: 沿 model settings/catalog/picker 既有 owner 收束 `ModelConfigModal`、`SettingsModelCatalogPresenter`、provider icon refresh 与 workspace residual；`OpenCodianSettings` 只允许做必要的 section wiring 对齐。
- **优先入口**:
  - `src/features/settings/ModelConfigModal.ts`
  - `src/features/settings/SettingsModelCatalogPresenter.ts`
  - `src/features/settings/SettingsModelSection.ts`
  - `src/features/settings/modelConfigWorkspace.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/utils/icons/ProviderIconService.ts`
  - `src/utils/icons/builtinIconRegistry.ts`
- **禁止项**: 不改变 provider/model disable layering、provider icon fallback order、title-generation fallback、server catalog merge 或 project-local override 语义；不新增薄 provider/icon facade。
- **验收**: model catalog/provider icon residual warning 有可量化下降且 lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`；执行 Test Vault 部署并校验 `BUILD_ID`。

### [DONE] R144 - Settings style control residual seam

- **Lane**: Maintainability / settings style
- **目标**: 沿 `SettingsStyleSection` 的 style/theme/background/glass/input panel controls 收束 color control 参数与 section residual；`OpenCodianSettings` 只允许做必要的 style section wiring 对齐。
- **优先入口**:
  - `src/features/settings/SettingsStyleSection.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/core/theme/`
  - `tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
- **禁止项**: 不改变 theme preset、background persistence、glass adapter fallback、input panel appearance normalization、preview/reload 或 locale 文案语义；不新增薄 renderer/helper。
- **验收**: style section residual warning 有可量化下降且 lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`；执行 Test Vault 部署并校验 `BUILD_ID`。

### [DONE] R145 - Model config layering residual seam

- **Lane**: Maintainability / model config
- **目标**: 沿 `modelConfig`、`ModelConfigService` 与 `OpencodeConfigManager` 收束 catalog merge、provider disable、`baseEffective` / filtered `effective` residual，优先保持既有 config owner。
- **优先入口**:
  - `src/core/config/modelConfig.ts`
  - `src/core/config/ModelConfigService.ts`
  - `src/core/config/OpencodeConfigManager.ts`
  - `tests/unit/core/config/ModelConfigService.test.ts`
  - `tests/unit/core/config/modelConfig.test.ts`
- **禁止项**: 不改变 local/server catalog precedence、disabled provider/model layering、directory-scoped config lookup、Windows directory normalization 或 title-generation catalog filtering。
- **验收**: model config residual warning 有可量化下降且 lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R146 - Startup locale/settings normalization residual seam

- **Lane**: Maintainability / startup normalization
- **目标**: 沿 `main.ts` startup、settings normalization、locale/theme startup residual 收束仍混杂的 bootstrap wiring，同时保持 conversation preload 与 theme initialization 顺序。
- **优先入口**:
  - `src/main.ts`
  - `src/core/types/settings.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
  - `tests/unit/main/themeSettingsMigration.test.ts`
  - `tests/unit/core/types/settings.test.ts`
- **禁止项**: 不改变 conversation restore preload、settings migration/defaults、locale keys、theme/background startup、provider/model disable layering 或 plugin load order。
- **验收**: startup/settings normalization residual warning 有可量化下降且 lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`；执行 Test Vault 部署并校验 `BUILD_ID`。

### [DONE] R147 - Checkpoint after settings/startup seams

- **Lane**: Checkpoint
- **目标**: 复盘 `R143-R146` 的 settings/model/startup 收益、deploy 验证、warning 变化与最后一批 opencode/streaming/persistence 入口。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘；不展开新的 settings/main/opencode refactor，不自动重排 `R148-R152`。
- **验收**: phase 文档明确记录 settings/startup 收益、deploy 结果与 remaining hotspots；并通过全量 `npm test` 与 `npm run build`。

## Batch 13: opencode, streaming, persistence, and justified cleanup

- **批次目标**: 最后处理 opencode/streaming/persistence production residual，再只在 live lint 仍支撑时做 heavy tests / opt-in glass cleanup；`R152` 作为整批 continuation checkpoint。

### [DONE] R148 - OpenCodeService and ServerManager lifecycle residual seam

- **Lane**: Maintainability / opencode lifecycle
- **目标**: 沿 `OpenCodeService`、`ServerManager` 与 lifecycle coordinator 收束 constructor/settings/server adoption residual，优先把 lifecycle decision 与 restart/rollback 责任留在既有厚 owner。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/ServerManager.ts`
  - `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts`
  - `tests/unit/core/opencode/OpenCodeServiceLifecycleCoordinator.test.ts`
  - `tests/unit/core/opencode/ServerManager*.test.ts`
- **禁止项**: 不改变 SDK-first / legacy fallback、managed server adoption/restart、auth fallback、directory scope、subscription pause/resume、session-scoped abort/detach 或 sync-event bridge 语义。
- **验收**: opencode lifecycle residual warning 有可量化下降且 lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R149 - Streaming transform/runtime residual seam

- **Lane**: Maintainability / streaming runtime
- **目标**: 沿 `OpenCodeStreamEventTransformer`、`OpenCodeStreamingRuntimeCoordinator`、stream controller 与 tool renderer 收束 stream transform/runtime/render residual，保持 foreground status 与 message-layer sync signals 分离。
- **优先入口**:
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
  - `src/utils/streaming/StreamController.ts`
  - `src/utils/streaming/ToolCallRenderer.ts`
  - `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts`
  - `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
- **禁止项**: 不改变 final response completion、tool-call rendering、MCP/custom tool summary rules、SSE fallback handling、session.diff/message.updated bridge 或 abort semantics。
- **验收**: streaming residual warning 有可量化下降且 lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R150 - Storage/provider asset persistence residual seam

- **Lane**: Maintainability / persistence
- **目标**: 沿 `StorageService`、provider icon cache 与 builtin icon registry 收束 conversation persistence、theme background、provider asset cache residual，保持 local-first storage 与 icon fallback order。
- **优先入口**:
  - `src/core/storage/StorageService.ts`
  - `src/utils/icons/ProviderIconService.ts`
  - `src/utils/icons/builtinIconRegistry.ts`
  - `tests/unit/core/storage/StorageService.test.ts`
  - `tests/unit/utils/icons/ProviderIconService*.test.ts`
- **禁止项**: 不改变 conversation serialization、theme background persistence、provider icon builtin/LobeHub/custom fallback order、cache invalidation 或 asset path semantics。
- **验收**: persistence/provider asset residual warning 有可量化下降且 lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R151 - Heavy tests and glass warning cleanup

- **Lane**: Warning cleanup / justified hotspots
- **目标**: 仅在前序轮次后 live lint 仍显示对应热点时，处理 remaining heavy tests 与 opt-in glass/demo warning residual，优先按 fixture/context 分组或既有 owner 内部整理完成。
- **优先入口**:
  - `tests/unit/core/config/ModelConfigService.test.ts`
  - `tests/unit/core/storage/StorageService.test.ts`
  - `tests/unit/core/types/settings.test.ts`
  - `tests/unit/features/chat/glassOctahedronDemo.test.ts`
  - `tests/unit/utils/glass/shuding.test.ts`
  - `src/utils/glass/adapters/shuding.ts`
  - `src/utils/glass/adapters/shudingDiamond.ts`
  - `src/features/chat/glassOctahedronDemo*.ts`
  - `src/features/chat/liquidDiamondDemo*.ts`
- **禁止项**: 不删除断言、不降低覆盖、不把 demo/experimental visuals 暴露到 stable UI path、不新增薄 helper / adapter / provider / factory；若热点已被前序轮次自然消除，改做最小 docs checkpoint note 而不是自由选题。
- **验收**: heavy tests / opt-in glass residual warning 有可量化下降且 lint 维持 `0 errors`；并通过全量 `npm test` 与 `npm run build`。

### [DONE] R152 - Continuation checkpoint after R138-R151

- **Lane**: Checkpoint
- **目标**: 复盘 `R138-R151` 的三批收益、warning 轨迹、deploy 验证、剩余热点与是否需要再次停回人工续排态。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
- **禁止项**: 只做 checkpoint 文档与指标复盘；不自动扩展 `R153+`，不把下一批写成 freestyle backlog。
- **验收**: phase 文档明确记录 `R138-R151` 收益、remaining hotspots、是否需要人工续排；并通过全量 `npm test` 与 `npm run build`。

## Batch 14: defragmentation, large-owner recovery, and hotspot closeout

- **批次目标**: 先回并前一阶段残留的碎片化装配链，优先压缩 `OpenCodianView` 与 `OpenCodeService` 的 direct assembly / import surface；只有在核心 owner 收缩后 live hotspot 仍成立时，才处理 heavy tests / glass/demo 残余。整个批次禁止继续制造新的薄 helper / adapter / provider / factory。

### [DONE] R153 - OpenCodianView host/provider defragmentation seam

- **Lane**: Maintainability / chat defragmentation
- **目标**: 沿 `OpenCodianView` 与直接相邻的 chat runtime/service owner 回并过薄 host/provider/factory/adapter 链，优先把碎片并回相邻厚 owner（而非 `OpenCodianView` 本体），处理 sync / hydration / tab activation / background live signal / render assembly 周边的装配噪音，降低 view 的 direct host wiring 与 import surface。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationSyncLoadRuntimeHostProvider.ts`
  - `src/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory.ts`
  - `src/features/chat/services/ConversationHydrationRuntimeHostProvider.ts`
  - `src/features/chat/services/ConversationHydrationRuntimeViewHostFactory.ts`
  - `src/features/chat/services/TabActivationRuntimeHostProvider.ts`
  - `src/features/chat/services/TabActivationRuntimeViewHostFactory.ts`
  - `src/features/chat/services/BackgroundTaskLiveSignalCoordinatorHostProvider.ts`
  - `src/features/chat/services/BackgroundTaskLiveSignalCoordinatorViewHostFactory.ts`
  - `src/features/chat/services/ConversationSyncBridgePortProvider.ts`
  - `src/features/chat/services/TabActivationConversationSyncPortProvider.ts`
  - `src/features/chat/services/TabConversationSyncFingerprintPortProvider.ts`
  - 直接相关 chat tests / docs
- **允许边界**:
  - 允许把过薄 host/provider/factory 文件并回既有 runtime / coordinator owner
  - 允许把稳定 host type / port 定义与 owning runtime 同位收束，以减少装配跳转
  - 明确禁止把碎片直接并回 `OpenCodianView.ts`；主文件只允许同步删减装配与 import，不承担回并落点
- **禁止项**:
  - 不新增新的薄 helper / adapter / provider / factory
  - 不改变并发 tab/session streaming、hydration/auth-sync gate、background-task completion notice、scroll restore、question resolution 语义
- **验收**:
  - `OpenCodianView` 的 direct host assembly / import surface 有可量化下降
  - 至少一条过薄 chat 装配链被回并进相邻更厚 owner，而不是替换成新的薄层或回灌主文件
  - 全量 `npm test` 与 `npm run build` 通过

### [DONE] R154 - OpenCodeService coordinator stack defragmentation seam

- **Lane**: Maintainability / opencode defragmentation
- **目标**: 沿 `OpenCodeService` 与相邻 opencode owner 回并过薄 coordinator / wrapper / gateway 边界，优先把碎片并回相邻厚 owner（而非 `OpenCodeService` 本体），收束 constructor / lifecycle / session-control / catalog-query 装配噪音，降低 service 的 direct runtime wiring 压力。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts`
  - `src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts`
  - `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
  - `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
  - `src/core/opencode/OpenCodeQueryGateway.ts`
  - `src/core/opencode/OpenCodeSettingsReconfigurationCoordinator.ts`
  - `src/core/opencode/OpenCodeSdkFacade.ts`
  - `src/core/opencode/ServerManager.ts`
  - 直接相关 opencode tests / docs
- **允许边界**:
  - 允许把 ownership 过薄、只承担转发/装配的 wrapper 并回既有厚 owner
  - 允许整理 constructor lifecycle assembly，使 runtime decision 更集中在既有 owner
  - 明确禁止把碎片直接并回 `OpenCodeService.ts`；主文件只允许同步删减装配与 import，不承担回并落点
- **禁止项**:
  - 不改变 SDK-first / legacy fallback、directory scope、managed server adoption/restart、auth fallback、session-scoped abort/detach 或 sync-event bridge 语义
  - 不新增新的 facade / gateway / builder 薄层
- **验收**:
  - `OpenCodeService` 的 direct coordinator assembly / import surface 有可量化下降
  - 至少一条过薄 opencode wrapper 链被回并进相邻更厚 owner，且 `OpenCodeService` 行数压力下降
  - 全量 `npm test` 与 `npm run build` 通过

### [DONE] R155 - Typecheck gate recovery before zero-warning closeout

- **Lane**: Correctness / typecheck recovery
- **目标**: 先恢复远端真实 `typecheck` 绿灯，只吸收当前红线并保持运行语义不变；不得借机新建薄层。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/settings/SettingsModelSection.ts`
  - `src/types/jsx-shim.ts`
- **允许边界**:
  - 允许做最小类型收束、泛型/union 修正、runtime-state 类型对齐与 shim 清理
  - 允许同步更新直接相关 tests / docs
- **禁止项**:
  - 不改变 chat runtime、settings 保存语义、background task 流程或 JSX/render 行为
  - 不新增薄 helper / adapter / provider / factory
- **验收**:
  - `npm run typecheck` 通过
  - `npm run lint` 保持 `0 errors` 且 warning 不上升
  - 全量 `npm test` 与 `npm run build` 通过

### [DONE] R156 - Zero-warning hotspot closeout after typecheck recovery

- **Lane**: Warning cleanup / justified hotspots
- **目标**: 在 `typecheck` 已恢复后，把 live lint warning 从当前 `38` 条压到 `0`，优先沿现有 suite / owner 内部整理 heavy tests 与 glass/demo / opencode / chat residual，不新增 test helper 碎片。
- **优先入口**:
  - `tests/unit/core/storage/StorageService.test.ts`
  - `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts`
  - `tests/unit/features/chat/glassOctahedronDemo.test.ts`
  - `tests/unit/features/settings/ModelConfigModal.test.ts`
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
  - `src/utils/glass/adapters/shuding.ts`
  - `src/utils/glass/adapters/shudingDiamond.ts`
  - `src/utils/glass/adapters/nikdelvin.ts`
  - `src/features/chat/glassOctahedronDemo.ts`
  - `src/features/chat/glassOctahedronDemoRefraction.ts`
  - `src/features/chat/liquidDiamondDemo.ts`
  - `src/features/chat/liquidDiamondDemoWebgl.ts`
- **禁止项**:
  - 不删除断言、不降低覆盖、不把 experimental demo 暴露到 stable UI path
  - 不新增薄 test helper / adapter / provider / factory
  - 不为了清 warning 把厚 owner 人为切碎
- **验收**:
  - `npm run lint -- --format unix` 达到 `0 errors / 0 warnings`
  - `npm run typecheck`、全量 `npm test` 与 `npm run build` 通过

### [DONE] R157 - OpenCodianView residual thick-owner reduction under green gates

- **Lane**: Maintainability / chat residual thick owner
- **目标**: 在 `lint/typecheck/test/build` 全绿后，继续削减 `OpenCodianView.ts` 的 direct assembly / import surface，优先把仍然过厚的 view-adjacent seam 压回相邻厚 owner，而不是回灌主文件或继续造碎片。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/` 下与 view 直接耦合、且已具备较厚 owner 落点的 residual seam
  - 直接相关 chat tests / docs
- **禁止项**:
  - 不新增薄 host/provider/adapter/factory
  - 不把碎片并回 `OpenCodianView.ts` 主文件本体
  - 不改变并发 tab/session streaming、hydration/auth-sync、background-task notice、scroll restore、question resolution 语义
- **验收**:
  - `OpenCodianView.ts` 行数与 direct assembly/import surface 有可量化下降
  - lint/typecheck/test/build 全绿保持

### [DONE] R158 - OpenCodeService residual thick-owner reduction under green gates

- **Lane**: Maintainability / opencode residual thick owner
- **目标**: 在绿色质量门槛下继续收束 `OpenCodeService.ts` 的 residual thick seam，优先把还偏薄或仅承担转发的 ownership 并回相邻厚 owner，不制造新的 wrapper/gateway 碎片。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts`
  - `src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts`
  - `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
  - `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
  - 直接相关 opencode tests / docs
- **禁止项**:
  - 不改变 SDK-first / legacy fallback、directory scope、managed server adoption/restart、auth fallback、session-scoped abort/detach 或 sync-event bridge
  - 不新增薄 facade / gateway / builder / provider
- **验收**:
  - `OpenCodeService.ts` 行数与 direct coordinator assembly/import surface 继续下降
  - lint/typecheck/test/build 全绿保持

### [DONE] R159 - Checkpoint after green-gate recovery and thick-owner reduction

- **Lane**: Checkpoint
- **目标**: 复盘 `R155-R158` 的 typecheck 恢复、warning 清零、`OpenCodianView` / `OpenCodeService` 体量变化、碎片回并收益与剩余 residual，并据此判断 maintainability autopilot 是否还值得继续。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
- **禁止项**:
  - 只做 checkpoint 文档与指标复盘；不自动扩展 `R160+`
  - 不把 checkpoint 写成 freestyle backlog
- **验收**:
  - phase 文档明确记录 `lint/typecheck/test/build` 结果、核心大文件体量变化、remaining hotspots 与 stop/continue 建议
  - `npm run lint -- --format unix`、`npm run typecheck`、全量 `npm test` 与 `npm run build` 通过

### [DONE] R160 - OpenCodianView final residual thick seam closeout

- **Lane**: Maintainability / final chat thick owner
- **目标**: 在 `lint/typecheck/test/build` 全绿下，处理 `src/features/chat/OpenCodianView.ts` 的最后一批高价值 residual thick seam，优先把仍由 view 直接装配的 conversation/render/composer/question/background runtime residual 收束到相邻既有厚 owner；禁止把碎片回灌进主文件或新增薄层。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationRenderService.ts`
  - `src/features/chat/services/ConversationHistoryActionsCoordinator.ts`
  - `src/features/chat/services/ComposerInputShellCoordinator.ts`
  - `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
  - 直接相关 chat tests / docs
- **允许边界**:
  - 允许把 view-local host factory / port object / direct assembly 收进已有较厚 owner
  - 允许删除已经变成纯转发的薄层文件、测试与模块文档
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不新增薄 helper / adapter / provider / factory
  - 不把碎片并回 `OpenCodianView.ts` 主文件本体
  - 不改变并发 tab/session streaming、hydration/auth-sync、background-task notice、scroll restore、question resolution 语义
- **验收**:
  - `OpenCodianView.ts` 行数、import surface 或 direct assembly surface 有可量化下降
  - 不产生新的薄碎片，且 `npm run lint -- --format unix` 为 `0 errors / 0 warnings`
  - `npm run typecheck`、全量 `npm test` 与 `npm run build` 通过

### [DONE] R161 - OpenCodeService final residual thick seam closeout

- **Lane**: Maintainability / final opencode thick owner
- **目标**: 在绿色质量门槛下处理 `src/core/opencode/OpenCodeService.ts` 的最后一批高价值 residual thick seam，优先把仍由 service 直接持有的 diagnostics/session/question facade residual 收束到既有 lifecycle/session/control/question/catalog 厚 owner；禁止新建 wrapper/gateway/facade 碎片。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts`
  - `src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts`
  - `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
  - `src/core/opencode/OpenCodeQuestionPermissionHub.ts`
  - `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
  - 直接相关 opencode tests / docs
- **允许边界**:
  - 允许把 service-local diagnostics / lifecycle proxy / session-question assembly 收进已有较厚 owner
  - 允许删除已经变成纯转发的薄层文件、测试与模块文档
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 SDK-first / legacy fallback、directory scope、managed server adoption/restart、auth fallback、session-scoped abort/detach 或 sync-event bridge
  - 不新增薄 facade / gateway / builder / provider
  - 不把碎片回并到 `OpenCodeService.ts` 主文件本体
- **验收**:
  - `OpenCodeService.ts` 行数、import surface 或 direct coordinator assembly surface 有可量化下降
  - 不产生新的薄碎片，且 `npm run lint -- --format unix` 为 `0 errors / 0 warnings`
  - `npm run typecheck`、全量 `npm test` 与 `npm run build` 通过

### [NEXT] R162 - Final high-maintainability checkpoint

- **Lane**: Checkpoint
- **目标**: 复盘 `R160-R161` 是否真正收掉最后两个 residual thick seam，确认是否达到“高可维护性：0 新碎片、0 errors、0 warnings、typecheck 全绿、全量测试全过、build 通过”，并决定是否停止 autopilot。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - 最新 phase 文档与远端 metrics
- **禁止项**:
  - 只做 checkpoint 文档与指标复盘；不自动扩展 `R163+`
  - 不把 checkpoint 写成 freestyle backlog
- **验收**:
  - phase 文档明确记录两个 thick seam 的结果、剩余 residual、质量门槛与 high-maintainability 判断
  - `npm run lint -- --format unix`、`npm run typecheck`、全量 `npm test` 与 `npm run build` 通过

### 当前状态

- 当前可自动执行的 `[NEXT]` 是 `R162 - Final high-maintainability checkpoint`。
- `R160-R162` 是最后一批人工续排的受控 closeout；完成后若无新人工队列，必须再次停回“当前没有可自动执行的后续任务”。

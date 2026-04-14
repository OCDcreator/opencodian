# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个标记为 `[NEXT]` 的任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成 `[NEXT]`；如果不存在后续 `[QUEUED]`，则必须明确写成“当前没有可自动执行的 `[NEXT]`”。
> **当前状态**: [READY] `R51` conversation section owner seam 已完成，当前首个 `[NEXT]` 为 `R52 - OpenCodianSettings plugin section owner seam`；必须继续按 `R52-R67` 顺序执行。

## 控制规则

- 不允许跳过当前 `[NEXT]` 去做“顺手的小抽取”
- 如果当前 `[NEXT]` 已在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个
- 如果当前 `[NEXT]` 被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道
- 新增文件必须满足 master plan 的粒度规则；默认优先在现有 owner 内收束，避免薄 helper / adapter / factory
- 每个成功 queue item 都必须运行全量 `npm test` 与 `npm run build`
- 命中 deploy-relevant paths 时，build 通过后必须执行 Test Vault 部署并校验 `BUILD_ID`

## 当前背景

- 已完成批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-385.md`
- 当前 live lint 基线：`0 errors / 92 warnings`
- 当前路线判断：继续 settings residual seams、基础服务热点与显式 warning cleanup

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

### [NEXT] R52 - OpenCodianSettings plugin section owner seam

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

### [QUEUED] R53 - OpenCodianSettings UI section lifecycle seam

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

### [QUEUED] R54 - OpenCodianSettings debug section lifecycle seam

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

### [QUEUED] R55 - ServerManager managed adoption/conflict seam

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

### [QUEUED] R56 - ServerManager launch diagnostics seam

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

### [QUEUED] R57 - ServerManager stop/restart lifecycle seam

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

### [QUEUED] R58 - ModelConfigService inherited config resolution seam

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

### [QUEUED] R59 - ModelConfigService server catalog assembly seam

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

### [QUEUED] R60 - OpenCodeMessageNormalizationMapper tool/content seam

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

### [QUEUED] R61 - OpenCodeMessageNormalizationMapper context attachment and OMO seam

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

### [QUEUED] R62 - ProviderIconService default and effective entry resolution seam

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

### [QUEUED] R63 - ProviderIconService asset loading and custom cache seam

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

### [QUEUED] R64 - Warning cleanup batch A (settings residuals)

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

### [QUEUED] R65 - Warning cleanup batch B (config and opencode core)

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

### [QUEUED] R66 - Warning cleanup batch C (server, icons, and heavy tests)

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

### [QUEUED] R67 - Maintainability and warning checkpoint

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

# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个标记为 `[NEXT]` 的任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成 `[NEXT]`；如果不存在后续 `[QUEUED]`，则必须明确写成“当前没有可自动执行的 `[NEXT]`”。
> **当前状态**: [READY] `R67` checkpoint 已完成，新的 `R68-R87` 长队列已人工续排；恢复 autopilot 后必须从 `R68` 开始顺序执行。

## 控制规则

- 不允许跳过当前 `[NEXT]` 去做“顺手的小抽取”
- 如果当前 `[NEXT]` 已在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个
- 如果当前 `[NEXT]` 被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道
- 新增文件必须满足 master plan 的粒度规则；默认优先在现有 owner 内收束，避免薄 helper / adapter / factory
- 每个成功 queue item 都必须运行全量 `npm test` 与 `npm run build`
- 命中 deploy-relevant paths 时，build 通过后必须执行 Test Vault 部署并校验 `BUILD_ID`

## 当前背景

- 已完成批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-421.md`
- 当前 live lint 基线：`0 errors / 64 warnings`
- 当前路线判断：`R86` 已完成 secondary residual warning cleanup；下一轮进入 `R87` checkpoint，复盘 `R68-R86` 收益与下一批建议。

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

### [NEXT] R87 - Maintainability checkpoint

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

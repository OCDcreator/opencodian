# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个标记为 `[NEXT]` 的任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成 `[NEXT]`；如果不存在后续 `[QUEUED]`，则必须明确写成“当前没有可自动执行的 `[NEXT]`”。
> **当前状态**: [READY] `R48` model section owner seam 已完成；当前顺序推进到 `R49-R50` queue。

## 控制规则

- 不允许跳过当前 `[NEXT]` 去做“顺手的小抽取”
- 如果当前 `[NEXT]` 已在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个
- 如果当前 `[NEXT]` 被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道
- 新增文件必须满足 master plan 的粒度规则；默认优先在现有 owner 内收束，避免薄 helper / adapter / factory
- 每个成功 queue item 都必须运行全量 `npm test` 与 `npm run build`
- 命中 deploy-relevant paths 时，build 通过后必须执行 Test Vault 部署并校验 `BUILD_ID`

## 当前背景

- 已完成批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-383.md`
- 当前 live lint 基线：`0 errors / 90 warnings`
- 当前路线判断：`R48` 已完成 `OpenCodianSettings` model section 厚切口；无人值守 queue 顺延到 `OpenCodianSettings` style section lifecycle seam

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
- **目标**: 从 `src/core/opencode/OpenCodeService.ts:1231` 一带收束 `updateSettings()`、settings update plan、managed server restart/stop 决策、subscription pause/resume 与 rollback/restore lifecycle，优先形成单一厚 owner。
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
- **目标**: 从 `src/features/settings/OpenCodianSettings.ts:385` 的 `addModelSettings()` 中收束完整 model section lifecycle，优先整理 source mode、provider/model disable、refresh/test action、catalog presenter 与 workspace 关联装配。
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

### [NEXT] R49 - OpenCodianSettings style section lifecycle seam

- **Lane**: Maintainability / settings style section
- **目标**: 从 `src/features/settings/OpenCodianSettings.ts:1575` 的 `addStyleSettings()` 中收束完整 style/theme lifecycle，优先整理 preset、background、glass / input panel appearance、custom CSS 与 preview/reload 相关装配。
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

### [QUEUED] R50 - Maintainability checkpoint

- **Lane**: Checkpoint
- **目标**: 复盘 `R46-R49` 的 lint/owner 收益、验证成本与后续方向，判断下一批优先继续 `OpenCodeService` residual seam，还是回到 residual settings/model UI warning trim。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - 最新 lint / test / build 输出与 phase 文档
- **允许边界**:
  - 只做文档、指标与下一批建议
- **禁止项**:
  - 不自动扩展 `R51+`
  - 不回切长串 warning cleanup，除非 checkpoint 证据明确显示只有 unblocker 价值
- **验收**:
  - phase 文档明确记录 `R46-R49` 收益、最新 lint 基线与后续建议

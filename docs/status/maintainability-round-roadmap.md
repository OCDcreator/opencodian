# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个标记为 `[NEXT]` 的任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成 `[NEXT]`；如果不存在后续 `[QUEUED]`，则必须明确写成“当前没有可自动执行的 `[NEXT]`”。
> **当前状态**: [QUEUED] `R39-R41` 已人工确认并排队；恢复 autopilot 时从 `R39` 开始。

## 控制规则

- 不允许跳过当前 `[NEXT]` 去做“顺手的小抽取”
- 如果当前 `[NEXT]` 已在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个
- 如果当前 `[NEXT]` 被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道
- 新增文件必须满足 master plan 的粒度规则；默认优先在现有 owner 内收束，避免薄 helper / adapter / factory
- 每个成功 queue item 都必须运行全量 `npm test` 与 `npm run build`
- 命中 deploy-relevant paths 时，build 通过后必须执行 Test Vault 部署并校验 `BUILD_ID`

## 当前背景

- 已完成批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-372.md`
- 当前 lint 基线：`0 errors / 89 warnings`
- 当前路线判断：lint housekeeping 已完成，继续回到 `OpenCodianSettings` 的较厚 section seam

## Queue

### [DONE] R38 - Import-sort lint housekeeping

- **Lane**: Lint housekeeping / unblocker
- **目标**: 只修复 `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts` 与 `src/core/opencode/OpenCodeService.ts` 的 `simple-import-sort/imports` error，恢复 lint error 为零
- **优先入口**:
  - `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
  - `src/core/opencode/OpenCodeService.ts`
- **允许边界**:
  - 允许仅为 import-sort 规则调整 import 顺序、type-only import 形式与分组
- **禁止项**:
  - 不改 catalog query、service façade、SDK-first / legacy fallback 或 scoped-directory 语义
  - 不借机展开新的 `OpenCodeService` maintainability 拆分
- **验收**:
  - `npm run lint` 至少回到 `0 errors / 89 warnings`
  - 全量 `npm test`、`npm run build` 通过

### [NEXT] R39 - OpenCodianSettings server section owner seam

- **Lane**: Maintainability / settings server section
- **目标**: 从 `src/features/settings/OpenCodianSettings.ts:359` 的 `addServerSettings` 中收束完整 server section lifecycle，优先削弱 mode、host/port、remote URL、auth、status/action 的直接 DOM/state 装配
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - 直接相关 settings tests
  - 直接相关 locale / docs（仅在行为或文案需要同步时）
- **允许边界**:
  - 允许在现有文件内提取同 owner lifecycle helper
  - 只有形成完整 section owner 时才允许新增较厚 section owner 文件
- **禁止项**:
  - 不改变 local/remote server mode 语义、managed server status、auth fallback 或 restart 行为
  - 不把 security/style/model catalog 等其他 settings section 混入本轮
- **验收**:
  - `OpenCodianSettings` 对 server section 的直接装配明显减少，且 section lifecycle 归属更清晰
  - focused validation、全量 `npm test`、`npm run build` 通过
  - 执行 Test Vault 部署并校验 `BUILD_ID`

### [QUEUED] R40 - OpenCodianSettings security section lifecycle seam

- **Lane**: Maintainability / settings security section
- **目标**: 从 `src/features/settings/OpenCodianSettings.ts:1865` 的 `addSecuritySettings` 中收束完整 security/config lifecycle，优先整理 config status、permission mode、restart flow、blocklist / export path 配置
- **优先入口**:
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/core/config/OpencodeConfigManager.ts`
  - 直接相关 settings tests
- **允许边界**:
  - 允许在现有 owner 内提取同文件 helper，或新增覆盖完整 security section lifecycle 的较厚 owner
  - 允许更新直接相关 locale / docs / tests
- **禁止项**:
  - 不改变 permission mode 写回语义、auto-restart 触发条件、server remote-manage 限制或平台 blocklist 行为
  - 不把 server/style/chat/opencode 其他热点混入本轮
- **验收**:
  - security section 的 config-status / restart / blocklist 组装从主类中明显收缩
  - focused validation、全量 `npm test`、`npm run build` 通过
  - 执行 Test Vault 部署并校验 `BUILD_ID`

### [QUEUED] R41 - Maintainability checkpoint

- **Lane**: Checkpoint
- **目标**: 复盘 `R38-R40` 的 lint/owner 收益，并明确下一批是继续 settings 残余 section，还是切回 chat / opencode 主热点
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - 最新 lint / test / build 输出与 phase 文档
- **允许边界**:
  - 只做文档、指标与下一批建议
- **禁止项**:
  - 不自动扩展 `R42+` 或回切长串 warning cleanup
- **验收**:
  - phase 文档明确记录 `R38-R40` 收益、当前 lint 基线与下一批建议

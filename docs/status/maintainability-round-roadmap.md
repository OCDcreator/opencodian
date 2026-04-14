# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个标记为 `[NEXT]` 的任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成 `[NEXT]`；如果不存在后续 `[QUEUED]`，则必须明确写成“当前没有可自动执行的 `[NEXT]`”。
> **当前状态**: [READY] `R42` 已完成；当前首个可执行项为 `R43`。

## 控制规则

- 不允许跳过当前 `[NEXT]` 去做“顺手的小抽取”
- 如果当前 `[NEXT]` 已在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个
- 如果当前 `[NEXT]` 被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道
- 新增文件必须满足 master plan 的粒度规则；默认优先在现有 owner 内收束，避免薄 helper / adapter / factory
- 每个成功 queue item 都必须运行全量 `npm test` 与 `npm run build`
- 命中 deploy-relevant paths 时，build 通过后必须执行 Test Vault 部署并校验 `BUILD_ID`

## 当前背景

- 已完成批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-376.md`
- 当前 lint 基线：`0 errors / 86 warnings`
- 当前路线判断：`R42` 已完成 conversation history/actions seam；下一步继续从 `R43` 顺序推进

## Queue

### [DONE] R42 - OpenCodianView conversation history/actions seam

- **Lane**: Maintainability / chat conversation management UI
- **目标**: 从 `src/features/chat/OpenCodianView.ts:3452` 一带收束 conversation history dropdown、rename/delete confirm、history positioning 与 cleanup lifecycle，减少 view 直接持有的会话管理 UI 状态与分支。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - 直接相关 chat tests
- **允许边界**:
  - 允许在现有 chat owner 下提取覆盖完整 history/actions lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 tab cleanup、delete fallback、新建会话触发条件、rename/delete 交互语义
  - 不混入 message sync、model selector、settings UI 或 send pipeline 改动
- **验收**:
  - `OpenCodianView` 对 conversation history/actions UI 细节的直接装配明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [NEXT] R43 - OpenCodianView authoritative sync merge seam

- **Lane**: Maintainability / chat conversation sync
- **目标**: 从 `src/features/chat/OpenCodianView.ts:5441` 一带收束 authoritative sync merge、latest user hydration、client-only preservation、fingerprint/logging 组装，优先把完整 sync-merge lifecycle 收口到单一厚 owner。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ConversationSyncOrchestrationService.ts`
  - 直接相关 chat sync tests
- **允许边界**:
  - 允许扩展现有 conversation sync/render owner，或新增覆盖完整 sync merge lifecycle 的较厚 chat owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 hydration/auth-sync gate、scroll restore、background-task authoritative sync、interrupted message preservation 语义
  - 不把 history dropdown、model catalog、settings 或 OpenCode transport 混入本轮
- **验收**:
  - `OpenCodianView` 内 authoritative sync merge / hydration 写回责任明显收缩
  - focused validation、全量 `npm test`、`npm run build` 通过

### [QUEUED] R44 - OpenCodianView model catalog/selection seam

- **Lane**: Maintainability / chat model selection
- **目标**: 从 `src/features/chat/OpenCodianView.ts:6140` 一带收束 model catalog load、current/requested/resolved selection、switch model 与 unavailable notice follow-up，减少 view 直接维护的 catalog/selection 分支。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
  - 直接相关 selector/model tests
- **允许边界**:
  - 允许继续扩展现有 selection coordinator/runtime owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 provider icon fallback、disabled model filtering、session model override、title-generation fallback 语义
  - 不把 settings model catalog、OpenCode provider lookup 或 send pipeline 混入本轮
- **验收**:
  - `OpenCodianView` 对 model catalog/selection resolution 的直接持有明显减少
  - focused validation、全量 `npm test`、`npm run build` 通过

### [QUEUED] R45 - OpenCodeService streaming transport seam

- **Lane**: Maintainability / opencode streaming transport
- **目标**: 从 `src/core/opencode/OpenCodeService.ts:1283` 一带收束 SDK stream、legacy SSE fallback、reader lifecycle 与 final response completion，优先形成完整 transport owner seam。
- **优先入口**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - 直接相关 opencode tests
- **允许边界**:
  - 允许新增覆盖完整 streaming transport lifecycle 的较厚 owner
  - 允许同步更新直接相关 docs / tests
- **禁止项**:
  - 不改变 SDK-first / legacy fallback 策略、per-session stream registry、abort/detach 语义、tool/question event transform 结果
  - 不把 settings update plan、catalog query、session control 或 server lifecycle 混入本轮
- **验收**:
  - `OpenCodeService` 不再直接铺开整段 streaming transport/fallback/read/finalize 细节
  - focused validation、全量 `npm test`、`npm run build` 通过

### [QUEUED] R46 - Maintainability checkpoint

- **Lane**: Checkpoint
- **目标**: 复盘 `R42-R45` 的 owner 收益、lint 变化与验证成本，判断下一批优先继续 `OpenCodeService` settings reconfiguration seam，还是回切 residual settings/model UI seam。
- **优先入口**:
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`
  - 最新 lint / test / build 输出与 phase 文档
- **允许边界**:
  - 只做文档、指标与下一批建议
- **禁止项**:
  - 不自动扩展 `R47+`
  - 不回切长串 warning cleanup
- **验收**:
  - phase 文档明确记录 `R42-R45` 收益、最新 lint 基线与后续建议

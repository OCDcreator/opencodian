# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个标记为 `[NEXT]` 的任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成 `[NEXT]`；如果不存在后续 `[QUEUED]`，则必须明确写成“当前没有可自动执行的 `[NEXT]`”。
> **当前状态**: [CONFIRMED_NEXT_BATCH] 文档压缩已人工完成；当前可自动执行的 `[NEXT]` 是 `W7 - main.ts loadSettings trim`。

## 控制规则

- 不允许跳过当前 `[NEXT]` 去做“顺手的小抽取”
- 如果当前 `[NEXT]` 已经在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个
- 如果当前 `[NEXT]` 被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道
- 新增文件必须满足 master plan 的粒度规则；默认优先合并薄 provider / factory / adapter
- 每个成功 queue item 都必须运行全量 `npm test` 与 `npm run build`
- warning cleanup 允许 focused validation，但不得省略全量验证

## 当前背景

- 已完成批次归档：`docs/status/maintainability-completed-batches.md`
- 当前 lint 基线：`0 errors / 100 warnings`
- 当前最适合继续 autopilot 的方向：继续一小批现有 owner 内的 warning cleanup，而不是自动恢复 `R33+`

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

### [NEXT] W7 - main.ts loadSettings trim

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

### [QUEUED] W8 - OpenCodianView sync complexity trim

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

### [QUEUED] W9 - Warning cleanup checkpoint

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

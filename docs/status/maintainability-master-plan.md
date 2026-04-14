# Maintainability Master Plan

> **状态**: [REVIEW_REQUIRED]
> **作用**: 这是 maintainability 无人值守的战略文档。后续每一轮开始前，必须先读本文件，再读最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `W1-W5` warning cleanup 队列已全部完成；当前没有可自动执行的 `[NEXT]`。若要继续 autopilot，必须先人工确认新的 warning-cleanup queue，或明确恢复 `R33+` maintainability queue。

## 1. 总体目标

maintainability 的目标是：

- 优先降低整体 ownership 集中度，尤其是把过多责任从 `OpenCodianView` 这类主集成点迁走
- 推进稳定、可复用、可单测的单一职责边界
- 让后续修改优先落在明确模块，而不是继续把同一条 helper 链路无限粉碎

非目标：

- 不是把某一条已经很窄的 helper / source-contract / shape 链路继续拆到极致
- 不是为了“每轮都能安全提交”而长期停留在局部低收益切片

## 2. 当前阶段判断

**当前判断：中后期，R28-R32、L1-L5 与 W1-W5 均已完成；`W1-W4` 已把 lint 从 `0 errors / 116 warnings` 继续压到 `0 errors / 103 warnings`，`W5` checkpoint 也已完成复盘。当前应回到人工确认态：如果后续继续，优先再确认一批受控 warning cleanup，而不是自动恢复新的 maintainability 重构。**

原因：

- R1-R12 已按受控 roadmap 完成 P2、P3、P4、Settings、Core config 与 checkpoint；本轮不再继续拆新的 owner
- `src/features/chat/OpenCodianView.ts` 已从 R12 checkpoint 的 **7732 行** 收缩到当前 **6203 行**；R13-R17 已把 tab/pane、header/status、composer input、selection controls、input appearance/glass 等 UI/runtime shell 收束到独立 owner，剩余职责更偏向运行时桥接、hydration/send pipeline seam 与少量实验特性
- `src/features/settings/OpenCodianSettings.ts` 当前实测 **4989 行**，较 R9 前 baseline **6756 行**明显收缩；section lifecycle、model catalog presenter、catalog state writeback 已迁出，但 settings tab 仍负责 section composition、settings persistence、modal launch 与多处分区业务装配
- `src/core/opencode/OpenCodeService.ts` 当前实测 **2397 行**，较 R18 checkpoint 的 **4733 行**减少 **2336 行**（约 **49.4%**），较 R27 checkpoint 的 **2858 行**再减少 **461 行**（约 **16.1%**）；R28-R31 已把 session lifecycle、session control/message orchestration、question/permission negotiation 与 broad query gateway 四块 ownership 迁出，但 service 仍集中 SDK-first / legacy HTTP fallback transport、assistant response + finish/fetch orchestration、server lifecycle / settings update / scoped-directory wiring、provider/model/config lookup 与 tool catalog/event bridge 等跨域兼容 seam
- `src/core/opencode/OpenCodeSdkFacade.ts` / `src/core/opencode/ServerManager.ts` 当前分别为 **257** / **1171** 行；它们继续作为高风险相邻 owner 保持稳定，没有在本批被拆成新的薄 facade
- L1-L5 加上已完成的 `W1-W4` 已把 `npm run lint` 从 post-L1 baseline 的 **44 errors / 119 warnings** 收敛到当前 **0 errors / 103 warnings**；剩余 **103** 条 warning 全部来自 `max-lines-per-function` / `max-lines` / `complexity` / `max-params`，主要集中在 `src/features/settings/OpenCodianSettings.ts`、`src/features/chat/OpenCodianView.ts`、`src/features/settings/ModelConfigModal.ts`、`tests/unit/core/opencode/OpenCodeService.test.ts` 与 `src/main.ts`

结论：L1-L5 已完成“先把 lint 拉回可控状态”的批次目标，`W1-W5` 也完成了新一批低风险 warning cleanup 的降噪目标；但剩余 warnings 仍然高度集中在大 owner 与长测试文件。当前 autopilot 应保持人工确认态；若后续继续，应先人工确认下一批 warning cleanup，再决定是否恢复 `R33+` maintainability 重构。

## 2.1 已完成批次（R13-R18）

R13-R18 已完成 `OpenCodianView` 的 UI/runtime shell 收束：tab/messages pane、header/server status、composer input、selection controls、input appearance/glass，以及 checkpoint 复盘。该批次证明了“沿完整 ownership 下沉”比继续粉碎 helper 更有效，也为 `OpenCodeService` 新批次腾出了主关注点。

## 2.2 已完成夜间批次（R19-R27）

R19-R27 已完成 `OpenCodeService` 的第一批兼容优先收束：sync-event runtime、open-code event runtime、catalog state、prompt request builder、context/image serializer、streaming runtime、stream event transformer、message normalization，以及 checkpoint 复盘。该批次证明了在不破坏 SDK-first / legacy fallback 语义的前提下，`OpenCodeService` 仍然可以继续按较厚 owner 下沉。

## 2.3 已完成受控批次（R28-R32）

R28-R32 已在保持 `OpenCodeService` 对外总门面不散开的前提下完成 session lifecycle、session control、question/permission 与条件性的 query gateway ownership 收束，同时继续把“避免微碎片 facade”放在第一优先级：

1. **R28 session lifecycle coordinator**：已迁出 session create/list/messages/todos/statuses/delete/update/current-session tracking/subscription 共用逻辑。
2. **R29 session control and messaging orchestrator**：已迁出 fork/revert/unrevert/diff/context snapshot、message commands、shell / message-part operations 的共用控制流。
3. **R30 question + permission hub**：已迁出 pending questions/replies/reject 与 pending/session permissions/responders，集中交互式 negotiation API。
4. **R31 conditional query gateway**：已在形成较厚 owner 的前提下，收束 provider/project/file/find/path/VCS/formatter/LSP/MCP auth 这组广域 gateway。
5. **R32 checkpoint**：已完成复盘，不开新重构；结论是当前剩余的 transport/config/finalize/tool-catalog seam 需要人工确认后再决定是否继续。

本批仍然**没有**处理 `ServerManager`、`OpenCodeSdkFacade`，也没有把调用方改成直接依赖一堆新 service。`OpenCodeService` 继续作为对外总门面；新增 owner 只承接内部成块 lifecycle，并通过 host seam 接入。R32 完成后，当前 queue 已结束，autopilot 必须回到人工确认态。

## 2.4 已完成 lint cleanup 批次（L1-L5）

L1-L5 的目标不是继续拆 owner，而是先把当前仓库的 ESLint debt 拉回到可维护状态，避免后续架构轮次继续叠加 lint 噪音：

1. **L1 autofix sweep**：先运行 lint autofix，统一 import/export sort、`prefer-const` 等自动可修项，并记录剩余 errors/warnings 基线。
2. **L2 non-autofix error cleanup**：清掉所有非自动修的 ESLint errors，优先 `src/core/opencode/**`、最近 touched 的 chat/services/tests，以及当前会阻塞新重构提交的文件。
3. **L3 lint green checkpoint**：确认 `npm run lint` 至少 errors 为 0；如仍失败，只允许做解除 lint 失败所需的最小修改。
4. **L4 high-value warning trim**：只处理高价值 warnings，优先当前主热点的 complexity / max-params / no-empty-object-type / no-unused-vars，不为清空低收益 warning 而制造微碎片。
5. **L5 checkpoint**：复盘 lint cleanup 的实际收益，决定下一批是继续 warning cleanup，还是恢复新的 maintainability owner queue。

本批不允许借 lint cleanup 之名顺手启动新的大规模重构；只允许做让 lint 通过或明显降噪所需的最小结构调整。

L1-L5 已全部完成。L5 checkpoint 的结论是：若后续继续 autopilot，应先人工确认一批新的 warning cleanup queue，优先处理生产代码热点内的 `max-lines-per-function` / `max-lines` / `complexity` / `max-params`；暂不直接恢复新的 `R33+` maintainability owner queue。


## 2.5 已确认下一批 warning cleanup 队列（W1-W5）

人工现已确认继续一小批新的 warning cleanup queue，目标是在不重新打开大规模 owner 重构的前提下，进一步降低高噪音 warning：

1. **W1 `ModelConfigModal` max-params cleanup**：只处理 `renderKeyValueEditor`、`createTextField`、`createSelectField` 的参数收束。
2. **W2 `ProviderIconService` signature cleanup**：只处理 `selectBuiltinIcon`、`getLobehubCachePath` 的 `max-params`。
3. **W3 `OpenCodeService` complexity trim**：只处理 `connectSSE` 与 `updateSettings` 的 `complexity`。
4. **W4 chat bridge test typing cleanup**：清掉 `ContextFileCatalogEventBridge` / `FocusContextEventBridge` tests 中的 `@typescript-eslint/no-explicit-any`。
5. **W5 checkpoint**：复盘 `W1-W4` 收益，决定是否继续 warning cleanup，还是恢复新的 maintainability queue。

这批 queue 刻意**不**把 `OpenCodianView` / `OpenCodianSettings` 的大型 `max-lines*` / `complexity` 热点直接拉进无人值守执行，也不恢复 `R33+` ownership-reduction queue；它们保留到 `W5` 之后再人工复盘。

W1-W5 已全部完成。W5 checkpoint 的结论是：这一批 queue 合计收掉 **13** 条 warnings，把 lint 从 L5 checkpoint 的 `0 errors / 116 warnings` 进一步收敛到 `0 errors / 103 warnings`；但剩余 warning 依旧集中在大型 owner 的 `max-lines*` / `complexity` / `max-params` 热点。后续若继续 autopilot，应先人工确认一批新的受控 warning cleanup queue；暂不自动恢复新的 `R33+` ownership-reduction queue。

## 3. 高优先级方向

`W1-W5` warning cleanup 队列已完成，当前 autopilot 回到人工确认态。下面保留各 lane 的长期定位，供下一次人工复盘后再决定是否恢复新的 maintainability queue：

### P1. `OpenCodianView` 中剩余的核心 ownership 迁移

R28-R32 已完成 `OpenCodeService` 的 session/control/negotiation/gateway 收束；在新的人工确认 queue 写入前，`OpenCodianView` 仅保留 regression watchpoints。若后续继续，应先确认 `OpenCodeService` 剩余 transport/config/finalize seam 是否还能形成新的厚 owner。

### P2. question / todo / background task 链路

R1-R6 已完成本 lane 的主要收束。本批 R28-R32 不再开新的 question / todo / background-task 拆分切口；除非测试、构建或正确性阻塞，只保留 regression watchpoints。

### P3. context / composer / retained-selection 链路

R7 已把主要 composer-context bundle / builder / catalog ownership 收进 `ComposerContextViewFacade.create()`。本批 R28-R32 不回到这条链路做低收益细拆；只在回归阻塞时修正。

### P4. message shell / notice / timestamp ownership

R8 已完成 persisted assistant shell / notice / footer / timestamp 的主要收束。本批 R28-R32 不继续拆 assistant shell 细节；只保留 pseudo-stream reveal、本地错误/server-prompt UI 壳层作为 regression watchpoints。

### P5. header / appearance / model-permission / experimental demo

R13-R18 已完成这组 UI/runtime shell 的主要收束。本批 R28-R32 不继续沿这条 lane 新开切口；只保留 regression watchpoints，并继续确保 demo / experimental visual feature 保持 opt-in，不进入稳定 UI 路径。

## 4. 暂停 / 降优先级方向

以下方向目前应明确降优先级：

### 已明显过度停留的链路

- `ConversationRenderService` 的 trailing-assistant patch 链路
- `TrailingAssistantPatch*` 体系下的 tail-state / tail-outcome / completion-debug / planning-context / source-contract / child-plans / callback adapter 继续细拆
- 同类的“`source -> inputs -> shape` 再拆一层”或“再抽一个窄 helper 绑定既有 helper”的收口工作

### 当前判断为收益递减的原因

- 最近大量轮次都停留在同一条 trailing-assistant helper 链上
- 最近数轮的变化大多是“再抽一个更窄 helper”，而不是迁移新的 ownership 边界
- `ConversationRenderService` 已经不再是聊天域的最大维护压力来源；`OpenCodianView` 仍远大于它
- 若继续沿这条链路推进，主要收益会落在局部整洁度，而不是整体维护性

### 明确规则

除非出现以下情况，否则**暂不继续深挖**这条链路：

- failing test / build break
- 明确的功能缺陷或正确性问题
- 它直接阻塞了更高优先级方向的提取

如果只是还能再抽一个更窄 helper，但没有迁出新的 ownership，则默认不做。

## 5. 换赛道规则

后续无人值守必须遵守以下规则：

1. **每轮优先从本文件的高优先级方向中选题**，而不是盲目顺着上一轮 `next_focus` 继续挖。
2. **同一热点链路连续超过 6 轮成功提交后，必须先复审，再决定是否继续。**
3. **如果 10 轮内没有明显降低主集成文件体量，或没有迁出新的 ownership 边界，则必须切换方向。**
4. **如果候选改动只是继续抽一个很小的 `SourceContract` / `Inputs` / `Shape` / `PlanParts` / `ChildPlans` helper，而没有减少主 owner 的职责，就视为低收益切片，禁止优先选择。**
5. **除非被测试、构建或正确性阻塞，否则禁止继续在已暂停链路上做低收益 helper 粉碎。**
6. **拆出的模块若同时低于“约 100 行”且“少于 3 个公开 API / 导出”，默认视为过碎；除非它隔离了高风险依赖或跨 3 处以上复用，否则应优先并回调用方或相邻 owner。**
7. **每轮必须优先执行 `docs/status/maintainability-round-roadmap.md` 里第一个 `[NEXT]` 任务；只有该任务已在仓库中自然完成或被明确阻塞时，才允许推进后续项，并在 phase 文档里说明原因。**
8. **每轮 phase 文档必须明确写出自己推进的是哪条 master-plan lane，以及完成了 roadmap 的哪一个 queue item。**
9. **如果上一轮 `next_focus` 与本文件或 roadmap 冲突，以本文件和 roadmap 为准。**

## 6. 文档协作关系

- `docs/status/maintainability-master-plan.md` = 战略层文档，负责定义优先级、暂停方向和换赛道规则
- `docs/status/maintainability-phase-XXX.md` = 单轮执行文档，负责记录本轮具体切口、验证、部署和下一步建议

后续每轮开始时的阅读顺序应固定为：

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. `docs/status/maintainability-round-roadmap.md`
4. 最近的 `docs/status/maintainability-phase-XXX.md`

## 7. 当前执行指令

当前执行阶段（checkpoint 后暂停态）要求：

- 当前没有可自动执行的 `[NEXT]`
- 若要继续 autopilot，必须先人工确认新的 warning-cleanup queue，或明确恢复 `R33+`
- 在新的人工确认前，不得自动扩展 `W6+` 或恢复 `R33+`
- `OpenCodianView` / `OpenCodianSettings` 的大型 `max-lines*` / `complexity` 热点继续保持人工复盘后再决定
- `ConversationRenderService` trailing-assistant helper 链仍保持降优先级；除非正确性、测试或构建阻塞，不要把它作为本批 queue 的默认起点

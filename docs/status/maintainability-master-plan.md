# Maintainability Master Plan

> **状态**: [CONFIRMED_NEXT_BATCH]
> **作用**: 这是 maintainability 无人值守的战略文档。后续每一轮开始前，必须先读本文件，再读最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: R28-R32 受控队列已确认；autopilot 只能按 `docs/status/maintainability-round-roadmap.md` 的 `[NEXT]` 顺序执行，R32 完成后必须再次暂停并等待人工确认。

## 1. 总体目标

maintainability 的目标是：

- 优先降低整体 ownership 集中度，尤其是把过多责任从 `OpenCodianView` 这类主集成点迁走
- 推进稳定、可复用、可单测的单一职责边界
- 让后续修改优先落在明确模块，而不是继续把同一条 helper 链路无限粉碎

非目标：

- 不是把某一条已经很窄的 helper / source-contract / shape 链路继续拆到极致
- 不是为了“每轮都能安全提交”而长期停留在局部低收益切片

## 2. 当前阶段判断

**当前判断：中后期，R28-R32 已确认为下一批受控队列。**

原因：

- R1-R12 已按受控 roadmap 完成 P2、P3、P4、Settings、Core config 与 checkpoint；本轮不再继续拆新的 owner
- `src/features/chat/OpenCodianView.ts` 已从 R12 checkpoint 的 **7732 行** 收缩到当前 **6203 行**；R13-R17 已把 tab/pane、header/status、composer input、selection controls、input appearance/glass 等 UI/runtime shell 收束到独立 owner，剩余职责更偏向运行时桥接、hydration/send pipeline seam 与少量实验特性
- `src/features/settings/OpenCodianSettings.ts` 当前实测 **4989 行**，较 R9 前 baseline **6756 行**明显收缩；section lifecycle、model catalog presenter、catalog state writeback 已迁出，但 settings tab 仍负责 section composition、settings persistence、modal launch 与多处分区业务装配
- `src/core/opencode/OpenCodeService.ts` 当前实测 **2858 行**，较 R18 checkpoint 的 **4733 行**减少 **1875 行**（约 **39.6%**）；R19-R26 已把 sync/open-code event runtime、catalog state、prompt builder、context/image serializer、streaming runtime、stream event transform、message normalization 八块 ownership 迁出，但 service 仍集中 SDK-first / legacy HTTP fallback transport、session/config/provider gateway、MCP/project/file/find/permission API glue 与 finish/fetch orchestration
- `src/core/opencode/OpenCodeSdkFacade.ts` / `src/core/opencode/ServerManager.ts` 当前分别为 **257** / **1171** 行；它们继续作为高风险相邻 owner 保持稳定，没有在本批被拆成新的薄 facade

结论：R19-R26 已证明“兼容优先的较厚 owner 下沉”能够显著削弱 `OpenCodeService`。下一批已确认继续推进，但范围只限于仍然成块存在、能够形成较厚 owner 的 session lifecycle、session control、question/permission hub 与条件性的 query gateway；必须继续避免把剩余 gateway 再拆成新的微碎片 facade。

## 2.1 已完成批次（R13-R18）

R13-R18 已完成 `OpenCodianView` 的 UI/runtime shell 收束：tab/messages pane、header/server status、composer input、selection controls、input appearance/glass，以及 checkpoint 复盘。该批次证明了“沿完整 ownership 下沉”比继续粉碎 helper 更有效，也为 `OpenCodeService` 新批次腾出了主关注点。

## 2.2 已完成夜间批次（R19-R27）

R19-R27 已完成 `OpenCodeService` 的第一批兼容优先收束：sync-event runtime、open-code event runtime、catalog state、prompt request builder、context/image serializer、streaming runtime、stream event transformer、message normalization，以及 checkpoint 复盘。该批次证明了在不破坏 SDK-first / legacy fallback 语义的前提下，`OpenCodeService` 仍然可以继续按较厚 owner 下沉。

## 2.3 下一批确认方向（R28-R32）

R28-R32 的目标是在保持 `OpenCodeService` 对外总门面不散开的前提下，继续处理仍然成块存在的 session lifecycle、session control、question/permission 与条件性的 query gateway ownership，但必须把“避免微碎片 facade”放在第一优先级：

1. **R28 session lifecycle coordinator**：迁出 session create/list/messages/todos/statuses/delete/update/current-session tracking/subscription 共用逻辑。
2. **R29 session control and messaging orchestrator**：迁出 fork/revert/unrevert/diff/context snapshot、message commands、shell / message-part operations 的共用控制流。
3. **R30 question + permission hub**：迁出 pending questions/replies/reject 与 pending/session permissions/responders，集中交互式 negotiation API。
4. **R31 conditional query gateway**：仅在能形成较厚 owner 的前提下，收束 provider/project/file/find/path/VCS/formatter/LSP/MCP auth 这组广域 gateway；如果落地后会退化成薄 wrapper，必须跳过并在 phase 文档中说明原因。
5. **R32 checkpoint**：只做复盘，不开新重构；决定 session/config/query gateway 是否还有继续拆分的价值。

本批仍然**不**处理 `ServerManager`、`OpenCodeSdkFacade`，也不允许把调用方改成直接依赖一堆新 service。`OpenCodeService` 继续作为对外总门面；新 owner 只能承接内部成块 lifecycle，并通过 host seam 接入。


## 3. 高优先级方向

R28-R32 中，后续无人值守必须优先执行 roadmap 的 `[NEXT]`，每轮只做一个切口。下面保留各 lane 的长期定位，但本批执行顺序以 R28-R32 为准：

### P1. `OpenCodianView` 中剩余的核心 ownership 迁移

本批继续以 `OpenCodeService` 为主，但只处理仍然成块存在的 session lifecycle、session control、question/permission 与条件性的 query gateway ownership。`OpenCodianView` 仅保留 regression watchpoints。

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

R30 完成之后：

- R28-R32 受控队列已经确认，`docs/status/maintainability-round-roadmap.md` 的 `R31` 是唯一可自动执行的 `[NEXT]`
- Autopilot 可以按 R28-R32 顺序运行，但不得越过 R32 自动扩展新队列
- 本批明确优先 `OpenCodeService` 的 session lifecycle、session control、question/permission hub 与条件性的 query gateway；如果 `R31` 无法避免微碎片，必须在该轮说明原因后直接推进 `R32`
- `ConversationRenderService` trailing-assistant helper 链仍保持降优先级；除非正确性、测试或构建阻塞，不要把它作为新 queue 的默认起点

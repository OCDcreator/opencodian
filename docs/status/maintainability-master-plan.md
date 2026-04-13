# Maintainability Master Plan

> **状态**: [AWAITING_MANUAL_CONFIRMATION]
> **作用**: 这是 maintainability 无人值守的战略文档。后续每一轮开始前，必须先读本文件，再读最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: R13-R18 已在 R18 checkpoint 完成；当前没有可自动执行的 `[NEXT]`，autopilot 必须暂停并等待人工确认下一批队列。

## 1. 总体目标

maintainability 的目标是：

- 优先降低整体 ownership 集中度，尤其是把过多责任从 `OpenCodianView` 这类主集成点迁走
- 推进稳定、可复用、可单测的单一职责边界
- 让后续修改优先落在明确模块，而不是继续把同一条 helper 链路无限粉碎

非目标：

- 不是把某一条已经很窄的 helper / source-contract / shape 链路继续拆到极致
- 不是为了“每轮都能安全提交”而长期停留在局部低收益切片

## 2. 当前阶段判断

**当前判断：中期 checkpoint，R13-R18 已完成并等待下一批人工确认。**

原因：

- R1-R12 已按受控 roadmap 完成 P2、P3、P4、Settings、Core config 与 checkpoint；本轮不再继续拆新的 owner
- `src/features/chat/OpenCodianView.ts` 已从 R12 checkpoint 的 **7732 行** 收缩到当前 **6203 行**；R13-R17 已把 tab/pane、header/status、composer input、selection controls、input appearance/glass 等 UI/runtime shell 收束到独立 owner，剩余职责更偏向运行时桥接、hydration/send pipeline seam 与少量实验特性
- `src/features/settings/OpenCodianSettings.ts` 当前实测 **4989 行**，较 R9 前 baseline **6756 行**明显收缩；section lifecycle、model catalog presenter、catalog state writeback 已迁出，但 settings tab 仍负责 section composition、settings persistence、modal launch 与多处分区业务装配
- `src/core/opencode/OpenCodeService.ts` 当前实测 **4733 行**，在 R13-R18 期间没有直接收缩；它仍集中 SDK facade consumption、legacy HTTP/SSE fallback、sync event normalization、question/tool/session/config API glue，已经成为下一批最需要人工确认边界的候选 hotspot

结论：R13-R18 已证明“迁出完整 ownership”比继续粉碎 helper 更有效，并且 `OpenCodianView` 的本批 UI shell 大块 ownership 已按计划完成。项目仍不是收尾阶段，但下一批不应自动展开；应由人工先确认是否围绕 `OpenCodeService` 设计一个专门的高风险兼容边界队列，再决定是否继续无人值守。

## 2.1 已完成批次（R13-R18）

R13-R18 的目标是继续削弱 `OpenCodianView`，但不再回到已完成的 P2 question/todo/background-task、P3 composer-context、P4 persisted assistant shell 细节链路。该批次已经按顺序完成以下 UI/runtime shell ownership 迁移：

1. **R13 tab/messages pane surface**：迁出 messages pane lifecycle、active pane 切换、scroll metrics 和 pane observer，让 view 不再直接管理 pane DOM map 的主要生命周期。
2. **R14 header/server status shell**：迁出 header DOM、server status label/action、wordmark/settings button 组装，让 view 只提供 plugin/service 回调。
3. **R15 composer input shell**：迁出 input area DOM、textarea 行为、高度同步和 composer layout metrics；暂不碰 liquid-glass diagnostics。
4. **R16 model/permission selection controls**：迁出 chat 内 model selector 与 permission selector 的 dropdown/search/selection ownership；不改 core model catalog 或 settings catalog 规则。
5. **R17 input appearance/glass state**：迁出 input panel theme class、SVG filter layer、liquid-glass adapter mount/diagnostic state；保持 experimental demos opt-in。
6. **R18 checkpoint**：只做回归、指标和文档复盘，决定是否下一批转向 `OpenCodeService`。

本批没有处理 `OpenCodeService`，原因是它的 SDK-first 与 legacy HTTP/SSE fallback 双路径风险更高，必须在 R18 checkpoint 后单独定义兼容边界；不要把 core service 与 chat UI shell 重构混在同一批里。


## 3. 高优先级方向

R13-R18 中，后续无人值守必须优先执行 roadmap 的 `[NEXT]`，每轮只做一个切口。下面保留各 lane 的长期定位，但本批执行顺序以 R13-R18 为准：

### P1. `OpenCodianView` 中剩余的核心 ownership 迁移

本批优先把仍然明显集中在 view 内的大块 UI/runtime shell 职责迁到 dedicated module / coordinator：

- tab / messages pane lifecycle、active pane、scroll metrics、pane observer
- header / server status shell 与 composer input shell
- chat 内 model / permission selector ownership
- input panel appearance / glass state lifecycle

### P2. question / todo / background task 链路

R1-R6 已完成本 lane 的主要收束。本批 R13-R18 不再开新的 question / todo / background-task 拆分切口；除非测试、构建或正确性阻塞，只保留 regression watchpoints。

### P3. context / composer / retained-selection 链路

R7 已把主要 composer-context bundle / builder / catalog ownership 收进 `ComposerContextViewFacade.create()`。本批 R13-R18 不回到这条链路做低收益细拆；只在回归阻塞时修正。

### P4. message shell / notice / timestamp ownership

R8 已完成 persisted assistant shell / notice / footer / timestamp 的主要收束。本批 R13-R18 不继续拆 assistant shell 细节；只保留 pseudo-stream reveal、本地错误/server-prompt UI 壳层作为后续候选。

### P5. header / appearance / model-permission / experimental demo

这一组在 R13-R18 中被提升为本批后半段重点，但必须保持较厚 owner 与 opt-in demo 边界：

- header / input area 组装
- appearance / theme / glass / layout 状态同步
- model / permission selector ownership
- demo / experimental visual feature 只保留 opt-in，不进入稳定 UI 路径

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

从第三百三十三阶段 checkpoint 之后：

- R13-R18 受控队列已经全部完成，当前没有新的可自动执行 `[NEXT]`
- Autopilot 不得自动扩展 R19+；必须等待人工确认下一批 roadmap
- 下一批若继续 maintainability，优先由人工评估是否把 `OpenCodeService` 的 SDK facade / legacy HTTP-SSE fallback / sync-event normalization 设计为新队列；未经确认不得自动开工
- `ConversationRenderService` trailing-assistant helper 链仍保持降优先级；除非正确性、测试或构建阻塞，不要把它作为新 queue 的默认起点

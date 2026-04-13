# Maintainability Master Plan

> **状态**: [REVIEW_REQUIRED]
> **作用**: 这是 maintainability 无人值守的战略文档。后续每一轮开始前，必须先读本文件，再读最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: R1-R12 受控队列已完成，下一批 roadmap 必须先由人工确认，不得由 autopilot 自动扩展。

## 1. 总体目标

maintainability 的目标是：

- 优先降低整体 ownership 集中度，尤其是把过多责任从 `OpenCodianView` 这类主集成点迁走
- 推进稳定、可复用、可单测的单一职责边界
- 让后续修改优先落在明确模块，而不是继续把同一条 helper 链路无限粉碎

非目标：

- 不是把某一条已经很窄的 helper / source-contract / shape 链路继续拆到极致
- 不是为了“每轮都能安全提交”而长期停留在局部低收益切片

## 2. 当前阶段判断

**当前判断：中期，但 R12 checkpoint 后暂停自动推进。**

原因：

- R1-R12 已按受控 roadmap 完成 P2、P3、P4、Settings、Core config 与 checkpoint；本轮不再继续拆新的 owner
- `src/features/chat/OpenCodianView.ts` 当前实测 **7732 行**，仍是聊天域最大集成热点；R1-R8 已把 question/todo/background-task、session signal、composer-context、persisted assistant shell 等链路迁到更明确 owner，但 tab activation / runtime bridge / header-appearance 等职责仍需下一批人工排序
- `src/features/settings/OpenCodianSettings.ts` 当前实测 **4989 行**，较 R9 前 baseline **6756 行**明显收缩；section lifecycle、model catalog presenter、catalog state writeback 已迁出，但 settings tab 仍负责 section composition、settings persistence、modal launch 与多处分区业务装配
- `src/core/opencode/OpenCodeService.ts` 当前实测 **4733 行**，本批 roadmap 未直接收缩；它仍集中 SDK facade consumption、legacy HTTP/SSE fallback、sync event normalization、question/tool/session/config API glue，后续若处理必须先设计高风险兼容边界

结论：本批队列已经证明“迁出完整 ownership”比继续粉碎 helper 更有效，但项目仍不是收尾阶段。下一批 roadmap 应由人工确认后再启动，且必须继续围绕大 owner 的完整生命周期边界，而不是自动追加同类小切片。

## 3. 高优先级方向

后续无人值守应优先从以下方向中选题，每轮只做一个切口：

### P1. `OpenCodianView` 中剩余的核心 ownership 迁移

优先把仍然明显集中在 view 内的大块职责迁到 dedicated module / service / runtime helper，尤其是：

- tab / pane / conversation activation 与 sync orchestration
- 会话级 runtime 状态桥接
- 仍然明显耦合在 view 内的渲染编排桥

### P2. question / todo / background task 链路

优先处理仍集中在 `OpenCodianView` 的以下职责：

- session todo 更新、fingerprint、stale notice、dock 协调
- background task launch / completion / stale follow-up / inline notice 协调
- question resolution、question dock、follow-up 行为与状态桥接

这是当前最值得继续搬迁的 ownership 群，因为它们既影响运行时状态，也影响 UI 行为，并且仍在 view 中形成大段耦合逻辑。

### P3. context / composer / retained-selection 链路

优先抽离：

- context file catalog 构建与缓存
- composer context chips / focus context preview / retained selection 协调
- context 附件与 editor 交互桥接

这条链路仍然跨 UI、editor、state 三层，是明显的 ownership 集中点。

### P4. message shell / notice / timestamp ownership

优先审查并继续搬迁仍滞留在 `OpenCodianView` 的：

- assistant shell / notice card / persistent notice 组装
- timestamp / footer / notice action bridge
- assistant render bridge 中仍可稳定下沉的通用渲染职责

目标是让 view 更接近 host/assembly，而不是继续保留大量消息级 DOM 细节。

### P5. header / appearance / model-permission / experimental demo

这一组属于次一级但仍然有价值的方向，适合在上面几组没有更高价值切口时再推进：

- header / input area 组装
- appearance / theme / glass / layout 状态同步
- model / permission selector ownership
- demo / experimental visual feature 的装配边界

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

从第三百二十七阶段 checkpoint 开始：

- R1-R12 受控队列已经完成，`docs/status/maintainability-round-roadmap.md` 不再保留可自动执行的 `[NEXT]`
- Autopilot 必须暂停在 [REVIEW_REQUIRED]，等待人工确认下一批 queue；不得自行把候选方向扩展成新的 `[NEXT]`
- 下一批人工 roadmap 建议先比较 `OpenCodianView` 的 tab activation / runtime bridge、header/appearance/model-permission，以及 `OpenCodeService` 的 SDK/legacy/sync-event boundary，再决定是否继续 settings 分区拆分
- `ConversationRenderService` trailing-assistant helper 链仍保持降优先级；除非正确性、测试或构建阻塞，不要把它作为新 queue 的默认起点

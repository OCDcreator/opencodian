# Maintainability Master Plan

> **状态**: [ACTIVE]
> **作用**: 这是 maintainability 无人值守的战略文档。后续每一轮开始前，必须先读本文件，再读最近的 `docs/status/maintainability-phase-XXX.md`。

## 1. 总体目标

maintainability 的目标是：

- 优先降低整体 ownership 集中度，尤其是把过多责任从 `OpenCodianView` 这类主集成点迁走
- 推进稳定、可复用、可单测的单一职责边界
- 让后续修改优先落在明确模块，而不是继续把同一条 helper 链路无限粉碎

非目标：

- 不是把某一条已经很窄的 helper / source-contract / shape 链路继续拆到极致
- 不是为了“每轮都能安全提交”而长期停留在局部低收益切片

## 2. 当前阶段判断

**当前判断：中期。**

原因：

- 发送、finalization、conversation state、conversation render 等几条主链路已经完成多轮拆分，说明基础模块化工作已经明显推进
- 但 `src/features/chat/OpenCodianView.ts` 仍然是聊天域的绝对主集成热点，当前体量约 **11079 行**，依旧持有大量 runtime、UI、question、todo、background task、context、header、appearance 等 ownership
- 与之相比，`src/features/chat/services/ConversationRenderService.ts` 当前约 **696 行**，且 trailing-assistant patch 周边已经衍生出 **40 个 `TrailingAssistantPatch*.ts` helper**；这说明最近工作的收益更偏向局部收口，而不是继续显著降低全局 ownership 集中度

结论：目前并不是“只剩收尾”的后期状态，更像是**完成了若干关键链路拆分后的中期阶段**：已经有可复用边界，但最大的集成点仍未被系统性瘦身。

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
6. **每轮 phase 文档必须明确写出自己推进的是哪条 master-plan lane。**
7. **如果上一轮 `next_focus` 与本文件冲突，以本文件为准。**

## 6. 文档协作关系

- `docs/status/maintainability-master-plan.md` = 战略层文档，负责定义优先级、暂停方向和换赛道规则
- `docs/status/maintainability-phase-XXX.md` = 单轮执行文档，负责记录本轮具体切口、验证、部署和下一步建议

后续每轮开始时的阅读顺序应固定为：

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. 最近的 `docs/status/maintainability-phase-XXX.md`

## 7. 当前执行指令

从本次战略复审开始：

- 不再把 `ConversationRenderService` trailing-assistant helper 链作为默认延续方向
- 下一轮起，优先从 `OpenCodianView` 仍然集中的 ownership 中选择一个高价值切口
- 首选候选应落在：`question / todo / background task`、`context / composer`、`message shell / notice / timestamp`、或其它能直接削弱 `OpenCodianView` ownership 的链路

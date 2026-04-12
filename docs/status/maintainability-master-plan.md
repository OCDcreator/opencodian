# Maintainability Master Plan

> **状态**: [ACTIVE]
> **作用**: 这是 maintainability 无人值守的战略文档。每一轮开始前，先读本文件，再读 lane map，最后读最近的阶段文档。

## 1. 总体目标

- 持续降低 `OpenCodianView` 等主集成点的 ownership 集中度
- 优先迁移稳定、可单测、可复用的职责边界，而不是把窄 helper 继续碎片化
- 让后续维护更多落在 dedicated service / runtime bridge / host adapter，而不是回流到超大 view

## 2. 当前阶段判断

**当前判断：中期。**

原因：

- 发送、finalization、conversation state、render 等链路已经出现了可复用边界
- 但聊天域的主集成文件仍然很大，`OpenCodianView` 仍持有大量 runtime、UI、question、todo、background task、context 和 appearance ownership
- 后续无人值守应优先减少主集成点体量，而不是继续在局部 helper 链上做低收益细拆

## 3. 高优先级方向

### P1. `OpenCodianView` 核心 ownership 迁移

- tab / pane / conversation activation 与 sync orchestration
- 会话级 runtime 状态桥接
- 仍明显耦合在 view 内的渲染编排桥

### P2. question / todo / background task 链路

- session todo 更新、fingerprint、stale notice、dock 协调
- background task launch / completion / stale follow-up / inline notice 协调
- question resolution、question dock、follow-up 行为与状态桥接

### P3. context / composer / retained-selection 链路

- context file catalog 构建与缓存
- composer context chips / focus preview / retained selection 协调
- context 附件与 editor 交互桥接

### P4. message shell / notice / timestamp ownership

- assistant shell / notice card / persistent notice 组装
- timestamp / footer / notice action bridge
- assistant render bridge 中仍可稳定下沉的通用渲染职责

### P5. header / appearance / model-permission / experimental demo

- header / input area 组装
- appearance / theme / glass / layout 状态同步
- model / permission selector ownership
- demo / experimental visual feature 的装配边界

## 4. 暂停 / 降优先级方向

- `ConversationRenderService` trailing-assistant helper 链
- `TrailingAssistantPatch*` 周边继续细拆 source/input/shape/parts/helper 的低收益收口
- 没有迁出新 ownership 边界、只是在既有窄 helper 链里再抽一层的切片

## 5. 换赛道规则

1. 每轮优先从本文件的高优先级方向选题
2. 同一热点链路连续多轮推进后，必须复审是否仍在降低主 owner 体量
3. 如果数轮内没有明显降低主集成文件体量，或没有迁出新的 ownership 边界，则切换方向
4. 如果上一轮 `next_focus` 与本文件冲突，以本文件为准


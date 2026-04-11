# 可维护性改进：第七阶段总结与第八阶段实施说明

> **状态**: [ACTIVE]
> **适用范围**: 供后续会话/工程师继续推进可维护性优化时使用

这份文档承接 `docs/status/maintainability-phase-1.md`、`docs/status/maintainability-phase-2.md`、`docs/status/maintainability-phase-3.md`、`docs/status/maintainability-phase-4.md`、`docs/status/maintainability-phase-5.md` 与 `docs/status/maintainability-phase-6.md`。第一阶段解决的是“先立滚动与局部 UI 护栏”，第二阶段解决的是“拆 conversation/tab 装载编排”，第三阶段解决的是“拆 model selector 子模块”，第四阶段解决的是“拆消息区 rerender / tail patch / append-only sync 编排”，第五阶段解决的是“把 `sendMessage()` 末段的 post-stream finalization / post-sync orchestration 抽成独立 service”，第六阶段解决的是“把 `sendMessage()` 前半段的 send preflight / optimistic bootstrap orchestration 抽成独立 service”，第七阶段解决的是 **把发送链路真正提升为独立子系统，并继续细拆成可单测、可维护的 runtime 子模块**。本轮仍然坚持 **渐进式提取 + 同步补测试**，没有做一次性重写。

---

## 1. 第七阶段的目标与本轮边界

第六阶段留给第七阶段的主轴是：

1. 不再只抽 `sendMessage()` 的一个更小 helper
2. 优先按子系统搬运 `OpenCodianView` 的真实 ownership
3. 首选完整搬走发送子系统

本轮实际完成的范围，正是 **发送子系统 ownership 的第一次真实搬迁**：

- `OpenCodianView.sendMessage()` 不再承载发送链路本体
- 新建 `SendPipelineRuntime` 作为发送子系统 composition root
- 再把 runtime 内部进一步切成 chunk router、local finalizer、trace、pending indicator、content helper、outcome builder、shell finalizer、message persistence 等更小模块

本轮仍然没有顺手去做这些事：

- 重写消息列表渲染 ownership
- 大拆 `main.ts`
- 大拆 `OpenCodeService.ts`
- 全仓 warning 清零

这是刻意控制范围，而不是“拆不动”。第七阶段的重点不是“把一切都拆完”，而是先证明 **`OpenCodianView` 里的一个重型子系统可以完整搬走，并在搬走后继续向最小颗粒细分**。

---

## 2. 第七阶段已完成内容

### 2.1 抽出发送子系统总入口 `SendPipelineRuntime`

本轮新增：

- `src/features/chat/runtime/SendPipelineRuntime.ts`

这个 runtime 现在负责装配整条发送链路：

- 调用 `MessageSendPreparationService`
- 建立真实 stream、streaming shell 与 `StreamController`
- 把 stream loop 交给 `StreamChunkRouter`
- 把本地收尾交给 `StreamLocalFinalizer`
- 最后把 post-stream finalization 继续交给 `MessageFinalizationService`

这意味着发送子系统已经不再是 `OpenCodianView` 中的一段“大型私有方法”，而是拥有了自己的运行时入口。

### 2.2 把 runtime 继续细拆成更小模块

为了避免 `SendPipelineRuntime` 自己变成第二个大类，本轮又新增了这些 runtime 内部模块：

- `src/features/chat/runtime/SendPipelineTypes.ts`
- `src/features/chat/runtime/sendPipelineContent.ts`
- `src/features/chat/runtime/PendingIndicatorController.ts`
- `src/features/chat/runtime/SendPipelineTrace.ts`
- `src/features/chat/runtime/buildLocalStreamOutcome.ts`
- `src/features/chat/runtime/StreamShellFinalizer.ts`
- `src/features/chat/runtime/LocalStreamMessagePersistence.ts`
- `src/features/chat/runtime/StreamChunkRouter.ts`
- `src/features/chat/runtime/StreamLocalFinalizer.ts`

它们各自承接的职责如下：

- `SendPipelineTypes`
  - 统一定义 runtime、host、router、finalizer、outcome 的共享契约
- `sendPipelineContent`
  - 统一处理 streaming block → persisted message block 映射
  - 统一定义“什么算可见内容”
- `PendingIndicatorController`
  - 专管 1 秒延迟 pending indicator 的 DOM、interval 与 reveal
- `SendPipelineTrace`
  - 专管 trace id、raw/rendered chunk 计数、progress checkpoint 与日志节流
- `StreamChunkRouter`
  - 专管 stream loop、chunk 分流、timeout、interruption、fallback error 注入
- `buildLocalStreamOutcome`
  - 纯推导本地收尾结果，不直接做副作用
- `StreamShellFinalizer`
  - 专管 streaming shell 最终落地成 timestamp / notice / removed
- `LocalStreamMessagePersistence`
  - 专管 assistant / notice message 的本地持久化与第一次 `saveConversation()`
- `StreamLocalFinalizer`
  - 负责 orchestration：把 outcome、shell、persistence 串起来

这一步很关键：第七阶段不是只做“把大方法移个文件”，而是继续把发送子系统内部压缩到更细粒度。

### 2.3 `OpenCodianView` 已退化成 bridge + host 装配层

本轮在 `OpenCodianView` 中完成了两个关键收薄：

- `sendMessage()` 只剩一行桥接调用 `this.sendPipelineRuntime.sendMessage(content)`
- `createSendPipelineRuntimeHost()` 成为发送子系统与 view 的集中适配点

也就是说，`OpenCodianView` 对发送链路的角色已经从“实现者”下降成：

- 创建 host
- 暴露仍在 view 内的能力
- 从 UI 事件触发 runtime

虽然 host 还不算小，但 ownership 已经搬出去了，这是第七阶段最核心的进展。

### 2.4 测试补强

本轮新增：

- `tests/unit/features/chat/SendPipelineRuntime.test.ts`
- `tests/unit/features/chat/sendPipelineContent.test.ts`
- `tests/unit/features/chat/buildLocalStreamOutcome.test.ts`

新增覆盖到的行为包括：

- `SendPipelineRuntime` 在 preparation 失败时会中止，不误发 stream
- 正常发送时，本地 assistant message 会先于 post-stream finalization 落库
- 纯 error 流会持久化 notice，而不是错误地落成普通 assistant 文本
- `sendPipelineContent` 的 block 映射、文本提取、可见内容判定
- `buildLocalStreamOutcome` 对 metadata、interrupted partial content、error-only 分支的推导

这些测试让发送子系统在拆成多个 runtime 子模块后，仍然保有明确的行为锚点。

### 2.5 文档同步

本轮新增或更新了这些模块文档：

- `docs/modules/features/chat/runtime/SendPipelineRuntime.md`
- `docs/modules/features/chat/runtime/StreamChunkRouter.md`
- `docs/modules/features/chat/runtime/StreamLocalFinalizer.md`
- `docs/modules/features/chat/runtime/SendPipelineTypes.md`
- `docs/modules/features/chat/runtime/sendPipelineContent.md`
- `docs/modules/features/chat/runtime/PendingIndicatorController.md`
- `docs/modules/features/chat/runtime/SendPipelineTrace.md`
- `docs/modules/features/chat/runtime/buildLocalStreamOutcome.md`
- `docs/modules/features/chat/runtime/StreamShellFinalizer.md`
- `docs/modules/features/chat/runtime/LocalStreamMessagePersistence.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`

这些文档已经把新的 runtime 子目录和边界关系同步出来，后续不需要再回头猜“哪个模块负责哪一层”。

### 2.6 验证结果

第七阶段本轮落地后，本地已验证通过：

- `npm run lint`（无 error，保留仓库既有 warning baseline）
- `npm run typecheck`
- `npm run test`
- `npm run build`

并且已按仓库规则完成 Test Vault 部署与 `BUILD_ID` 校验：

- `main.202604111609`

---

## 3. 第七阶段后的当前状态判断

### 已经改善的点

- `OpenCodianView.sendMessage()` 已经不再承载发送链路主体
- 发送子系统已经具备独立 runtime 入口、独立测试锚点、独立模块文档
- 发送子系统内部也没有停在“单类迁移”，而是进一步拆成更细粒度 helper / coordinator
- `MessageSendPreparationService` 与 `MessageFinalizationService` 终于被一个真正的发送 runtime 夹在中间，形成闭环边界：
  - preparation
  - runtime stream orchestration
  - local finalization
  - post-stream finalization

### 仍然存在的核心问题

第七阶段结束后，发送子系统虽然已经搬走 ownership，但还有三个明显的后续压力点：

1. **`createSendPipelineRuntimeHost()` 仍然偏大**
   - host 暴露了 transport、DOM、notice、debug、persistence、context usage 等多类能力
   - 如果不继续拆，它会成为“挪出 view 后的新隐形巨型边界”
2. **streaming shell / notice / timestamp 相关原子能力仍然挂在 `OpenCodianView`**
   - 例如：
     - `createAssistantMessageElement()`
     - `revealStreamingAssistantMessageElement()`
     - `addTimestampWithCopyButton()`
     - `buildStreamErrorNotice()`
     - `buildInterruptedAssistantNotice()`
     - `renderAssistantPlaceholderAsNotice()`
   - 这些方法虽然已被 runtime 调用方收口，但 ownership 仍在 view
3. **消息渲染 ownership 仍然集中在 `OpenCodianView`**
   - 发送子系统要继续变薄，最终还是要把与 assistant shell / notice / message rendering 更相关的能力继续往外搬

### 当前不应回退的原则

第八阶段继续做时，不要回退以下设计：

- 不要把 `SendPipelineRuntime` 的主链路塞回 `OpenCodianView`
- 不要把 `StreamChunkRouter` / `StreamLocalFinalizer` 重新合并回一个大方法
- 不要为了减少 host 字段数量，牺牲已有的多层边界和可测性
- 不要破坏这几个既有时序：
  - optimistic user message 先落地再开流
  - pending indicator 1 秒延迟
  - 5 分钟 idle timeout
  - 第一次本地 `saveConversation()` 先于 post-stream finalization
  - 真实 error 优先于通用 fallback error
- 不要把第八阶段又退回成“只再抽一个小 helper”

---

## 4. 第八阶段建议主轴

第七阶段之后，第八阶段最推荐的方向，不是继续只在 runtime 内部抠更小函数，而是 **继续沿着发送链路向外收缩 `OpenCodianView` 的 host 面与消息壳体 ownership**。

换句话说，第八阶段的目标应从：

- “发送子系统已经搬走”

推进到：

- “发送子系统依赖的 view host 也开始按能力簇继续拆薄”

### 4.1 优先级 A：先拆 `createSendPipelineRuntimeHost()` 的 host 面

这是第八阶段最推荐优先做的事。

建议不要继续让 `SendPipelineHost` 作为一个不断扩张的“大接口”，而是按职责把 host 面拆成更窄的 port / adapter，例如：

- `SendPipelineTransportHost`
  - stream 调用、detach、usage sync、permission/question 路由
- `SendPipelineShellHost`
  - assistant shell 创建、reveal、timestamp、notice 渲染
- `SendPipelinePersistenceHost`
  - `saveConversation()`、message debug summary、payload stringify
- `SendPipelineDebugHost`
  - preview、trace、content-block debug summary

这些名字不必一次定死，但第八阶段至少应该让 host 面开始“分簇”，而不是继续在一个大 interface 里增长。

### 4.2 优先级 B：优先搬走 assistant shell / notice rendering ownership

如果第八阶段只做一个高收益切口，最推荐优先搬的不是 transport，而是 **assistant shell / notice rendering ownership**。

原因是这些能力目前同时满足三个条件：

1. 与发送子系统高度相关
2. 仍强耦合在 `OpenCodianView`
3. 继续拆出去之后，能直接缩小 `SendPipelineHost` 的体积

建议优先考虑新增类似模块：

- `src/features/chat/runtime/AssistantShellRenderer.ts`
- 或 `src/features/chat/runtime/SendPipelineShellHost.ts`

让它接管至少这些能力：

- `createAssistantMessageElement()`
- `revealStreamingAssistantMessageElement()`
- `addTimestampWithCopyButton()`
- `buildStreamErrorNotice()`
- `buildInterruptedAssistantNotice()`
- `renderAssistantPlaceholderAsNotice()`
- `removeEmptyAssistantShells()`

一旦这层 ownership 搬走，发送 runtime 对 `OpenCodianView` 的依赖面会明显缩小。

### 4.3 优先级 C：把 host adapter 自己变成独立模块，而不是继续内联在 view 里

即便第八阶段暂时不拆消息渲染 ownership，也建议至少先把：

- `createSendPipelineRuntimeHost()`

从 `OpenCodianView` 里挪成独立 adapter 模块，例如：

- `src/features/chat/runtime/createSendPipelineRuntimeHost.ts`
- 或 `src/features/chat/runtime/SendPipelineHostAdapter.ts`

这样做的价值是：

- `OpenCodianView` 自身继续变薄
- host 的实现与 runtime 的契约可以一起演进
- 之后再细拆 host 的子 port 时，落点已经不在 view 本体里

### 4.4 优先级 D：若 host 已明显变薄，再考虑消息列表 ownership

如果第八阶段还有余量，下一步才建议继续看：

- `MessageListRuntime`
- `AssistantMessageRenderer`
- `NoticeMessageRenderer`

也就是把更广义的消息渲染 / 消息壳体 ownership 继续从 `OpenCodianView` 中搬走。

但顺序上，仍建议先把发送子系统的 host 与 shell 依赖面压薄，再看更大范围的 message list runtime。

### 4.5 第八阶段不要优先做的事

仍然不建议第八阶段前半程抢做：

- `main.ts` 大拆分
- settings 大拆分
- `OpenCodeService.ts` 大拆分
- 与发送子系统 host / shell 无关的 warning 清理
- 主题、provider icon 或实验 demo 扩张
- 只在 `SendPipelineRuntime` 内继续做一轮“更小 helper”就宣告完成

---

## 5. 第八阶段建议任务顺序

建议按下面顺序推进。

### Task 1：先盘点 `SendPipelineHost` 当前能力簇

完成标准：

- 列出 host 里哪些方法属于 transport
- 哪些属于 shell / notice
- 哪些属于 persistence
- 哪些属于 debug / trace

### Task 2：先把 host adapter 独立成模块

完成标准：

- `OpenCodianView` 不再直接内联 `createSendPipelineRuntimeHost()` 的完整实现
- host adapter 至少移动到 runtime 子目录或紧邻发送子系统的位置

### Task 3：优先搬走 assistant shell / notice ownership

完成标准：

- 至少有一个新的 renderer / host 模块真正拥有 shell / notice 相关实现
- `OpenCodianView` 对这部分只保留 bridge，不再自己实现完整逻辑

### Task 4：补上 host / shell 新边界的测试

优先只处理：

- shell 创建与 reveal
- timestamp / interrupted badge 分支
- error notice / interrupted notice 分支
- host adapter 分簇后的最小行为测试

### Task 5：同步更新模块文档

至少更新：

- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/SendPipelineRuntime.md`
- 新增对应的 host adapter / shell renderer 模块文档

### Task 6：运行必要验证

保持：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`

只有改到运行时代码、样式或构建链时，再执行：

4. `npm run build`

如果运行了 `npm run build`，仍然必须：

- 立即部署到 Test Vault
- 校验 `BUILD_ID`

---

## 6. 第八阶段实施约束

### 6.1 拆分方式

- 继续优先搬 ownership，不只是抽局部 helper
- 优先缩小 host 面和 view 对发送子系统的耦合
- 允许先拆 adapter，再拆 renderer / host 内部实现
- 尽量通过窄 port、pure helper 和小型 renderer 协作，不复制 tab runtime 状态

### 6.2 行为约束

不要破坏以下现有行为：

- 多 tab 并发 streaming / background-task 状态隔离
- 1 秒 pending indicator 与 5 分钟 timeout 保护
- optimistic user message 的先落地再开流语义
- 首条 user message 的 fallback title / AI title kickoff 时序
- local assistant message / error notice / interrupted notice 的现有持久化分流
- 第一次本地 `saveConversation()` 与 post-stream finalization 的现有先后顺序
- turn diff notice、todo refresh、context usage 刷新的现有时序

### 6.3 范围约束

- 不要修改用户可见设置 schema
- 不要修改存储格式
- 不要修改 OpenCode 协议
- 不要动 `reference-projects/`
- 不要顺手处理与本轮 host / shell 拆分无关的 warning

---

## 7. 给下一位实现者的简明接手建议

如果下一会话要继续做，推荐直接这样开工：

1. 先读：
   - `AGENTS.md`
   - `docs/status/maintainability-phase-1.md`
   - `docs/status/maintainability-phase-2.md`
   - `docs/status/maintainability-phase-3.md`
   - `docs/status/maintainability-phase-4.md`
   - `docs/status/maintainability-phase-5.md`
   - `docs/status/maintainability-phase-6.md`
   - `docs/status/maintainability-phase-7.md`
2. 再读：
   - `src/features/chat/OpenCodianView.ts`
   - `src/features/chat/runtime/SendPipelineRuntime.ts`
   - `src/features/chat/runtime/StreamChunkRouter.ts`
   - `src/features/chat/runtime/StreamLocalFinalizer.ts`
   - `src/features/chat/runtime/SendPipelineTypes.ts`
   - `tests/unit/features/chat/SendPipelineRuntime.test.ts`
   - `tests/unit/features/chat/sendPipelineContent.test.ts`
   - `tests/unit/features/chat/buildLocalStreamOutcome.test.ts`
3. 先盘点 `createSendPipelineRuntimeHost()` 当前能力簇
4. 再优先提取 host adapter 或 shell renderer ownership
5. 如还有余量，再继续推进消息列表 / assistant shell 更大范围的 ownership 拆分
6. 每完成一个切口就跑 lint + typecheck + test

一句话总结第八阶段：

> 在第七阶段已经搬走发送子系统 ownership 的基础上，继续把 `OpenCodianView` 对发送子系统的 host 面和 assistant shell / notice rendering ownership 压薄，避免 `SendPipelineHost` 演变成新的隐形巨型边界。

### 可直接复制的新会话启动提示

如果要让新会话继续第八阶段，可以直接复制下面这段：

```text
请继续推进 OpenCodian 的可维护性优化第八阶段。

先阅读并严格遵循：
1. AGENTS.md
2. docs/status/maintainability-phase-1.md
3. docs/status/maintainability-phase-2.md
4. docs/status/maintainability-phase-3.md
5. docs/status/maintainability-phase-4.md
6. docs/status/maintainability-phase-5.md
7. docs/status/maintainability-phase-6.md
8. docs/status/maintainability-phase-7.md

这次不要重复做前七阶段已经完成的内容；请基于现有改动继续优化。第八阶段仍然以“渐进式提取 + 同步补测试”为原则，但本轮重点不再是继续在 runtime 内抠更小 helper，而是继续压薄 OpenCodianView 对发送子系统的 host 面和 shell ownership。

本轮优先目标：
- 继续拆分 src/features/chat/OpenCodianView.ts
- 先把 createSendPipelineRuntimeHost 的实现从 view 中搬走或分簇
- 优先把 assistant shell / notice rendering ownership 继续外移

本轮请先：
- 阅读 docs/status/maintainability-phase-7.md 中列出的第八阶段方向与任务顺序
- 先盘点 SendPipelineHost 当前能力，区分 transport、shell、persistence、debug
- 首选提取 host adapter 或 shell renderer，而不是继续只做 runtime 内部更小 helper
- 先补即将改动路径的测试，再做提取
- 继续复用现有 runtime / service / helper，而不是把逻辑重新塞回 OpenCodianView
  - src/features/chat/runtime/SendPipelineRuntime.ts
  - src/features/chat/runtime/StreamChunkRouter.ts
  - src/features/chat/runtime/StreamLocalFinalizer.ts
  - src/features/chat/services/MessageSendPreparationService.ts
  - src/features/chat/services/MessageFinalizationService.ts

明确约束：
- 不要回退现有 CI、lint 规则，以及第七阶段建立的 SendPipelineRuntime / StreamChunkRouter / StreamLocalFinalizer / SendPipelineTrace / PendingIndicatorController 边界
- 不要修改用户可见设置 schema、存储格式、OpenCode 协议，除非确有必要且有证据
- 不要顺手处理无关 warning；只消化与你本轮 host / shell 拆分直接相关的 warning
- 不要动 reference-projects/
- 不要把“只再抽一个 runtime helper”当成第八阶段完成

建议执行顺序：
1. 先盘点 SendPipelineHost 当前能力簇
2. 优先提取 host adapter
3. 再优先提取 assistant shell / notice renderer ownership
4. 更新对应 docs/modules 文档
5. 运行必要验证

验证要求：
- 至少运行 npm run lint、npm run typecheck、npm run test
- 只有在改到运行时代码 / 样式 / 构建链时，再运行 npm run build
- 如果运行了 npm run build，必须立即按 AGENTS.md 里的规则部署到 Test Vault 并验证 BUILD_ID

开始前先给出一个简短计划，然后直接实施。
```

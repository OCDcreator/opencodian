# 可维护性改进：第六阶段总结与第七阶段实施说明

> **状态**: [ACTIVE]
> **适用范围**: 供后续会话/工程师继续推进可维护性优化时使用

这份文档承接 `docs/status/maintainability-phase-1.md`、`docs/status/maintainability-phase-2.md`、`docs/status/maintainability-phase-3.md`、`docs/status/maintainability-phase-4.md` 与 `docs/status/maintainability-phase-5.md`。第一阶段解决的是“先立滚动与局部 UI 护栏”，第二阶段解决的是“拆 conversation/tab 装载编排”，第三阶段解决的是“拆 model selector 子模块”，第四阶段解决的是“拆消息区 rerender / tail patch / append-only sync 编排”，第五阶段解决的是“把 `sendMessage()` 末段的 post-stream finalization / post-sync orchestration 抽成独立 service”，第六阶段解决的是“把 `sendMessage()` 前半段的 send preflight / optimistic bootstrap orchestration 抽成独立 service”。本轮仍然坚持 **渐进式提取 + 同步补测试**，没有做一次性重写。

---

## 1. 第六阶段的目标与本轮边界

第五阶段留给第六阶段的主轴是：

1. 提取 `sendMessage()` 的 send preflight / optimistic bootstrap orchestration
2. 先补 preparation 路径的最小测试
3. 如有余量，再处理本地 shell finalization 的更小 helper

本轮实际完成的范围覆盖了前两个方向，也就是 **`sendMessage()` 前半段 preparation / bootstrap orchestration 的 service 化与最小测试补强**。本地 shell finalization 没有顺手继续拆，chunk router 也没有被整体重写。这是有意控制风险，而不是“拆不动”：

- preparation orchestration 是第五阶段之后最自然、收益最高的下一个切口
- 它与第二到第五阶段已经形成的 host + service 边界天然一致，适合继续沿用
- 如果第六阶段同时去深拆 chunk router、stream shell finalization 与本地 assistant/notice 构建，会再次把事件语义、pending/timeout、DOM 收尾与消息持久化风险叠在一起

换句话说，第六阶段不是追求“`sendMessage()` 立刻显著变短”，而是先把 **能不能发、发之前先做什么、optimistic user message 何时落地、何时进入 stream runtime** 这层编排从 `OpenCodianView` 里拿出来。

---

## 2. 第六阶段已完成内容

### 2.1 抽出 `MessageSendPreparationService`

本轮新增：

- `src/features/chat/services/MessageSendPreparationService.ts`

这个 service 当前负责：

- `buildOptimisticUserMessage()`
- `prepareMessageSend()`
- `enterStreamingState()`
- `completePreparedStreamStart()`

其中：

- `buildOptimisticUserMessage()` 作为纯 helper 导出，方便直接单测
- `prepareMessageSend()` 只负责编排与判定，不直接发起 stream，也不消费 chunk
- `enterStreamingState()` 与 `completePreparedStreamStart()` 把 stream 前后的状态切换分成两个小步骤，保留原有时序

#### 已迁出的职责

- 当前 conversation / active tab / runtime 的前置校验
- foreground busy 判定与阻断 notice
- server availability 检查与 `ensureServerReadyForChat()` 分流
- model catalog 懒加载与 selected model availability 判定
- optimistic user message 的构建
- optimistic user message 的本地 append / save / render / scroll
- 首条 user message 的 fallback title 与 AI title kickoff 判定
- stream runtime 进入前的状态切换：
  - `isStreaming`
  - tab stream-like UI 状态同步
  - context usage stream 开始
- stream 真正创建后的 staged state 清理：
  - `pendingEditedFiles`
  - `draftContextItems`

#### 设计方式

本轮仍然没有让新 service 直接持有 view、plugin 或整套 DOM 运行时所有权，而是定义了：

- `MessageSendPreparationHost`
- `SendPreparationServerAvailability`
- `SendMessageModelOptions`
- `PreparedMessageSend`
- `MessageSendPreparationService`

service 通过 host 回调访问外部能力，例如：

- 确保 conversation 可用、获取 active tab、确认 tab runtime
- foreground busy 阻断 notice
- server availability / `ensureServerReadyForChat()`
- model catalog 加载、model availability 校验
- optimistic message append/save/render/scroll
- fallback title / AI title generation
- stream-like 状态同步、context usage stream 开始、pending edited files 与 draft context items 清理

这个设计的价值在于：

- 第五阶段已经抽出的 `MessageFinalizationService` 不需要回退，`sendMessage()` 前后两段开始形成对称边界
- `OpenCodianView` 可以继续沿着一致的 host + service 模式收薄，而不是在前半段再塞回一堆内联分支
- 后续继续拆 `sendMessage()` 的本地 shell finalization 或 chunk router 时，可以继续复用这个边界，而不需要重写 preparation 路径

### 2.2 `OpenCodianView` 的 `sendMessage()` 前半段已收薄

本轮在 `OpenCodianView` 中新增：

- `messageSendPreparationService` 字段
- `createMessageSendPreparationHost()`

并完成了三处关键替换：

- 用 `messageSendPreparationService.prepareMessageSend(...)` 取代前半段的内联 preflight / bootstrap 编排
- 用 `messageSendPreparationService.enterStreamingState(...)` 取代内联的 stream-enter 状态切换
- 用 `messageSendPreparationService.completePreparedStreamStart(...)` 取代 stream 创建后对 staged state 的内联清理

#### 明确保留在 view 内的职责

本轮没有迁走，而是明确保留在 `OpenCodianView` 的内容包括：

- 真正的 `openCodeService.sendMessage()` 调用
- `StreamController` chunk 消费
- pending indicator、timeout、interruption 处理
- permission / question request 分支
- streaming shell 最终 DOM 收尾
- streamed content block 到本地 assistant / notice message 的构建
- 第一次本地 `saveConversation()`
- `MessageFinalizationService` 负责的 post-stream finalization / post-sync orchestration

这样做的收益是：

- `sendMessage()` 前半段最密集的一层“发送前编排”已经被拆出
- stream loop 本体、stream shell DOM、本地消息构建没有被一轮混在一起重构
- 现有时序——尤其是 “optimistic user message 先落地再开流”——得以保留

### 2.3 测试补强

本轮新增：

- `tests/unit/features/chat/MessageSendPreparationService.test.ts`

新覆盖到的行为包括：

- `buildOptimisticUserMessage()` 会按现有规则带上 context attachments
- server 不可用且 `ensureServerReadyForChat()` 失败时，发送被中止，不追加 optimistic user message
- model catalog 未加载时，会先加载 catalog 再做 selected model availability 检查
- model 不可用时，仍走现有 model-unavailable notice 路径，不启动 stream
- 正常路径下，optimistic user message 会按既有顺序 append / save / render / scroll
- 首条 user message 时，fallback title 与 AI title kickoff 时序保持不变
- 进入 stream 前后，`isStreaming`、stream-like UI 状态、context usage stream、pending edited files 与 draft context items 的顺序保持不变

这些测试的价值不只是“补覆盖率”，而是让第六阶段之后的 send preparation orchestration 首次拥有独立测试锚点，不再只能通过 `OpenCodianView` 的超大私有方法间接验证。

### 2.4 文档同步

本轮已更新：

- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`

本轮已新增：

- `docs/modules/features/chat/services/MessageSendPreparationService.md`

模块文档中已经说明：

- `sendMessage()` 的前半段 preparation / bootstrap orchestration 已迁出
- `MessageSendPreparationService` 与 `OpenCodianView`、`MessageFinalizationService` 的职责边界是什么
- 哪些逻辑仍然保留在 view 中

### 2.5 验证结果

第六阶段本轮落地后，本地已验证通过：

- `npm run lint`（无 error，仅保留仓库既有 warning）
- `npm run typecheck`
- `npm run test`
- `npm run build`

并且已按仓库规则完成 Test Vault 部署与 `BUILD_ID` 校验：

- `main.202604111449`

---

## 3. 第六阶段后的当前状态判断

### 已经改善的点

- `sendMessage()` 前半段的 can-send / preflight / optimistic bootstrap 编排，不再全部内联在 `OpenCodianView` 中
- `MessageSendPreparationService` 与 `MessageFinalizationService` 已经形成明确的前后边界：
  - `MessageSendPreparationService` 负责“能不能发、发之前先做什么、何时进入 stream”
  - `MessageFinalizationService` 负责“stream 结束后何时 sync、sync 后何时 patch/rerender、如何做 todo/save/attention 收尾”
- 第二到第六阶段已经形成连续边界：
  - 第二阶段：`ConversationViewStateService`
  - 第三阶段：`ui/modelSelector/*`
  - 第四阶段：`ConversationRenderService`
  - 第五阶段：`MessageFinalizationService`
  - 第六阶段：`MessageSendPreparationService`

### 为什么 `OpenCodianView.ts` 和 `sendMessage()` 仍然很大——以及这意味着什么

到第六阶段为止，这种现象对“渐进式降低单条链路风险”来说仍然正常；但如果目标已经变成 **把 `OpenCodianView.ts` 实际降到可长期维护的规模，甚至继续逼近 500 行**，那么这已经说明当前策略不够了。

原因主要有三个：

1. **前六阶段主要在拆编排层，不是在搬运子系统所有权**
   - 所以即便 orchestration 被抽走，view 里仍保留大量真实 DOM、状态、事件与运行时逻辑
2. **当前最大体积不只是 `sendMessage()`，而是“多个子系统同时挂在一个 view 上”**
   - streaming、消息渲染、composer/context、question/todo/background-task、header/appearance、demo 都还同居在这个文件里
3. **继续按“小 helper / 小 orchestrator”推进，维护性会继续提升，但文件体积不会显著下降**
   - 这条路线适合稳妥拆热点，但不适合把 `OpenCodianView` 真正打成薄壳

### 仍然存在的核心问题

- `sendMessage()` 依然是 `OpenCodianView` 中最重的单体链路
- chunk router 仍然内联处理：
  - `message_start`
  - `usage`
  - `message_metadata`
  - `message_stop`
  - `file_edited`
  - `permission_request`
  - `question_request`
  - 通用 text / thinking / tool / error 转换
- 本地 stream shell finalization 与 assistant / notice message 构建仍留在 view 内
- pending indicator / progress logging payload 仍是 `sendMessage()` 内联的一部分
- 更重要的是：`OpenCodianView` 仍然同时拥有多个子系统的真实实现所有权，而不只是“流程装配权”

### 当前不应回退的原则

第七阶段继续做时，不要回退以下设计：

- 不要把 `MessageSendPreparationService` 的编排逻辑重新塞回 `OpenCodianView`
- 不要让 `MessageSendPreparationService` 重新实现 `MessageFinalizationService` 或 `ConversationRenderService` 已经负责的职责
- 不要为了“再降一些 warning”就贸然改动 stream chunk 语义
- 不要删除第六阶段新增测试来换速度
- 但也不要再把第七阶段限定成“只继续微创拆 `sendMessage()` 的一个更小 helper”

---

## 4. 第七阶段建议主轴

第六阶段之后，第七阶段不再建议继续沿着“一个函数里再抠一小块 helper”推进，而应该转向 **按子系统拆分 `OpenCodianView` 的真实所有权**。

换句话说，第七阶段的目标不再只是继续降低 `sendMessage()` 某一段的复杂度，而是开始把 `OpenCodianView` 从“超级控制器”改造成“薄装配层 / composition root”。

### 4.1 优先级 A：先定义并落下第一批子系统边界

这是第七阶段最推荐优先做的事。

建议先把 `OpenCodianView` 内部现有职责明确切成子系统，而不是继续只盯着一个函数。推荐的目标边界如下：

- `SendPipelineRuntime`
  - 负责 `sendMessage()`、stream loop、本地 stream finalization、post-sync finalization 装配
- `MessageListRuntime` 或 `MessageRendererRuntime`
  - 负责消息容器、assistant/user/notice 渲染、streaming shell DOM
- `ComposerRuntime`
  - 负责输入框、context items、send button、draft state、focus/selection 相关输入区逻辑
- `QuestionTodoRuntime`
  - 负责 question、todo、session status、background-task 相关路由与 UI
- `HeaderAppearanceRuntime`
  - 负责 header、toolbar、server badge、model/effort 控件、appearance 装配
- `ExperimentalRuntime`
  - 负责 liquid diamond / glass octahedron 等实验 demo，完全与主链路隔离
- `TabRuntimeStore`
  - 逐步收拢 tab 级 runtime state 的所有权与状态读写

这些名字不必一次性全部落地，但第七阶段至少应该挑 **一个高收益子系统** 真正搬走所有权，而不是只抽一个小 helper。

### 4.2 优先级 B：第一个子系统优先选 `SendPipelineRuntime`

如果第七阶段只做一个子系统，最推荐先做：

- `src/features/chat/runtime/SendPipelineRuntime.ts`

建议它拥有的职责不是一个 helper，而是一整段发送子系统：

- 调用 `MessageSendPreparationService`
- 驱动真实 stream 调用
- 承接 chunk router
- 承接本地 stream finalization
- 调用 `MessageFinalizationService`

此时 `OpenCodianView` 只保留：

- 创建 runtime host
- 从 UI 事件触发“开始发送”
- 少量 bridge 方法

这条路线比单独抽 `MessageStreamLocalFinalizationService` 风险更高，但它才真正对应“按子系统拆分”的目标。

### 4.3 优先级 C：若 `SendPipelineRuntime` 过大，则先做“子系统壳 + 内部分层”

如果直接把整条发送链一次搬走仍然过重，不要退回到“只抽一个小 helper”，而应该改成：

1. 先建 `SendPipelineRuntime`
2. 让它先拥有发送子系统的总入口与主状态
3. 再在它内部继续复用已有的：
   - `MessageSendPreparationService`
   - `MessageFinalizationService`
   - `ConversationRenderService`
4. 如有需要，再在 `SendPipelineRuntime` 内部继续拆：
   - `StreamChunkRouter`
   - `StreamLocalFinalizer`
   - `StreamProgressLogger`

这样做的关键差别是：

- **子系统所有权已经搬走**
- 即便内部仍有子模块，`OpenCodianView` 也已经不再是唯一承载者

### 4.4 优先级 D：同步改写目标，不再把“500 行”当第七阶段短期结果

第七阶段的短期目标应改成：

- 把 `OpenCodianView` 从“超级实现类”改成“薄装配层”
- 至少搬走一个完整子系统的 ownership
- 让后续阶段可以按子系统持续收缩，而不是继续围着单个巨型文件打补丁

不要把第七阶段成功标准写成：

- “把文件直接降到 500 行”

那会诱导出大爆炸重写。更现实的目标是：

- 先把 ownership 拆开
- 再把大文件逐步压缩到可持续下降的轨道上

### 4.5 第七阶段不要优先做的事

仍然不建议第七阶段前半程抢做：

- `main.ts` 大拆分
- `OpenCodeService.ts` 大拆分
- settings 大拆分
- 与当前切口无关的 warning 清理
- 主题 / provider icon / demo 体系扩张
- 继续只做一个“更小的 `sendMessage()` helper”就结束本轮

原因仍然一样：

- 会分散上下文
- 当前最重的维护压力其实已经升级成“多个子系统仍共用一个宿主文件”
- 第六阶段已经把 preparation / bootstrap 清出来，下一步最该顺势推进的是 ownership 拆分，而不是继续只抠局部 helper

---

## 5. 第七阶段建议任务顺序

建议按下面顺序推进。

### Task 1：先做子系统清单与 ownership 标注

完成标准：

- 在 `OpenCodianView` 里明确标出：
  - 哪些方法属于发送子系统
  - 哪些方法属于消息渲染子系统
  - 哪些方法属于 composer/context 子系统
  - 哪些方法属于 question/todo/background-task 子系统
  - 哪些方法属于 header/appearance/demos

### Task 2：先搬走一个完整子系统

完成标准：

- 至少落地一个新的 runtime / coordinator 模块
- `OpenCodianView` 对该子系统只保留 host / 装配 / bridge
- 不接受“只新建一个 helper 文件，但 ownership 仍留在 view 内”作为完成标准

### Task 3：优先给 `SendPipelineRuntime` 补测试锚点

优先只处理：

- 发送子系统入口测试
- 本地 finalization 分流测试
- post-sync 交接测试
- 如拆不完整条链，也至少把新 runtime 的外部可观察行为锁住

### Task 4：只消化与本轮拆分直接相关的 warning

优先只处理：

- 新 runtime / coordinator 的复杂度 / 参数数量 warning
- `OpenCodianView` 因 ownership 搬移而自然下降的局部 warning

不要试图一轮清理整个仓库 warning。

### Task 5：同步更新模块文档

至少更新：

- `docs/modules/features/chat/OpenCodianView.md`
- 新增对应的 runtime / coordinator 模块文档

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

## 6. 第七阶段实施约束

### 6.1 拆分方式

- 优先搬运子系统所有权，不只是提取局部 helper
- 先补测试，再拆实现
- 允许在单个子系统内部继续分层，但最外层 ownership 必须先搬走
- 尽量通过轻量 host / pure helper 协作，不要复制 view 状态

### 6.2 行为约束

不要破坏以下现有行为：

- 多 tab 并发 streaming / background-task 状态隔离
- 1 秒 pending indicator 与 5 分钟 timeout 保护
- optimistic user message 的先落地再开流语义
- 首条 user message 的 fallback title / AI title kickoff 时序
- pseudo-stream reveal 逻辑
- stream error notice / interrupted notice 的现有展示优先级
- 第一次本地 save 先于 `MessageFinalizationService` 接手的现有时序
- background-task indicator / turn diff notice / todo refresh 的现有时序
- tab runtime state 的现有隔离语义

### 6.3 范围约束

- 不要修改用户可见设置 schema
- 不要修改存储格式
- 不要修改 OpenCode 协议
- 不要动 `reference-projects/`
- 不要顺手处理与本轮拆分无关的 warning

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
2. 再读：
   - `src/features/chat/OpenCodianView.ts`
   - `src/features/chat/services/MessageSendPreparationService.ts`
   - `src/features/chat/services/MessageFinalizationService.ts`
   - `src/features/chat/services/ConversationRenderService.ts`
   - `tests/unit/features/chat/MessageSendPreparationService.test.ts`
   - `tests/unit/features/chat/MessageFinalizationService.test.ts`
3. 先给 `OpenCodianView` 做子系统 ownership 清单
4. 再优先提取一个完整子系统，首选 `SendPipelineRuntime`
5. 如还有余量，再在该子系统内部继续拆 chunk router / local finalization 子模块
6. 每完成一个切口就跑 lint + typecheck + test

一句话总结第七阶段：

> 沿着第二到第六阶段已经建立的 host + service + 测试边界，把 `OpenCodianView` 从“持续抽局部 orchestrator 的超级控制器”推进到“按子系统拆分 ownership 的薄装配层”，优先搬走完整发送子系统，而不是继续只抠 `sendMessage()` 的更小 helper。

### 可直接复制的新会话启动提示

如果要让新会话继续第七阶段，可以直接复制下面这段：

```text
请继续推进 OpenCodian 的可维护性优化第七阶段。

先阅读并严格遵循：
1. AGENTS.md
2. docs/status/maintainability-phase-1.md
3. docs/status/maintainability-phase-2.md
4. docs/status/maintainability-phase-3.md
5. docs/status/maintainability-phase-4.md
6. docs/status/maintainability-phase-5.md
7. docs/status/maintainability-phase-6.md

这次不要重复做前六阶段已经完成的内容；请基于现有改动继续优化。第七阶段仍然以“渐进式提取 + 同步补测试”为原则，但本轮不再建议只做一个更小的 helper；请优先按子系统拆分 ownership。

本轮优先目标：
- 继续拆分 src/features/chat/OpenCodianView.ts
- 优先按子系统拆分 OpenCodianView 的 ownership
- 首选搬走发送子系统，而不是继续只抽 sendMessage 的小块 helper

本轮请先：
- 阅读 docs/status/maintainability-phase-6.md 中列出的第七阶段方向与任务顺序
- 优先给 OpenCodianView 做子系统 ownership 清单，确认 send pipeline、消息渲染、composer/context、question/todo/background-task、header/appearance、demo 的边界
- 首选提取一个完整的发送子系统 runtime / coordinator，让 OpenCodianView 只保留 host / 装配 / bridge
- 先补即将改动路径的测试，再做提取
- 继续复用现有 service / helper，而不是把逻辑重新塞回 OpenCodianView
  - src/features/chat/services/MessageSendPreparationService.ts
  - src/features/chat/services/MessageFinalizationService.ts
  - src/features/chat/services/ConversationRenderService.ts
  - src/features/chat/services/ScrollManager.ts

明确约束：
- 不要回退现有 CI、lint 规则、ConversationViewStateService、ConversationRenderService、MessageFinalizationService、MessageSendPreparationService、model selector 子模块、sticky header cleanup 方案
- 不要修改用户可见设置 schema、存储格式、OpenCode 协议，除非确有必要且有证据
- 不要顺手处理无关 warning；只消化与你本轮拆分直接相关的 warning
- 不要动 reference-projects/
- 不要把“只再抽一个小 helper”当成第七阶段完成

建议执行顺序：
1. 先做 OpenCodianView 子系统 ownership 清单
2. 优先提取一个完整子系统，首选 SendPipelineRuntime
3. 如仍有余量，再在该子系统内部处理 local finalization / chunk router 的更小子模块
4. 更新对应 docs/modules 文档
5. 运行必要验证

验证要求：
- 至少运行 npm run lint、npm run typecheck、npm run test
- 只有在改到运行时代码 / 样式 / 构建链时，再运行 npm run build
- 如果运行了 npm run build，必须立即按 AGENTS.md 里的规则部署到 Test Vault 并验证 BUILD_ID

开始前先给出一个简短计划，然后直接实施。
```

# 可维护性改进：第五阶段总结与第六阶段实施说明

> **状态**: [ACTIVE]
> **适用范围**: 供后续会话/工程师继续推进可维护性优化时使用

这份文档承接 `docs/status/maintainability-phase-1.md`、`docs/status/maintainability-phase-2.md`、`docs/status/maintainability-phase-3.md` 与 `docs/status/maintainability-phase-4.md`。第一阶段解决的是“先立滚动与局部 UI 护栏”，第二阶段解决的是“拆 conversation/tab 装载编排”，第三阶段解决的是“拆 model selector 子模块”，第四阶段解决的是“拆消息区 rerender / tail patch / append-only sync 编排”，第五阶段解决的是“把 `sendMessage()` 末段的 post-stream finalization / post-sync orchestration 抽成独立 service”。本轮仍然坚持 **渐进式提取 + 同步补测试**，没有做一次性重写。

---

## 1. 第五阶段的目标与本轮边界

第四阶段留给第五阶段的主轴是：

1. 提取 `sendMessage()` 的 post-stream finalization / post-sync orchestration
2. 如有余量，再处理 send preflight 的更小 helper

本轮实际完成的范围只覆盖第一个方向，也就是 **`sendMessage()` 末段 finalization orchestration 的 service 化与最小测试补强**。send preflight 没有顺手继续拆，stream loop 也没有被整体重写。这是有意控制风险，而不是“拆不动”：

- finalization 已经是第四阶段之后最自然、收益最高的下一个切口
- 它与第四阶段 `ConversationRenderService` 的边界天然衔接，适合继续沿用 host + service 模式
- 如果第五阶段同时去深拆 preflight、chunk router 与本地 shell finalization，会再次把 server/model 检查、pending/timeout、stream 事件路由和 post-sync patch 风险叠在一起

换句话说，第五阶段不是追求“`sendMessage()` 一轮直接减半”，而是先把 **stream 结束后该不该 sync、sync 后该不该 patch/rerender、todo/save/attention 如何收尾** 这层编排从 `OpenCodianView` 里拿出来。

---

## 2. 第五阶段已完成内容

### 2.1 抽出 `MessageFinalizationService`

本轮新增：

- `src/features/chat/services/MessageFinalizationService.ts`

这个 service 当前负责：

- `shouldSyncAfterStream()`
- `finalizeAfterStream()`

其中：

- `shouldSyncAfterStream()` 作为纯 helper 导出，方便直接单测
- `finalizeAfterStream()` 只负责编排，不重新实现具体的 message render 或 stream chunk 消费

#### 已迁出的职责

- stream 完成后的 should-sync 判定
- 最终 `syncConversationMessagesFromServer()` 调用与结果分流
- visual fingerprint 对比
- foreground conversation/tab 下的 patch tail / full rerender 决策
- final sync 后的 background-task indicator 刷新
- turn diff notice 追加
- session todo refresh
- final save
- tab needs-attention / active-tab conversation / active-tab context usage 的最终收尾
- sync lock 的释放

#### 设计方式

本轮仍然没有让新 service 直接持有 view、plugin 或整套 DOM 运行时所有权，而是定义了：

- `MessageFinalizationHost`
- `FinalizeMessageOptions`
- `MessageFinalizationService`

service 通过 host 回调访问外部能力，例如：

- 当前 conversation / active tab 判定
- `syncConversationMessagesFromServer()`
- `getConversationVisualFingerprint()` / `getConversationSyncFingerprint()`
- `patchTrailingAssistantRender()` / `rerenderConversationMessages()`
- `renderBackgroundTaskIndicatorIfNeeded()` / `appendTurnDiffNoticeIfNeeded()`
- `refreshTabSessionTodos()` / `saveConversation()`
- sync lock、sync fingerprint、pending edited files、tab attention、active-tab context usage 更新
- debug log 与 assistant message 摘要

这个设计的价值在于：

- 第四阶段已经抽出的 `ConversationRenderService` 可以被第五阶段直接复用，而不是重写 patch/rerender 分流
- `OpenCodianView` 再次沿着一致的 host + service 边界收薄，而不是引入第二套不一致的抽象
- 后续继续拆 `sendMessage()` 前半段或 stream loop 时，可以继续沿用这个边界，而不需要把 finalization 重新塞回 view

### 2.2 `OpenCodianView` 的 `sendMessage()` 末段已收薄

本轮在 `OpenCodianView` 中新增：

- `messageFinalizationService` 字段
- `createMessageFinalizationHost()`

并完成了两处关键替换：

- 用 `shouldSyncAfterStream()` 取代内联 should-sync 条件判断
- 把 `if (sendingConversation) { ... }` 的大段 finalization 末段，收缩成一次 `messageFinalizationService.finalizeAfterStream(...)` 调用

#### 明确保留在 view 内的职责

本轮没有迁走，而是明确保留在 `OpenCodianView` 的内容包括：

- send preflight：server availability、model catalog / model availability 检查
- optimistic user message 本地 append / save / render
- 首条 user message 的 fallback title / AI title kickoff
- `StreamController` chunk 消费
- pending indicator、timeout、interruption 处理
- streaming shell 最终 DOM 收尾
- streamed content block 到本地 assistant / notice message 的构建
- 第一次本地 `saveConversation()`

这样做的收益是：

- `sendMessage()` 里最危险的一段“后处理编排层”已经先被拆出
- stream loop 本体、stream shell DOM、deep renderer 没有被一轮混在一起重构
- 现有时序——尤其是 “先置 sync lock，再 reset local streaming state”——得以保留

### 2.3 测试补强

本轮新增：

- `tests/unit/features/chat/MessageFinalizationService.test.ts`

新覆盖到的行为包括：

- `shouldSyncAfterStream()` 的 true / false 判定矩阵
- no-sync 分支下不触发 server sync / patch / rerender / turn diff
- sync 后 visual fingerprint 未变化时，不额外 patch / full rerender
- sync 后 visual fingerprint 变化时，优先 patch tail，失败再 fallback full rerender
- 用户切换到其他 tab / conversation 后，不做 foreground patch/rerender，而是打 needs-attention
- final save 抛错时，sync lock 仍然会释放

这些测试的价值不只是“补覆盖率”，而是让第五阶段之后的 finalization orchestration 首次拥有独立测试锚点，不再只能通过 `OpenCodianView` 的超大私有方法间接验证。

### 2.4 文档同步

本轮已更新：

- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`

本轮已新增：

- `docs/modules/features/chat/services/MessageFinalizationService.md`

模块文档中已经说明：

- `sendMessage()` 的 stream loop 仍保留在 view 中
- post-stream finalization / post-sync orchestration 已迁出
- `MessageFinalizationService` 与 `ConversationRenderService` 的职责边界是什么

### 2.5 验证结果

第五阶段本轮落地后，本地已验证通过：

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

并且已按仓库规则完成 Test Vault 部署与 `BUILD_ID` 校验：

- `main.202604111428`

---

## 3. 第五阶段后的当前状态判断

### 已经改善的点

- `sendMessage()` 末段的 final sync / post-sync patch-or-rerender / todo-save-attention 编排，不再全部内联在 `OpenCodianView` 中
- `ConversationRenderService` 与 `MessageFinalizationService` 已经形成明确的上下游关系：
  - `ConversationRenderService` 负责“怎么 patch / append / rerender”
  - `MessageFinalizationService` 负责“什么时候要 sync，sync 之后何时调用 render orchestration”
- 第二到第五阶段已经形成连续边界：
  - 第二阶段：`ConversationViewStateService`
  - 第三阶段：`ui/modelSelector/*`
  - 第四阶段：`ConversationRenderService`
  - 第五阶段：`MessageFinalizationService`

### 为什么 `OpenCodianView.ts` 和 `sendMessage()` 仍然很大——这依然正常

这仍然是正常现象，而且符合这轮渐进式拆分策略。

原因主要有三个：

1. **本轮只抽了 finalization orchestrator，没有重写 stream loop**
   - chunk router、pending indicator、timeout、question/permission 分支仍保留在 `sendMessage()`
2. **本轮没有继续动 send preflight / optimistic message bootstrap**
   - server/model availability 检查、标题生成启动、stream runtime 进入点仍在 view 内
3. **本轮优先追求边界清晰与行为可测，而不是行数立刻暴跌**
   - 现在阅读 `sendMessage()` 末段时，已经不必再穿过大段 sync / patch / save / attention 分流

### 仍然存在的核心问题

- `sendMessage()` 依然是 `OpenCodianView` 中最重的单体链路
- send preflight / optimistic bootstrap 仍然集中在 `sendMessage()` 前半段
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

### 当前不应回退的原则

第六阶段继续做时，不要回退以下设计：

- 不要把 `MessageFinalizationService` 的编排逻辑重新塞回 `OpenCodianView`
- 不要让 `MessageFinalizationService` 重新实现 `ConversationRenderService` 已经负责的 patch/rerender 逻辑
- 不要为了“再降一些 warning”就贸然改动 stream chunk 语义
- 不要删除第五阶段新增测试来换速度

---

## 4. 第六阶段建议主轴

第五阶段之后，下一块最值得顺势推进的区域，已经从“finalization 末段”转移到 **`sendMessage()` 的 send preflight / optimistic bootstrap orchestration**。

### 4.1 优先级 A：提取 send preflight / bootstrap orchestration

这是第六阶段最推荐优先做的事。

建议优先聚焦 `sendMessage()` 前半段里这些逻辑：

- 当前 conversation / active tab / runtime 的前置校验
- foreground busy 判定
- server availability 检查与 `ensureServerReadyForChat()` 分流
- model catalog 懒加载与 selected model availability 判定
- optimistic user message 的本地 append / save / render
- 首条 user message 的 fallback title 与 AI title kickoff
- stream runtime 进入前的状态切换：
  - `isStreaming`
  - context usage stream begin
  - pending edited files 清理
  - draft context items 清理

建议模块方向：

- `src/features/chat/services/MessageSendPreparationService.ts`

建议设计方式：

- 继续沿用轻量 host 接口，而不是让新 service 直接拥有 view/plugin
- 新 service 只负责编排与判定：
  - 能不能开始发送
  - 发送前需要做哪些状态变更
  - optimistic user message 是否已经落地
- 明确保留在 view 内的内容：
  - 真正的 stream 调用
  - `StreamController` chunk 消费
  - pending indicator / timeout / interruption
  - streaming shell / assistant placeholder DOM
  - 本地 stream shell finalization

这样可以继续拆掉 `sendMessage()` 的前半段重逻辑，但不需要提前进入高风险的 chunk router 重写。

### 4.2 优先级 B：先补 preparation 路径的最小测试

在真正提取前，建议先补这些行为测试：

- server 不可用且 `ensureServerReadyForChat()` 失败时，发送被中止，不追加 optimistic user message
- model 不可用时，仍走现有 model-unavailable notice 路径，不启动 stream
- 首条 user message 时，fallback title 与 AI title kickoff 时序保持不变
- 正常发送前，optimistic user message 会先写入 conversation 并渲染，再进入 stream
- 进入 stream 前，draft context items / pending edited files / streaming flag 的时序保持不变

如果测试颗粒度需要更小，优先先锁：

- can-send / can-not-send 判定
- optimistic user message append/save/render 顺序
- first-message title kickoff 条件

### 4.3 优先级 C：如仍有余量，再处理本地 shell finalization 的更小 helper

如果第六阶段前半段完成后还有余量，可以继续考虑一个更小的后续切口：

- 提取 streamed content blocks -> 本地 `ChatMessage` / notice 的组装 helper
- 或提取 pending indicator / progress logging payload helper

但不要在第六阶段前半段就贸然做：

- 整体重写 `sendMessage()` chunk router
- 直接把 `for await` stream loop 抽成巨型 service
- 顺手打散 assistant deep renderer
- 顺手重构 `OpenCodeService` 的 streaming 语义

### 4.4 第六阶段不要优先做的事

仍然不建议第六阶段前半程抢做：

- `main.ts` 大拆分
- `OpenCodeService.ts` 大拆分
- settings 大拆分
- 与当前切口无关的 warning 清理
- 主题 / provider icon / demo 体系扩张

原因仍然一样：

- 会分散上下文
- 当前最重的维护压力仍然集中在 `sendMessage()` 的前半段与 stream loop
- 第五阶段已经把 finalization 清出来，最该顺势推进的是 preparation / bootstrap，而不是跳去别的巨型文件

---

## 5. 第六阶段建议任务顺序

建议按下面顺序推进。

### Task 1：先补 preparation 路径的最小测试

完成标准：

- 至少把 can-send / optimistic message append / first-message title kickoff 三条核心路径锁住

### Task 2：提取 `MessageSendPreparationService`

完成标准：

- `sendMessage()` 前半段的 preflight / bootstrap 至少有一部分变成薄包装器
- 新 service 不直接消费 stream chunk，也不接管 finalization

### Task 3：只消化与本轮拆分直接相关的 warning

优先只处理：

- 新 service 的复杂度 / 参数数量 warning
- `OpenCodianView` 因 preparation 抽离而自然下降的局部 warning

不要试图一轮清理整个仓库 warning。

### Task 4：同步更新模块文档

至少更新：

- `docs/modules/features/chat/OpenCodianView.md`
- 新增 `docs/modules/features/chat/services/MessageSendPreparationService.md`

### Task 5：运行必要验证

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

## 6. 第六阶段实施约束

### 6.1 拆分方式

- 只做“提取 + 收薄调用方”，不要顺手改发送语义
- 先补测试，再拆实现
- 优先提取 preparation / bootstrap orchestrator，不要先打散 chunk router
- 尽量通过轻量 host / pure helper 协作，不要复制 view 状态

### 6.2 行为约束

不要破坏以下现有行为：

- 多 tab 并发 streaming / background-task 状态隔离
- 1 秒 pending indicator 与 5 分钟 timeout 保护
- optimistic user message 的先落地再开流语义
- 首条 user message 的 fallback title / AI title kickoff 时序
- pseudo-stream reveal 逻辑
- background-task indicator / turn diff notice / todo refresh 的现有时序
- 真实错误消息优先于通用“no response”提示的错误展示优先级

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
2. 再读：
   - `src/features/chat/OpenCodianView.ts`
   - `src/features/chat/services/ConversationRenderService.ts`
   - `src/features/chat/services/MessageFinalizationService.ts`
   - `tests/unit/features/chat/ConversationRenderService.test.ts`
   - `tests/unit/features/chat/MessageFinalizationService.test.ts`
3. 先补 `sendMessage()` preparation / bootstrap 的下一批测试
4. 再提取 `MessageSendPreparationService`
5. 如还有余量，再考虑本地 shell finalization 的更小 helper
6. 每完成一个切口就跑 lint + typecheck + test

一句话总结第六阶段：

> 沿着第二到第五阶段已经建立的 host + service + 测试边界，把 `OpenCodianView` 中 `sendMessage()` 前半段真正拖累复杂度的另一大块——send preflight / optimistic bootstrap orchestration——抽成独立编排层，而不是急着重写 stream loop 或深层 renderer。

### 可直接复制的新会话启动提示

如果要让新会话继续第六阶段，可以直接复制下面这段：

```text
请继续推进 OpenCodian 的可维护性优化第六阶段。

先阅读并严格遵循：
1. AGENTS.md
2. docs/status/maintainability-phase-1.md
3. docs/status/maintainability-phase-2.md
4. docs/status/maintainability-phase-3.md
5. docs/status/maintainability-phase-4.md
6. docs/status/maintainability-phase-5.md

这次不要重复做前五阶段已经完成的内容；请基于现有改动继续优化。第六阶段仍然以“渐进式提取 + 同步补测试”为原则，不要做一次性重写。

本轮优先目标：
- 继续拆分 src/features/chat/OpenCodianView.ts
- 优先提取 sendMessage 的 send preflight / optimistic bootstrap orchestration
- 如仍有余量，再考虑本地 shell finalization 的更小 helper

本轮请先：
- 阅读 docs/status/maintainability-phase-5.md 中列出的第六阶段方向与任务顺序
- 优先关注 sendMessage() 前半段里 server/model availability、optimistic user message、本地 save/render、title kickoff、stream runtime enter 的编排
- 先补即将改动路径的测试，再做提取
- 继续复用现有 service / helper，而不是把逻辑重新塞回 OpenCodianView
  - src/features/chat/services/ConversationViewStateService.ts
  - src/features/chat/services/ConversationRenderService.ts
  - src/features/chat/services/MessageFinalizationService.ts
  - src/features/chat/services/ScrollManager.ts

明确约束：
- 不要回退现有 CI、lint 规则、ConversationViewStateService、ConversationRenderService、MessageFinalizationService、model selector 子模块、sticky header cleanup 方案
- 不要修改用户可见设置 schema、存储格式、OpenCode 协议，除非确有必要且有证据
- 不要顺手处理无关 warning；只消化与你本轮拆分直接相关的 warning
- 不要动 reference-projects/

建议执行顺序：
1. 确认并补充 sendMessage preparation 的下一批测试
2. 提取 MessageSendPreparationService
3. 如仍有余量，再处理本地 shell finalization 的更小 helper
4. 更新对应 docs/modules 文档
5. 运行必要验证

验证要求：
- 至少运行 npm run lint、npm run typecheck、npm run test
- 只有在改到运行时代码 / 样式 / 构建链时，再运行 npm run build
- 如果运行了 npm run build，必须立即按 AGENTS.md 里的规则部署到 Test Vault 并验证 BUILD_ID

开始前先给出一个简短计划，然后直接实施。
```

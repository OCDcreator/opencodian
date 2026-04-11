# 可维护性改进：第四阶段总结与第五阶段实施说明

> **状态**: [ACTIVE]
> **适用范围**: 供后续会话/工程师继续推进可维护性优化时使用

这份文档承接 `docs/status/maintainability-phase-1.md`、`docs/status/maintainability-phase-2.md` 与 `docs/status/maintainability-phase-3.md`。第一阶段解决的是“先立滚动与局部 UI 护栏”，第二阶段解决的是“拆 conversation/tab 装载编排”，第三阶段解决的是“拆 model selector 子模块”，第四阶段解决的是“把消息区 rerender / tail patch / append-only sync 编排抽成独立 service”。本轮仍然坚持 **渐进式提取 + 同步补测试**，没有做一次性重写。

---

## 1. 第四阶段的目标与本轮边界

第三阶段留给第四阶段的两个方向是：

1. 提取 conversation render orchestration
2. 如有余量，再处理 assistant tail patch 的更小 helper

本轮实际完成的范围只覆盖第一个方向，也就是 **conversation render orchestration 的 service 化与最小测试补强**。assistant tail patch 没有继续单独拆成更细 helper，`sendMessage()` 也没有顺手重写。这是有意控制范围，而不是“拆不下去”：

- conversation render orchestration 已经是第三阶段之后最自然、收益最高的下一个切口
- 它与第二阶段的 `ConversationViewStateService` 抽离模式天然对齐，适合继续沿用 host + service 边界
- 如果第四阶段同时去深拆 assistant renderer 或 `sendMessage()`，会把 pseudo-stream reveal、post-sync tail patch、background-task indicator 时序、stream finalization 等风险再次叠在一起

换句话说，第四阶段不是要“彻底打散消息区所有逻辑”，而是先把 **何时 full rerender、何时 patch 尾部、何时仅 append** 这一层编排逻辑从 `OpenCodianView` 中拿出来。

---

## 2. 第四阶段已完成内容

### 2.1 抽出 `ConversationRenderService`

本轮新增：

- `src/features/chat/services/ConversationRenderService.ts`

这个 service 当前负责：

- `rerenderConversationMessages()`
- `applySyncedConversationUpdate()`
- `patchTrailingAssistantRender()`
- `getIncrementalRenderedMessageUpdate()`

其中：

- `getIncrementalRenderedMessageUpdate()` 作为纯 helper 导出，方便直接单测
- `patchTrailingAssistantRender()` 保持在 service 内部实现，不再额外拆成新的 helper 文件

#### 已迁出的职责

- full rerender 前的前置检查：
  - 当前 conversation 是否仍匹配
  - 当前 tab / messages container 是否仍有效
- rerender 编排：
  - 进入 hydration
  - 采集 scroll snapshot
  - 清空消息区与 turn state
  - 重绘消息与 background-task indicator
  - 恢复 scroll
  - 刷新 pane metrics 与 composer layout
- synced message 增量判断：
  - rendered message 数量减少时直接回退 full rerender
  - 非尾部 visual signature 改变时拒绝 patch / append-only
  - 只在尾部 assistant 变化时允许 patch
  - append-only 时只追加新的 rendered message
- 尾部 assistant patch：
  - 仅 metadata 变化时复用已有正文，只更新 timestamp row
  - 正文变化时复用现有 DOM 容器，重渲内容区
  - 缺失尾部 DOM / content 节点时立即失败并回退

#### 设计方式

这次仍然没有让新 service 直接持有 view、plugin 或 DOM 运行时所有权，而是定义了：

- `ConversationRenderHost`
- `ConversationRenderRuntimeState`
- `IncrementalRenderedMessageUpdate`
- `ConversationRenderService`

service 通过 host 回调访问外部能力，例如：

- 当前 conversation / active tab / messages container
- scroll runtime / render runtime
- `renderMessages()` / `renderMessage()` / pseudo-stream reveal
- `renderAssistantMessageContent()` / timestamp 更新
- background-task state 同步
- debug log 与消息摘要

这个设计的价值在于：

- 抽出了最密集的一段消息区编排逻辑，但没有把真实 renderer、markdown、tool renderer 和 tab runtime 一起塞进新的“第二个巨型 view”
- 第二阶段和第四阶段已经形成一致模式：都通过 host + service 边界收薄 `OpenCodianView`
- 后续继续拆 `sendMessage()` 时，可以直接复用现有 render orchestration，而不是重新发明 patch / rerender 分流逻辑

### 2.2 `OpenCodianView` 相关方法已收薄

本轮在 `OpenCodianView` 中新增：

- `createConversationRenderHost()`
- `conversationRenderService` 字段

以下方法仍保留原名，但现在已经变成薄包装器：

- `rerenderConversationMessages()`
- `patchTrailingAssistantRender()`
- `applySyncedConversationUpdate()`
- `getIncrementalRenderedMessageUpdate()`

这样做的收益是：

- 原有调用点不需要大范围改名或重布线
- `sendMessage()` 收尾同步逻辑仍可复用旧方法名，但内部已切到新的 service
- `OpenCodianView` 对消息区重渲的关注点，开始从“实现细节”收缩到“装配与调用”

#### 明确保留在 view 内的职责

本轮没有迁走，而是明确保留在 `OpenCodianView` 的内容包括：

- `renderMessage()` / `renderMessages()` 的真实 DOM 渲染
- `renderAssistantMessageContent()` 的 markdown / thinking / tool / question 装配
- pseudo-stream reveal 的具体实现
- tab runtime state、streaming DOM、messages pane 的所有权
- `sendMessage()` 内的 stream loop、pending indicator、timeout、notice 处理

这样可以先抽“编排层”，而不是一下子把深层 renderer 与发送主链路一起撕开。

### 2.3 测试补强

本轮新增：

- `tests/unit/features/chat/ConversationRenderService.test.ts`

新覆盖到的行为包括：

- rendered messages 数量减少时，`getIncrementalRenderedMessageUpdate()` 返回 `null`
- 非尾部 signature 改变时，`getIncrementalRenderedMessageUpdate()` 返回 `null`
- append-only sync 时只追加新增 rendered message，不触发 full rerender
- 尾部 assistant metadata 变化时，优先 patch 现有节点而不是整段重渲
- 尾部 assistant patch 失败时，回退 full rerender
- append 的纯文本 assistant synced message 继续走 pseudo-stream reveal
- full rerender 时仍保留 hydration / scroll restore / background-task indicator / layout sync 时序

这些测试的价值不只是“补覆盖率”，而是让第四阶段之后的消息区编排首次拥有独立测试锚点，不再只能依赖 `OpenCodianView` 的超大私有方法间接验证。

### 2.4 文档同步

本轮已更新：

- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`

本轮已新增：

- `docs/modules/features/chat/services/ConversationRenderService.md`

模块文档中已经说明：

- 消息区 rerender / patch / append-only 编排已迁出
- `ConversationRenderService` 与 `OpenCodianView` 的边界是什么
- 哪些内容仍必须保留在 view 中

### 2.5 验证结果

第四阶段本轮落地后，本地已验证通过：

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

并且已按仓库规则完成 Test Vault 部署与 `BUILD_ID` 校验：

- `main.202604111348`

---

## 3. 第四阶段后的当前状态判断

### 已经改善的点

- 消息区 rerender / tail patch / append-only sync 不再全部内联在 `OpenCodianView` 中
- conversation render orchestration 首次拥有独立、可单测的 service 边界
- 第二、三、四阶段已经形成连续边界：
  - 第二阶段：`ConversationViewStateService`
  - 第三阶段：`ui/modelSelector/*`
  - 第四阶段：`ConversationRenderService`
- `sendMessage()` 收尾同步可以直接复用新 service，而不是继续复制 patch / rerender 判定逻辑

### 为什么 `OpenCodianView.ts` 仍然很大——这依然正常

这仍然是正常现象，而且符合这轮渐进式拆分策略。

原因主要有三个：

1. **本轮只抽消息区编排层，没有重写深层 renderer**
   - 因此 assistant / user / notice 的真实 DOM 渲染仍保留在 view 中
2. **当前最大体积已经明显转向 `sendMessage()`、stream finalization、background-task / question / todo 路由**
   - 即便 render orchestration 抽离，主文件总体体积也不会立刻大幅下降
3. **本轮优先追求边界清晰与行为可测，而不是行数立刻暴跌**
   - 现在读消息区同步逻辑时，已经不必先穿过大段 hydration / patch / append-only 分流细节

### 仍然存在的核心问题

- `OpenCodianView.ts` 仍然极大，warning 仍然很多
- `sendMessage()` 及其 post-sync finalization 仍然是最重的单体链路
- assistant renderer 的深层内容装配仍然集中在 view 内
- `OpenCodeService.ts`、`OpenCodianSettings.ts`、`ModelConfigModal.ts` 仍然是后续大块债务

### 当前不应回退的原则

第五阶段继续做时，不要回退以下设计：

- 不要把 `ConversationRenderService` 的编排逻辑重新塞回 `OpenCodianView`
- 不要为了“进一步降行数”而贸然重写 pseudo-stream reveal
- 不要删除第四阶段新增测试来换速度
- 不要把 render orchestration 与 deep renderer、send pipeline 一口气重新混成一个新巨型 service

---

## 4. 第五阶段建议主轴

第五阶段建议仍然聚焦 `OpenCodianView`，但主轴应从“消息区同步编排”继续推进到 **`sendMessage()` 的 post-stream finalization / post-sync orchestration**。

### 4.1 优先级 A：提取 message finalization orchestration

这是第五阶段最推荐优先做的事。

建议优先聚焦 `sendMessage()` 末段里这些逻辑：

- stream 结束后的 should-sync 判定
- 最终 `syncConversationMessagesFromServer()` 调用与结果分流
- visual fingerprint 对比
- patch tail / full rerender 决策
- background-task indicator 刷新
- turn diff notice 追加
- session todo refresh
- final save

建议模块方向：

- `src/features/chat/services/MessageFinalizationService.ts`

建议设计方式：

- 继续沿用轻量 host 接口，而不是让新 service 直接拥有 view/plugin
- 新 service 只负责编排：
  - 何时需要最终服务端同步
  - 何时复用 `ConversationRenderService`
  - 何时刷新 todo / notice / save
  - 何时提前结束，不做多余同步
- 明确保留在 view 内的内容：
  - `StreamController` chunk 消费
  - pending indicator / timeout / interruption
  - 真正的 notice 渲染与消息创建
  - composer / context / selection / tab runtime 的真实状态读写

这样可以继续拆掉 `sendMessage()` 里最重的一大块“收尾 orchestrator”，而不是直接动 stream loop 本体。

### 4.2 优先级 B：先补 finalization 路径的最小测试

在真正提取前，建议先补这些行为测试：

- stream error / timeout / interrupted 时，不触发不该发生的最终 sync
- final sync 后 visual fingerprint 未变化时，不额外 rerender
- final sync 后 visual fingerprint 变化时，优先 patch tail，再 fallback full rerender
- finalization 结束后，todo refresh / final save / turn diff notice 的时序保持不变
- background-task indicator 仍在 final sync 之后刷新，而不是提前
- 已有真实错误消息时，不被通用“no response”路径覆盖

如果测试颗粒度需要更小，优先先锁：

- should-sync 判定
- post-sync patch / rerender 分流
- final save 前的 notice / todo 刷新顺序

### 4.3 优先级 C：如仍有余量，再处理 send preflight 的更小 helper

如果第五阶段前半段完成后还有余量，可以继续考虑一个更小的后续切口：

- 提取 server/model availability preflight helper
- 或提取 finalization log payload / fingerprint helper

但不要在第五阶段前半段就贸然做：

- 整体重写 `sendMessage()`
- 直接把 stream loop 抽成巨型 service
- 顺手打散 assistant deep renderer

这些都属于更高风险的下一层。

### 4.4 第五阶段不要优先做的事

仍然不建议第五阶段前半程抢做：

- `main.ts` 大拆分
- `OpenCodeService.ts` 大拆分
- settings 大拆分
- 与当前切口无关的 warning 清理
- 主题 / provider icon / demo 体系扩张

原因仍然一样：

- 会分散上下文
- 真正卡住 `OpenCodianView` 可维护性的下一块大头已经转移到 `sendMessage()` 收尾链路
- 第四阶段已经把 render orchestration 清出来，最该顺势推进的就是 finalization orchestration

---

## 5. 第五阶段建议任务顺序

建议按下面顺序推进。

### Task 1：先补 finalization 路径的最小测试

完成标准：

- 至少把 should-sync / post-sync patch-or-rerender / final save 三条核心路径锁住

### Task 2：提取 `MessageFinalizationService`

完成标准：

- `sendMessage()` 末段的 post-stream finalization 至少有一部分变成薄包装器
- 新 service 复用 `ConversationRenderService`，不重新实现 patch / append / rerender 分流

### Task 3：只消化与本轮拆分直接相关的 warning

优先只处理：

- 新 service 的复杂度 / 参数数量 warning
- `OpenCodianView` 因 finalization 抽离而自然下降的局部 warning

不要试图一轮清理整个仓库 warning。

### Task 4：同步更新模块文档

至少更新：

- `docs/modules/features/chat/OpenCodianView.md`
- 新增 `docs/modules/features/chat/services/MessageFinalizationService.md`

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

## 6. 第五阶段实施约束

### 6.1 拆分方式

- 只做“提取 + 收薄调用方”，不要顺手改发送语义
- 先补测试，再拆实现
- 优先提取 finalization orchestrator，不要先打散 stream loop 深层逻辑
- 尽量通过轻量 host / pure helper 协作，不要复制 view 状态

### 6.2 行为约束

不要破坏以下现有行为：

- 多 tab 并发 streaming / background-task 状态隔离
- 1 秒 pending indicator 与 5 分钟 timeout 保护
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
2. 再读：
   - `src/features/chat/OpenCodianView.ts`
   - `src/features/chat/services/ConversationViewStateService.ts`
   - `src/features/chat/services/ConversationRenderService.ts`
   - `tests/unit/features/chat/ConversationRenderService.test.ts`
3. 先补 `sendMessage()` finalization 的下一批测试
4. 再提取 `MessageFinalizationService`
5. 如还有余量，再考虑 send preflight 的更小 helper
6. 每完成一个切口就跑 lint + typecheck + test

一句话总结第五阶段：

> 沿着第二到第四阶段已经建立的 host + service + 测试边界，把 `OpenCodianView` 中下一块真正拖累复杂度的大头——`sendMessage()` 的 post-stream finalization / post-sync orchestration——抽成独立编排层，而不是急着重写 stream loop 或深层 renderer。

### 可直接复制的新会话启动提示

如果要让新会话继续第五阶段，可以直接复制下面这段：

```text
请继续推进 OpenCodian 的可维护性优化第五阶段。

先阅读并严格遵循：
1. AGENTS.md
2. docs/status/maintainability-phase-1.md
3. docs/status/maintainability-phase-2.md
4. docs/status/maintainability-phase-3.md
5. docs/status/maintainability-phase-4.md

这次不要重复做前四阶段已经完成的内容；请基于现有改动继续优化。第五阶段仍然以“渐进式提取 + 同步补测试”为原则，不要做一次性重写。

本轮优先目标：
- 继续拆分 src/features/chat/OpenCodianView.ts
- 优先提取 sendMessage 的 post-stream finalization / post-sync orchestration
- 如仍有余量，再考虑 send preflight 的更小 helper

本轮请先：
- 阅读 docs/status/maintainability-phase-4.md 中列出的第五阶段方向与任务顺序
- 优先关注 sendMessage() 末段里最终 sync、patch / rerender 分流、todo refresh、turn diff notice、final save 的编排
- 先补即将改动路径的测试，再做提取
- 继续复用现有 service / helper，而不是把逻辑重新塞回 OpenCodianView
  - src/features/chat/services/ConversationViewStateService.ts
  - src/features/chat/services/ConversationRenderService.ts
  - src/features/chat/services/ScrollManager.ts
  - src/features/chat/ui/modelSelector/*

明确约束：
- 不要回退现有 CI、lint 规则、ConversationViewStateService、ConversationRenderService、model selector 子模块、sticky header cleanup 方案
- 不要修改用户可见设置 schema、存储格式、OpenCode 协议，除非确有必要且有证据
- 不要顺手处理无关 warning；只消化与你本轮拆分直接相关的 warning
- 不要动 reference-projects/

建议执行顺序：
1. 确认并补充 sendMessage finalization 的下一批测试
2. 提取 MessageFinalizationService
3. 如仍有余量，再处理 send preflight 的更小 helper
4. 更新对应 docs/modules 文档
5. 运行必要验证

验证要求：
- 至少运行 npm run lint、npm run typecheck、npm run test
- 只有在改到运行时代码 / 样式 / 构建链时，再运行 npm run build
- 如果运行了 npm run build，必须立即按 AGENTS.md 里的规则部署到 Test Vault 并验证 BUILD_ID

开始前先给出一个简短计划，然后直接实施。
```

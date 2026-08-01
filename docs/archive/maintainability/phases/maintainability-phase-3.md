# 可维护性改进：第三阶段总结与第四阶段实施说明

> **状态**: [ACTIVE]
> **适用范围**: 供后续会话/工程师继续推进可维护性优化时使用

这份文档承接 `docs/status/maintainability-phase-1.md` 与 `docs/status/maintainability-phase-2.md`。第一阶段解决的是“先立护栏”，第二阶段解决的是“沿着护栏拆主装载链路”，第三阶段解决的是“继续把 `OpenCodianView` 里的高密度 model selector UI 逻辑抽成稳定子模块”。本轮仍然坚持 **渐进式提取 + 同步补测试**，没有做一次性重写。

---

## 1. 第三阶段的目标与本轮边界

第二阶段留给第三阶段的两个主要方向是：

1. 提取 model selector 逻辑
2. 提取消息区重渲编排

本轮实际完成的范围只覆盖第一个方向，也就是 **model selector 渲染/交互/trigger 展示推导**。消息区重渲编排明确顺延到第四阶段。这样安排是有意为之，不是“拆不动”：

- model selector 已经是第二阶段之后最自然、风险最低的下一个切口
- 它与第一阶段的 `modelSelectorStickyHeaders` helper、第二阶段的“先补测试再提取”节奏天然对齐
- 如果第三阶段同时硬拆 conversation render orchestration，会把 tab hydration、pseudo-stream reveal、tail patch、background-task inline render 等多种风险叠在一起

换句话说，第三阶段不是追求“`OpenCodianView.ts` 行数立刻大降”，而是先把一块边界相对清晰、却长期占据 view 认知负担的 toolbar UI 子系统稳稳抽出来。

---

## 2. 第三阶段已完成内容

### 2.1 抽出 model selector 子模块

本轮新增：

- `src/features/chat/ui/modelSelector/types.ts`
- `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts`
- `src/features/chat/ui/modelSelector/ModelSelectorInteractions.ts`
- `src/features/chat/ui/modelSelector/ModelSelectorDisplay.ts`

#### 已迁出的职责

`ModelSelectorRenderer.ts` 负责：

- loading / empty state
- provider 分组和 option DOM 构建
- selected / highlighted class 应用
- click / hover 回调接线
- 每次重渲前的 sticky-header cleanup 与重绑

`ModelSelectorInteractions.ts` 负责：

- `provider::model` option value 组装与解析
- 键盘导航高亮
- 按值高亮某一项
- 选中当前高亮项
- 将当前模型滚动到可见区域

`ModelSelectorDisplay.ts` 负责：

- trigger 文本推导
- trigger title 推导
- icon label 推导
- `is-unavailable` / `is-unconfigured` 布尔状态推导

`types.ts` 负责：

- provider / model / selection / known-model-info 等共享类型
- 统一替代 `OpenCodianView` 里原本分散的匿名结构

#### 明确保留在 view 内的职责

本轮没有把以下职责一起迁走，而是有意保留在 `OpenCodianView`：

- dropdown / trigger / search input 的真实 DOM 容器
- catalog loading：`reloadModelCatalog()` / `loadAvailableModels()`
- 当前 session model 解析：`getCurrentSessionModel()` / `getCurrentSessionModelResolution()`
- provider icon 的异步解析与并发请求保护：`updateModelSelectorIcon()`
- model override 写入与副作用：`switchModel()` / `syncActiveTabContextUsageIdentity()`

这样做的价值在于：

- 没有为了“多挪几行”而把 catalog / icon / settings / tabManager 的业务耦合一起打包进新模块
- model selector 子模块仍然是轻量 helper，而不是新的“第二个大 view”
- 为第四阶段继续拆 conversation render orchestration 保留了干净的重心

### 2.2 `OpenCodianView` 中相关方法已收薄

以下方法仍保留原名，但已变成薄包装器或轻量装配入口：

- `renderModelList()`
- `navigateModelList()`
- `highlightModelOption()`
- `selectHighlightedModel()`
- `scrollToCurrentModel()`
- `updateModelSelectorDisplay()`

这次收薄后的特点是：

- view 只装配输入状态、回调和文本
- 列表 DOM 构建不再直接写在 view 内
- 键盘/高亮交互不再直接由 view 手写 DOM 查询细节
- trigger display state 与 DOM 应用解耦，先计算再写入

### 2.3 测试补强

本轮新增：

- `tests/unit/features/chat/modelSelectorRenderer.test.ts`
- `tests/unit/features/chat/modelSelectorInteractions.test.ts`
- `tests/unit/features/chat/modelSelectorDisplay.test.ts`

新覆盖到的行为包括：

- loading state、空 catalog empty state、过滤无结果 empty state
- provider 分组渲染、selected option 标记、hover / click 回调
- sticky-header cleanup 在列表重渲前先释放、重渲后重新绑定
- ArrowUp / ArrowDown 高亮移动和边界夹紧
- `highlightModelOption()` 只保留一个高亮项
- `selectHighlightedModel()` 能正确解析 `provider::model`
- `scrollToCurrentModel()` 在当前模型存在/不存在时的行为
- trigger 在以下状态的展示推导：
  - unconfigured
  - 可用模型优先显示 metadata 名称
  - unavailable 模型仍保留 metadata/title
  - empty catalog 时回退到空 catalog tooltip

这些测试的价值在于：第三阶段之后，model selector 的行为已经不再只能通过超大 view 间接验证。

### 2.4 文档同步

本轮已更新：

- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`

本轮已新增：

- `docs/modules/features/chat/ui/modelSelector/ModelSelectorRenderer.md`
- `docs/modules/features/chat/ui/modelSelector/ModelSelectorInteractions.md`
- `docs/modules/features/chat/ui/modelSelector/ModelSelectorDisplay.md`
- `docs/modules/features/chat/ui/modelSelector/types.md`

模块文档中已经说明：

- model selector 已拆成 renderer / interactions / display / types 四层
- sticky header 继续沿用独立 helper
- 哪些职责仍必须保留在 `OpenCodianView` 中

### 2.5 验证结果

第三阶段本轮落地后，本地已验证通过：

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

并且已按仓库规则完成 Test Vault 部署与 `BUILD_ID` 校验：

- `main.202604111323`

---

## 3. 第三阶段后的当前状态判断

### 已经改善的点

- model selector 的列表渲染、键盘交互和 trigger display state 已经不再全部挤在 `OpenCodianView` 内
- model selector 首次拥有独立、可单测的子模块边界
- 第三阶段之后，`OpenCodianView` 至少少了一整块 toolbar UI 的细节噪音，后续读主聊天链路时更容易聚焦消息、同步与 streaming
- 第一、二、三阶段已经形成连续边界：
  - 第一阶段：`ScrollManager`、`modelSelectorStickyHeaders`
  - 第二阶段：`ConversationViewStateService`
  - 第三阶段：`modelSelector/*`

### 为什么 `OpenCodianView.ts` 行数没有明显下降——这是正常现象

这是正常现象，而且符合这轮重构策略。

原因主要有三个：

1. **本轮故意只抽 UI helper，不抽 catalog / icon / tab override 业务**
   - 这样能降低回归风险，但也意味着 view 里仍然保留大量 orchestrator 代码
2. **`OpenCodianView` 当前最大体积并不在 model selector，而在消息发送、同步、增量重渲、background-task、question/todo 路由**
   - 所以即便 model selector 抽干净，文件总体体积也不会立刻出现“大跳水”
3. **本轮更重视“责任密度下降”和“可测试边界增加”，而不是纯行数指标**
   - 现在读 model selector 时，不再需要先跳过几十行 DOM 拼装和高亮交互细节

所以第三阶段的收益更像是：

- 降低局部认知密度
- 给下一阶段拆更大的 render orchestration 打通路径
- 把一块可反复回归的 UI 行为做成独立测试锚点

而不是一次性让 `OpenCodianView.ts` 从一万多行立刻掉到几千行。

### 仍然存在的核心问题

- `OpenCodianView.ts` 仍然极大，warning 仍然很多
- conversation rerender / patch tail / incremental sync / pseudo-stream reveal 仍然集中在 view 内
- `sendMessage()` 及其收尾同步逻辑仍然非常重
- `OpenCodeService.ts`、`OpenCodianSettings.ts`、`ModelConfigModal.ts` 仍然是后续大块债务

### 当前不应回退的原则

第四阶段继续做时，不要回退以下设计：

- 不要把 model selector 的渲染/交互细节塞回 `OpenCodianView`
- 不要把 `modelSelectorStickyHeaders` 重新退回 DOM 私有状态写法
- 不要为了“让文件行数好看一点”而把 catalog / icon / tab override 一股脑丢进新的巨型模块
- 不要删除第三阶段新增测试来换速度

---

## 4. 第四阶段建议主轴

第四阶段建议仍然聚焦 `OpenCodianView`，但主轴应从 toolbar UI 转向 **conversation render orchestration**。

### 4.1 优先级 A：提取 conversation render orchestration

这是第四阶段最推荐优先做的事。

建议聚焦：

- `rerenderConversationMessages()`
- `patchTrailingAssistantRender()`
- `applySyncedConversationUpdate()`
- `getIncrementalRenderedMessageUpdate()`

建议模块方向：

- `src/features/chat/services/ConversationRenderService.ts`

建议设计方式：

- 新建轻量 host 接口，例如：
  - 当前 conversation / active tab / runtime 访问
  - `renderMessages()` / `renderMessage()` / `renderBackgroundTaskIndicatorIfNeeded()`
  - scroll snapshot / restore / `scrollToBottom()`
  - `renderAssistantMessageContent()` 等需要的渲染 callback
- service 只负责编排：
  - 何时整段重渲
  - 何时 patch tail
  - 何时只追加 render message
  - 何时 fallback 到 full rerender

建议保留在 view 内的内容：

- `renderMessage()` 及 user / assistant / notice 的真实 DOM 渲染
- markdown / streaming renderer / tool renderer 的真实装配
- tab runtime state 的 DOM 引用与细节更新

这样可以先把“增量更新编排层”抽出去，而不是一口气重写 assistant 渲染器。

### 4.2 优先级 B：先补 render orchestration 的最小测试

在真正提取前，建议先补测试锁住这些行为：

- rendered message count 不匹配时回退 full rerender
- 只有 tail assistant 变化时优先 patch，而不是整段重渲
- 非 tail message visual signature 变化时拒绝 patch
- append-only 增量消息时只追加，不重跑 full rerender
- pseudo-stream reveal 的 assistant sync path 仍然生效
- rerender 时继续保留 hydration / scroll restore / background-task indicator 时序

如果测试颗粒度需要更小，优先先锁：

- `getIncrementalRenderedMessageUpdate()`
- `patchTrailingAssistantRender()` 的跳过/成功条件

### 4.3 优先级 C：如仍有余量，再处理 assistant render 子切口

如果第四阶段前半段完成后还有余量，可以继续考虑一个更小的后续切口：

- 提取 assistant tail patch 所需的最小 DOM 更新 helper

但不要在第四阶段前半段就贸然做：

- 整体重写 `renderAssistantMessageContent()`
- 把 `renderMessage()` 全量拆散
- 顺带重构 `sendMessage()`

这些都属于更高风险的下一层。

### 4.4 第四阶段不要优先做的事

仍然不建议第四阶段前半程抢做：

- `main.ts` 大拆分
- `OpenCodeService.ts` 大拆分
- settings 大拆分
- 与当前切口无关的 warning 清理
- 样式体系、主题体系或 provider icon 体系扩张

原因仍然一样：

- 这些会分散上下文
- 真正卡住 `OpenCodianView` 可维护性的下一块大头是消息区重渲编排
- 第三阶段已经把 toolbar UI 清掉一块，最该顺势推进的就是 render orchestration

---

## 5. 第四阶段建议任务顺序

建议按下面顺序推进。

### Task 1：先补 conversation render orchestration 的最小测试

完成标准：

- 至少把 tail patch / append-only / fallback rerender 三条核心路径锁住

### Task 2：提取 `ConversationRenderService`

完成标准：

- `rerenderConversationMessages()`、`patchTrailingAssistantRender()`、`applySyncedConversationUpdate()` 至少有一部分变成薄包装器
- 新 service 通过 host / callback 协作，不直接接管整个 view

### Task 3：只消化与本轮拆分直接相关的 warning

优先只处理：

- 新 service 的复杂度 / 参数数量 warning
- `OpenCodianView` 因 render orchestration 抽离而自然下降的局部 warning

不要试图一轮清理整个仓库 warning。

### Task 4：同步更新模块文档

至少更新：

- `docs/modules/features/chat/OpenCodianView.md`
- 新增 `docs/modules/features/chat/services/ConversationRenderService.md`

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

## 6. 第四阶段实施约束

### 6.1 拆分方式

- 只做“提取 + 收薄调用方”，不要顺手改渲染语义
- 先补测试，再拆实现
- 优先提取“编排层”，不要先打散深层 assistant renderer
- 尽量通过轻量 host / pure helper 协作，不要复制 view 状态

### 6.2 行为约束

不要破坏以下现有行为：

- 多 tab 并发 streaming / background-task 状态隔离
- hydration 期间的 scroll restore 语义
- pseudo-stream reveal 逻辑
- background-task indicator 与 authoritative sync 的时序
- `session.status` 与 message-layer sync signal 的分层

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
2. 再读：
   - `src/features/chat/OpenCodianView.ts`
   - `src/features/chat/services/ConversationViewStateService.ts`
   - `src/features/chat/ui/modelSelector/`
   - `tests/unit/features/chat/modelSelectorRenderer.test.ts`
   - `tests/unit/features/chat/modelSelectorInteractions.test.ts`
   - `tests/unit/features/chat/modelSelectorDisplay.test.ts`
3. 先补 conversation render orchestration 的下一批测试
4. 再提取 `ConversationRenderService`
5. 如还有余量，再考虑 assistant tail patch 的更小 helper
6. 每完成一个切口就跑 lint + typecheck + test

一句话总结第四阶段：

> 沿着前三阶段已经建立的 helper / service / 测试边界，把 `OpenCodianView` 中下一块真正影响体量和复杂度的大头——conversation render orchestration——抽成独立编排层，而不是急着重写深层 renderer。

### 可直接复制的新会话启动提示

如果要让新会话继续第四阶段，可以直接复制下面这段：

```text
请继续推进 OpenCodian 的可维护性优化第四阶段。

先阅读并严格遵循：
1. AGENTS.md
2. docs/status/maintainability-phase-1.md
3. docs/status/maintainability-phase-2.md
4. docs/status/maintainability-phase-3.md

这次不要重复做前三阶段已经完成的内容；请基于现有改动继续优化。第四阶段仍然以“渐进式提取 + 同步补测试”为原则，不要做一次性重写。

本轮优先目标：
- 继续拆分 src/features/chat/OpenCodianView.ts
- 优先提取 conversation render orchestration
- 如仍有余量，再考虑 assistant tail patch 的更小 helper

本轮请先：
- 阅读 docs/status/maintainability-phase-3.md 中列出的第四阶段方向与任务顺序
- 优先关注 OpenCodianView 的 `rerenderConversationMessages()`、`patchTrailingAssistantRender()`、`applySyncedConversationUpdate()`、`getIncrementalRenderedMessageUpdate()`
- 先补即将改动路径的测试，再做提取
- 继续复用前三阶段已经抽出的 helper / service，而不是把逻辑重新塞回 OpenCodianView
  - src/features/chat/services/ScrollManager.ts
  - src/features/chat/services/ConversationViewStateService.ts
  - src/features/chat/ui/modelSelector/*
  - src/features/chat/ui/modelSelectorStickyHeaders.ts

明确约束：
- 不要回退现有 CI、lint 规则、ScrollManager、ConversationViewStateService、model selector 子模块、sticky header cleanup 方案
- 不要修改用户可见设置 schema、存储格式、OpenCode 协议，除非确有必要且有证据
- 不要顺手处理无关 warning；只消化与你本轮拆分直接相关的 warning
- 不要动 reference-projects/

建议执行顺序：
1. 确认并补充 conversation render orchestration 的下一批测试
2. 提取 ConversationRenderService
3. 如仍有余量，再处理 assistant tail patch 的更小 helper
4. 更新对应 docs/modules 文档
5. 运行必要验证

验证要求：
- 至少运行 npm run lint、npm run typecheck、npm run test
- 只有在改到运行时代码 / 样式 / 构建链时，再运行 npm run build
- 如果运行了 npm run build，必须立即按 AGENTS.md 里的规则部署到 Test Vault 并验证 BUILD_ID

开始前先给出一个简短计划，然后直接实施。
```

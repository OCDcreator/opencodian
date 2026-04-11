# 可维护性改进：第二阶段总结与第三阶段实施说明

> **状态**: [ACTIVE]
> **适用范围**: 供后续会话/工程师继续推进可维护性优化时使用

这份文档承接 `docs/status/maintainability-phase-1.md`。第一阶段解决的是“先立护栏”，第二阶段解决的是“沿着护栏继续拆 `OpenCodianView` 的主链路”。本轮仍然坚持 **渐进式提取 + 同步补测试**，没有做一次性重写。

---

## 1. 第二阶段的目标与本轮边界

第二阶段原本规划了三个优先方向：

1. 提取 tab / conversation 装载编排
2. 提取 model selector 逻辑
3. 提取消息区重渲编排

本轮实际完成的范围只覆盖第一个方向，并明确保持其余两项顺延到第三阶段。原因不是“做不动”，而是有意控制风险：

- 先把 `initializeFirstTab()` / `restorePersistedTabs()` / `activateTab()` / `loadConversation()` 这条最核心装载链路从大文件中剥出来
- 先补会被这次改动触达的测试，再提取实现
- 先让新的边界稳定下来，再继续拆 model selector 和 conversation render orchestration

换句话说，第二阶段不是“把 `OpenCodianView` 拆完”，而是先把它最影响理解成本的一段主流程抽成一个可以继续承接拆分的 service。

---

## 2. 第二阶段已完成内容

### 2.1 抽出会话 / 标签页装载编排 service

本轮新增：

- `src/features/chat/services/ConversationViewStateService.ts`

这个 service 当前负责四个入口：

- `initializeFirstTab()`
- `restorePersistedTabs()`
- `activateTab()`
- `loadConversation()`

#### 已迁出的职责

- 首次打开视图时：
  - 先 `loadConversations()`
  - 再 restore persisted tabs
  - restore 失败时重置 persisted tab state
  - 无 persisted tab 时复用首个已有 conversation
  - 仍无 conversation 时创建新 conversation
- tab 激活时：
  - 激活 pane
  - 刷新 focus preview / question dock / todo dock
  - 分流处理 streaming tab、普通 conversation tab、空 tab
- conversation 装载时：
  - 切换前对上一对话做最小清理
  - 切入 hydration
  - 处理 session 切换时的 pending questions / todo / status reset
  - 需要时从服务端同步消息
  - 重渲消息、background task indicator、dock
  - 恢复滚动位置
  - 刷新 model selector / context usage

#### 设计方式

这次没有让新 service 直接持有 view、plugin 或 DOM 所有权，而是定义了：

- `LoadConversationOptions`
- `ConversationViewStateHost`
- `ConversationViewStateService`

service 通过 host 回调访问外部能力，例如：

- conversation / tab 数据访问
- hydration 生命周期
- 消息重渲与背景任务刷新
- session todo / question / status 刷新
- model selector / context usage 刷新
- scroll restore 相关运行时状态

这个设计的价值在于：

- 抽出了装载主链路，但没有把整个 `OpenCodianView` 挪进另一个“第二个巨型类”
- 后续继续拆 model selector 或 conversation render orchestration 时，可以沿着同一个 host 边界继续收缩 view

### 2.2 `OpenCodianView` 只保留薄包装器和视图专属逻辑

本轮没有改变 `OpenCodianView` 的对外调用方式；调用点仍然通过原有方法名进入：

- `initializeFirstTab()`
- `restorePersistedTabs()`
- `activateTab()`
- `loadConversation()`

但这些方法现在已经变成对 `ConversationViewStateService` 的薄包装器。

与此同时，view 中保留了真正属于视图层的内容，例如：

- host 装配
- DOM 容器和 pane 切换
- UI render 入口
- plugin/service 的真实调用
- tab runtime state 持有
- scroll metrics / background task / question dock 等细粒度 UI 协调

此外，为了避免把太多细节重新塞回 service，本轮在 view 内补了三个更小的专用 helper：

- `applyStreamingConversationActivation()`
- `applyEmptyTabActivation()`
- `prepareConversationTransition()`

这些 helper 负责处理仍然和 view 绑定得很紧的分支逻辑，从而保证新 service 只做编排，不做 UI 细节接管。

### 2.3 延续第一阶段 helper，而不是回退

第二阶段在 conversation 装载链路里继续复用了第一阶段抽出的模块：

- `src/features/chat/services/ScrollManager.ts`

这次没有把滚动恢复逻辑重新内联回 `OpenCodianView`，而是继续使用：

- `captureElementScrollRestoreSnapshot()`
- `restoreElementScrollAfterRender()`
- `isElementNearBottom()`

保留的滚动语义没有变化：

- `bottom`
- `preserve-anchor`
- `preserve-distance`

这点很重要，因为第二阶段虽然换了编排位置，但没有改变 hydration 期间的滚动恢复行为。

### 2.4 测试补强

本轮新增：

- `tests/unit/features/chat/ConversationViewStateService.test.ts`

本轮更新：

- `tests/unit/features/chat/persistedTabRestore.test.ts`

新覆盖到的行为包括：

- `initializeFirstTab()` 在无 persisted tabs 时：
  - 复用首个已有 conversation
  - 没有现成 conversation 时创建新 conversation
- `activateTab()`：
  - streaming tab 走快速路径，不触发完整 reload
  - 普通 tab 走 `loadConversation(..., { preserveScrollPosition: true })`
  - 空 tab 走独立清空分支
- `loadConversation({ preserveScrollPosition: true })`：
  - 进入 / 退出 hydration
  - 触发 scroll snapshot / restore
  - session 切换时清掉 pending questions
  - `is-rehydrating` class 能在恢复后清理掉

这些测试的价值不只是“覆盖率增加”，而是给第三阶段继续拆分保留了几个稳定的行为锚点。

### 2.5 文档同步

本轮已更新：

- `docs/modules/features/chat/OpenCodianView.md`

本轮已新增：

- `docs/modules/features/chat/services/ConversationViewStateService.md`

模块文档中已经说明：

- conversation/tab 装载编排已迁出
- 新 service 与 `OpenCodianView` 的边界是什么
- 哪些内容仍然必须留在 view 内

### 2.6 验证结果

第二阶段本轮落地后，本地已验证通过：

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

并且已按仓库规则完成 Test Vault 部署与 `BUILD_ID` 校验：

- `main.202604111257`

---

## 3. 第二阶段后的当前状态判断

### 已经改善的点

- `OpenCodianView` 的“首次打开 / restore / 激活 / 装载”主链路不再完全埋在一个超大文件里
- 这条主链路首次拥有了独立、可单测的 service 边界
- 后续如果继续拆 model selector 或 render orchestration，不必再从最重的初始化/装载流程开刀
- 与第一阶段形成了连续边界：
  - 第一阶段抽滚动 helper
  - 第二阶段抽装载编排 service

### 仍然存在的核心问题

- `src/features/chat/OpenCodianView.ts` 仍然极大，warning 仍然很多
- model selector 逻辑仍然集中在 view 内
- conversation rerender / trailing assistant patch / incremental sync render 仍然集中在 view 内
- `OpenCodeService.ts`、`OpenCodianSettings.ts`、`ModelConfigModal.ts` 仍然很重

### 当前不应回退的原则

第三阶段继续做时，不要回退以下设计：

- 不要把 `ConversationViewStateService` 的编排逻辑重新塞回 `OpenCodianView`
- 不要把 `ScrollManager` 的 scroll restore 算法重新内联回 view
- 不要为了继续拆分而删除这次新增的 service 测试
- 不要把 streaming tab、普通 tab、空 tab 三条激活路径重新混成一个超大方法

---

## 4. 第三阶段建议主轴

第三阶段建议仍然聚焦 `OpenCodianView`，但优先级要比第二阶段更明确。

### 4.1 优先级 A：提取 model selector 逻辑

这是第三阶段最推荐优先做的事。

原因：

- 它仍然是一大块集中在 `OpenCodianView` 里的 UI + 状态 + 交互混合逻辑
- 第二阶段已经把 tab / conversation 装载主链路挪走，model selector 现在是更自然的下一个切口
- 第一阶段留下的 `bindModelSelectorStickyHeaders()` 可以继续作为稳定基础，不需要推倒重来

建议提取范围：

- `renderModelList()`
- `navigateModelList()`
- `highlightModelOption()`
- `selectHighlightedModel()`
- `scrollToCurrentModel()`
- `updateModelSelectorDisplay()`

建议模块方向：

- `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts`
- `src/features/chat/ui/modelSelector/ModelSelectorInteractions.ts`
- 如有必要，再加轻量 state/helper 文件

约束：

- sticky header cleanup 继续沿用现有 `bindModelSelectorStickyHeaders()` 方案
- 不要新造一个“ModelSelector 巨型类”
- 优先做“渲染/交互拆分”，而不是一次性把 catalog loading、icon loading、selection resolution 全挪走

### 4.2 优先级 B：提取消息区重渲编排

如果 model selector 拆完后还有余量，再继续处理 conversation render orchestration。

建议聚焦：

- `rerenderConversationMessages()`
- `patchTrailingAssistantRender()`
- `applySyncedConversationUpdate()`

建议模块方向：

- `src/features/chat/services/ConversationRenderService.ts`

建议保留在 view 内的内容：

- `renderMessage()` 及其深层 UI render 细节
- markdown / streaming renderer 的真实装配
- 当前 tab runtime 的 DOM 引用

这样可以先把“何时整段重渲 / 何时 patch tail / 何时追加增量消息”的编排抽出去，而不是一口气重写整套 assistant 渲染。

### 4.3 第三阶段不要优先做的事

仍然不建议第三阶段前半程抢做：

- `main.ts` 大拆分
- `OpenCodeService.ts` 大拆分
- settings 页大拆分
- CI / coverage / husky 体系扩张
- 与当前切口无关的 warning 清理

原因仍然一样：

- 上下文会分散
- `OpenCodianView` 还没拆到足够舒服的程度
- 继续沿着聊天主链路推进，收益仍然最大

---

## 5. 第三阶段建议任务顺序

建议按下面顺序推进。

### Task 1：先补 model selector 的最小测试

优先锁住：

- dropdown 打开/关闭
- 搜索过滤
- 键盘导航高亮
- 选中当前高亮项
- 当前模型滚动到可见区域
- 当前模型 trigger display 刷新

如果要拆显示逻辑，建议测试里显式覆盖：

- current model 已可用
- current model 不可用但 metadata 仍需展示
- catalog 为空时 trigger 的未配置 / unavailable 状态

### Task 2：提取 model selector 渲染与交互

完成标准：

- `OpenCodianView` 不再直接持有大段 model list 构建和键盘交互细节
- sticky header 仍走独立 helper
- 至少有一份独立单测覆盖 renderer/interactions 主行为

### Task 3：如仍有余量，再开始提取 conversation render orchestration

完成标准：

- `rerenderConversationMessages()` / `patchTrailingAssistantRender()` / `applySyncedConversationUpdate()` 至少有一部分变成薄包装器
- 不改变当前 hydration / background-task / pseudo-stream reveal 语义

### Task 4：同步更新模块文档

至少更新：

- `docs/modules/features/chat/OpenCodianView.md`
- 新增的 model selector / conversation render 模块文档

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

## 6. 第三阶段实施约束

### 6.1 拆分方式

- 只做“提取 + 收薄调用方”，不要借机重写行为
- 先补测试，再拆实现
- 优先提取有边界感、已有 helper 可复用的逻辑
- 尽量让新模块通过轻量 host / callback / pure helper 协作，而不是直接复制整段 view 状态

### 6.2 行为约束

不要破坏以下现有行为：

- 多 tab 并发 streaming / background-task 状态隔离
- hydration 期间 scroll restore 语义
- question dock / session todo dock 的刷新时序
- `session.status` 与 message-layer sync signal 的分层
- model selector sticky header cleanup 方案

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
2. 再读：
   - `src/features/chat/OpenCodianView.ts`
   - `src/features/chat/services/ConversationViewStateService.ts`
   - `src/features/chat/ui/modelSelectorStickyHeaders.ts`
   - `tests/unit/features/chat/ConversationViewStateService.test.ts`
3. 先补 model selector 的下一批测试
4. 再提取 model selector 渲染/交互
5. 如还有余量，再开始拆 conversation render orchestration
6. 每完成一个切口就跑 lint + typecheck + test

一句话总结第三阶段：

> 继续沿着第一阶段和第二阶段已经建立好的 helper / service / 测试边界，把 `OpenCodianView` 里下一块高密度 UI 逻辑——model selector——拆出去；如果还有余量，再开始处理 conversation render orchestration。

### 可直接复制的新会话启动提示

如果要让新会话继续第三阶段，可以直接复制下面这段：

```text
请继续推进 OpenCodian 的可维护性优化第三阶段。

先阅读并严格遵循：
1. AGENTS.md
2. docs/status/maintainability-phase-1.md
3. docs/status/maintainability-phase-2.md

这次不要重复做第一、第二阶段已经完成的内容；请基于现有改动继续优化。第三阶段仍然以“渐进式提取 + 同步补测试”为原则，不要做一次性重写。

本轮优先目标：
- 继续拆分 src/features/chat/OpenCodianView.ts
- 优先提取 model selector 逻辑
- 如仍有余量，再开始提取消息区重渲编排

本轮请先：
- 阅读 docs/status/maintainability-phase-2.md 中列出的第三阶段方向与任务顺序
- 优先关注 OpenCodianView 的 model selector 渲染/交互逻辑
- 先补即将改动路径的测试，再做提取
- 继续复用前两阶段已经抽出的 helper / service，而不是把逻辑重新塞回 OpenCodianView
  - src/features/chat/services/ScrollManager.ts
  - src/features/chat/services/ConversationViewStateService.ts
  - src/features/chat/ui/modelSelectorStickyHeaders.ts

明确约束：
- 不要回退现有 CI、lint 规则、ScrollManager、ConversationViewStateService、sticky header cleanup 方案
- 不要修改用户可见设置 schema、存储格式、OpenCode 协议，除非确有必要且有证据
- 不要顺手处理无关 warning；只消化与你本轮拆分直接相关的 warning
- 不要动 reference-projects/

建议执行顺序：
1. 确认并补充 model selector 的下一批测试
2. 提取 model selector 渲染与交互
3. 如仍有余量，再提取 conversation render orchestration
4. 更新对应 docs/modules 文档
5. 运行必要验证

验证要求：
- 至少运行 npm run lint、npm run typecheck、npm run test
- 只有在改到运行时代码 / 样式 / 构建链时，再运行 npm run build
- 如果运行了 npm run build，必须立即按 AGENTS.md 里的规则部署到 Test Vault 并验证 BUILD_ID

开始前先给出一个简短计划，然后直接实施。
```

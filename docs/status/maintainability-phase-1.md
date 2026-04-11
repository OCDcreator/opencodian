# 可维护性改进：第一阶段总结与第二阶段实施说明

> **状态**: [ACTIVE]
> **适用范围**: 供后续会话/工程师继续推进可维护性优化时使用

配套的短启动提示模板见：`docs/status/maintainability-next-session-prompt.md`

## 1. 背景与目标

这一轮工作是“低风险首批”维护性改进，目标不是重写，而是先把后续大拆分前必须具备的护栏补齐：

- 清掉已有 lint error，避免新规则一上来就被旧问题淹没
- 把最容易反复出错、又能独立测试的聊天视图局部逻辑先提出来
- 为安全、滚动恢复、tab 恢复、配置弹窗等关键点补单测
- 加最小 CI 门禁，确保后续拆分不会在仓库里“裸奔”

这份文档既记录第一阶段实际已完成的工作，也明确第二阶段应该怎么继续做，方便新会话直接接手。

---

## 2. 第一阶段已完成内容

### 2.1 工程护栏

已完成：

- 在 `.eslintrc.cjs` 中新增 warning 级维护性规则：
  - `complexity: 20`
  - `max-lines-per-function: 200`
  - `max-lines: 500`
  - `max-params: 4`
  - `@typescript-eslint/no-explicit-any: warn`
- 对 `src/utils/icons/lobehubIconManifest.ts` 做体量规则豁免，保留其“生成的 TypeScript 文件”策略
- 对 `src/types/jsx-shim.ts` 做 `@typescript-eslint/no-namespace` 的定点豁免
- 清掉了第一阶段前已有的 lint error 基线

当前结果：

- `npm run lint` 通过
- 现有维护性规则只报 warning，不阻塞当前开发
- warning 现在可以作为第二阶段的明确债务清单

### 2.2 CI 门禁

已新增：

- `.github/workflows/ci.yml`

当前 CI 顺序固定为：

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build`
6. `git diff --exit-code -- styles.css`

设计意图：

- 先让 lint/type/test/build 全量跑通
- 再强制检查 `styles.css` 是否与 `src/style/**` 同步，避免 CSS 改了但根产物没更新

### 2.3 `OpenCodianView` 的第一批安全抽取

本阶段没有重构 `OpenCodianView` 的整体结构，只做了两个“低耦合切口”：

#### A. 抽出滚动辅助逻辑

新增：

- `src/features/chat/services/ScrollManager.ts`

已抽离的职责：

- 判断消息区是否接近底部
- 程序化滚到底部
- 捕获重渲前的滚动恢复快照
- 重渲后按三种模式恢复滚动：
  - `bottom`
  - `preserve-anchor`
  - `preserve-distance`

保留在 `OpenCodianView` 中的职责：

- 当前 tab / pane 的查找
- 何时应该触发 auto-scroll 的业务判断
- 恢复滚动后刷新 pane metrics / sidebar

#### B. 抽出 model selector 的 sticky header 监听

新增：

- `src/features/chat/ui/modelSelectorStickyHeaders.ts`

已修复的问题：

- 不再把 scroll listener 存在 DOM 私有属性 `_stuckHandler` 上
- 改为由 `OpenCodianView` 自己持有 cleanup disposer
- 模型列表每次重渲前会先 dispose 旧监听，再绑定新监听

这一步的价值不是“减少很多行数”，而是先把一种明显脆弱的 DOM 私有状态写法消掉。

### 2.4 测试补强

新增测试：

- `tests/unit/core/security/BlocklistChecker.test.ts`
- `tests/unit/features/chat/ScrollManager.test.ts`
- `tests/unit/features/chat/modelSelectorStickyHeaders.test.ts`
- `tests/unit/features/chat/persistedTabRestore.test.ts`
- `tests/unit/features/settings/ModelConfigModal.test.ts`

覆盖到的行为：

- blocklist 总开关、regex 命中、非法 regex 回退、长 pattern 回退、不命中
- 聊天消息区底部检测、滚动恢复、anchor 恢复
- model selector sticky header 的绑定/释放
- `initializeFirstTab()` 中“先 `loadConversations()` 再 `restorePersistedTabs()`”
- persisted tab 的 per-tab model override 不串扰
- `ModelConfigModal` 的：
  - service 缺失回退
  - `initialView: 'preset-selector'`
  - `initialProviderId`
  - 未保存关闭确认

### 2.5 文档同步

已更新：

- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/settings/ModelConfigModal.md`
- `docs/modules/core/security/BlocklistChecker.md`
- `docs/modules/infrastructure/build-pipeline.md`

已新增模块文档：

- `docs/modules/features/chat/services/ScrollManager.md`
- `docs/modules/features/chat/ui/modelSelectorStickyHeaders.md`

### 2.6 验证结果

第一阶段落地后，本地已验证通过：

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

并且当时已按仓库规则完成 Test Vault 部署与 `BUILD_ID` 校验。

---

## 3. 第一阶段后的当前状态判断

第一阶段完成后，仓库的状态可以概括为：

### 已经改善的点

- 仓库从“没有维护性门禁”变成“有可执行门禁 + 有 warning 债务清单”
- `OpenCodianView` 首次出现可复用、可单测的独立 helper
- 聊天滚动恢复和 sticky header 这种高回归风险逻辑不再只能通过超大 view 间接测试
- 第二阶段可以在已有测试和 CI 基础上继续拆，不必再先补基础设施

### 仍然存在的核心问题

- `src/features/chat/OpenCodianView.ts` 仍然是最大的维护瓶颈
- `src/features/settings/OpenCodianSettings.ts` 和 `src/features/settings/ModelConfigModal.ts` 仍然很重
- `src/core/opencode/OpenCodeService.ts` 的复杂度仍然很高
- 维护性规则 warning 数量仍然很多；它们现在只是“可见了”，还没有被系统消化

### 当前不应回退的原则

第二阶段继续优化时，不要回退以下设计：

- 不要把 sticky header listener 再挂回 DOM 私有属性
- 不要把滚动恢复逻辑重新内联回 `OpenCodianView`
- 不要删除第一阶段新增的测试来“换取”重构速度
- 不要把 warning 规则改回关闭；应该通过拆分和收敛逐步消化

---

## 4. 第二阶段的实现方向

第二阶段的目标应从“先立护栏”切换到“沿着护栏持续拆核心巨型文件”，重点仍然是 **渐进式拆分 + 同步补测试**，而不是一次性大改。

建议第二阶段只聚焦三个主目标：

1. 继续拆 `OpenCodianView`
2. 为拆出的模块补独立测试
3. 消化与这些改动直接相关的 lint warning

### 4.1 第二阶段主轴：继续拆 `OpenCodianView`

推荐继续按“低耦合、可测试、已有边界感”的顺序抽取，而不是按文件块机械切割。

#### 优先级 A：提取会话/标签页装载编排

目标：

- 从 `OpenCodianView` 中抽出“tab 激活 + conversation 装载 + hydration 期间的状态编排”

建议新模块方向：

- `src/features/chat/services/ConversationViewStateService.ts`
- 或者拆成：
  - `TabActivationService`
  - `ConversationHydrationService`

建议迁移的行为：

- `initializeFirstTab()`
- `restorePersistedTabs()`
- `activateTab()`
- `loadConversation()` 中与 hydration、scroll snapshot、session 切换直接相关的部分

保留在 `OpenCodianView` 的内容：

- DOM 容器引用
- 真正的 UI render 调用入口
- 插件/服务装配

这样做的价值：

- 这是目前视图文件中最影响理解成本的主链路之一
- 第一阶段已经给 tab restore 和 scroll restore 建了测试入口，适合继续往下抽

#### 优先级 B：提取模型选择器逻辑

目标：

- 把 `renderModelList()`、高亮、键盘导航、当前模型显示、dropdown 开关逻辑进一步聚合成独立模块

建议新模块方向：

- `src/features/chat/ui/modelSelector/`
  - `ModelSelectorRenderer.ts`
  - `ModelSelectorState.ts`
  - `ModelSelectorInteractions.ts`

建议迁移的行为：

- `renderModelList()`
- `navigateModelList()`
- `highlightModelOption()`
- `selectHighlightedModel()`
- `scrollToCurrentModel()`
- `updateModelSelectorDisplay()`

约束：

- 继续沿用第一阶段新增的 `bindModelSelectorStickyHeaders()`
- 不要重新把 `OpenCodianView` 里的 model selector 分支复制到新类里形成第二个巨型模块

#### 优先级 C：提取消息区重渲编排

目标：

- 把“重渲当前对话 / patch 尾部 assistant / sync 后尽量增量更新”的编排逻辑拆出来

建议新模块方向：

- `src/features/chat/services/ConversationRenderService.ts`

建议迁移的行为：

- `rerenderConversationMessages()`
- `patchTrailingAssistantRender()`
- `applySyncedConversationUpdate()` 内和 DOM 增量更新直接相关的逻辑

这样做的价值：

- 它和第一阶段抽出的 `ScrollManager` 是天然邻接模块
- 后续如果继续拆 assistant 渲染，这一层会成为稳定过渡带

### 4.2 第二阶段不要优先做的事

以下事项有价值，但不建议抢在第二阶段前半程做：

- `main.ts` 大拆分
- `OpenCodeService` 大拆分
- i18n 文件模块化
- `dependency-cruiser`
- husky / lint-staged
- coverage threshold
- devlog 归档

原因很简单：

- 这些工作会分散上下文
- 当前最大瓶颈仍然是 `OpenCodianView`
- 第一阶段已经把“继续拆 view”的跑道铺出来了，优先顺着这条线推进收益最高

---

## 5. 第二阶段建议任务清单

建议按下面顺序执行。

### Task 1：为 `OpenCodianView` 的下一批切口补最小测试

先补测试，再动结构。建议新增测试覆盖：

- `initializeFirstTab()` 的无 persisted tab 路径
- `activateTab()` 切换到 streaming tab 与普通 tab 的差异路径
- `loadConversation({ preserveScrollPosition: true })` 的 hydration + scroll restore 路径

目标：

- 先把第二阶段计划要动的核心行为锁住

### Task 2：提取 tab / conversation 装载编排

实现目标：

- 把 `initializeFirstTab()` / `restorePersistedTabs()` / `activateTab()` / `loadConversation()` 的编排部分拆出去

完成标准：

- `OpenCodianView` 中这些方法要么显著缩短，要么变成薄包装器
- 现有 persisted tab restore 测试不需要大改语义

### Task 3：提取 model selector 逻辑

实现目标：

- 让 `OpenCodianView` 不再直接持有 model list 构建和 keyboard navigation 的大部分细节

完成标准：

- sticky header 仍走独立 helper
- model selector 的渲染和交互各自有独立单测

### Task 4：开始消化直接相关 warning

优先只处理与上述拆分直接相关的 warning，例如：

- `OpenCodianView.ts` 的部分复杂度 warning
- 新拆出的 renderer / state 模块中的 `max-params` / `complexity`

不要试图在同一轮里把整个仓库的 100+ warning 清光。

### Task 5：同步更新模块文档

需要跟着第二阶段一起更新的文档至少包括：

- `docs/modules/features/chat/OpenCodianView.md`
- 新增的聊天 helper / service 文档
- 如果模块边界变化明显，可补充 `docs/architecture/README.md` 中对聊天层的说明

---

## 6. 第二阶段实施约束

后续大模型继续做时，建议遵守这些约束：

### 6.1 拆分方式

- 只做“提取 + 调用方收薄”，不要边拆边改行为语义
- 每提取一个模块，就给该模块补单测
- 优先提纯函数、轻量 service、无插件状态的 helper

### 6.2 行为约束

不要破坏以下现有行为：

- 多 tab 并发 streaming / background-task 状态隔离
- conversation hydration 期间的 scroll restore 语义
- question dock / session todo dock 的现有刷新时序
- `session.status` 与 message-layer sync signal 的区分

### 6.3 验证顺序

每轮保持：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`

只有在改了运行时代码、样式或构建链时，再执行：

4. `npm run build`

若执行了 `npm run build`，必须按仓库规则立即部署到 Test Vault 并校验 `BUILD_ID`。

---

## 7. 给下一位实现者的简明接手建议

如果下一会话要继续做，推荐直接这样开工：

1. 先读这份文档
2. 先读：
   - `src/features/chat/OpenCodianView.ts`
   - `src/features/chat/services/ScrollManager.ts`
   - `src/features/chat/ui/modelSelectorStickyHeaders.ts`
   - `tests/unit/features/chat/persistedTabRestore.test.ts`
3. 先补 `activateTab()` / `loadConversation()` 的测试
4. 再提取 tab / conversation 装载编排
5. 每完成一个切口就跑 lint + typecheck + test

一句话总结第二阶段：

> 不要试图“一次解决所有维护性问题”，而是沿着第一阶段已经建好的测试和 helper 边界，继续把 `OpenCodianView` 拆成可理解、可验证、可继续演进的几个中等模块。

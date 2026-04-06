# OpenCodian 多 Agent 看板标签页需求整理

## 1. 背景

当前 OpenCodian 已经具备聊天视图、多标签会话、流式状态、question、todo、OMO 后台任务提示等能力，但这些信息主要散落在单个聊天视图内部。

现在希望进一步增加一个新的 Obsidian 标签页视图，用“看板 / 卡片”的形式集中展示多任务、多 agent 的运行状态，并允许用户在看板内直接做调度动作，例如：

1. 查看多个会话 / agent 当前在做什么
2. 快速定位谁在运行、谁在等待输入、谁被阻塞
3. 用卡片方式管理任务而不是只在聊天流中查找
4. 拖动卡片，让另一个 agent 接手或开始处理某项工作

这类需求与你参考的 `agent-orchestrator` 很接近，但不能直接把它当作一比一照搬的目标。更准确的需求定义应当是：

`在 OpenCodian 内提供一个 Obsidian 原生的多 agent 看板工作台，用于监控、分派和切换多会话 / 多任务工作流。`

这份文档同时承担两个角色：

1. `可行性分析`
   - 用于帮助判断该想法是否值得做、哪些地方当前可做、哪些地方不应承诺
2. `初步技术规格`
   - 用于给后续实现规划提供最小必要的数据模型、协议分层和阶段路线图

因此本文既会讨论产品边界，也会包含少量接口草案，但这些接口草案应理解为“方向性规格”，不是已经冻结的最终实现。

## 2. 用户真实诉求

用户想要的不是“又一个聊天窗口”，而是一个更接近控制台 / 调度台的视图。

核心诉求可以拆成四层：

### 2.1 总览能力

用户希望一眼看到：

1. 当前有哪些任务 / 会话
2. 每个任务当前属于什么状态
3. 哪些任务需要自己介入
4. 哪些任务可以继续放给 agent 跑

### 2.2 多任务切换能力

用户希望不必反复切回不同聊天 tab 才知道进度，而是能在一个看板里浏览多个工作单元。

### 2.3 调度能力

用户希望不只是“看”，还可以在看板上直接触发动作，例如：

1. 打开对应聊天
2. 继续 / 暂停 / 停止某个任务
3. 把一个任务派给另一个 agent 配置
4. 从一个任务派生出新的 worker

### 2.4 Obsidian 原生融合

用户希望这个能力仍然是 Obsidian 内的一部分，而不是外跳网页 dashboard。

这意味着它需要保留：

1. Obsidian 标签页 / 叶子视图行为
2. 当前 vault 上下文
3. 本地持久化
4. 与现有聊天视图之间的快速联动

## 3. 当前已验证事实

### 3.1 OpenCodian 已具备“新标签页视图”承载基础

当前插件已经通过 `ItemView` 注册了聊天视图：

- `src/main.ts`
- `src/core/types/chat.ts`

其中：

1. `VIEW_TYPE_OPENCODIAN` 已存在
2. `main.ts` 已使用 `registerView(...)` 注册视图
3. `activateView()` 已能在主标签页或侧栏中打开插件视图

这意味着：

`在架构上新增一个“看板视图类型”是可行的。`

它可以作为新的 Obsidian tab / leaf，而不需要把看板硬塞进现有聊天 DOM 结构里。

### 3.2 OpenCodeService 已具备一部分“实时看板”所需数据源

当前服务层已支持：

- `listSessions()`
- `getSessionTodos(sessionId)`
- `getSessionStatuses()`
- `subscribeToSessionTodoUpdates(...)`
- `subscribeToSessionStatusUpdates(...)`
- `createSession(...)`
- `forkSession(...)`
- `sendMessage(..., { agent })`

对应文件：

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/types.ts`

关键结论：

1. 当前已经有“会话列表”与“会话状态”的基础数据源
2. 当前已经有“实时 todo / status 更新订阅”
3. 当前已经能在发送时带上 `agent` 参数
4. 当前已经支持从现有 session 分叉新 session

这说明：

`做一个 session / task 驱动的实时看板，并不是从零开始。`

### 3.3 聊天层已经有可复用的任务信号

当前聊天层已经识别或维护了多种“适合进卡片摘要”的运行时信号：

1. session todo
2. question request / resolution
3. session busy / idle / retry
4. OMO 后台任务提示
5. `subagent` content block

对应文件包括：

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/ui/SessionTodoDock.ts`
- `src/features/chat/ui/QuestionDock.ts`
- `src/core/types/chat.ts`

这意味着看板卡片无需凭空设计状态模型，很多字段可以从现有聊天运行态中抽取。

### 3.4 当前还没有完整的“多 agent 编排器”

这一点也必须写清楚。

和 `agent-orchestrator` 不同，OpenCodian 当前并没有下面这些完整能力：

1. 独立 orchestrator 进程
2. 大规模 worker fleet 生命周期管理
3. issue tracker 自动扫描
4. PR / CI / review 反馈自动回流
5. 专门的 dashboard backend API

虽然 `agent-orchestrator` 的 dashboard 很值得参考，但它成立的前提是：

`它背后有一个真正的编排层。`

而 OpenCodian 当前更接近：

`聊天客户端 + session 管理器`

不是：

`多 agent orchestration 平台`

### 3.5 agent-orchestrator 中真正值得借鉴的是“看板视图方法”，不是整套产品闭环

参考 `agent-orchestrator` 后，可以提炼出几条对 OpenCodian 真正有用的设计启发：

#### 可借鉴

1. Attention-first 分栏
   - 不是按时间排序，而是按“需要处理什么”分栏
2. Session card 聚合摘要
   - 一张卡片里展示 title、summary、状态、动作
3. 实时事件驱动更新
   - 看板应随状态变化自动更新
4. 卡片级快捷动作
   - 发送一句话、终止、恢复、打开详情

#### 不适合直接照搬

1. PR / CI / review 维度分栏
   - OpenCodian 当前没有这套完整数据
2. 外部 dashboard 风格的多项目总控
   - 对 Obsidian 插件第一版来说过重
3. Web terminal / tmux 控制台集成
   - 会显著增加复杂度

### 3.6 多 agent 互联不是只有 UI 问题，本质上还需要“编排与互通层”

如果要真正实现“agent 和 agent 之间能够相互协作、相互委派、相互通信”，仅有看板 UI 是不够的。

至少还需要一层明确的中间能力来回答这些问题：

1. 如何创建一个新的 worker agent
2. 如何给某个 agent 发送任务、上下文和约束
3. 如何订阅 agent 的状态变化和输出事件
4. 如何把一个任务从 agent A 派生 / 委派给 agent B
5. 如何恢复、取消、重试一个 agent session
6. 如何统一 Codex、Claude Code、OpenCode 这类不同 agent 的能力差异

因此：

`多 agent 看板要成立，背后必须有一层 agent orchestration / interoperability 能力。`

### 3.7 当前可选机制不止一种，但它们解决的问题并不相同

围绕“agent 和 agent 如何互通”，目前可以考虑的路线至少有四类：

#### A. A2A 协议

适合作为：

`外部 agent-to-agent 互操作标准`

它更适合解决：

1. 不同 agent 服务之间的互通
2. 跨进程 / 跨机器 / 跨运行时协作
3. Agent Card、能力发现、异步任务通知等问题

#### B. ACP 协议

这里需要区分两种不同语义：

1. `Agent Client Protocol`
   - 更偏“agent 与编辑器 / IDE 之间”的连接协议
2. `Agent Communication Protocol`
   - 早期也用于 agent 间通信，但现阶段不适合作为新系统主线赌注

因此 ACP 更适合作为：

`某些前端或客户端的接入方式`

而不是当前 OpenCodian 的唯一主通信协议。

#### C. MCP / 插件 / skills / hooks

这类机制更适合作为：

`agent 接入桥或工具扩展层`

它们适合解决：

1. 如何把 OpenCodian 能力暴露给某个 agent
2. 如何让某个 agent 访问工具、文件和命令
3. 如何做单个 agent 与宿主环境的集成

但它们不天然等于：

`完整的多 agent 委派协议`

#### D. 内部自定义编排协议

这是最贴近当前 OpenCodian 现状、也最容易落地的一类方案。

它更适合解决：

1. 统一不同 agent 的最小公共能力
2. 管理任务派发、会话恢复、事件流和状态模型
3. 为上层看板和拖拽交互提供稳定语义

### 3.8 现阶段不建议把“魔改某个官方插件”作为系统主底座

例如：

1. 直接修改某个 Claude Code 官方插件
2. 直接把某个 Codex 官方插件改造成编排中心

这类方案的问题在于：

1. 它们更像“接入桥”，不是整个系统的稳定中枢
2. 很容易被上游插件实现细节绑住
3. 一旦要同时接入多个 agent，桥接层会迅速失控

更合理的做法是：

`把官方插件 / MCP / skills / hooks 当成 adapter 接入点，而不是系统主协议。`

## 4. 关键可行性判断

### 4.1 能不能做一个 Obsidian 原生的看板标签页？

结论：`可以，而且是合理方向。`

原因：

1. 现有插件已经有独立视图注册机制
2. 现有服务层已能提供 session list / status / todo
3. 现有聊天层已有足够多的状态信号可转成卡片摘要
4. 看板本质上是另一种视图组织方式，不需要先重写聊天内核

### 4.2 能不能做“多任务、多 agent 状态浏览”？

结论：`第一版可以做，而且很适合。`

第一版完全可以先基于以下对象展示：

1. conversation / session
2. todo
3. waiting question
4. background task
5. subagent 痕迹

也就是说，先把“可观察性工作台”做出来，是稳的。

### 4.3 能不能通过拖动卡片“让另一个 agent 去工作”？

结论：`可以做，但必须先定义拖拽的真实语义，不能把“拖拽”误写成“状态魔法”。`

这里至少有三种完全不同的含义：

#### 含义 A：改变显示分组

比如从 `Backlog` 拖到 `In Progress`，只是修改插件本地 board 状态。

这是最容易实现的。

#### 含义 B：重新指派 agent 配置

比如把卡拖到 `Research Agent`、`Writer Agent`、`Fixer Agent` 这类 lane，触发：

1. 创建新 session
2. 选择特定 `agent`
3. 把卡片任务描述作为首条 prompt 发给新 worker

这在当前 OpenCodian 里是“可设计”的，但前提是新增 agent profile 管理与 dispatch 语义。

#### 含义 C：把现有运行中 session 直接迁移给另一个 agent

这件事在当前能力下并不天然成立，因为：

1. session 本身已经在某个 agent / 模型上下文中运行
2. 运行中的上下文和内部状态不能简单靠拖拽“换 agent”
3. 更现实的做法通常是：
   - fork 一个新 session
   - 或创建新 session，并转交摘要与上下文

因此建议在需求里明确：

`拖卡派活的正式语义应是“派生 / 分派新 worker”，而不是“把运行中的同一会话瞬间换脑”。`

### 4.4 多 agent 协作应该优先选哪条协议路线？

结论：`应优先采用“内部编排协议 + agent adapter”，并把 A2A 作为外部兼容层。`

推荐原因如下：

1. 当前最先需要统一的是运行语义，而不是协议名
2. 不同 coding agent 在 session、恢复、上下文、流式输出、权限和工具侧存在实际差异
3. 这些差异必须先在 OpenCodian 内部被收敛成一致模型
4. 当内部模型稳定后，再暴露 A2A 或其他兼容层才有意义

因此推荐顺序：

1. 内部编排协议
2. agent adapter
3. 看板 / dispatch UI
4. A2A facade
5. 其他桥接协议或插件接入

### 4.5 A2A、ACP、MCP、插件桥接在本项目中的正确角色

建议在需求里明确分工：

| 机制 | 在 OpenCodian 中的建议角色 | 是否适合作为主线 |
| --- | --- | --- |
| A2A | 对外 agent-to-agent 互操作层 | 适合作为外部标准层 |
| ACP | 某些 agent / IDE 的连接适配层 | 不建议作为唯一主线 |
| MCP / skills / hooks | 单个 agent 的工具接入层 | 只适合作为桥接层 |
| 官方插件魔改 | 早期实验接入方式 | 不建议作为长期底座 |
| 内部自定义编排协议 | OpenCodian 的核心运行主线 | 最适合作为第一阶段主线 |

## 5. 推荐产品定位

建议把这个能力正式命名为：

`OpenCodian Agent Board`

在文档里建议区分：

1. `Agent Board`
   - 产品能力名
2. `AgentBoardView`
   - 视图实现名
3. `AgentBoardCard`
   - 卡片数据模型名

推荐定位成一个新的 Obsidian 原生视图，而不是聊天页里的附属面板。

推荐产品定义：

1. 它是 OpenCodian 的“工作台视图”
2. 它服务于多会话、多任务、多 agent 观察与调度
3. 它与聊天视图并列，而不是替代聊天视图
4. 它优先承载“看状态 + 派生任务 + 快捷动作”
5. 不把第一版目标写成 AO 式完整编排平台
6. 它背后需要一个轻量的 agent orchestration 层，而不只是一个静态看板

## 6. 推荐信息架构

这里最关键的一点是：

`监控看板` 和 `调度看板` 不应该混成一个数据模型。

建议拆成两个模式。

### 6.1 模式一：运行时看板 Runtime Board

这是“系统派生视图”，主要用于观察。

特征：

1. 卡片来源于真实 session / conversation
2. 分栏由运行态自动决定
3. 大多数跨栏移动是只读的，不允许用户随便改状态

推荐分栏：

1. `Needs Input`
   - 有 question request
   - 等待用户回复
2. `Running`
   - session status 为 `busy`
   - 或当前正在 streaming
3. `Background`
   - 有后台任务提示 / 异步子任务痕迹
4. `Blocked / Retry`
   - session status 为 `retry`
   - 或出现明显错误 / 阻塞
5. `Idle`
   - session status 为 `idle`
   - 但仍未结束
6. `Done / Archived`
   - 用户手动归档
   - 或任务显式完成

这个模式主要解决“浏览和切换”问题。

### 6.2 模式二：调度看板 Dispatch Board

这是“用户驱动视图”，主要用于派活。

特征：

1. 卡片来源于本地 board task
2. 分栏由用户拖拽维护
3. 拖拽是有业务意义的

推荐分栏：

1. `Inbox`
2. `Ready`
3. `Assigned`
4. `Running`
5. `Blocked`
6. `Done`

这个模式主要解决“调度与规划”问题。

### 6.3 Agent Swimlane 作为高级扩展

当用户真的希望“拖给另一个 agent”时，更适合加的是：

`按 agent profile 分泳道`

例如：

1. `Unassigned`
2. `Research`
3. `Builder`
4. `Reviewer`
5. `Polish`

拖到某个泳道时，才触发 dispatch 行为。

这比直接把状态栏和 agent 栏混在一起更清晰。

## 7. 卡片模型建议

建议新增统一的 board card 视图模型，而不是直接把 `Conversation` 或 `ChatMessage` 塞进 UI。

推荐字段：

```ts
interface AgentBoardCard {
  id: string;
  projection: 'runtime' | 'dispatch';
  sourceKey: string;
  sourceType: 'session' | 'conversation' | 'task';
  conversationId?: string;
  sessionId?: string;
  boardTaskId?: string;
  title: string;
  summary?: string;
  laneId: string;
  agentRef?: string | null;
  modelRef?: string | null;
  status: 'needs_input' | 'running' | 'background' | 'retry' | 'idle' | 'done' | 'planned';
  todoCount?: number;
  incompleteTodoCount?: number;
  questionCount?: number;
  backgroundTaskCount?: number;
  hasSubagentActivity?: boolean;
  updatedAt: number;
  derived: boolean;
}
```

其中：

1. `derived = true`
   - 表示这是从运行时数据派生出的卡片投影
2. `derived = false`
   - 表示这是用户维护的调度任务卡

这个区分非常重要，因为它决定了拖拽是否能改数据。

还需要额外明确：

1. 同一 session 可以同时出现在 `Runtime Board` 和 `Dispatch Board`
2. 这两者应视为两个独立的 card projection，而不是同一个 card 实例
3. 二者通过共享的 `sourceKey` 关联
   - 例如 `session:<sessionId>`
   - 或 `conversation:<conversationId>`
4. `id` 用于标识单个卡片实例
5. `sourceKey` 用于标识它们是否来源于同一个底层工作对象

也就是说：

`同源 ≠ 同实例`

这样才能同时支持：

1. Runtime Board 自动分栏
2. Dispatch Board 用户手动排序与拖拽
3. 二者共享底层任务来源但保留各自展示语义

## 8. 推荐交互与本地化设计

### 8.1 卡片内容

每张卡第一版建议至少显示：

1. 标题
2. 一行摘要
3. 当前 agent / model
4. session 状态
5. todo 进度
6. question / background / subagent 标记
7. 最后更新时间

### 8.2 卡片动作

建议优先支持这些动作：

1. `打开聊天`
2. `定位到现有 tab`
3. `发送一句快捷回复`
4. `停止当前流`
5. `从此卡派生新 worker`
6. `归档 / 取消归档`

### 8.3 拖拽语义

建议明确分层：

#### Runtime Board

1. 允许同栏排序
2. 不允许用户随意把 `Running` 拖成 `Done`
3. 如果支持跨栏拖拽，只能拖到特殊 action zone
   - `Archive`
   - `Spawn Worker`
   - `Open in Chat`

#### Dispatch Board

1. 允许跨栏拖拽
2. 拖拽结果会更新本地 board task 状态
3. 拖到 agent swimlane 可触发新的 dispatch 流程

### 8.4 派生 worker 交互

建议把“拖给另一个 agent”第一版定义成：

1. 选择卡片
2. 选择目标 agent profile
3. 生成新 session
4. 把卡片标题、摘要、必要上下文、链接回原会话一起发给新 worker
5. 在原卡与新 worker 卡之间建立关联

更适合的实现方式是：

`fork / spawn new worker`

而不是：

`rebind current running session to another agent`

### 8.5 国际化与本地化

当前项目已经存在 locale 体系，因此看板相关内容也必须纳入 i18n，而不是直接把英文标签写死在组件里。

至少需要纳入翻译的内容包括：

1. lane 名称
2. 状态标签
3. 卡片动作名称
4. 错误与降级提示
5. 空状态与筛选说明

第一版就应要求：

1. 所有新 UI 文本进入 `en` / `zh` locale
2. 不在组件中硬编码最终用户可见文案
3. 运行时状态名与调度状态名分别定义，避免一个翻译键承载两种语义

## 9. 数据与持久化建议

第一版至少会引入两类新数据：

### 9.1 Board UI state

例如：

1. 当前看板模式
2. 列顺序
3. 卡片排序
4. 折叠状态
5. 当前筛选器

这类数据可以继续走插件 settings / UI state 持久化。

### 9.2 Board task state

如果做 Dispatch Board，就还需要本地持久化：

1. 用户创建的任务卡
2. lane 归属
3. agent 指派
4. 与 conversation / session 的关联
5. 是否已生成 worker session

这部分更适合放进 `StorageService`，而不是混进现有聊天设置里。

### 9.3 性能与规模约束

由于 OpenCodian 运行在 Obsidian / Electron 渲染进程内，第一版必须明确规模预期，避免在需求层面默认“无限卡片和无限订阅”。

建议第一版约束如下：

1. 目标支持 `20~30` 张活跃卡片时保持流畅
2. `50+` 卡片场景不作为第一版强保证
3. 第一版优先通过：
   - 分栏分页或折叠
   - 增量渲染
   - 节流状态刷新
   来控制开销
4. 当卡片数量继续上升时，再评估：
   - 虚拟滚动
   - 更细粒度的订阅拆分
   - 后台聚合状态缓存

建议在实现时额外关注：

1. 高频 `session.status` / `todo.updated` 事件的合并
2. 卡片级 rerender 的最小化
3. 避免每次状态更新都整板重排

## 10. 协议与编排层建议

如果这个需求要继续推进，建议显式新增一层：

`OpenCodian Orchestrator Layer`

这层不一定一开始就作为独立进程存在，但至少要在代码结构上成立。

### 10.1 推荐的三层结构

建议把多 agent 协作拆成下面三层：

#### 第一层：Agent 运行层

负责直接对接具体 agent，例如：

1. Codex
2. Claude Code
3. OpenCode
4. 未来其他 agent

#### 第二层：编排层

负责：

1. 任务创建
2. worker 派生
3. 状态同步
4. 事件总线
5. 任务委派
6. 会话恢复 / 取消 / 重试

#### 第三层：协议 / 接入层

负责：

1. A2A 对外暴露
2. ACP 或其他连接协议适配
3. MCP / 插件 / skills / hooks 接入

也就是说：

`协议层不应直接替代编排层。`

### 10.2 推荐的内部抽象：AgentAdapter

建议先定义统一内部接口，而不是让 UI 直接操作某个具体 agent。

例如：

```ts
interface AgentAdapterCapabilities {
  canSpawn: boolean;
  canSend: boolean;
  canCancel: boolean;
  canResume: boolean;
  supportsStreamingEvents: boolean;
  supportsHandoff: boolean;
  supportsStructuredTasks: boolean;
}

interface AgentAdapter {
  id: string;
  kind: 'codex' | 'claude-code' | 'opencode' | 'custom';
  capabilities: AgentAdapterCapabilities;
  spawn(task: HandoffPacket): Promise<AgentSession>;
  send(sessionId: string, input: AgentMessage): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  resume(sessionId: string): Promise<void>;
  getState(sessionId: string): Promise<AgentState>;
  subscribe(sessionId: string, onEvent: (event: AgentEvent) => void): () => void;
}
```

这样做的意义在于：

1. 看板与调度层只依赖统一接口
2. 后续新增 agent 时不需要重写看板模型
3. 可以把官方插件、CLI、MCP、hooks 都藏到 adapter 内部

还应明确：

`AgentAdapter` 是统一抽象，不代表所有 agent 必须拥有完全对称的能力。`

因此需要 `capabilities` 来回答：

1. 当前 adapter 是否支持 spawn
2. 是否支持恢复
3. 是否支持连续事件订阅
4. 是否支持结构化 handoff

看板与调度 UI 应根据 `capabilities` 决定哪些动作可用，而不是假设所有 adapter 都能完整实现生命周期。

### 10.3 推荐的任务交接模型：HandoffPacket

为了让“拖给另一个 agent”可控，建议统一一个交接包模型。

例如：

```ts
interface HandoffPacket {
  taskId: string;
  title: string;
  goal: string;
  summary?: string;
  repoPath?: string;
  worktreePath?: string;
  branch?: string;
  contextFiles?: string[];
  sourceSessionId?: string;
  parentTaskId?: string;
  requestedAgentProfile?: string;
  constraints?: {
    allowedTools?: string[];
    approvalMode?: 'auto' | 'manual';
    budget?: number;
  };
  successCriteria?: string[];
}
```

这个模型建议用于：

1. 从卡片派生 worker
2. agent 间 handoff
3. 任务恢复
4. 重试 / 接力

### 10.4 推荐的事件总线模型：AgentEvent

看板能否做好，关键在于是否有统一事件流。

例如：

```ts
type AgentEvent =
  | { type: 'status'; sessionId: string; status: 'idle' | 'running' | 'waiting_input' | 'blocked' | 'done' | 'failed' }
  | { type: 'message'; sessionId: string; role: 'agent' | 'system'; content: string }
  | { type: 'tool'; sessionId: string; name: string; state: 'start' | 'end' | 'error' }
  | { type: 'todo'; sessionId: string; total: number; completed: number; items?: Array<{ id?: string; content: string; status: string }> }
  | { type: 'question'; sessionId: string; requestId: string; questionCount: number; waiting: boolean }
  | { type: 'handoff'; from: string; to: string; taskId: string }
  | { type: 'artifact'; sessionId: string; kind: 'patch' | 'file' | 'summary'; ref: string };
```

当前 OpenCodian 已经有一部分基础事件：

1. session status
2. todo updated
3. question request
4. streaming chunk

后续可以把这些现有信号逐步归并到统一的 board / orchestration event 模型中。

### 10.5 A2A 在本项目中的建议接法

如果未来要支持 A2A，建议方式是：

1. 先在内部完成 `AgentAdapter + HandoffPacket + AgentEvent`
2. 再新增一个 `A2AGateway`
3. 由 `A2AGateway` 把内部 orchestrator 能力映射成 A2A 服务接口

这样 A2A 的角色就是：

`OpenCodian Orchestrator 的外部互操作门面`

而不是把内部逻辑直接写死在 A2A 请求处理里。

### 10.6 MCP / 官方插件 / skills / hooks 的建议接法

对于 Claude Code、Codex、OpenCode 等 agent，更适合这样使用：

1. 使用官方插件 / skills / hooks / MCP 作为“agent 侧适配入口”
2. 由 adapter 负责把 OpenCodian 的 handoff / message / event 语义转译成对应 agent 的接入方式
3. 不让看板或上层调度逻辑依赖某个单一插件实现

也就是说：

`插件桥接属于 adapter 内部实现细节，不应成为产品层主协议。`

## 11. 错误处理与降级策略

第一版需求里应明确：看板必须能在数据不完整、连接中断或 adapter 失效时优雅降级，而不是“板子空白”。

建议最低降级策略如下：

1. `OpenCodeService` 连接暂时失败
   - 保留最后一次成功快照
   - 看板显示“状态可能已过期”
2. 某个 adapter 超时或异常
   - 仅标记对应 lane / card 异常
   - 不拖垮整个看板
3. 某些能力缺失
   - 依据 `capabilities` 隐藏或禁用动作
4. 实时订阅失效
   - 退化为轮询或手动刷新
5. 状态不一致
   - 优先保留“最近可信快照 + 错误标记”，避免直接丢卡

建议看板至少有三类显式反馈：

1. `live`
2. `stale`
3. `degraded`

## 12. 测试策略建议

当前项目已有测试体系，因此看板与 orchestrator 层也应在需求阶段说明基本测试策略。

建议至少覆盖：

### 12.1 adapter 层

1. 使用 mock adapter 做契约测试
2. 验证 `capabilities` 驱动下的动作可用性
3. 验证 handoff packet 到 adapter 调用的映射

### 12.2 事件总线与状态聚合

1. 验证 `status / todo / question / handoff` 事件的归并
2. 验证异常事件、乱序事件和重复事件的处理
3. 验证从现有 `OpenCodeService` 信号到 board event 的转换

### 12.3 看板 UI

1. 优先测试 selector / state / action 逻辑
2. 组件测试聚焦：
   - 分栏结果
   - 卡片动作可见性
   - 空状态与降级状态
3. 不把第一版测试重点放在复杂拖拽动画本身，而放在拖拽后的状态语义

## 13. 对当前架构的推荐接入点

建议分两步接入，而不是一开始就做大规模目录重构。

### 13.1 第一阶段

先以最小侵入方式引入：

```text
src/features/board/
  AgentBoardView.ts
  boardTypes.ts
  boardState.ts
  boardSelectors.ts
  boardActions.ts
  boardOrchestratorBridge.ts
  components/
    BoardColumn.ts
    BoardCard.ts
    BoardToolbar.ts
    AgentLane.ts
```

这样可以先把编排辅助能力放在 board feature 内部，减少一次性重构范围。

### 13.2 第二阶段

当 board + dispatch + adapter 抽象稳定后，再提升为：

```text
src/core/orchestrator/
  AgentAdapter.ts
  adapterRegistry.ts
  handoff.ts
  eventBus.ts
  orchestratorTypes.ts
  adapters/
    CodexAdapter.ts
    ClaudeCodeAdapter.ts
    OpenCodeAdapter.ts
```

并至少改动这些现有文件：

- `src/main.ts`
  - 注册新的 board view
  - 增加打开看板命令
- `src/core/types/chat.ts`
  - 新增 `VIEW_TYPE_OPENCODIAN_BOARD`
  - 或将 board 相关常量迁到更合适的类型模块
- `src/core/storage/StorageService.ts`
  - 新增 board state / board tasks 持久化
- `src/core/opencode/OpenCodeService.ts`
  - 复用 session list / status / todo / fork / sendMessage(agent)
- `src/core/types/settings.ts`
  - 若加入 board 视图偏好、默认看板模式、默认 agent lane 等设置，需要补齐默认值和 normalize
- `styles.css`
  - 看板布局与卡片样式
- `src/features/board/**`
  - 第一阶段新增看板、状态与轻量编排桥
- `src/core/orchestrator/**`
  - 第二阶段在抽象稳定后上提为核心模块

## 14. 推荐分阶段实现

### Phase 0a：事件模型最小集

目标：

1. 定义 board 需要的最小事件模型
2. 先统一 `status / todo / question`
3. 建立从 `OpenCodeService` 到 board state 的桥接层

这期重点是：

`先为 Runtime Board 提供稳定的上游状态流。`

#### Phase 0a 验收

1. Runtime Board 不依赖聊天 DOM 才能获取状态
2. 至少能稳定接收 `status / todo / question` 三类信号
3. 状态更新具备最小节流和聚合

### Phase 0b：内部互联与 adapter 基线

目标：

1. 定义 `AgentAdapter`
2. 定义 `HandoffPacket`
3. 定义 `AgentEvent`
4. 接通至少一种 agent adapter
5. 让看板层有稳定的上游编排接口

这期重点是：

`先把多 agent 协作的骨架搭起来。`

#### Phase 0b 验收

1. 至少能通过统一接口创建 / 发送 / 取消 / 恢复一个 agent session
2. 至少有一种 adapter 可工作
3. 看板不直接依赖某个具体 agent 的私有实现
4. 能把一个 handoff packet 派给目标 adapter

### Phase 1：运行时看板 MVP

目标：

1. 新增一个看板标签页视图
2. 基于现有 session / conversation 数据生成卡片
3. 接入 session status / todo 的实时更新
4. 支持打开聊天、定位会话、基础筛选

这期重点是：

`先把多任务总览做出来。`

#### Phase 1 验收

1. 可在 Obsidian 中打开新的看板标签页
2. 看板能显示多个 session / conversation 卡片
3. 卡片能随 session status / todo 变化自动更新
4. 可从卡片跳转到对应聊天

### Phase 2：卡片动作与本地 Dispatch Board

目标：

1. 新增用户可维护的任务卡
2. 支持拖拽跨栏
3. 支持任务卡与 conversation / session 关联
4. 支持基础快捷动作

这期重点是：

`把“看板”从观察界面升级为工作流界面。`

#### Phase 2 验收

1. 用户可创建本地任务卡
2. 用户可拖拽调整列与状态
3. 卡片状态能本地持久化
4. 卡片可关联到已有聊天 / session

### Phase 3：派生 worker / agent 指派

目标：

1. 给卡片指定 agent profile
2. 从卡片派生新的 worker session
3. 新 worker 卡与原卡建立关系
4. 卡片上显示“来源 / 派生 / 接力”关系

这期重点是：

`把“拖给另一个 agent”真正做成受控动作。`

#### Phase 3 验收

1. 用户可从卡片触发新 worker session
2. 可选择目标 agent profile
3. 新 worker session 能收到任务摘要与必要上下文
4. 看板上能看到原卡和派生 worker 的关联

### Phase 4：A2A 外部兼容层

目标：

1. 在内部 orchestrator 基础上提供 A2A gateway
2. 支持能力发现与外部 agent 接入
3. 支持外部 handoff / 委派进入 OpenCodian

这期重点是：

`把内部多 agent 能力升级为对外互操作能力。`

#### Phase 4 验收

1. OpenCodian 可通过 A2A 暴露基础 agent / task 能力
2. 内部 handoff 语义可映射到外部协议
3. 不破坏现有本地看板和 adapter 层

### Phase 5：更强编排能力（可选）

只有在前面几期稳定后，才适合继续考虑：

1. 批量分派
2. agent pool
3. lane 级 WIP 限制
4. 自动 follow-up
5. 外部 issue / PR / review 联动

这部分已经更接近轻量 orchestrator，而不是简单看板。

## 15. 第一版明确非目标

以下内容不应在第一版承诺：

1. 复刻 `agent-orchestrator` 全量 dashboard
2. 引入 tmux / terminal dashboard / web backend
3. 自动处理 PR、CI、review 工作流
4. 把运行中的同一 session 直接“切换成另一个 agent”
5. 在没有明确数据模型的前提下，把所有聊天消息都映射成拖拽卡片
6. 通过魔改某个单一官方插件来承担整个系统的编排主干
7. 在没有内部编排协议的前提下，直接让 A2A / ACP 替代全部业务语义

## 16. 对“拖动卡片让另一个 agent 去工作”的正确表述

建议在需求里把这件事写成：

### 当前可实现方向

1. 拖动本地任务卡到某个 agent lane
2. 基于该动作创建新的 worker session
3. 通过 `sendMessage(..., { agent })` 指定 agent profile
4. 或通过 `forkSession(...)` 派生新的工作分支

### 当前不应承诺

1. 把任意运行中 session 无缝迁移给另一个 agent
2. 像真正 orchestrator 一样自动管理整队 agent 生命周期
3. 仅靠 UI 拖拽就获得完整多 agent 编排闭环

## 17. 建议结论

这个想法是：

`值得调研，而且第一阶段非常适合做。`

但正确的立项方式应该是：

1. 先做 `内部编排协议 + adapter`
2. 再做 `运行时看板`
3. 然后做 `本地 Dispatch Board`
4. 再做 `agent 指派 / worker 派生`
5. 最后再做 `A2A` 兼容层

而不是一开始就把目标定义成：

`在 Obsidian 内实现一个完整的 Agent Orchestrator`

更准确、更可落地的需求定义建议写成：

`为 OpenCodian 增加一个 Obsidian 原生的多 agent 看板标签页，并在内部建立统一的 agent 编排协议与 adapter 层，先解决多会话总览与任务分派，再逐步扩展到 worker 派生、agent 调度和 A2A 互操作。`

# 会话标签机制与验收（2026-10-30）

## 一套标签状态和创建入口

`TabManager` 是当前聊天视图的标签状态源；`ConversationTabRuntimeCoordinator` 负责挂载位置和持久化，`TabBar` 负责显示与交互。六后端共用这些组件，不为每个后端复制一套标签系统。

新增会话标签的加号固定在标签栏末尾。它经运行时端口回到既有 `OpenCodianView.createNewConversation`，保留 ZCode 目录、文件变更和 session rail 等创建后处理。头部工具区只保留“在当前标签新建会话”、历史、会话设置及后端状态／诊断；不再提供独立的新增标签按钮。

## 位置和数量

| 布局 | 常规最多显示 | 文字 | 空间不足 |
| --- | --- | --- | --- |
| header | 4 个 | 编号 | 减少可见标签；保留当前项、溢出和新增 |
| input | 5 个 | 编号与截断标题 | 按实际可用宽度收入溢出菜单 |
| below-header-grid | 5 个 | 编号与截断标题 | 按实际可用宽度收入溢出菜单 |
| below-header-vertical | 5 个 | 编号；悬停／焦点可见标题 | 保留纵向紧凑编号和溢出入口 |

横向轨道外高 28px、数字项及新增按钮 24px，与相邻工具按钮统一。轨道随宿主 Obsidian 强调色淡色高亮，状态图标另行表达运行、后台任务和待处理状态。

超过可见数量的标签进入 `+N` 菜单，N 精确等于隐藏数量。当前项不在前部窗口时，用它替代末个可见项；从溢出菜单选中的标签立即成为可见当前项。窗口／侧栏宽度变化由 ResizeObserver 重排。父会话面包屑加长标题仍无法容纳时，紧凑模式隐藏标题文字，保留返回图标、当前编号、溢出和新增入口。

## 新增、关闭和恢复

- 创建期间禁用栏内加号；创建协调器同时阻止其他入口的重复请求。异步创建结束时重新检查 tab manager、enableTabs 和容量，拒绝把旧后端的迟到结果挂到新工作区；只清理本次新建但无法挂载的空会话。
- 达到 maxTabs 后禁止普通新增。关闭标签会重新编号并启用加号；当前标签关闭后沿用既有相邻标签恢复流程。正在处理响应的标签由生命周期协调器阻止关闭，避免丢失流式运行。
- 关闭标签不等于删除会话或原生会话历史。最后一个普通根标签没有关闭入口；内部子会话仍保留返回与清理入口。
- maxTabs 是新增限制，不是重载时的数据裁剪规则。恢复全部有效保存标签，包括内部子会话或降低上限前已有的标签；超过新上限时仅禁止继续新增。
- 恢复时先过滤已删除和其他后端的会话，再以原活动条目定位新的活动索引，避免数组过滤后选中错误会话。
- 禁用可见标签 UI 时不显示加号或普通标签；内部子会话继续使用既有的返回／关闭导航。

## 键盘与状态刷新

方向键、Home 和 End 移动标签焦点，Enter／Space 激活；右键、中键或 Delete 关闭允许关闭的标签。溢出菜单支持上下键、Home、End、Enter 和 Escape，Escape 返回菜单触发器。流式状态重渲染按 tab id 保留焦点，已打开的溢出菜单及其焦点不会因状态刷新被关闭。销毁、改变布局或窗口几何时清理／重定位菜单及观察器。

## 六后端接入

| 后端 | 会话身份 | 本轮会话创建探测 |
| --- | --- | --- |
| OpenCode 2 | backendSessionId | 已连接后端创建两个独立 session |
| Claude Code | backendSessionId | SDK 会话记录创建；未发送首轮消息 |
| Codex | backendSessionId | 本地 provisional session；原生 thread 在首轮消息时建立 |
| Pi | backendSessionId | 后端创建两个独立 session |
| ZCode | backendSessionId | 后端 session/create 返回独立身份 |
| DSH | backendSessionId | 当前配置的 ACP 会话创建返回独立身份 |

既有 `getConversationBackendSessionId` 统一解析会话身份，标签本身只关联 conversationId。新增、活动切换、恢复、模型覆盖、前后台运行状态和关闭均经过共享标签所有者。旧 OpenCode 1 继续不出现在可选后端中。

六后端测试矩阵覆盖真实生产组件之间的连接：创建协调器、TabManager、会话状态桥、运行状态桥、恢复协调器、关闭协调器和四种 TabBar 布局。Test Vault 另使用六个真实注册适配器各创建两个会话，验证 ID 独立及标签切换／关闭／超上限恢复；适配器原连接状态、启用列表和原视图标签已恢复。

探测未派发模型 turn，不能作为六后端消息生成或长对话上下文续接验收。新建探测会话清理中，ZCode 拒绝其 workspace 归属校验未通过的删除，DSH ACP 不支持删除持久化会话；没有绕过这两条保护，原生探测会话可能保留。它们未加入用户视图的会话标签。本轮只对 macOS Test Vault 实机验收。

## 验证记录

结构化证据保存在本次本机 `.obsidian-debug/session-tabs-mechanism-20261030/`：

- `codegraph-before.json`：源码修改前的逐符号直接调用者与深度 1 影响范围；用户已允许在会话标签及其接入范围继续。
- `codegraph-affected.json`：修改后的受影响范围。
- `red.log`、`overflow-red.log`：异步创建竞态及溢出菜单刷新缺陷的失败复现。
- `matrix-tests.log`、`factory-tests.log`、`overflow-green.log`：组件和六后端矩阵定向验证。
- `native-sessions.json`：六个真实适配器的 session 创建结果及状态恢复读回。
- `layout-matrix.json`：真实 TabBar 和安装样式的临时渲染夹具；深浅主题 × 320/400/800px × 四布局 × 单／多／溢出标签，并包含父子会话，共 120 个组合。夹具证据不冒充真实用户输入。
- `verify.log`：完整仓库门禁记录。

后续实机指针操作和最终部署身份在同目录保存。构建／拷贝／BUILD_ID 与 SHA256 核对按仓库规定顺序执行；不提交原始日志、机器路径或原生会话内容。

## 修改前 CodeGraph 核对

所有列出的影响查询均使用有限深度 1。直接调用者仅计 function/method，排除 file 节点；以下为工具返回值，不推断风险等级。

| 符号 | 直接调用者 | 深度 | 影响节点 |
| --- | --- | --- | --- |
| TabBar::constructor | 0 | 1 | 1 |
| TabBar::render | renderTabBar (tests/unit/features/chat/tabs/TabBar.test.ts:19)、renderTabBar (src/features/chat/services/conversation/ConversationTabRuntimeCoordinator.ts:240)、createChildSessionGraphCoordinatorHost (src/features/chat/OpenCodianView.ts:736)、createTabMessagesPaneCoordinatorHost (src/features/chat/OpenCodianView.ts:1611)、renderSessionTodoDock (src/features/chat/OpenCodianView.ts:1824)、createAssistantShellViewHostAdapterHost (src/features/chat/OpenCodianView.ts:3072)、applyLocaleTexts (src/features/chat/OpenCodianView.ts:3738)、refreshQuestionUi (src/features/chat/OpenCodianView.ts:3747)、refreshQueuedFollowUpBar (src/features/chat/OpenCodianView.ts:3964)、renderMarkdownInto (src/features/chat/OpenCodianView.ts:4340)、addUserMessageFooter (src/features/chat/OpenCodianView.ts:4395) | 1 | 12 |
| TabBar::renderParentNavigation | renderTabBar (src/features/chat/services/conversation/ConversationTabRuntimeCoordinator.ts:240) | 1 | 3 |
| TabBar::destroy | mountChatEffortSelector (src/features/chat/OpenCodianView.ts:1102)、createTabMessagesPaneCoordinatorHost (src/features/chat/OpenCodianView.ts:1611)、onClose (src/features/chat/OpenCodianView.ts:3248)、rebuildNavigationSidebar (src/features/chat/OpenCodianView.ts:3395)、refreshComposerToolbarForActiveBackend (src/features/chat/OpenCodianView.ts:4251) | 1 | 23 |
| TabBar::partitionItems | render (src/features/chat/tabs/TabBar.ts:28) | 1 | 2 |
| TabBar::renderTabItem | render (src/features/chat/tabs/TabBar.ts:28) | 1 | 2 |
| TabBar::renderOverflowButton | render (src/features/chat/tabs/TabBar.ts:28) | 1 | 2 |
| TabBar::openOverflowMenu | renderOverflowButton (src/features/chat/tabs/TabBar.ts:251) | 1 | 2 |
| TabBar::positionOverflowMenu | openOverflowMenu (src/features/chat/tabs/TabBar.ts:284) | 1 | 2 |
| TabBar::closeOverflowMenu | render (src/features/chat/tabs/TabBar.ts:28)、renderParentNavigation (src/features/chat/tabs/TabBar.ts:48)、destroy (src/features/chat/tabs/TabBar.ts:58)、renderOverflowButton (src/features/chat/tabs/TabBar.ts:251)、openOverflowMenu (src/features/chat/tabs/TabBar.ts:284) | 1 | 6 |
| ChatHeaderPresenter::build | createComposerInputShellCoordinatorHost (src/features/chat/OpenCodianView.ts:954)、buildUI (src/features/chat/OpenCodianView.ts:3326)、createFixture (tests/unit/features/chat/ChatHeaderPresenter.test.ts:27) | 1 | 5 |
| ChatHeaderPresenter::applyLocaleTexts | build (src/features/chat/services/surface/ChatHeaderPresenter.ts:146) | 1 | 2 |
| ChatHeaderPresenter::destroy | 0 | 1 | 1 |
| ConversationTabRuntimeCoordinator::initializeTabSystem | 0 | 1 | 3 |
| ConversationTabRuntimeCoordinator::renderTabBar | resetTabManager (src/features/chat/services/conversation/ConversationTabRuntimeCoordinator.ts:236)、applyTabBarLayout (src/features/chat/services/conversation/ConversationTabRuntimeCoordinator.ts:575)、createTabManager (src/features/chat/services/conversation/ConversationTabRuntimeCoordinator.ts:710) | 1 | 4 |
| createConversationTabRuntimeCoordinator | 0 | 1 | 2 |
| ConversationTabOpenCoordinator::createConversationInNewTab | assembleConversationLoadRecovery (src/features/chat/services/conversation/ConversationLoadRecoveryCoordinator.ts:689) | 1 | 4 |
| TabManager::restoreTabs | restorePersistedTabs (src/features/chat/services/conversation/ConversationLoadRecoveryCoordinator.ts:387) | 1 | 3 |
| ConversationLoadRecoveryCoordinator::restorePersistedTabs | initializeFirstTab (src/features/chat/services/conversation/ConversationLoadRecoveryCoordinator.ts:337) | 1 | 4 |
| ChatRuntimeComposition::createConversationRuntimeWiring | compose | 1 | 2 |
| TabBar::renderParentBackButton | renderParentBreadcrumb | 1 | 2 |
| TabBar::renderParentCloseButton | renderParentBreadcrumb | 1 | 2 |

## 最终结果

完整 `npm run verify -- --base HEAD` 的 15 项门禁全部通过；1,020 个测试套件、11,091 项测试通过，6 项既有跳过。生产构建 `main.202610301234` 已部署并重载 macOS Test Vault，main.js、manifest.json、styles.css 三份文件逐一 SHA256 一致。

真实指针在四种位置各点击栏内加号，随后在 320px 窄栏点击溢出项切换；检查菜单焦点后发送 Delete，关闭成功且保留活动项。达到容量后加号禁用、释放／恢复容量后重新启用。原标签、活动会话、设置、容器样式和会话列表恢复读回见 ui-input.json。120 项布局夹具在最终构建上重新通过。六后端创建探测在同一实现的较早构建执行；之后仅改标签布局和菜单焦点保留，没有改适配器、创建、关闭或恢复接入，其证据按该边界复用。

设计扫描报告的 5 项提示均位于既有字体／圆角规则（core.css 285、290、297、752、873 行），不在本次修改区域；ESLint 为 0 errors / 0 warnings。本轮没有提交或推送。

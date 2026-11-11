# SettingsDshSection

## 2026-11-09 跨任务导航接线

- `attachTabbed(containerEl, secondaryTabId, navigate?)` 增加第三个可选回调，tabbed 宿主传入 `(task) => switchToPrimaryTab('dsh', task)`，原生工作区的“配置与扩展”↔“模型与提供商”跨任务链接由此保持可操作（聊天无终端入口深链到 advanced 后仍能一步到达扩展管理）。回调存入可变的 `nativeHost.navigateTask`；`attach()`（堆叠面）显式清空，避免渲染点击无效的链接。
- 扩展管理挂载点随 `SettingsDshNativeWorkspace` 移至 configuration 页；`configuration` 标签（en/zh “Configuration & extensions”／“配置与扩展”）与深链 ID 不变。

## 2026-11-09 完整 DSH 任务工作区

- 保留 connection/model/mcp/configuration 的稳定 ID，增加 permissions/context/tools/advanced 横向任务页；已验收的 1642 连接页四字段和页尾连接备份位置不变。
- `SettingsDshNativeWorkspace` 拥有原生库覆盖、模型提供商、公开 schema 字段、凭据引用、回读与组历史；`SettingsDshExtensionsWorkspace` 和 `SettingsDshExtensionSettings` 隔离包执行操作与机器本地公开扩展字段。MCP 仍由独立 workspace 所有。
- constructor 仅通过既有连接端口与新可选 `DshNativeSettingsPort` 的类型交集组装，不扩大 MCP host，不引入 unsafe any。
- `dispose()` 释放原生配置及扩展订阅；renderer 在页签切换、宿主 hide/onClose 时调用。草稿以稳定 plugin host 身份保留。
- 下方较早记录中的“默认值只读／聊天唯一编辑入口／独立终端不可用”是历史状态；当前模型页可保存新会话默认值，聊天仍拥有会话覆盖，终端能力按已加载原生可选 bundle 和握手如实显示。


> 2026-10-24：增加原生/ACP 接入选择；默认原生通道支持图片、历史和行内能力。MCP 保存后可显式应用到已打开的空闲原生会话，返回应用计数；运行回合拒绝变更。ACP 模式仍只在新建/恢复时接收声明。页面不把已保存声明等同在线状态，不声称支持 OAuth、历史删除或独立终端。

源码：`src/features/settings/backends/dsh/SettingsDshSection.ts`

DSH 的连接、MCP 声明和原生默认值读取区。由现有 SettingsBackendSection 注入窄 `DshSettingsHost`，设置区仅依赖 core.types 与 i18n，不直接引入 main.ts、后端运行时或新的服务 owner。

- 启用 DSH 时显示 CLI/Desktop 路径、工作目录和连接测试。
- MCP JSON 编辑器整批校验后保存；失败回滚原声明，编辑器旁的 aria-live 状态直接显示成功或错误，避免独立设置窗口依赖主窗口 Notice。明确说明只对新建/恢复会话生效，不声称热连接或 OAuth 已完成。
- 读取配置准备一个供下一次新聊天复用的草稿，仅显示原生 configOptions 返回的名称与当前值；设置页不提供会被会话继承策略覆盖的临时编辑控件。
- 聊天工具栏是模型与推理强度的唯一编辑入口，按 conversation 持久化，并在发送边界等待原生确认。
- 图片说明只报告当前连接是否提供输入能力；原生仍需校验模型。历史回放、删除、分支、命令、终端与行内限制明确可见。

沿用原生 Obsidian Setting、现有全宽编辑器和 disclosure 样式；焦点规则加入共享 `settings-layout-contract.css`，未新增 DSH 专属样式文件、模态或视觉 token。

## 2026-10-26 标签、状态与配置表达

- 接入方式、CLI 路径、工作目录和 MCP 声明编辑器使用与可见字段一致的可访问名称；连接状态节点从建立起具有 status / polite / atomic 语义。焦点样式限定于 DSH 设置组。
- 原生 model/reasoning_effort 回读字段名称使用本地化标签；重复的 High: High 只显示一次 High，原生选项值和配置不被修改。
- MCP disclosure 保留服务器上下文，内部编辑行改称服务器声明；草稿与已保存声明经同一验证器规范化后比较，JSON 排版或显式 `type: "stdio"` 不再造成未保存/未应用误报。真正的未保存草稿仍就地提示，应用后说明其不在本次应用内。保存/应用均不冒充在线状态回读。

> 2026-10-27：DSH 改为独立工作区，二级页拆分为连接、MCP、原生默认值；只在 DSH 为当前后端时挂载，不再出现在通用智能体管理。

> 2026-10-27（二次审查）：DSH 工作区新增“模型与行内”二级页，复用 `SettingsInlineEditSection.renderBackendModelOverrides` 提供 DSH 专属行内编辑/补全模型覆盖；连接页保持只读的模型/推理默认值说明与聊天工具栏入口。DSH 适配器实现 `AgentAuxQueryCapability` 与 `AgentInlineCompletionCapability`，覆盖值与通用 inline-edit 消费者一致。

> 2026-10-27（UI 验收修复）：`renderTab` 在 section 外壳与 `opencodian-dsh-settings` group 之间补标准 `opencodian-settings-block-body opencodian-settings-section-body` + `data-settings-surface="section-body"` wrapper，使内层 h4 获得与相邻 section 一致的内边距；未新增 CSS 或硬编码间距。

## 2026-11-08 拆分 MCP 工作区与机器本地恢复

- MCP 编辑器、逐服务器表单和恢复列表整体迁移到 `SettingsDshMcpWorkspace`；本文件保留连接页（传输/可执行/工作目录选择卡）、launch 高级 disclosure、模型与行内覆盖、原生回读页的组装职责，通过窄 `DshMcpWorkspaceHost`（`getSettings`/`getAdapter`/`validateMcpServers`/`saveSettings`/`vaultPath?`/`recoveryBaseDir?`）委托渲染。行数保持在 max-lines 500 以内，不新增间接层之外的所有权。
- 原始错误安全收口：连接测试、配置回读与 MCP 保存失败一律只呈现本地化通用文案 + `Notice`，端点/凭据类原始错误文本不进入 DOM 或日志；异步保存不再有未处理拒绝。
- 保存失败现在回滚草稿并在 workspace 状态节点显示通用失败文案；保存成功但恢复历史归档失败时如实追加“历史不可用”提示，不回滚已落盘保存。
- 恢复历史本身（快照存储、CAS 校验、按 vault 哈希隔离）由 `src/core/agents/backend/configuration/BackendConfigRecoveryStore.ts` 与 `SettingsDshMcpWorkspace` 页面描述；`vaultPath` 由 `createSettingsDshSection` 工厂从 `getVaultBasePath(plugin.app)` 提供。

## 2026-11-09 用户选择 A：横向子标签与平整设置行

- 保留连接、模型与行内、MCP、原生默认值的原有横向子标签。连接页改为紧凑传输分段控件、程序路径下拉和工作目录下拉；不再把简单选择渲染成多层边框大卡片，也不重复“推荐”。
- 路径源 select 交由设置宿主的 `enhanceSettingsDropdowns(container, app.keymap)` 统一增强，复用 `SettingsDropdownControl` 的 trigger/listbox、ownerDocument portal、键盘 Scope 和销毁机制；没有新增另一套下拉组件。
- `renderPathSetting` 只在用户选自定义后显露同一设置行内的输入。选择自定义不保存空的配置；输入 change 时 trim 后保存，空输入保留旧配置并给出提示。选择自动查找／当前库才显式清空覆盖值。异步保存期间禁用该行控件，失败恢复配置、模式、输入和显隐，原始错误不进入 DOM。
- 连接页保留自动保存语义，以一行“自动保存到当前库／下次连接生效”替代重复元数据。真实连接状态与连接测试同行；启动参数、环境变量仍在独立高风险 disclosure，MCP 保存、应用与历史所有权不变。
- 视觉仅由 `[data-backend-workspace="dsh"]` 下的样式调整，其他后端不继承这次 A 布局。行为测试同时验证源 select 的事件及增强后的 trigger/portal 交互。
- 用户随后指出标题上方的来源／恢复区打断内容层级。`renderTab` 原先将已有bar移到内容后；在用户要求重新设计该组件后，现仅在connection页保留并移到底部，在model／mcp／configuration页移除该bar。它只备份连接字段，因此不在其他子页重复出现。共享组件仍拥有保存／恢复事件、allowlist和存储；workspace标记及独立的缺程序提示不被移除。默认收起的“连接配置备份与恢复”显示空状态／备份时间，展开后说明字段范围、单份替换和下次连接生效边界。
- 高级启动区使用独立 `opencodian-dsh-disclosure-body` 包住风险说明和字段。当前按用户确认的 shadcn Collapsible／带边框 Accordion 方向呈现：标题与内容共用一层细边框，整行 summary 可点击、箭头靠右，body 与标题使用一致内边距且不叠加第二层卡片或左侧引导线；字段字号／行距弱于主表单。环境变量编辑器与“添加变量”放在环境变量 Setting 的 controlEl 内，位于启动参数之后，不再将操作按钮提前到展开区顶部。参数和环境变量仍沿用原保存与失败反馈路径，未新增持久化状态。

# SettingsDshSection

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

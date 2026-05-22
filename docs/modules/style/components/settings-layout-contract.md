# Settings Layout Contract Styles

> **源码**: `src/style/components/settings-layout-contract.css`
> **状态**: [REVIEW]

## 职责

定义设置界面的本地布局契约与共享 surface token。该文件为 classic 与 tabbed 设置界面提供统一的 section、ordinary setting row、object surface、inline group、半径与间距变量，并把共享设置容器映射到一致的视觉层级。

## Surface Contract

- `.opencodian-settings`：设置界面 token 作用域，所有 `--opencodian-settings-*` 变量都从 Obsidian 主题变量派生。
- `.opencodian-settings-quick-nav` / `.opencodian-settings-tab-primary` / `.opencodian-settings-tab-secondary`：classic 与 tabbed 的同级 navigation-shell surface。它们可以显示 active / hover / focus 状态，但不承担内容卡片视觉。
- `.opencodian-settings-content-shell`：布局型内容 shell，用于承载 classic / tabbed 内容，不承担重卡片视觉。
- `.opencodian-settings-section` / `.opencodian-settings-block.opencodian-settings-section`：共享 section block surface，使用 section 背景、边框与半径 token；legacy `.opencodian-settings-block` 本身保持兼容，不会单独触发契约样式。
- `.opencodian-settings-section-body` / `.opencodian-settings-block-body`：section 内部纵向 rhythm，普通设置行在这里按 row-card 规则排列。
- `.opencodian-settings-section .setting-item`：普通设置项的轻量 row-card 样式，和 object-card 等更重实体 surface 区分。
- `.opencodian-wide-text-setting`：给路径、URL、访问令牌等长文本设置项使用的宽字段 row。它只放宽明确标记的输入，控制列在桌面端限制在 `clamp(320px, 42vw, 520px)`，窄屏退为单列，避免把 host/port/数字类短输入一起拉长。
- `.opencodian-debug-workbench` / `.opencodian-debug-status-strip` / `.opencodian-debug-channel-list` / `.opencodian-debug-log-preview`：Claude Code 调试工作台布局。它跟随格式化器子标签的 block + object-row 语法，总开关、日志通道和日志预览保持同宽 `.opencodian-settings-block`、统一标题/说明/content 内边距和 `12px` 说明到内容 rhythm；状态摘要只保留轻量 object tiles，不再把 Claude Debug 渲染成单个空 toggle，也不使用 dashboard 式指标卡或嵌套重卡片。
- `.opencodian-theme-style-card` / `.opencodian-style-input-lock-note` / `.opencodian-debug-help-item`：在本轮只映射到 object token weight，不把样式设置、debug help 等复杂区域完整迁移成统一 object-card。

## Mode-Aware Hierarchy Taxonomy

设置界面的视觉层级必须先判断当前 layout mode，再选择 token weight。Tabbed mode 和 classic mode 都是一等公民，但它们获得层级的方式不同：tabbed mode 已经有 primary / secondary tabs 帮用户拆分上下文，classic mode 则会把多个子区域连续铺在同一滚动流里，因此需要更明确的轻量父子层级。

- **Navigation shell**：quick nav、primary tabs、secondary tabs。使用 nav / inline tokens，只表达导航、active、hover、focus 状态，不承担内容卡片视觉。
- **Primary section**：`.opencodian-settings-section`。使用 section tokens，是 classic 与 tabbed 共享的最强内容 surface。
- **Classic child panel**：classic section 内部的子区域，当一个大 section 包含多个独立子块时使用。使用 object tokens，无 shadow、无 gradient、无 decorative blur。Tabbed mode 默认不使用 classic child panel，因为 secondary tabs 已经承担分层。
- **Object surface**：provider、server、formatter、editor group、plugin source item 等有实体含义的对象。使用 object tokens。
- **Row surface**：ordinary setting rows、catalog rows、helper rows、tables、nested editable rows。使用 row tokens。
- **Inline surface**：paths、compact key/value rows、toolbars、filters、button bars。使用 inline tokens 或透明背景。

Rule: never apply one hierarchy rule globally across both layout modes. In classic mode, visible grouping may be needed for scanability. In tabbed mode, extra panels can become nested-card noise.

## Visible Unification Slice

本轮可见统一只处理 settings layout 的第一层观感：

- classic quick navigation 与 tabbed primary / secondary tabs 都使用轻量 navigation shell token。
- `.opencodian-settings-content-shell` 保持结构用途，不重新引入重 tab panel 卡片。
- `.opencodian-settings-section` 是本轮最强的通用内容 surface。
- 普通 `.setting-item` 继续保留轻卡片感，但必须只在 marked settings section 内生效。
- preview / object-like descendants 可以映射到 object tokens；MCP、model availability、formatter runtime、agents、commands、plugins 和深层 style preview 仍属于后续 owner-specific migration。

不要重新引入带阴影的 `.opencodian-settings-tab-panel`，也不要在共享设置 section 上使用粗 `border-left` 侧边条。这两类样式会重新制造大卡片套大卡片或局部 UI 家族漂移。

## Guardrails

- 只在 `.opencodian-settings` / `.opencodian-settings-section` 作用域内影响设置界面，不使用全局 `.setting-item` 或未标记的 `.opencodian-settings-block` 选择器。
- 共享设置 surface、spacing、row-card、object-card 和 inline group token 归此模块所有；各 section CSS 不应重复定义一套半径、边框、背景或 row-card 间距。
- 新的视觉迁移应优先复用这些 token，再按 section 的真实职责增加更具体的 object-card、summary、toolbar 或 state 样式。
- navigation shell 的 hover / focus 只能改变背景、边框或 outline，不应使用会造成布局错觉的 translate 或重 shadow。
- 修改后运行 `npm run build:css` 刷新根目录 `styles.css`。

## Skill Catalog Styles

- `.opencodian-skill-settings-shell`：Skills 标签页的布局 shell，只负责控制面板与来源列表之间的垂直 rhythm，不再把整个技能页包成一个大 settings block。
- `.opencodian-skill-control-panel` / `.opencodian-skill-toolbar`：全局权限 dropdown 和当前标签的 scope action 控制栏。项目技能页只在顶部显示新建技能，外部技能页只在顶部显示刷新；工具条使用轻量 copy/action 两列，不再通过 Obsidian `Setting` row 渲染。
- `.opencodian-skill-permission-help-modal` / `.opencodian-skill-permission-help*`：默认技能权限的解释弹窗，使用三列卡片说明 allow / ask / deny，窄屏退为单列，并在底部提供官方文档链接。
- `.opencodian-skill-list`：纵向 flex 容器，承载来源分组后的技能列表。项目技能与外部技能的切换由设置布局自身的二级标签承载，不再在 Skills 页面内部维护额外分段控件。
- `.opencodian-skill-bulk-bar` / `.opencodian-skill-bulk-permission-group` / `.opencodian-skill-bulk-actions`：技能批量操作条，宽屏为“左侧批量权限 select + 已选数量，右侧动作组”。项目技能动作组包含全选、Refresh 和批量 Delete；批量权限下拉选择即应用，不再显示 Apply 按钮。外部技能页不渲染删除按钮，刷新保留在外部页顶部工具条。
- `.opencodian-skill-source-section` / `.opencodian-skill-source-header`：每个技能来源的独立分区与标题行，显示来源名和计数，让用户按来源扫描，而不是先穿过一个大卡片。

## Shared Session Manager Styles

- `.opencodian-share-policy-panel` / `.opencodian-share-policy-*`：Conversation > Sharing 顶部的分享策略控制面板。左侧解释项目级策略，右侧保留 Obsidian dropdown 与帮助按钮，当前模式以低调状态 chip 显示，避免把公开分享配置伪装成普通表单行。
- `.opencodian-share-diagnostics*`：分享策略面板内的诊断区。按钮会检查项目 share mode、OpenCode 服务健康状态和公共分享主机可达性，用 compact status rows 显示 ok / warning / error。
- `.opencodian-shared-sessions` / `.opencodian-shared-sessions-header`：已分享会话管理区，使用标题、说明、公开数量与刷新按钮组成轻量工具头，不复用截图式的单行 setting layout。
- `.opencodian-shared-session-row`：单个已分享会话的数据行，左侧为标题、更新时间、公开 URL，右侧为复制、预览、取消分享动作；多行共享一个 list surface，窄屏改为单列。
- `.opencodian-shared-session-preview` / `.opencodian-shared-session-message*`：完整会话预览区域。普通文本直接展开，工具调用和长输出由 `<details>` 默认折叠；消息之间使用 transcript 分隔线，避免在 setting row 内继续嵌套卡片。
- `.opencodian-skill-card`：紧凑技能行，宽屏为“选择框 + 名称/描述/路径 + 操作区”三列，避免在列表中展开完整 SKILL.md。
- `.opencodian-skill-select-checkbox`：列表行选择控件，尺寸跟随 Obsidian 原生 checkbox，不额外发明选择 affordance。
- `.opencodian-skill-source-chip`：技能来源的低调 monospace chip。
- `.opencodian-skill-row-actions` / `.opencodian-skill-row-permission-group` / `.opencodian-skill-row-button-group`：技能卡片右侧操作区，宽屏固定为“左侧单技能 permission select + 右侧按钮组”。项目技能按钮组显示 Open 和 Delete；外部技能不显示 Delete。项目目录刷新属于 bulk card 的 catalog-level 操作，不在每个技能行重复出现。
- `.opencodian-skill-detail-modal` / `.opencodian-skill-detail-shell` / `.opencodian-skill-detail-layout`：技能详情编辑器的宽屏双栏布局，宽度进一步收在约 `1120px` 内，避免超宽窗口下显得过扁；双栏采用更明显的编辑器比例 `1.22fr / 0.78fr`，让源码区更主、预览区更辅。`modal-content` 本身是 `overflow: hidden` 的纵向 flex，shell 吃掉剩余高度，双栏区在中段独立滚动。
- `.opencodian-skill-editor-textarea` / `.opencodian-skill-preview-content`：源码与预览面板改为 `flex: 1` 的内部滚动区域，不再依赖固定大高度把 footer 挤到 modal 视窗外。
- `.opencodian-skill-detail-actions` / `.opencodian-skill-detail-action-button`：技能详情底部操作区，使用独立 footer 和直接按钮元素承载 `Save / Delete / Close`，保证较矮窗口下右下角操作仍留在 modal 内。
- `.opencodian-skill-validation*`：保存前格式校验状态，使用低调边框颜色表示 valid / invalid。

## Tool Permission Styles

- `.opencodian-tool-control-panel` / `.opencodian-tool-default-*`：Tools 页签顶部控制卡。它有意复用 `.opencodian-skill-control-panel`、`.opencodian-skill-permission-cluster`、`.opencodian-skill-permission-*` 和 `.opencodian-skill-toolbar` 的结构与样式 vocabulary，让工具权限配置和技能权限配置看起来属于同一套设置表单。
- `.opencodian-tool-authoring-actions`：自定义工具文件 authoring 工具条，承载 New tool、Refresh 和 Docs 等紧凑动作。它位于同一张 Tools 控制卡的权限 cluster 下方，而不是另起一张更重的面板。
- `.opencodian-tool-group-panel`：工具权限的分组面板，承载组标题、描述和权限行。
- `.opencodian-tool-permission-row`：单个工具权限行，带 `data-tool-permission` 标记供 ask / deny 状态做低调语义边框；`data-tool-permission-source="override"` 会用更明确的 tonal background 提示该工具已覆盖默认权限。
- `.opencodian-tool-file-card` / `.opencodian-tool-file-*`：自定义工具定义文件行，宽屏为“名称/来源/路径/说明 + 操作区”两列，窄屏退为单列。
- `.opencodian-tool-source-chip`：项目 / 全局工具来源 chip，使用低调边框和 background-secondary，不用重色块。
- `.opencodian-tool-row-actions` / `.opencodian-tool-row-action`：工具文件行中的 permission dropdown、Open、Delete 等操作区，保持 compact 表单节奏。
- `.opencodian-settings-inline-empty`：Skills / Tools / ACP 共享的空态与加载态 surface。

## ACP Agent Card Styles

- `.opencodian-acp-preset-rail`：新建和预设按钮的顶部 rail，左侧展示说明，右侧展示 custom / preset actions。
- `.opencodian-acp-agent-list`：agent card 的纵向列表容器。
- `.opencodian-acp-agent-card`：使用 object token weight 的 agent 配置卡片。
- `.opencodian-acp-agent-card-header`：卡片头部，展示 agent 名称、命令摘要、enabled toggle 与 remove 动作。
- `.opencodian-acp-agent-fields`：两列 stacked field grid，窄屏退化为单列。

## Tab Bar Scrolling

当一级标签数量超过可视宽度时，`.opencodian-settings-tabs-primary` 启用水平滚动（`overflow-x: auto`），隐藏滚动条高度为 4px，保持标签栏不换行（`flex-wrap: nowrap`）。

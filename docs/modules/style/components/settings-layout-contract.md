# Settings Layout Contract Styles

> 2026-07-29: Added token-aligned OpenCode trace status and recent-trace layouts.

> **源码**: `src/style/components/settings-layout-contract.css`
> **状态**: [REVIEW]

## 职责

定义设置界面的本地布局契约与共享 surface token。该文件为 classic 与 tabbed 设置界面提供统一的 section、ordinary setting row、object surface、inline group、半径与间距变量，并把共享设置容器映射到一致的视觉层级。

## Surface Contract

- `.opencodian-settings`：设置界面 token 作用域，所有 `--opencodian-settings-*` 变量都从 Obsidian 主题变量派生。
- `--opencodian-settings-form-row-*`：普通设置项的 shadcn-style Card + Field row token。它是 `--opencodian-settings-row-*` 的当前标准实现，背景必须保持中性，状态色只允许进入 badge、文字、outline 或真实 Alert/Empty surface。
- `.opencodian-settings-panel-title` / `.opencodian-settings-panel-title-actions`：设置页标题行。左侧保留 `SettingsPanelChrome` 的 OpenCodian logo / wordmark，action slot 右对齐承载 active backend icon switcher；它是标题 row，不是内容卡片。标题行上方 spacing 为 `12px`，品牌块左侧 padding 为 `0`，标题行右侧 padding 为 `56px`，用于避开 Obsidian 设置 modal 的关闭按钮区域。
- `.opencodian-settings-quick-nav` / `.opencodian-settings-tab-primary` / `.opencodian-settings-tab-secondary`：classic 与 tabbed 的同级 navigation-shell surface。它们可以显示 active / hover / focus 状态，但不承担内容卡片视觉。
- `.opencodian-settings-content-shell`：布局型内容 shell，用于承载 classic / tabbed 内容，不承担重卡片视觉。
- `.opencodian-settings-section-heading` / `.opencodian-settings-subsection-heading`：共享 Settings section/group heading 契约。所有标题重置 host heading 的 margin 与 inline padding，固定为 `14px / 700 / 1.35`，并由父级 stack 的 tokenized gap 决定节奏；classic 顶层 section ribbon 是保留的居中特例，使用 `24px` 上间距与 `12px` 下间距。
- `.opencodian-settings-section` / `.opencodian-settings-block.opencodian-settings-section`：共享 section block surface，使用 section 背景、边框与半径 token；legacy `.opencodian-settings-block` 本身保持兼容，不会单独触发契约样式。
- `.opencodian-settings-section-body` / `.opencodian-settings-block-body`：section 内部纵向 rhythm，普通设置行在这里按 row-card 规则排列。
- `.opencodian-settings-section .setting-item` / `.opencodian-settings-content-shell .setting-item`：普通设置项的轻量 row-card 样式，采用 shadcn `Card` + `Field` 的信息结构。前者覆盖 section body 内 rows，后者覆盖 tabbed content shell 内所有 ordinary setting descendants，例如 Server、Conversation、Commands、Formatter、Style、Debug 等嵌套设置行。左侧 `.setting-item-info` 放 label / description，右侧 `.setting-item-control` 放 dropdown、input、switch 或按钮。它和 object-card、readback、alert 等更重或更强状态 surface 区分。
- `.opencodian-codex-project-config-form`：Codex 项目配置的直接 row-card stack，使用 `--opencodian-settings-space-lg` 提供 12px 纵向间距，避免模型、推理强度、沙盒、审批、网络、网页搜索和额外目录字段贴合；不改变字段自身的 row-card 或响应式规则。
- `.opencodian-command-editor-advanced`：Commands 项目命令编辑器的原生 `<details>` disclosure。summary 使用 shadcn Accordion/Collapsible 式的整行 hover、可见 focus ring 与旋转 chevron；展开后保留 `8px` 的 row-card 间距，并把 agent/model/sampling fields 收紧为紧凑 Field rows，而不再把 disclosure 外层也做成第二张 Card。该 selector 复用共享半径、间距、focus 和 reduced-motion token。
- `.opencodian-settings-content-shell[data-primary-tab="conversation"] > [data-section-block]`：会话标签页的二级内容容器。Tabbed conversation 没有 classic block body 外层，因此这里显式提供 `12px` 垂直 rhythm，保证“标题 / 压缩 / 分享 / 显示与渲染 / 提问”各二级页中的 row-card 和自定义 sharing 面板都按同一 Card/Field 间距排列，而不是贴边堆叠。
- `.opencodian-wide-text-setting`：给路径、URL、访问令牌等长文本设置项使用的宽字段 row。它只放宽明确标记的输入，控制列在桌面端限制在 `clamp(320px, 42vw, 520px)`，窄屏退为单列，避免把 host/port/数字类短输入一起拉长。两条网格轨道都带容器相对下限（label 列 `min(200px, 45%)`，control 列 `min(280px, 50%)` + `min(..., 100%)` 上限）：固定上限的 control 轨道在 grid maximize 阶段总是赢过无下限的 fr 轨道，没有下限会在“面板窄但视口仍大于 720px”时把 label 列压成 0 宽、让文字完全消失。
- `.opencodian-settings-section .setting-item` / `.opencodian-settings-content-shell .setting-item` 的普通 row-card 网格同理：label 列 `minmax(min(160px, 45%), 1fr)`、control 列 `minmax(min(180px, 50%), max-content)`，保证窄面板下 label 永远可见。同一原则也已应用到 Debug 模块/导出/频道行、`.opencodian-share-policy-header` 和 `.opencodian-tool-permission-row > .setting-item`（label `min(140px–160px, 45%)`，control `min(160px–220px, 50%)`，固定上限轨道加 `min(..., 100%)` 容器封顶）。
- `.opencodian-debug-tab-shell` / `.opencodian-debug-tab-header` / `.opencodian-debug-tab-body` / `.opencodian-debug-tab-badge`：Debug 五个二级标签共享的 shadcn-inspired settings shell。它提供紧凑标题、说明、badge rail 和中性内容栈；不引入 React/Radix/Tailwind，也不改变 tab id 或设置保存语义。
- `.opencodian-debug-global-panel` / `.opencodian-debug-modules` / `.opencodian-debug-export` / `.opencodian-debug-workbench`：调试页四个来源子标签统一跟随 Debug tab shell + neutral Field row 语法。Plugin 的全局日志开关、Plugin/OpenCode 的模块开关、Claude Code 的 SDK 诊断块、Export 的路径/动作/控制台帮助都位于同宽 shell body 内，不再混用裸 setting row、外边距扩宽、object-card 或局部卡片。
- `.opencodian-debug-status-strip` / `.opencodian-debug-channel-list` / `.opencodian-debug-log-preview`：Claude Code 调试工作台内部布局。SDK 诊断状态使用 muted metadata rows 表达；普通 channel/module/export rows 使用 `--opencodian-settings-form-row-*`，不使用 `--opencodian-settings-object-*`、`interactive-accent`、purple/violet 或整行状态色边框。日志预览采用 ScrollArea-like bounded `pre`，不使用 dashboard 式指标卡或嵌套重卡片。
- `@media (max-width: 720px)`：tabbed settings 在窄宽下收紧 editor-area padding，primary/secondary tabs 允许换行，content shell、Debug tab shell、Debug header、ordinary setting rows、wide text rows、help rows 和 Debug channel rows 退为单列；Debug 描述和 block desc 使用 `overflow-wrap: anywhere`，确保 `server/config/model/streaming` 等长 token 不撑破行宽。
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

## Settings Form Row Card Contract

普通设置行现在统一为本地 shadcn-style `Card + Field` 规范，不引入 React、Radix 或 Tailwind：

- Card root 使用 `--opencodian-settings-form-row-bg`、`--opencodian-settings-form-row-border`、`--opencodian-settings-form-row-hover-bg`、`--opencodian-settings-form-row-radius` 和 `--opencodian-settings-form-row-shadow`。它同时适用于 marked section rows 和 tabbed content shell 内的 ordinary descendant rows。
- `--opencodian-settings-row-bg` / `--opencodian-settings-row-border` 继续作为兼容别名，但新样式应优先引用 `form-row` token，避免再把 ordinary row 误当成 object/status surface。
- 默认背景从 Obsidian `background-primary` 轻混 `background-secondary` 得到，保持低调中性。普通 setting row 不允许使用大面积 error/warning/accent tint。
- 状态表达应落在 badge、文字、focus ring、低调 border 或 `.opencodian-settings-inline-empty` / owner-specific alert 上。比如 Tools 的 ask/deny/override 只能改边框或 badge，不再给整行铺 accent 背景。
- Server > Connection 的连接模式、自动启动、OpenCode 可执行路径、host、port，以及 General 的设置界面模式、界面语言、在编辑区打开设置都继承同一 row-card contract。
- `.opencodian-wide-text-setting` 只是 Field/control column 宽度变体，不是另一套视觉样式。
- 不迁移 readback/proof/status panels、真正的 alert/empty、modal editor cards、chat/composer、permission dialog 或 streaming error blocks。

## Visible Unification Slice

本轮可见统一只处理 settings layout 的第一层观感：

- classic quick navigation 与 tabbed primary / secondary tabs 都使用轻量 navigation shell token。
- `.opencodian-settings-content-shell` 保持结构用途，不重新引入重 tab panel 卡片。
- `.opencodian-settings-section` 是本轮最强的通用内容 surface。
- 普通 `.setting-item` 继续保留轻卡片感，但必须只在 marked settings section 内生效，并使用 neutral form-row token，不使用整行状态 tint。
- preview / object-like descendants 可以映射到 object tokens；MCP、model availability、formatter runtime、agents、commands、plugins 和深层 style preview 仍属于后续 owner-specific migration。

不要重新引入带阴影的 `.opencodian-settings-tab-panel`，也不要在共享设置 section 上使用粗 `border-left` 侧边条。这两类样式会重新制造大卡片套大卡片或局部 UI 家族漂移。

## Guardrails

- 只在 `.opencodian-settings` / `.opencodian-settings-section` 作用域内影响设置界面，不使用全局 `.setting-item` 或未标记的 `.opencodian-settings-block` 选择器。
- 共享设置 surface、spacing、row-card、object-card 和 inline group token 归此模块所有；各 section CSS 不应重复定义一套半径、边框、背景或 row-card 间距。
- 新的视觉迁移应优先复用这些 token，再按 section 的真实职责增加更具体的 object-card、summary、toolbar 或 state 样式。
- navigation shell 的 hover / focus 只能改变背景、边框或 outline，不应使用会造成布局错觉的 translate 或重 shadow。
- 标题行 backend switcher 必须保持 compact icon-only，不应回到标题下方 text chip row，也不应使用左侧 fixed overlay 作为 tabbed settings 的稳定入口。
- 修改后运行 `npm run build:css` 刷新根目录 `styles.css`。

## Skill Catalog Styles

- `.opencodian-skill-settings-shell`：Skills 标签页的布局 shell，只负责控制面板与来源列表之间的垂直 rhythm，不再把整个技能页包成一个大 settings block。
- `.opencodian-skill-control-panel` / `.opencodian-skill-toolbar`：全局权限 dropdown 和当前标签的 scope action 控制栏。项目技能页只在顶部显示新建技能，外部技能页只在顶部显示刷新；工具条使用 shadcn Card/Form row 的结构语言，左侧 copy、右侧 action，不引入 React/Radix/Tailwind。
- `.opencodian-skill-permission-help-modal` / `.opencodian-skill-permission-help*`：默认技能权限的解释弹窗，使用三列卡片说明 allow / ask / deny，窄屏退为单列，并在底部提供官方文档链接。
- `.opencodian-skill-list`：ScrollArea root，内部使用共享 viewport/content/gutter 三层结构承载来源分组后的技能列表。Skills shell/list/viewport 使用 flex 高度链，并通过 `--opencodian-settings-scrollarea-available-height` 同时约束 viewport 的 `height` 和 `max-height`；长目录在列表内部滚动，而不是让 viewport 只占上方几行后露出大片空白背景、无界撑高到完整目录高度，或让 editor-area 外层滚动条继续滑到 content track 造成的空白区域。项目技能与外部技能的切换由设置布局自身的二级标签承载，不再在 Skills 页面内部维护额外分段控件。
- `.opencodian-skill-bulk-bar` / `.opencodian-skill-bulk-permission-group` / `.opencodian-skill-bulk-actions`：技能批量操作条，宽屏为“左侧批量权限 select + 已选数量，右侧动作组”。项目技能动作组包含全选、Refresh 和批量 Delete；批量权限下拉选择即应用，不再显示 Apply 按钮。外部技能页不渲染删除按钮，刷新保留在外部页顶部工具条。
- `.opencodian-skill-source-section` / `.opencodian-skill-source-header`：每个技能来源的 flat 分区与标题行，显示来源名和计数，让用户按来源扫描，而不是先穿过一个大卡片。

## Shared Session Manager Styles

- `.opencodian-share-policy-panel` / `.opencodian-share-policy-*`：Conversation > Sharing 顶部的分享策略控制面板，采用 shadcn Card + Field + Footer 语义。上层是紧凑的双列设置行：左侧解释项目级策略，右侧在同一行放置 Obsidian dropdown 与帮助按钮，并解除隐藏 info 后残留的原生 Setting grid 轨道，让可见操作组贴齐卡片右侧；不再用重复状态 chip 再显示一次 dropdown 值。窄屏时控制列换行并铺满可用宽度。
- `.opencodian-share-troubleshooting` / `.opencodian-share-troubleshooting-summary`：分享策略面板底部的诊断 footer，仍使用 `<details>` disclosure 维持键盘与折叠语义，但移除默认 disclosure 箭头。summary 行左侧显示“Sharing setup check / 分享连接检查”按钮式文本，右侧显示诊断状态 chip；展开后才显示 troubleshooting rows，不让诊断内容一上来挤占 sharing 主 surface。
- `.opencodian-share-diagnostics*`：分享策略面板内真正的诊断 rows。按钮会检查项目 share mode、OpenCode 服务健康状态和公共分享主机可达性，用 compact status rows 显示 ok / warning / error；diagnostics rows 本身不再承担顶部边框或折叠标题样式。
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

- `.opencodian-tool-control-panel` / `.opencodian-tool-default-*`：Tools 页签顶部控制卡。它有意复用 `.opencodian-skill-control-panel`、`.opencodian-skill-permission-cluster` 和 `.opencodian-skill-permission-*` 的结构与样式 vocabulary，但只承载默认权限 copy、状态 badge 和右侧 dropdown，不再承载 custom tool authoring actions。
- `.opencodian-tool-files-header` / `.opencodian-tool-files-copy` / `.opencodian-tool-files-actions` / `.opencodian-tool-files-count-badge`：自定义工具文件 header 的 shadcn CardHeader/CardAction 结构。左侧显示标题、说明和文件数量 badge；右侧同一按钮组承载 New tool、Refresh 和 Docs，其中 New tool 是 primary outline，Refresh/Docs 是低调 utility action。
- `.opencodian-tool-group-panel`：工具权限的 flat 分组，承载组标题、描述和 row-card 权限行；分组本身不再承担重卡片视觉。
- `.opencodian-tool-group-rows`：ScrollArea root，内部使用共享 viewport/content/gutter 三层结构，用于限制内置工具组和 custom runtime tool 列表高度，同时避免滚动条 gutter 缩短 row-card 宽度。
- `.opencodian-tool-permission-row`：单个工具权限行，带 `data-tool-permission` 标记供 ask / deny 状态做低调语义边框；`data-tool-permission-source="override"` 也只使用边框与 badge 表达覆盖状态，不再把整行染成 accent/tint 背景。
- `.opencodian-tool-row-badges` / `.opencodian-tool-badge-*`：权限行标题旁的 compact badges，展示 effective permission 以及 inherited / override / custom source，不改变 dropdown 的保存语义。
- `.opencodian-tool-file-card` / `.opencodian-tool-file-*`：自定义工具定义文件行，宽屏为“名称/来源/路径/说明 + 操作区”两列，窄屏退为单列。
- `.opencodian-tool-source-chip` / `.opencodian-tool-status-badge`：项目 / 全局来源与 editable / read-only 状态 chip，使用低调边框和 inline 背景，不用重色块。
- `.opencodian-tool-row-actions` / `.opencodian-tool-row-action`：工具文件行中的 permission dropdown、Open、Delete 等操作区，保持 compact 表单节奏。
- `.opencodian-settings-inline-empty`：Skills / Tools / ACP 共享的空态与加载态 surface。

## Agent Management Styles

- `.opencodian-agent-settings-shell` / `.opencodian-agent-settings-control-row` / `.opencodian-agent-catalog-list` / `.opencodian-agent-editor-*` / `.opencodian-agent-workspace-*` 由 `src/style/components/settings-agents.css` 拥有。
- Agents 页签借鉴 shadcn Card/Form row、Badge、ScrollArea、Accordion/Disclosure 和 Alert/Empty 结构，但保持 Obsidian DOM + CSS 实现，不引入新依赖。
- 该样式模块只服务 Settings > Agents，不覆盖聊天 agent selector、Skills、Tools 或 ACP。详细契约见 `docs/modules/style/components/settings-agents.md`。

## Settings Extension Control Surface

- `.opencodian-settings-extension-shell`：Skills / Tools / ACP 共享的布局 shell 语义，当前主要由 ACP 使用；它和 `.opencodian-skill-settings-shell` 一样只提供垂直 rhythm，不添加外层卡片。
- Skills、Tools、ACP 共享 row-card、badge、scroll-list、toolbar 和 empty-alert 规范，归 `settings-layout-contract.css` 拥有；Agents 专用的 catalog/editor/workspace 样式仍归 `settings-agents.css`，两者不要混放。
- 借鉴 shadcn/Radix 的 Card、Badge、Button、Select、Switch、ScrollArea、Alert 和 Separator 结构，不采用 Sheet/Drawer、Table、Command 或替换现有 detail modal。

## Settings ScrollArea Alignment

- `.opencodian-settings-scrollarea`：共享 ScrollArea root，负责和 sibling toolbar / control panel 对齐外宽，不承担滚动。
- `.opencodian-settings-scrollarea-viewport`：唯一滚动层，承载 `overflow: auto`、`max-height` 和 `scrollbar-gutter: stable`。读取或恢复列表滚动位置时应访问 viewport，而不是 root。
- `.opencodian-settings-scrollarea-content`：row-card 内容轨道。Skills source section、Tools permission/file rows、ACP agent rows 和 empty-alert 都渲染到 content 内，保证空态、批量栏和普通 row 使用同一宽度。
- `.opencodian-settings-scrollarea-gutter`：预留的无交互 gutter layer，供经典滚动条落在内容轨道外侧；实际宽度由 section owner 测量 `viewport.offsetWidth - viewport.clientWidth` 后写入 `--opencodian-settings-scrollbar-track-width`。
- `.opencodian-settings-scrollarea-content--skills` / `--tools` / `--acp`：按 surface 设置不同 gap，但不能改变 shared root / viewport / content 语义。Skills content track 是内部滚动内容，不能重新参与 editor-area 外层滚动高度计算。
- 该 contract 修复 Skills / Tools / ACP 中“上方 control card 比下方 row-card 更宽”的错位问题；后续 settings scroll-list 不应回到 root 自身 `overflow:auto + padding-right` 的结构。

## ACP Agent Row Styles

- `.opencodian-acp-settings-shell`：ACP 一级标签的 extension shell，使用 `data-settings-extension-surface="acp"` 标记，保持和 Skills / Tools 一致的设置表面节奏。
- `.opencodian-acp-create-card` / `.opencodian-acp-create-header` / `.opencodian-acp-create-actions`：新建和预设按钮的顶部 shadcn-style Card surface。Header 左侧展示标题与说明，右侧显示 compact count badge；actions content 使用 primary action + preset rail，`Custom agent` 是主按钮，OpenCode、Codex、Claude Code 是紧凑 preset buttons。旧 `.opencodian-acp-preset-*` class 只作为 DOM 兼容，不再拥有核心布局。
- `.opencodian-acp-create-action-button` / `.opencodian-acp-create-action-icon` / `.opencodian-acp-create-action-label`：ACP create action 的 shadcn-style outline Button anatomy。预设按钮通过 settings backend switcher 的 LobeHub renderer 显示同源 backend identity mark，label 保持单行截断；自定义代理使用同尺寸 fallback glyph，避免首个按钮和预设按钮视觉节奏不一致。
- `.opencodian-acp-agent-list`：ScrollArea root，使用 `role="list"`，内部 content track 承载 agent rows；ACP 覆盖 shared viewport 的加宽/负 margin gutter 补偿，改用 `width: 100%` 与 `scrollbar-gutter: auto`，确保 agent row-card 右边缘与顶部 create card 对齐。
- `.opencodian-acp-agent-row-card`：ACP agent 的 editable row-card group，使用 `role="listitem"`、`data-acp-agent-id` 和 `data-acp-agent-enabled` 暴露状态。
- `.opencodian-acp-agent-title-row` / `.opencodian-acp-agent-status-badge`：agent 名称旁的 enabled / disabled badge；toggle 变化会同步更新 badge 和 `data-acp-agent-enabled`。
- `.opencodian-acp-agent-card-header`：行头部展示 agent 名称、状态 badge、命令摘要、enabled toggle 与 remove 动作。
- `.opencodian-acp-field-group`：同一 row-card 内的两列 shadcn-style FieldGroup，承载 name / command / args / cwd，窄屏退化为单列。

## Tab Bar Scrolling

当一级标签数量超过可视宽度时，`.opencodian-settings-tabs-primary` 启用水平滚动（`overflow-x: auto`），隐藏滚动条高度为 4px，保持标签栏不换行（`flex-wrap: nowrap`）。

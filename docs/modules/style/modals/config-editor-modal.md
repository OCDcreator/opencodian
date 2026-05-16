# Config Editor Modal Styles

> **源码**: `src/style/modals/config-editor-modal.css`
> **状态**: [FINAL]

## 职责

负责设置相关弹窗的大型样式集合，包括配置编辑器、会话设置、上下文消耗明细、模型可用性管理、模型工作区（workspace）与设置块组件。

## 关键类名 / CSS 变量

- 配置编辑：`.opencodian-config-editor*`、`.opencodian-config-help*`、`.opencodian-config-buttons`。
- 压缩帮助弹窗：`.opencodian-conversation-compaction-help-modal`、`.opencodian-conversation-compaction-help`、`.opencodian-compaction-help-*`（宽桌面卡片式 help modal，避免沿用默认窄容器和内部滚动）。
- 项目配置帮助弹窗：`.opencodian-project-config-help-modal`、`.opencodian-project-config-help`、`.opencodian-project-config-help-*`（用于 share / permission.bash 这类项目级 OpenCode 配置解释，主体是短列表 + 官方链接区）。
- 会话设置分享动作：`.opencodian-session-settings-sharing-status`、`.opencodian-session-settings-sharing-url`、`.opencodian-session-settings-sharing-hint`、`.opencodian-session-settings-sharing-actions` 与 `.opencodian-session-settings-sharing-button`，用于当前会话的分享状态、公开链接、禁用提示、share/unshare 操作按钮。
- 会话设置：`.opencodian-session-settings-*`（中性 hero、分组 card、两栏字段、内容自适应三态 segmented button、数字输入、错误提示、sticky footer，以及全局默认值摘要行）。
- 上下文统计：`.opencodian-context-breakdown*`、`.opencodian-context-modal-*`、`.opencodian-context-detail-modal*`。
- 模型开关管理：`.opencodian-model-toggle-*`。
- 模型工作区：`.opencodian-model-workspace-*`（平铺表单、预设选择器、provider 切换条、工具条、JSON 预览、状态徽章）。
- 设置区块：`.opencodian-settings-block*`。
- 代理 / 命令设置目录：`.opencodian-agent-editor-*`、`.opencodian-settings-catalog-scroll`、`.opencodian-agent-catalog-scroll`、`.opencodian-command-catalog-scroll`（项目代理编辑器分组卡片、默认折叠的高级区，以及代理 / 命令目录最大高度 + 内部滚动）。
- MCP 设置：`.opencodian-mcp-*`（management toolbar + metric cards、server cards、runtime switch label、status/detail modal、editor modal grouped form）。
- provider 卡片 / 预设卡片：`.opencodian-settings-provider-*`、`.opencodian-preset-*`。
- 模型选择弹层：`.opencodian-model-picker-*`（列表、搜索、筛选、选项、provider 分组标题与图标、source badge、空状态、响应式折行）。

## 关联 TS 组件

- `src/features/settings/OpencodeConfigModal.ts`
- `src/features/settings/ModelConfigJsonModal.ts`
- `src/features/settings/ModelConfigModal.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/ConversationCompactionHelpModal.ts`
- `src/features/settings/SettingsAgentsSection.ts`
- `src/features/settings/SettingsProjectAgentEditor.ts`
- `src/features/settings/SettingsMcpSection.ts`
- `src/features/settings/SettingsMcpAddForm.ts`
- `src/features/settings/McpServerEditorModal.ts`
- `src/features/settings/McpServerStatusModal.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `src/features/chat/ui/ContextDetailModal.ts`

## 修改注意点

- 该文件是“设置弹窗样式聚合点”，命名冲突风险高，新增类建议保持 `opencodian-<feature>-*` 前缀。
- 含较多响应式规则（`@media`），改网格列数、工具条折行或 footer 粘底时需同时检查窄屏可读性。
- `ContextDetailModal` 通过 `.opencodian-context-detail-modal` 直接覆盖 Obsidian 默认 modal 宽度；若切回 `:has(...)` 或改 class 名，需确认 raw message JSON 在宽窗口下不会再次被默认壳层截断。
- `ConversationCompactionHelpModal` 也通过专用 class 直接放宽 modal 宽度，并把内容做成 2×2 信息卡；如果改回 `.opencodian-config-help` 默认壳层，容易重新出现内容过窄和内部滚动问题。
- 代理设置相关样式现在混合了静态卡片和 `details/summary` 折叠区；如果修改 `.opencodian-agent-editor-group-summary` 的交互样式，需同时确认默认折叠的“高级配置”仍能看出可展开状态。
- `model availability` 里的 `.opencodian-model-availability-controls` 现在只负责布局，不再自带分组大卡片壳；如果后续想恢复这层视觉容器，先确认不会重新出现“外层模型 block 里再包一层 controls 大卡片”的双层嵌套感。
- `opencodian-settings-catalog-scroll` 只负责目录块的内部滚动高度，不应把整个 settings 容器再次改成双滚动。
- `opencodian-mcp-server-card-main` 默认是三列对齐，但窄屏会退化成单列；如果修改卡片 grid，记得同时检查状态 badge、transport badge 和按钮在移动宽度下不会重新挤压换行得太难看。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。

## 2026-05-09 Session settings summary rows

`ConversationSessionSettingsModal` 的 Display 分组下方新增全局默认值摘要样式：

- `.opencodian-session-settings-summary-divider`：显示设置与只读摘要之间的分隔区。
- `.opencodian-session-settings-summary-row`：单行摘要的卡片 / grid 容器。
- `.opencodian-session-settings-summary-label-group` / `.opencodian-session-settings-summary-label` / `.opencodian-session-settings-summary-description`：摘要行左侧标签与可选说明。
- `.opencodian-session-settings-summary-chips` / `.opencodian-session-settings-summary-chip`：右侧只读状态 chip 列表。
- `.opencodian-session-settings-summary-link`：跳转主设置页的 “Open settings” 按钮。
- 窄屏响应式规则会把摘要行改成单列，并让 chip 与按钮自然折行。

## 2026-05-12 Model availability density slice

模型可用性 / provider 管理区现在映射到共享 settings hierarchy token：

- search / filter controls 使用 inline tokens，不再像独立 glass toolbar。
- catalog summary card 与 provider row 使用 object tokens，不使用渐变、blur、hover lift 或装饰性阴影。
- 展开的 model row 使用 row tokens，避免 provider object row 内再出现另一套完整卡片家族。
- status badge 保留语义色，因为 provider / model availability 是决策关键状态。

Guardrail: 不要在 `.opencodian-model-toggle-provider` / `.opencodian-model-toggle-model` 上重新引入 `linear-gradient`、`backdrop-filter`、hover `translateY` 或 black-tinted card shadow。

## 2026-05-12 MCP/server density slice

MCP management 现在遵守共享 settings hierarchy token：

- management toolbar 使用 inline tokens，不再自成一张本地 toolbar 卡片。
- overview metrics、server cards、details panels 和 editor form groups 使用 object tokens。
- helper / error / empty rows 使用 row tokens。
- MCP status badges 保留语义色，因为 runtime connection、auth、failure 和 disabled 状态会影响用户决策。

Guardrail: 不要在 `.opencodian-mcp-*` 管理区重新引入 MCP-only card family，也不要使用渐变、decorative blur、hover lift、side-stripe border 或 shadowed nested cards。

## 2026-05-12 Formatter density slice

Formatter settings 现在使用共享 settings hierarchy token：

- summary cards、runtime list、builtin rows 和 custom rows 使用 object tokens。
- runtime table、override fields、custom fields 和 JSON editor 使用 row tokens。
- environment key/value rows 使用 inline tokens。
- enabled / disabled formatter badges 保留语义状态色。
- detected formatter 表格的搜索区、sticky 表头、排序按钮、扩展名列和状态列有独立样式钩子，用于保持密集扫读：搜索框内联标签，排序按钮重置 Obsidian 默认 button chrome，扩展名使用 monospace，状态 chip 右对齐。
- detected formatter 表格搜索和 builtin formatter / LSP 长列表都使用 `.opencodian-builtin-list-search*` 自定义搜索控件：inline toolbar、monospace 计数 chip、透明清除按钮、row-token 空态，以及 Obsidian-native 的绝对定位建议浮层；builtin 列表额外使用 `.opencodian-builtin-list-status-filter` 原生 select 作为项目状态筛选，和搜索框共享同一行 sticky toolbar，不引入独立卡片层级。builtin row 的状态 chip 现在挂在 `.setting-item-name` 内，紧跟 formatter / LSP 名称，`.opencodian-builtin-row-meta` 只承载唯一的扩展名文本，`.opencodian-builtin-row-status-chip[data-status]` 负责默认 / 项目覆盖 / 项目禁用的轻量语义色，`.opencodian-formatter-builtin-row.is-collapsible` 表示点击 row 空白区可折叠 override fields。builtin 列表的内部滚动容器 `.opencodian-formatter-builtin-scroll` 自带 top padding / scroll padding，避免滚动时 row 被 sticky 搜索框贴住；滚动条保持隐藏但仍可滚动，避免不同平台 scrollbar gutter 宽度导致 sticky 搜索框和滚动列表视觉宽度不一致。过滤时 TS 会给第一个和最后一个可见 builtin row 标记 `.is-first-visible` / `.is-last-visible`，CSS 用它们补足列表和 section 底部之间的 spacing；无匹配时 `.opencodian-builtin-list-search-empty` 负责保留底部 breathing room，避免隐藏行破坏 `:last-of-type` 间距。

Guardrail: 不要引入 formatter-only card hierarchy、渐变、decorative blur、hover lift、side-stripe border 或未定义的 settings radius token。

## 2026-05-12 Agents / Commands / Plugin catalog density slice

Agents、Commands 和 Plugin settings 现在共享同一组 plugin/catalog density contract：

- `.opencodian-plugin-block` 是无框 section shell，不再是一张嵌套大卡片。
- catalog `Setting` rows 和 plugin summary rows 使用 row tokens。
- agent editor groups 和 plugin source items 使用 object tokens。
- plugin source paths 使用 inline tokens；目录来源需要逐行显示 path status chip，并用 count chip 表示该分组实际检测到的插件数，避免把 missing directory 和 detected plugin entries 混成一个状态；路径块后面的 list 和 empty state 都必须保留同一档 `--opencodian-settings-space-md` 间距。

Guardrail: 不要在 `.opencodian-plugin-block*`、`.opencodian-settings-catalog-scroll`、`.opencodian-agent-editor-*` 或 `.opencodian-plugin-source-*` 重新引入大卡片套小卡片、渐变、decorative blur、hover lift、side-stripe border 或未定义的 settings radius token。

### 2026-05-12 classic hierarchy repair

第五轮的平铺模式反馈表明：Agents、Commands 和 Plugin catalog 的子选项很多，完全扁平会让 classic mode 失去二级层级。现在规则调整为：

- tabbed mode 继续保持 `.opencodian-plugin-block` 无框，因为二级 tab 已经承担分层。
- classic mode 下 `.opencodian-plugin-block` 使用 object tokens 作为轻量 section panel，帮助用户扫描多个子块。
- catalog rows 仍使用 row tokens，避免回到旧的大卡片套小卡片。

### 2026-05-13 classic catalog readability pass

第七轮只增强 classic mode 下 catalog-like 子块的扫读层级，不改变 tabbed mode：

- classic `.opencodian-plugin-block` padding 增至 14px，保留 object token 背景、边框、半径和 `box-shadow: none`。
- classic 子块 heading 固定为 13px / 1.35 line-height，避免标题和父 section 标题抢层级。
- classic `.opencodian-plugin-block-body` 增加 object-border token 的 1px top divider，并使用 `--opencodian-settings-space-lg` 作为标题区与内容区间距。
- classic catalog rows 之间使用 `--opencodian-settings-space-md`，让大量 Agents / Commands / Plugin rows 不再挤成一团。

Guardrail: 这次增强只允许 classic mode 获得更明确的 child panel rhythm。Tabbed mode 的 `.opencodian-plugin-block` 必须继续透明、无框、无 shadow。

### 2026-05-13 classic local hierarchy pass

第八轮只增强 classic mode 下 MCP、Formatter、Model availability 的局部层级，不改变功能和 tabbed mode：

- classic `.opencodian-model-toggle-block` 覆盖旧的 gradient / blur / heavy shadow，改用 object tokens、14px padding、row radius，并显式 `box-shadow: none` 与 `backdrop-filter: none`。
- classic `.opencodian-model-toggle-desc` 使用 object-border token 的分隔线，provider rows 之间使用 `--opencodian-settings-space-md`。
- classic `.opencodian-mcp-overview-shell` 使用 `--opencodian-settings-space-lg` 加强 overview 内部 rhythm；server list shell 增加 object-border token 的 top divider。
- classic `.opencodian-mcp-server-list` 使用 `--opencodian-settings-space-md`，让 server cards 在平铺流里更容易分辨。
- classic `.opencodian-formatter-summary-cards` 增加 top divider 与 `--opencodian-settings-space-lg` spacing；builtin / custom formatter rows 使用 `--opencodian-settings-space-md`。
- formatter config 中 `.opencodian-settings-block` 直接包含的 builtin / custom rows 会在 classic 和 tabbed 两种模式下获得左右 inset、首尾 spacing、row spacing，并把内部 `Setting` 约束为 `1fr + 180-260px` 两列，避免“内置格式化器”标题下的行贴边、贴顶或右侧下拉过宽。

Guardrail: MCP、Formatter、Model availability 的精修只能增加局部节奏和分隔，不应恢复 section 内的大卡片套大卡片、decorative blur、gradient、hover lift 或 heavy shadow。

### 2026-05-15 formatter/lsp overview readability pass

Formatter & LSP overview 顶部的 2x2 meta cards 不再把状态写成一整句 desc：

- `.opencodian-formatter-overview-meta-card` 继续使用 object token 的边框、背景和 row radius，但新增 `data-tone` 语义色，只做非常轻的 tonal tint，不引入 gradient、blur 或 hover lift。
- `.opencodian-formatter-overview-meta-body` / `-value` / `-description` 把主值和解释拆成两层，mode 卡片显示“模式名 + 说明”，config path 卡片用 monospace 主值显示长路径。
- `.opencodian-formatter-overview-meta-pills` + `-pill` 负责 runtime 小胶囊，把 Formatter / LSP 在线状态拆开显示，避免 `Formatter: ... · LSP: ...` 这种长句挤在一行里。
- `.opencodian-formatter-summary-card` 也同步从单行文本改成 `label + emphasized value`，保持概览区的层级一致性。

Guardrail: 这轮只是把 overview 信息拆层，不应该把卡片做成营销面板。保持 settings token、低对比 tint、无 decorative motion、无 glassmorphism。

### 2026-05-15 formatter/lsp runtime panel header pass

- `.opencodian-formatter-runtime-panel` 现在作为 runtime 卡片外壳，统一承接 object token 的边框、背景和圆角。
- `.opencodian-formatter-runtime-panel-summary` + `.opencodian-formatter-runtime-panel-header` 给 formatter 与 LSP 卡片提供一致的标题区层级：左侧 title，右侧 meta chip。
- `已检测格式化器` 使用 runtime panel summary 行承载折叠交互，整个 summary 行可点击，而不是只在标题旁边放一个小按钮。
- `LSP` 卡片复用同一套 header 样式，但保留静态 header，不引入不必要的折叠交互。

Guardrail: 这轮只增加更清晰的标题层级和原生折叠 affordance，不应引入厚重工具栏、夸张 hover 动画或额外装饰图标。

### 2026-05-16 formatter runtime table search/sort pass

- `.opencodian-formatter-runtime-toolbar` 在已检测 formatter 表格上方提供紧凑工具条，目前只承载本地搜索；它使用 flex + wrap，保留窄侧栏下换行能力。
- `.opencodian-formatter-runtime-search-input` 复用 inline surface token、pill radius 和 focus ring，避免把搜索框做成独立大卡片。
- `.opencodian-formatter-runtime-table-shell` 是表格内部滚动容器，`thead` / `th` 都设置 sticky 层级，确保表格内部滚动时表头始终置顶。
- `.opencodian-formatter-runtime-list` 保留 12px 顶部 padding，确保 formatter 工具条与 LSP 运行时条目都不会贴住 panel header 分隔线。
- `.opencodian-formatter-sort-header` 直接让 `Name` / `Extensions` / `Status` 原生表头承载排序交互，不再渲染 button；默认保持 muted，排序激活时使用 text-accent、`aria-sort` 和 CSS chevron 指示方向。
- 表格搜索和排序只调整当前 runtime 表格视图，不改变 formatter runtime 数据，也不写入项目配置。

Guardrail: 这轮是工作台式表格控制增强，不应引入独立筛选面板、持久排序设置、复杂多选过滤器或新的卡片层级。

### 2026-05-16 formatter/LSP editor field width pass

- `.opencodian-formatter-override-fields`、`.opencodian-formatter-custom-fields` 和 `.opencodian-formatter-env-editor` 内部的 `Setting` row 改为局部两列 grid：左侧说明保留密度，右侧字段列使用 `minmax(280px, 1fr)` 吃满可用编辑区域。
- command、extensions、environment 以及 LSP initialization 输入显式 `width: 100%` / `max-width: 100%`，避免 Obsidian 默认 text input 宽度截断 `例如 prettier --write $FILE` 这类 inline hint。
- builtin formatter/LSP override fields 显式支持 `[hidden] { display: none; }`，避免基础 `display: flex` 规则覆盖折叠态，导致 DOM 已折叠但视觉仍显示表单。
- 900px 以下退为单列，按钮与字段左对齐，避免窄设置面板里为了显示 placeholder 产生横向溢出。

Guardrail: 只放宽 formatter/LSP 编辑字段，不放宽 builtin row 顶部 action dropdown，也不把所有设置页 input 全局拉长。

### 2026-05-15 model availability rhythm pass

provider / model 管理区在交换 actions 与 search 行顺序后，纵向节奏改成“两层 gap”而不是依赖零散 margin 叠加：

- `.opencodian-model-toggle-management` 作为外层 stack，显式覆盖共享 section-body 的默认 `8px` gap，改用 `12px` 主节奏。
- `.opencodian-model-toggle-catalogs` 自己再用 `12px` 子节奏串联 bulk actions 与 summary cards，不再额外吃 bottom margin。
- `.opencodian-model-availability-controls` 与 `.opencodian-model-catalog-summary-grid` 去掉各自的 `margin-bottom`，provider list 顶部也不再额外补 `margin-top`。

Guardrail: 如果后续继续调整 availability 区，不要再把 `actions / summary / controls / provider list` 的纵向空隙拆回多个 margin。优先让外层 stack 决定主节奏，让 catalogs 子容器决定内部节奏。

## 2026-05-13 Model picker visual refresh

模型选择弹层（`ModelPickerModal`）进行视觉重构：

- 控件区使用统一的 `40px` 高度和 `10px` 圆角，搜索框与 provider 下拉在 `520px` 以下自动垂直堆叠。
- 列表区新增 `.opencodian-model-picker-list-inner` 内层容器与 `.opencodian-model-picker-divider` 分隔线，空选项现在融入列表流。
- provider 分组标题支持 `.opencodian-model-picker-group-icon` 图标位，标题取消全大写，改用 `13px` semibold。
- source badge 缩小为 `10px` 的 muted pill，不再使用高对比色块。
- 模型选项取消外边框，改用 transparent background + hover tonal lift；选中状态只保留勾选与轻边框，避免非悬浮状态下出现绿色背景。
- 空选项（如“跟随当前会话模型”）选中时同样不铺 accent 背景，保持 subdued。
- 选项间距从 `8px` 收紧到 `2px`，分组间距保持 `16px`，形成更清晰的“紧凑列表 + 分组留白”节奏。

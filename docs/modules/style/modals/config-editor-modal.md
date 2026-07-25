# Config Editor Modal Styles

> **源码**: `src/style/modals/config-editor-modal.css`
> **状态**: [FINAL]

## 职责

负责设置相关弹窗的大型样式集合，包括配置编辑器、会话设置、上下文消耗明细、模型可用性管理、模型工作区（workspace）与设置块组件。

## 关键类名 / CSS 变量

- 配置编辑：`.opencodian-config-editor*`、`.opencodian-config-help*`、`.opencodian-config-buttons`、`.opencodian-config-source-select`（来源下拉，全宽）、`.opencodian-config-source-metadata`（scope/path/exists/editable/revision/parse-error/evidence 的 12px muted 元数据列；mono 行用 `data-config-path|revision|parse-error|evidence` 标记，11px monospace + break-all）、`.opencodian-config-source-status`（`role="status"` 的 muted 状态行）与 `.opencodian-config-history*`（`:empty` 隐藏的历史区、h4、target 卡片、`-target-path` mono 路径、entry 11px mono、empty muted、error warning 边框）。
- 压缩帮助弹窗：`.opencodian-conversation-compaction-help-modal`、`.opencodian-conversation-compaction-help`、`.opencodian-compaction-help-*`（宽桌面卡片式 help modal，避免沿用默认窄容器和内部滚动）。
- 项目配置帮助弹窗：`.opencodian-project-config-help-modal`、`.opencodian-project-config-help`、`.opencodian-project-config-help-*`（用于 share / permission.bash 这类项目级 OpenCode 配置解释，主体是短列表 + 官方链接区）。
- 会话设置分享动作：`.opencodian-session-settings-sharing-status`、`.opencodian-session-settings-sharing-url`、`.opencodian-session-settings-sharing-hint`、`.opencodian-session-settings-sharing-actions` 与 `.opencodian-session-settings-sharing-button`，用于当前会话的分享状态、公开链接、禁用提示、share/unshare 操作按钮。
- 会话设置：`.opencodian-session-settings-*`（中性 hero、分组 card、两栏字段、内容自适应三态 segmented button、数字输入、文本输入、错误提示、透明 sticky footer，以及全局默认值摘要行）。
- 上下文统计：`.opencodian-context-breakdown*`、`.opencodian-context-modal-*`、`.opencodian-context-detail-modal*`。
- 模型开关管理：`.opencodian-model-toggle-*`。
- 模型 provider directory 诊断：`.opencodian-model-provider-directory-summary`（显示 `provider.list()` connected / listed / listed outside catalog 辅助计数，不承担可选模型目录布局）与 `.opencodian-model-status-badge.is-diagnostic`（provider 行的中性目录诊断 badge）。
- 模型 V2 影子比较：`.opencodian-model-catalog-comparison` 与 `is-match` / `is-drift` / `is-unavailable` 变体；三态均使用中性主题变量，不把 V2 不支持或暂时读取失败显示成错误红色。
- 模型工作区：`.opencodian-model-workspace-*`（平铺表单、预设选择器、provider 切换条、工具条、JSON 预览、状态徽章）。
- 设置区块：`.opencodian-settings-block*`。
- 代理 / 命令设置目录：`.opencodian-agent-editor-*`、`.opencodian-settings-catalog-scroll`、`.opencodian-agent-catalog-scroll`、`.opencodian-command-catalog-scroll`（项目代理编辑器分组卡片、默认折叠的高级区，以及代理 / 命令目录最大高度 + 内部滚动）。
- 命令目录卡片：`.opencodian-cmd-catalog-*`（搜索栏、筛选标签、按需显示的批量操作栏、两列卡片网格、方形批量选择 checkbox、复用 Obsidian `checkbox-container` 的可见性 switch、来源/状态芯片、可折叠描述、滚动容器）。
- MCP 设置：`.opencodian-mcp-*`（management toolbar + metric cards、server cards、runtime switch label、status/detail modal、editor modal grouped form）。
- Codex MCP 服务器详情：`.opencodian-codex-mcp-detail-modal`、`.opencodian-codex-mcp-server-section*`、`.opencodian-codex-mcp-resource-*`、`.opencodian-codex-mcp-tool-*`（顶部摘要 + server sections，工具/资源使用轻量 row/list，无嵌套卡片）。
- Codex 诊断 readback 弹窗：`.opencodian-codex-readback-modal`、`.opencodian-codex-readback-*`（intro、notes、status bar、content、row、code block）。
- provider 卡片 / 预设卡片：`.opencodian-settings-provider-*`、`.opencodian-preset-*`。
- 模型选择弹层：`.opencodian-model-picker-*`（列表、搜索、筛选、选项、provider 分组标题与图标、source badge、空状态、响应式折行）。
- 线程目标 readback + set/clear：`.opencodian-session-settings-codex-goal-*`（shell 容器、readback 卡片、objective 文本、status/token/time 预算 meta、空状态提示、set 输入行 + 按钮、clear 按钮）。

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
- `src/features/settings/CodexMcpServerDetailModal.ts`
- `src/features/settings/CodexReadbackModal.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `src/features/chat/ui/ContextDetailModal.ts`

## 修改注意点

- 该文件是“设置弹窗样式聚合点”，命名冲突风险高，新增类建议保持 `opencodian-<feature>-*` 前缀。
- 插件管理区现在包含安装区与每个条目的 toggle / uninstall / delete 控制，样式仍应复用既有 plugin/catalog density contract。
- 含较多响应式规则（`@media`），改网格列数、工具条折行或 footer 粘底时需同时检查窄屏可读性。
- `ContextDetailModal` 通过 `.opencodian-context-detail-modal` 直接覆盖 Obsidian 默认 modal 宽度；若切回 `:has(...)` 或改 class 名，需确认 raw message JSON 在宽窗口下不会再次被默认壳层截断。
- `ConversationCompactionHelpModal` 也通过专用 class 直接放宽 modal 宽度，并把内容做成 2×2 信息卡；如果改回 `.opencodian-config-help` 默认壳层，容易重新出现内容过窄和内部滚动问题。
- `ConversationSessionSettingsModal` 的 sticky footer 只负责把取消 / 保存按钮固定在底部，不应重新添加独立 top border、渐变遮罩或不透明背景带；按钮区应承接弹窗自身背景，保持会话设置弹窗底部统一。
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

- `opencodian-mcp-settings-shell` 是 layout-only stack，overview 和 server list 是并列 section，不额外包一层 settings block。
- `opencodian-mcp-overview-shell` 自己承担 summary card 边界、背景和圆角；内部 `management toolbar` 只做 CardHeader 风格布局层，左侧 title/description，右侧 Refresh / Add Server。
- overview metrics 改成低调 pill status rail，不再使用 dashboard metric cards。
- server list 使用共享 ScrollArea root / viewport / content 结构，长列表只在 viewport 内滚动。
- server cards 使用 neutral form-row tokens；details panels 和 editor form groups 继续使用 object tokens。
- helper / error / empty rows 使用 row tokens。
- MCP status badges 保留语义色，因为 runtime connection、auth、failure 和 disabled 状态会影响用户决策。

Guardrail: 不要在 `.opencodian-mcp-*` 管理区重新引入 MCP-only card family，也不要使用渐变、decorative blur、hover lift、side-stripe border 或 shadowed nested cards。

## 2026-06-29 Formatter neutral data row slice

Formatter / LSP builtin and custom rows now follow the Settings Neutral Data Row Surface:

- `.opencodian-formatter-builtin-row` and `.opencodian-formatter-custom-row` use neutral form-row tokens instead of object-card tokens. Ordinary default / override / disabled rows must not use large accent, warning, rose, gradient, or purple-tinted frames.
- `.opencodian-formatter-row-field` and `.opencodian-formatter-row-control` are stable DOM hooks for the shadcn-style Field layout: name + compact badge on the left, Select/control column on the right.
- `.opencodian-builtin-row-meta` only carries muted monospace extension metadata. Status chips stay inside `.setting-item-name`.
- `.opencodian-formatter-field-group` marks expanded override/custom editors. It is a flat FieldGroup with a subtle top separator, not a nested Card.
- `.opencodian-formatter-add-custom-row` is the custom formatter section footer action row. It must stay transparent and margin-aligned inside the section; it is not a `.opencodian-formatter-custom-row` and must not inherit ordinary setting-card background/border/shadow. Since 2026-07-22 its grid tracks carry container-relative floors (label `min(180px, 45%)`, control `minmax(min(280px, 50%), min(520px, 100%))`) so the label can no longer collapse to zero width in narrow settings panes.
- `.opencodian-formatter-section-description` renders advanced JSON helper copy as plain muted text. `.opencodian-formatter-json-editor` is the single textarea panel, and `.opencodian-formatter-json-buttons` is a transparent ButtonGroup footer with no nested `.setting-item`.
- `.opencodian-formatter-inline-empty` applies the shared inline empty-alert surface to builtin/custom Formatter/LSP empty states instead of using a regular Setting row.

Guardrail: Formatter/LSP sections may contain row-cards, flat field groups, editor panels, and inline empty alerts, but must not wrap descriptions, textareas, or button footers in another full `.setting-item` card.

## 2026-05-12 Formatter density slice

Formatter settings 现在使用共享 settings hierarchy token：

- summary cards 和 runtime list 使用 object tokens；builtin rows 和 custom rows 使用 neutral form-row tokens。
- runtime table、JSON editor、override fields 和 custom fields 使用 row / FieldGroup tokens。
- environment key/value rows 使用 inline tokens。
- enabled / disabled formatter badges 保留语义状态色。
- detected formatter 表格的搜索区、sticky 表头、排序按钮、扩展名列和状态列有独立样式钩子，用于保持密集扫读：搜索框内联标签，排序按钮重置 Obsidian 默认 button chrome，扩展名使用 monospace，状态 chip 右对齐。
- detected formatter 表格搜索和 builtin formatter / LSP 长列表都使用 `.opencodian-builtin-list-search*` 自定义搜索控件：inline toolbar、monospace 计数 chip、透明清除按钮、row-token 空态，以及 body-level fixed 定位建议浮层（`.opencodian-builtin-list-search-popover`，`position: fixed; z-index: 2280`，由 `SettingsPopoverController` 管理定位和生命周期；popover 在创建时保持 detached，仅在用户触发搜索时由 controller 挂载到 `document.body`）。搜索历史浮层（`.opencodian-settings-search-history-popover`）同样使用 `position: fixed; z-index: 2280` 和 body-level 挂载；builtin 列表额外使用 `.opencodian-builtin-list-status-filter` 原生 select 作为项目状态筛选，和搜索框共享同一行 sticky toolbar，不引入独立卡片层级。builtin row 的状态 chip 现在挂在 `.setting-item-name` 内，紧跟 formatter / LSP 名称，`.opencodian-builtin-row-meta` 只承载唯一的扩展名文本，`.opencodian-builtin-row-status-chip[data-status]` 负责默认 / 项目覆盖 / 项目禁用的轻量语义色，`.opencodian-formatter-builtin-row.is-collapsible` 表示点击 row 空白区可折叠 override fields。builtin 列表的内部滚动容器 `.opencodian-formatter-builtin-scroll` 自带 top padding / scroll padding，避免滚动时 row 被 sticky 搜索框贴住；滚动条保持隐藏但仍可滚动，避免不同平台 scrollbar gutter 宽度导致 sticky 搜索框和滚动列表视觉宽度不一致。过滤时 TS 会给第一个和最后一个可见 builtin row 标记 `.is-first-visible` / `.is-last-visible`，CSS 用它们补足列表和 section 底部之间的 spacing；无匹配时 `.opencodian-builtin-list-search-empty` 负责保留底部 breathing room，避免隐藏行破坏 `:last-of-type` 间距。

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

### 2026-05-18 model availability actions pass

模型可用性区不再渲染单独的 catalog bulk actions 信息条：

- `.opencodian-model-catalog-summary-grid` 保持 auto-fit grid，但把最小列宽和 gap 收紧，避免在窄设置面板里硬挤内容。
- `.opencodian-model-catalog-summary-card` 保留 title/meta 上下两行结构，只收紧 padding、gap 和高度，避免横排摘要在中文文案下溢出。
- `.opencodian-model-availability-controls` 现在同时承载搜索框、已启用/已禁用筛选，以及 catalog bulk provider actions，并用四列 grid 让它们在常规设置面板宽度下保持同一行。
- `.opencodian-model-catalog-actions-buttons` 保留为批量按钮容器，放在 controls 行最右列，默认不换行；窄屏下才恢复换行与全宽按钮。
- `.opencodian-model-catalog-actions*` 顶部信息条样式已移除，避免摘要卡片上方再出现重复的 title/count 容器。
- `.opencodian-settings-block-footer-desc` 用于把模型可用性说明放到整个 collapsible card 底部；该 footer 在 details 外侧，折叠态仍可见。

Guardrail: 后续不要把 provider 批量启用/禁用重新做成摘要卡片上方的独立横条，也不要把 summary card 的 title/meta 改成单行横排；模型可用性说明不要放回 collapsible summary 顶部。如果需要更多 bulk 行为，优先放进搜索/筛选 controls 右侧或在窄屏自然换行。

### 2026-05-15 model availability rhythm pass

provider / model 管理区在交换 actions 与 search 行顺序后，纵向节奏改成“两层 gap”而不是依赖零散 margin 叠加：

- `.opencodian-model-toggle-management` 作为外层 stack，显式覆盖共享 section-body 的默认 `8px` gap，改用 `12px` 主节奏。
- `.opencodian-model-toggle-catalogs` 自己再用 `12px` 子节奏承载 summary cards，不再额外吃 bottom margin。
- `.opencodian-model-availability-controls` 与 `.opencodian-model-catalog-summary-grid` 去掉各自的 `margin-bottom`，provider list 顶部也不再额外补 `margin-top`。

Guardrail: 如果后续继续调整 availability 区，不要再把 `summary / controls / provider list` 的纵向空隙拆回多个 margin。优先让外层 stack 决定主节奏，让 catalogs 子容器决定内部节奏。

### 2026-06-30 model provider card neutralization

- `Provider & Model Management` 的 `.opencodian-model-toggle-provider`、`.opencodian-model-toggle-model`、preset provider cards 和 model workspace provider rows 现在共享 neutral shadcn-style Card tokens：低权重 `background-modifier-border` 边框、安静背景、hover/focus 只做轻微边框和背景变化。
- 普通 provider/model cards 不再使用紫色/interactive-accent 边框、紫色 glow 或大面积强调态；真正的启用、禁用、warning、error 状态继续收敛在 badge、probe 文案和 inline status 中。
- `.opencodian-help-mode` 移除 3px accent side-stripe，改为完整低权重边框，保持 `$impeccable` 的 no side-stripe 约束。

Guardrail: 后续不要把 provider/model row 的普通 hover、selected 或卡片边框重新绑定到 `interactive-accent`。如果需要表达状态，优先使用 badge / inline text / focus ring，而不是给整张卡片上紫色边框。

### 2026-06-30 formatter/lsp tab hierarchy pass

- `Formatter & LSP` 的三个 secondary tabs 现在共享更明确的壳层语法：`.opencodian-formatter-overview-shell` / `.opencodian-formatter-tab-config-shell` 负责纵向主节奏，`.opencodian-formatter-overview-summary-band`、`.opencodian-formatter-tab-summary-band`、`.opencodian-formatter-tab-content-shell` 分开 summary 与 editor 内容区。
- `overview` meta cards 仍沿用 `.opencodian-formatter-overview-meta-*` 合同，但基底背景收轻，避免它继续像第二套编辑卡片；视觉上是 quiet summary，不是并行 control surface。
- builtin/custom/advanced editor 三类编辑块现在各自有稳定壳层：`.opencodian-formatter-builtin-list-shell`、`.opencodian-formatter-custom-list-shell`、`.opencodian-formatter-advanced-editor-shell`。这些 class 只表达层级和节奏，不改变既有 row-card / search / inline editor 行为。
- builtin override editor 继续使用现有 `.opencodian-formatter-override-fields` field-group DOM，但额外带 `.opencodian-formatter-builtin-editor-shell` 结构别名，明确它是 inline editor shell，不是新的 nested card。

### 2026-07-20 formatter/lsp non-custom mode state

- `.opencodian-formatter-mode-state` 为 formatter / LSP 的 default 与 disabled 模式提供紧凑只读状态块，左侧显示当前模式和现有说明，右侧显示检测数量或运行态错误。
- 状态块只填补原先 mode row 后直接 return 造成的空页面，不挂载 builtin/custom/advanced 编辑器；formatter 继续复用 detected runtime list，LSP 继续复用静态 runtime panel。
- 窄屏下状态块退为单列，状态 chip 左对齐，不增加固定高度或页面级填充。

## 2026-05-13 Model picker visual refresh

模型选择弹层（`ModelPickerModal`）进行视觉重构：

- 控件区使用统一的 `40px` 高度和 `10px` 圆角，搜索框与 provider 下拉在 `520px` 以下自动垂直堆叠。
- 列表区新增 `.opencodian-model-picker-list-inner` 内层容器与 `.opencodian-model-picker-divider` 分隔线，空选项现在融入列表流。
- provider 分组标题支持 `.opencodian-model-picker-group-icon` 图标位，标题取消全大写，改用 `13px` semibold。
- source badge 缩小为 `10px` 的 muted pill，不再使用高对比色块。
- 模型选项取消外边框，改用 transparent background + hover tonal lift；选中状态只保留勾选与轻边框，避免非悬浮状态下出现绿色背景。
- 空选项（如“跟随当前会话模型”）选中时同样不铺 accent 背景，保持 subdued。
- 选项间距从 `8px` 收紧到 `2px`，分组间距保持 `16px`，形成更清晰的“紧凑列表 + 分组留白”节奏。

## 2026-06-12 Thread goal session settings section

Codex 会话设置 modal 新增线程目标 readback + set/clear 区块（仅 Codex 后端可见）：

- `.opencodian-session-settings-codex-goal-shell`：外层容器，`margin-top: 12px`。
- `.opencodian-session-settings-codex-goal-readback`：readback 卡片，`background-secondary` + `border-radius: 6px` + `border`，承载 objective 文本与 status/token/time meta。
- `.opencodian-session-settings-codex-goal-objective`：objective 正文，`13px` + `pre-wrap` + `word-break`，最长 200 字符截断。
- `.opencodian-session-settings-codex-goal-meta`：状态 + 用量元信息，`11px` muted。
- `.opencodian-session-settings-codex-goal-empty`：无目标时的空状态提示，`12px` faint italic。
- `.opencodian-session-settings-codex-goal-set`：set 输入行，flex + `6px` gap，包含文本输入框和设定按钮。
- `.opencodian-session-settings-codex-goal-input`：set 文本输入框，`12px` + flex 1。
- `.opencodian-session-settings-codex-goal-budget-input`：可选 tokenBudget 数字输入框，`120px` 固定宽度 + `12px`。
- `.opencodian-session-settings-codex-goal-set-btn` / `.opencodian-session-settings-codex-goal-clear-btn`：操作按钮，`12px` + secondary background + hover lift。
- 数据由 `ConversationSessionSettingsCoordinator` 通过 `CodexAdapter` -> `CodexAppServerClient` 调用 `thread/goal/get|set|clear` app-server 路由获取。
- `onSetThreadGoal` 回调现在接受可选 `{ tokenBudget?: number }` 参数，经 coordinator -> adapter -> app-server 全链路传递到 `thread/goal/set`。

## 2026-06-16 MCP detail modal collapsible sections

Codex MCP 服务器详情弹窗样式重构，支持默认折叠的 server section 与工具二级展开：

- `.opencodian-codex-mcp-detail-modal` 设置固定宽度 `min(720px, calc(100vw - 40px))`，避免默认窄弹窗导致长 server 名被过度截断。
- `.opencodian-codex-mcp-server-section` 折叠态最小高度 `96px`（`--opencodian-mcp-server-collapsed-height`），`overflow: hidden`，`gap: 0`，section 本身不再承担 padding；header / body 分别负责内边距。展开态（`.is-expanded`）保持 `overflow: visible`，header 下方绘制分隔线。
- `.opencodian-codex-mcp-server-section-header` 作为摘要行，使用两列 grid：左侧 `.opencodian-codex-mcp-server-section-identity` 承载标题与 short id，右侧 `.opencodian-codex-mcp-server-section-meta` 承载计数、auth badge 和操作按钮；`640px` 以下退化为单列。
- `.opencodian-codex-mcp-server-section-counts` 显示 tool/resource 计数，`font-size: 0.82em`，使用 flex wrap 与 `white-space: nowrap` 保持紧凑，并由 meta column 右对齐。
- `.opencodian-codex-mcp-server-section-short-id` 在 server id 与 display name 不同时显示为 muted 小字摘要。
- `.opencodian-codex-mcp-server-section-body` 为展开内容容器；`.is-hidden` 折叠。
- `.opencodian-codex-mcp-server-section.is-focused` 只作为深链定位状态，不覆盖 header 的背景、边框或圆角；所有 server header 保持同一张卡片样式。
- `.opencodian-codex-mcp-server-expand-btn`、`.opencodian-codex-mcp-tool-detail-btn`、`.opencodian-codex-mcp-schema-toggle` 统一为紧凑 pill 按钮，`font-size: 0.78em`，背景使用 `--background-modifier-hover`，hover 时切换为背景修饰边框色。
- `.opencodian-codex-mcp-tool-details` 为工具详情容器，默认隐藏；展开后显示 description 与 schema toggle。
- `.opencodian-codex-mcp-tool-schema` 改为复用 `.opencodian-inspection-code` 样式（等宽、自动折行、内部滚动），仍需点击 schema toggle 才显示完整 JSON。
- h4/h5 保持 `padding-left: 0` / `padding-inline-start: 0`；展开态内容使用 modal spacing token，不引入 nested cards、side-stripe 或营销 hero。

Guardrail: 不要为 MCP detail modal 引入独立卡片层级、装饰性阴影或 focus 专属卡片外观；server section 本身保持透明，header 是唯一卡片表面，内部只应出现行、列表和折叠 detail，不应再包一层完整卡片。

## 2026-06-16 Shared modal layout system

新增一组共享 modal 布局 token 与类，用于统一设置类弹窗的纵向节奏、卡片表面、表单网格和动作行，替代各 modal 各自堆叠的零散 margin 和旧 `.opencodian-config-help*` 辅助类。token 定义在 `.modal .opencodian-modal-shell` / `.opencodian-help-modal-shell` 作用域下，与 `DESIGN.md` spacing 章节保持同步。

表单 / 编辑器 modal 类（`.opencodian-modal-*`）：

- `.opencodian-modal-shell`：根 flex 列容器，提供 section 间距，取代 ad-hoc margin。
- `.opencodian-modal-section`：相关控件 / 内容分组，纵向 section 内间距。
- `.opencodian-modal-card`：可复用卡片表面（不允许嵌套卡片）。
- `.opencodian-modal-form-grid`：单列表单 grid，统一 label/control 行节奏。
- `.opencodian-modal-actions`：右对齐动作 / footer 行，带 top border 与 `margin-top:auto` 粘底。

帮助 modal 类（`.opencodian-help-modal-*`，`max-width: 720px`）：

- `.opencodian-help-modal-shell`：根 flex 列容器。
- `.opencodian-help-modal-section` / `-card` / `-list` / `-pre` / `-code` / `-actions`：帮助内容分区、要点列表、代码块、行内 code 与官方链接行的共享表面。

Guardrail: 不要在 `.opencodian-modal-card` 内再嵌套卡片；新增 modal 优先复用上述类，而不是重新引入 modal 专属 spacing。旧 `.opencodian-config-help*` 与 `.opencodian-server-help` 类已被上述 help 类取代（modal 宽度钩子 `.opencodian-server-help` 保留为兼容，新增 `.opencodian-server-setting-help-modal` 作为新根类）。

消费这些共享类的 modal TS 文件：

- `src/features/settings/CodexMcpServerDetailModal.ts`（`.opencodian-modal-shell` / `-section` / `-card` + 新增 `.opencodian-codex-mcp-tool-entry-header` 与 `.is-hidden` schema 切换）
- `src/features/settings/McpServerEditorModal.ts`（`.opencodian-modal-shell` / `-section` / `-card` / `-form-grid` / `-actions`，`.opencodian-mcp-form-*` 保留为 MCP 专属覆盖）
- `src/features/settings/ModelConfigJsonModal.ts`（`.opencodian-modal-shell` / `-section` / `-actions` + `.opencodian-help-modal-section` / `-pre`）
- `src/features/settings/OpencodeConfigModal.ts`（`.opencodian-modal-shell` / `-section` / `-actions` + 完整 `.opencodian-help-modal-*` 帮助 DOM，已弃用 `innerHTML` 帮助注入）
- `src/features/settings/SettingsToolDetailModal.ts`（`.opencodian-modal-shell` / `-section` / `-actions`）
- `src/features/settings/ConversationCompactionHelpModal.ts`（`.opencodian-help-modal-shell`）
- `src/features/settings/ModifiedFilesSidebarHelpModal.ts`（`.opencodian-help-modal-shell`）
- `src/features/settings/LiquidGlassSettingHelpModal.ts`（`.opencodian-help-modal-shell` / `-section`）
- `src/features/settings/OpenCodeProjectConfigHelpModal.ts`（`.opencodian-help-modal-shell` / `-list` / `-actions`）

## 2026-06-16 Shared inspection panel classes

新增共享的 `.opencodian-inspection-*` 检查面板类，统一 Codex readback modal 与 MCP detail modal 的布局：

- `.opencodian-inspection-panel`：检查面板根容器，纵向 `20px` 间距（`modal-section-gap`）。
- `.opencodian-inspection-summary`：顶部摘要带，含用途说明（`.opencodian-inspection-summary-intro`）和 meta strip（`.opencodian-inspection-summary-meta`）。
- `.opencodian-inspection-summary-meta-item` / `.opencodian-inspection-summary-actions`：meta strip 中的条目与操作按钮组。
- `.opencodian-inspection-badge`：紧凑状态/元数据徽章。
- `.opencodian-inspection-state`：loading / unavailable / failed / empty 状态的紧凑提示块。
- `.opencodian-inspection-content`：主体内容区。
- `.opencodian-inspection-list`：条目列表。
- `.opencodian-inspection-row` / `-main` / `-side` / `-title` / `-subtitle` / `-meta` / `-note`：列表行，主信息在左，badge/操作在右，长文本自动折行。
- `.opencodian-inspection-section` / `-header` / `-title` / `-actions` / `-desc` / `-meta`：分组 section，带背景与边框，标题与操作分两侧。
- `.opencodian-inspection-subsection` / `-subheader`：section 内子分区。
- `.opencodian-inspection-detail-toggle`：展开/折叠 detail 的小型按钮。
- `.opencodian-inspection-detail` / `.is-hidden`：可折叠 detail 块。
- `.opencodian-inspection-code`：等宽代码块，自动折行，内部滚动。

## 2026-06-16 Codex diagnostic readback modal

Codex readback 弹窗改用共享 inspection-panel 布局：

- `.opencodian-codex-readback-modal`：弹窗根，限制 `.modal-content` 最大高度并启用内部滚动。
- `.opencodian-codex-readback-intro`：用途说明（现属于 `.opencodian-inspection-summary-intro`）。
- `.opencodian-codex-readback-notes` / `.opencodian-codex-readback-note`：只读说明与刷新时机说明（现属于 `.opencodian-inspection-summary-meta`）。
- `.opencodian-codex-readback-status-bar` / `-status-label` 保留为兼容钩子，但视觉上隐藏；状态改为 `.opencodian-codex-readback-status-value.opencodian-inspection-badge`。
- `.opencodian-codex-readback-status-value` 按 `data-readback-state` 切换语义色与边框色。
- `.opencodian-codex-readback-content` 取消内部最大高度，改为随 modal 内容滚动。
- `.opencodian-codex-readback-state-message`：loading / unavailable / failed / empty 状态文案。
- `.opencodian-codex-readback-row` / `-row-name` / `-row-meta`：列表行，复用 `.opencodian-inspection-row` 节奏。
- `.opencodian-codex-readback-code`：JSON / 代码证据块，复用 `.opencodian-inspection-code`。

## 2026-06-16 MCP detail modal inspection panel

MCP 详情弹窗改用共享 inspection-panel 布局：

- `.opencodian-codex-mcp-detail-status-bar` / `-status-label` 保留为兼容钩子，视觉上隐藏；状态改为 `.opencodian-codex-mcp-detail-status-value.opencodian-inspection-badge`。
- `.opencodian-codex-mcp-detail-status-value` 按 `data-mcp-state` 切换语义色与边框色。
- `.opencodian-codex-mcp-detail-toolbar` 归入 `.opencodian-inspection-summary-actions`。
- `.opencodian-codex-mcp-detail-summary-section` / `.opencodian-codex-mcp-detail-summary` 不再使用。
- 每个 server 使用 `.opencodian-inspection-section.opencodian-codex-mcp-server-section`，带背景与边框。
- `.opencodian-codex-mcp-server-section-header` 复用 `.opencodian-inspection-section-header`：`h4` 使用 `padding-left: 0` / `padding-inline-start: 0`，长 server id / name 自动换行。
- `.opencodian-codex-mcp-server-section-meta` 复用 `.opencodian-inspection-section-meta`。
- 工具与资源条目改为 `.opencodian-inspection-row`：主信息左侧，schema/查看按钮右侧。
- `.opencodian-codex-mcp-tool-entry-header` 不再使用；工具名称与 schema 按钮直接放入行两侧。
- `.opencodian-codex-mcp-schema-toggle` / `.opencodian-codex-mcp-resource-view-btn` 改为 `.opencodian-inspection-detail-toggle`。
- `.opencodian-codex-mcp-tool-schema` / `.opencodian-codex-mcp-resource-viewer` 改为 `.opencodian-inspection-detail`。
- `.opencodian-codex-mcp-resource-text` 复用 `.opencodian-inspection-code`。
- focus server 高亮仍使用 `::before` 伪元素外框。
- 保留 auth 徽章颜色变体：`-bearerToken`、`-none`、`-needs_auth`、`-notLoggedIn`、`-unsupported`。
- `src/features/settings/ServerSettingHelpModal.ts`（`.opencodian-help-modal-shell` / `-section` / `-card` / `-pre` / `-list`，已弃用 `innerHTML` 帮助注入）

## 2026-07-21 Plugin evidence surface

新增 SDK 1.18.3 plugin evidence 分层展示样式，复用 settings 共享层级 token：

- `.opencodian-plugin-evidence-section`：evidence 区外壳，使用 object tokens 作为轻量 section panel，避免嵌套卡片网格。
- `.opencodian-plugin-evidence-section-title` / `.opencodian-plugin-evidence-section-desc`：区标题与说明。
- `.opencodian-plugin-evidence-subsection`：当前 / 过期 effective specs 或 runtime IDs 子区。
- `.opencodian-plugin-evidence-subsection-title`：子区标题。
- `.opencodian-plugin-evidence-empty`：空态 / 未获取提示。
- `.opencodian-plugin-evidence-list`：spec / runtime ID 列表容器。
- `.opencodian-plugin-evidence-item`：单个 spec 或 runtime ID 条目。
- `.opencodian-plugin-evidence-code`：specifier / runtime ID 的 monospace 文本。
- `.opencodian-plugin-evidence-meta`：generation、timestamp、sources 等元信息，低调小号字。
- `.opencodian-plugin-remote-notice`：远程模式诚实性提示条，使用警告色调但保持克制。
- `.opencodian-plugin-remote-notice-label`：提示条加粗标签。
- `.opencodian-plugin-local-only-label`：本地文件操作旁的 local-only 小标签。

Guardrail: plugin evidence 区不引入渐变、玻璃、彩色侧边条或装饰动画；ID / generation / path 使用 monospace，状态使用低色度 badge 并附带非颜色文本。

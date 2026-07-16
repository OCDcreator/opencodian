# Settings Capability Lab Styles

> **源码**: `src/style/components/settings-capability-lab.css`
> **状态**: [REVIEW]

## 职责

定义 Debug > Capability Lab 诊断页的局部样式。该文件只负责实验能力面板的视觉层级、能力矩阵、诊断摘要、状态芯片、只读输出、sessionStore/structured-output/hooks runtime proof 控件，以及只读消息预览列表，不承担通用 settings layout token 的定义。

## 关键类名

- `.opencodian-capability-lab-shell`, `.opencodian-capability-lab-body`: Capability Lab 在 Debug 五标签体系中的 shared tab shell 对齐层。Capability Lab 专属 outer shell 覆盖为透明、无边框、无圆角的布局层，页头继续复用 shared rhythm；内部保持诊断 block、矩阵、proof marker 和 `data-section-block` 语义。
- `[data-capability-backend-tablist]`: backend tab rail。使用单行 `flex-wrap: nowrap` 和本地 `overflow-x: auto`，只拥有底部分隔线，不使用 card background/radius/shadow。rail 的 block/inline padding 和 `scroll-padding-inline` 使用 `space-sm`，为外置 2px + 2px offset focus ring 留出完整四边 clearance。
- `[data-capability-backend-tab]`: 固定 13px、normal letter spacing、32px 最小高度的紧凑 tab；active 使用 `interactive-accent` 2px underline，focus-visible 使用共享 2px settings focus ring，transition 仅 color / border-color / background-color 150ms。
- `[data-capability-backend-panel][hidden]`: 原生 hidden panel 强制 `display:none`。panel/root 使用 `min-width:0`，避免长 Claude 内容把整个 Settings 页面撑宽。
- `.opencodian-capability-lab-backend-workspace`: Claude Code、OpenCode、Codex 三个同级 tabpanel 各自的唯一 card owner。每个 panel 首次激活后创建一个 workspace，自己承担 border/background/radius；内部 header、status、table shell、empty state 与 controls 保持扁平，禁止 backend workspace 或完整卡片相互嵌套。
- `.opencodian-capability-lab-backend-header`, `.opencodian-capability-lab-backend-status`: backend 名称、说明和可见状态。状态同时使用 `data-backend-state` 与本地化文本，不只依赖颜色；窄容器改为单列。
- `.opencodian-capability-lab-banner`: 顶部实验性警告横幅，使用 warning token 明确 DIAGNOSTIC / EXPERIMENTAL / NOT STABLE。
- `.opencodian-capability-lab-summary`: 三列诊断边界摘要，说明面板只用于诊断、运行时证明不持久化、写操作只读或 dry-run；摘要项使用 muted inline surface，不再使用 object-card weight 或高饱和边框。`capability-lab` 容器不超过 560px 时改为单列，summary value 取消 ellipsis 并允许长词换行。
- `.opencodian-capability-lab-table-shell`: 能力矩阵横向滚动容器，防止窄宽度下 header 和状态芯片互相挤压。OpenCode capability id 在 DOM 中通过点号/camel-case `<wbr>` 提供语义断点，第一列使用 normal wrapping，避免任意字符断词，也不会越过固定列宽与可用性列重叠。
- `.opencodian-capability-lab-matrix`: 能力矩阵表格，最后一列为 `User Surface`，以 `Settings` / `Diagnostic` / `Hidden` / `Chat` / `Settings + Chat` 区分用户可见程度。
- `.opencodian-capability-lab-chip`: SDK、adapter、runtime proof、surface 等状态芯片的共享基线。
- `.opencodian-capability-lab-output`, `.opencodian-capability-lab-status`, `.opencodian-capability-lab-subagent-list`: 诊断输出和只读列表 surface。
- `.opencodian-capability-lab-preview-list`, `.opencodian-capability-lab-preview-row`, `.opencodian-capability-lab-preview-meta`, `.opencodian-capability-lab-preview-text`: history browser 的紧凑消息预览行，避免 Capability Lab 退化成整块 JSON dump。
- `.opencodian-capability-lab-chip-surface-chat`: 用户表面列中 `Chat` 表面类型的分类芯片，使用 info-border / info-subtle / info 颜色，表示该能力已在普通聊天界面作为稳定功能暴露。
- `.opencodian-capability-lab-chip-surface-settings-chat`: 用户表面列中 `Settings + Chat` 混合表面类型的分类芯片，使用单一 success 语义色与明确文本，避免装饰性双色渐变。
- `.opencodian-capability-lab-chip-pass`, `.opencodian-capability-lab-chip-readback`, `.opencodian-capability-lab-chip-untested`, `.opencodian-capability-lab-chip-fail`, `.opencodian-capability-lab-chip-blocked`, `.opencodian-capability-lab-chip-settings-only`, `.opencodian-capability-lab-chip-hidden`, `.opencodian-capability-lab-chip-wiring`, `.opencodian-capability-lab-chip-boundary`: 能力矩阵 runtime proof 状态芯片。`pass` 为 behavior verified（绿色），`readback` 为 runtime-readback verified（蓝色 info），`untested` 为未测试（琥珀色），`wiring` 和 `boundary` 为仅接线/边界触发（琥珀色），`fail` 为失败（红色）。`wiring` 与 `fail` 视觉上必须区分：前者是 warning 级别（SDK options 已接受，行为未验证），后者是 error 级别（runtime 验证尝试后失败）。`readback` 与 `pass` 也必须区分：前者是 info 级别（选项被构建并传入 SDK），后者是 success 级别（完整行为验证通过）。`blocked` 为 error 级别（上游阻塞），`settings-only` 为 info 级别（设置已接入但运行时行为未验证），`hidden` 为虚线边框淡色（未暴露给用户）
- `.opencodian-capability-lab-chip-hidden`, `.opencodian-capability-lab-chip-surface-hidden`: Hidden 保留虚线语义，但 foreground/border 使用 `text-muted`，确保浅色主题 11px 文本仍可辨认。
- `[data-backend-action]:focus-visible`: OpenCode 刷新/复制操作使用 settings focus ring，刷新重渲染恢复焦点后仍有可见键盘焦点。
- History/Subagents 的直属 `.opencodian-capability-lab-description` 使用 `text-wrap: balance`，避免窄容器中中文说明留下单字尾行；不影响其他长诊断文案。
- `.opencodian-capability-lab-proof-marker`, `.opencodian-capability-lab-proof-pass`, `.opencodian-capability-lab-proof-readback`, `.opencodian-capability-lab-proof-fail`, `.opencodian-capability-lab-proof-untested`, `.opencodian-capability-lab-proof-wiring`, `.opencodian-capability-lab-proof-boundary`: 运行时证明 inline marker。`pass` 为 behavior verified（绿色），`readback` 为 runtime-readback verified（蓝色 info，标签显示 "✓ Readback verified — not behavior verified"），`fail` 为失败（红色），`untested` 为未测试（琥珀色），`wiring` 为仅验证选项被 SDK 接受但未验证真实行为（琥珀色，标签显示 "Wiring only — not behavior verified"），`boundary` 为工具边界被触发但诊断路径缺少 UI 上下文（琥珀色，标签显示 "Boundary hit — UI context missing"）。
- `.opencodian-capability-lab-json-preview`: JSONL / runtime proof 预览区，使用 monospace、内部滚动和自动换行。
- `data-section-block` 属性选择器（`claude-code-capabilities`、`opencode-sdk-capabilities`、`codex-capabilities`、`history`、`subagents`、`rewind`、`structured`、`fork`、`resume`、`session-detail`、`backend-routing`、`discovery`）: 三个 backend capability block 使用独立 workspace 规则，其余深度诊断 block 继续共用 section 容器布局。
- `.opencodian-capability-lab-probe-header`: 单个 probe section 的标题区容器，flex column。
- `.opencodian-capability-lab-probe-title-row`: probe 标题行，flex wrap，space-between 布局标题和 badge。
- `.opencodian-capability-lab-probe-badge`: probe 标题旁的 inline-flex badge（状态标记等）。
- `.opencodian-capability-lab-probe-copy`: probe 说明文字容器，max-width 78ch 控制行宽。
- `.opencodian-capability-lab-probe-toolbar`: probe 操作栏，grid 布局（字段区 + 操作区），带 row-bg 和 border。窄屏时退化为单列。
- `.opencodian-capability-lab-probe-field-row`, `.opencodian-capability-lab-probe-action-row`: toolbar 内的输入行和操作按钮行。field-row 占满剩余宽度，action-row 右对齐。窄屏时 action-row 改为 stretch。
- `.opencodian-capability-lab-probe-status-grid`: probe 运行结果的多列状态网格，auto-fit minmax(180px, 1fr)。
- `.opencodian-capability-lab-probe-status-item`, `.opencodian-capability-lab-probe-status-label`, `.opencodian-capability-lab-probe-status-value`: 状态网格内的单项容器、标签和值。
- `.opencodian-capability-lab-select`, `.opencodian-capability-lab-input`: 共享的 select/input 基线样式，min-height 34px。
- `.opencodian-capability-lab-button`, `.opencodian-capability-lab-button-warning`: 操作按钮基线（min-height 34px, font-weight 650）及 warning 变体。

## 设计约束

- 复用 `settings-layout-contract.css` 提供的 `--opencodian-settings-*` token，不重新定义设置页全局半径、边框、背景或间距。
- 视觉必须保持 Obsidian-native、dense but not crowded；不使用营销式 hero、重 dashboard 卡片、渐变文字或装饰性玻璃。
- `Diagnostic`、`Hidden`、`Untested` 等状态不能被弱化成完成态；未验证能力不得通过样式看起来像稳定功能。
- sessionStore import / mirror proof 虽然是诊断性写入，但视觉上仍必须强调它们是 isolated diagnostic actions，而不是 stable restore/import UI。
- 横向滚动只用于矩阵和发现表，其他控件在窄屏换行或占满宽度。
- Capability Lab body 使用 container query；560px 以下 backend header 与操作栏改为单列。320px 等窄容器中 tab rail 保持单行并局部滚动；页面和 workspace 不横向溢出。整个 CSS 中只有 tab rail 与 `.opencodian-capability-lab-table-shell` 可拥有 `overflow-x:auto`。
- probe toolbar 和 probe status grid 在 720px 以下窄屏退化为单列，按钮和 select 占满宽度。

## 修改注意点

- 修改源码结构时同步 `docs/modules/features/settings/SettingsCapabilityLabSection.md` 的类名说明。
- 修改 CSS 后运行 `npm run build:css` 或完整 `npm run build`，刷新根目录 `styles.css`。

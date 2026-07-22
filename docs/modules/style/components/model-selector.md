# Model Selector Styles

> **源码**: `src/style/components/model-selector.css`
> **状态**: [FINAL]

## 职责

定义聊天输入区模型选择器与其下拉菜单样式，并承载设置页中大量共享 UI（设置滚动条、快速导航、样式编辑控件等）。

## 关键类名 / CSS 变量

- 模型选择器：`.opencodian-model-selector`、`.opencodian-model-trigger*`、`.opencodian-model-dropdown*`、`.opencodian-model-option*`。输入工具栏内的 trigger 使用统一 control height / inline padding，与 Agent / permission / effort selector 保持同一横向节奏；默认态是低视觉权重 runtime chip，`action-buttons-etched` 下切换为透明刻入态。
- 选择态：`.is-open`、`.is-unavailable`、`.is-unconfigured`、`.is-highlighted`、`.is-selected`。
- configured-only 禁用态：`.opencodian-model-option.is-configured-only` 与 `.opencodian-model-option-availability`，使用中性 muted 样式、稳定 badge 最小宽度，并覆盖 hover/highlight 背景。
- 设置页通用：`.opencodian-settings*`、`.opencodian-settings-quick-nav*`、`.opencodian-settings-tabs-*`、`.opencodian-settings-tab-*`、`.opencodian-settings-tooltip-layer` / `-bubble` / `-arrow`（`SettingsTooltipController` body-level overlay）、`.opencodian-capability-lab-session-detail`。
- 编辑区设置页：`.workspace-leaf-content[data-type="opencodian-settings-view"] > .view-content.opencodian-settings` 是 editor-area 专用根选择器；padding、classic quick-nav 顶部贴合、tabbed 标题行对齐都应落在 `.view-content` 上，避免把设置 UI 挂到 Obsidian leaf 外壳。
- 样式面板通用：`.opencodian-style-*`、`.opencodian-theme-*`、滚动条规则（含 `.opencodian-history-scroll` 皮肤）。

## 近期行为

- **Composer card unification + compact rail**（当前）：Model 继续保留 search、scroll、provider sticky headers 与 current-tab override，但 outer card、title/`Esc`/footer、共享 option geometry、selected/focus/reduced-motion 均由 `composer-popover-frame.css` 统一提供；composer runtime rail 内的 trigger 使用 pill 几何、`11px` 字号、小图标和低视觉权重尺寸，未引入 shadcn/Radix/cmdk/Tailwind/Web font。
  - Chevron：`cubic-bezier(0.4, 0, 0.2, 1)` 平滑旋转 180°，hover/open 时颜色递进。
  - 下拉外层只保留 340px/280px 宽度和 anchored placement；卡片表面不再在本文件重复声明背景、border、radius、shadow 或 animation。
  - 下拉面板的 340px 首选宽度使用 `box-sizing: border-box`，实际水平位置和窄容器收缩由共享 `AnchoredOverlayLayoutController` 计算，确保相对聊天容器左右各保留 8px 安全间距，不再因固定 `left: 0` 被右侧边界裁剪。
  - 搜索区是 shadcn CommandInput 风格的单一整宽 strip：`.opencodian-model-dropdown-search` 直接落在共享 surface 上，仅有一条底部 `background-modifier-border` 分隔线；`.opencodian-model-dropdown-search-container` 改为 `display: contents` 的纯布局包装，不再渲染自己的圆角卡 / 背景 / 边框。Model `dropdown-content` 的 padding 被本文件覆盖为 `0`，以便搜索条满宽。
  - Provider header：sticky shadcn `CommandGroupHeading` 风格的 11px / 600 分组标题，使用 `--text-muted`（明确禁止使用 `--text-faint`，避免在粉色主题下与搜索 placeholder 或未配置模型状态混淆），letter-spacing 为 `0`。Direction A 将 heading 直接落在共享 popover 表面上，背景为不透明 `var(--background-primary)`，并移除了旧的 tonal band 与全宽底部分隔线；层级完全由 provider icon 归属、模型行前导空槽、间距与排版来表达。最小高度 26px，内边距 `5px 12px 4px`，`position: sticky; top: 0; z-index: 10` 保持不变，确保滚动时不会露出背后模型行。provider header icon 为 12px / 0.55 opacity。移除了外部 DM Sans 字体、`text-transform: uppercase`、上下重复 border 等历史装饰。滚动容器本身保持无顶部内边距，4px 的呼吸间距由内部 `.opencodian-model-groups` 承担。模型 option 包裹在 `.opencodian-model-group-options` 中，保持共享 Command 几何与选中 checkmark + 600 字重。provider header 与 model option 的视觉层级关系由 `tests/unit/infrastructure/model-popover-provider-hierarchy.test.mjs` 在 light + dark 双主题下守卫，源样式契约要求 provider header 规则必须写 `background: var(--background-primary);`、`color: var(--text-muted);`，且不得出现 `color: var(--text-faint);`、tonal `color-mix` 背景或 `border-bottom`。
  - Model row 叠加共享 `opencodian-composer-popover-option`，以 provider icon / flex text / check 显式占据 22px / flexible / 18px 三列，得到统一的 Command 几何、选中 checkmark + 600 字重和 focus ring；hover/highlight/selected 共享同一中性 `--background-modifier-hover` 背景，不再有彩色 tint / box-shadow / scale 弹跳动画。
  - shared frame 的高度预算包含 header/footer/search，同时保留原有 280px model scroll viewport（由 Chromium rendered-layout 测试守卫）；search 作为 combobox 控制其实例专属 listbox，并只在打开态用 active descendant 暴露当前 Arrow highlight。
  - shared card 的 reduced-motion 策略统一生效，Model-specific CSS 仅保留搜索/scroll/header/icon 规则。
- classic 设置页 quick-nav 的 tooltip 现在不再依赖 `.opencodian-settings-quick-nav-btn` 的伪元素，而是用 `.opencodian-settings-quick-nav-tooltip-layer` / `-bubble` / `-arrow` 这组 body-level overlay 样式。这样提示层可以真正越过 settings 滚动容器，不再受容器裁切影响。quick-nav tooltip z-index 为 2260，并会按按钮上下空间切换 top/bottom placement。
- chat / tabs / sidebar / composer 这套共享 tooltip 也已经从 trigger 伪元素迁到 `.opencodian-tooltip-layer` / `-bubble` / `-arrow` 这组 body-level overlay 样式，由 `TooltipLayerController` 在运行时挂到 `document.body`。这样可以同时避开三类老问题：按钮自身 `::after` 冲突、祖先 `overflow: hidden` 裁切、以及局部 stacking context 导致的遮挡。触发器显示时会清理 `title` 和 `aria-label`，避免同一按钮出现 custom + Obsidian 原生两个提示框；若旧控件只有 `aria-label`，控制器会迁移它到 sr-only `aria-labelledby`，已有该关联的 icon-only 触发器不受影响。
- 新共享 tooltip overlay 的层级合同是 `z-index: 2300`，高于聊天面板与 quick-nav 自身局部层级，但不再依赖给 trigger 临时抬 `z-index` 才能显示。气泡继续使用 `max-width: min(240px, calc(100vw - 32px))`、`white-space: pre-wrap` 和 `overflow-wrap: break-word`，兼顾长英文与中文提示文案；tooltip bubble 现在保持 flat `box-shadow: none`，用边框和 placement 箭头表达层级。
- 设置页 overlay 层级梯度：quick-nav tooltip 2260 → settings popover 2280 → settings tooltip 2300。三级各有独立 CSS 类命名空间，互不干扰。
- 设置页内部 tooltip 使用 `.opencodian-settings-tooltip-layer` / `-bubble` / `-arrow` 这组独立的 body-level overlay 样式，由 `SettingsTooltipController` 管理，触发器通过 `data-settings-tooltip` 属性激活。视觉风格与共享 tooltip 对齐（暗色气泡、圆角箭头、placement 感知定位、无阴影），但选择器命名空间与 chat 共享 tooltip 隔离。箭头偏移通过 `--opencodian-settings-tooltip-arrow-offset` CSS 变量驱动。
- `.opencodian-capability-lab-session-detail` 是 Capability Lab 历史会话详情区域，用于在 `<select>` 选择后展示 sessionId / summary / lastModified 元数据（替代了原来的 `<option title>`）。
- editor-area 设置页样式现在只匹配 `.workspace-leaf-content[data-type="opencodian-settings-view"] > .view-content.opencodian-settings`。这和 `OpenCodianSettingsView` 渲染到 `ItemView.contentEl` 的结构保持一致，避免 classic/平铺模式下 Obsidian `Setting` 行只剩分隔线、名称和控件被异常层级样式吞掉。classic 模式会把 `.view-content` 顶部 padding 清零，让 quick-nav 像标准设置页一样贴住顶部；tabbed 模式的标题行保持自然顶部节奏，不再使用额外 `padding-top` 或负 `margin-left` 把 logo 推出正文流。
- `.opencodian-settings-panel-title` 现在是 tabbed/classic 共用的品牌标题行：左侧承载 `SettingsPanelChrome` 的 OpenCodian logo / wordmark，右侧通过 `.opencodian-settings-panel-title-actions` 放置 backend icon switcher。标题行使用 `.opencodian-settings .opencodian-settings-panel-title { padding: 0 56px 0 0; }` 覆盖 Obsidian vertical-tab 的默认 `h2` padding，为设置 modal 关闭按钮预留安全区；标题行上方保留 `12px` margin，品牌块左侧 padding 固定为 `0`，具体 icon group 视觉由 `agent-switcher.css` 管理。
- settings layout visible unification 后，此文件保留 settings 旧类名的兼容样式，但不再承担共享层级合同：
  - `.opencodian-settings-tab-panel` 只保留 `display: contents`，避免重 tab panel 再包一层 section card。
  - `.opencodian-style-section` 去掉粗 `border-left` 侧边条，改用 `--opencodian-settings-section-*` token fallback，使样式设置 section 不再像另一个局部设计系统。
  - `.opencodian-style-section` 和 `.opencodian-style-group-body` 也负责 Style 二级标签内容的纵向 stack gap，避免 tabbed style 子页里的 section/card/setting row 贴在一起。
  - quick-nav、tabs、section、ordinary setting row 的可见层级现在由 `settings-layout-contract.css` 统一覆盖。
- `.opencodian-style-setting-long-text` 只用于高级 custom CSS declarations 这类长文本控件。它把样式设置默认 `360px` 控制列放宽到最多 `520px`，但仍沿用 900px 以下单列响应式规则，避免普通数值/颜色控件被一起拉长。
- 2026-07-22 窄面板修复：`.opencodian-style-setting` 的网格轨道改为容器相对（label 列 `min(180px, 45%)` 下限，control 列 `min(360px, 55%)` 下限、上限仍为 `360px` / 长文本 `min(520px, 100%)`），control 元素改为 `width: 100%; max-width: 360px`。选择器提升到 (0,4,0)（覆盖 section/content-shell 内的普通 form-row 契约），桌面端保持 360px 统一控制列不变，窄面板（视口仍大于 900px 媒体查询时）label 不再被压成 0。
- `.opencodian-settings-tabs-primary` 现在使用 `flex-wrap: nowrap` + `overflow-x: auto` 实现水平滚动（而非换行），配合 `::after` 右侧渐变遮罩提示可滚动。当标签数量超过可视宽度时，用户可横向滚动查看更多标签。


## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/features/settings/OpenCodianSettings.ts`

## 修改注意点

- 此文件体量大、覆盖面广；若只改模型下拉，务必限制在 `.opencodian-model-*` 作用域。
- `is-unconfigured` 与警示色用于配置异常提示，不建议弱化对比度。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。

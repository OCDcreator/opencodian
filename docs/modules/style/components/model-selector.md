# Model Selector Styles

> **源码**: `src/style/components/model-selector.css`
> **状态**: [FINAL]

## 职责

定义聊天输入区模型选择器与其下拉菜单样式，并承载设置页中大量共享 UI（设置滚动条、快速导航、样式编辑控件等）。

## 关键类名 / CSS 变量

- 模型选择器：`.opencodian-model-selector`、`.opencodian-model-trigger*`、`.opencodian-model-dropdown*`、`.opencodian-model-option*`。输入工具栏内的 trigger 使用统一 control height / inline padding，与 Agent / permission selector 保持同一横向节奏；默认态是紧凑按钮，`action-buttons-etched` 下切换为透明刻入态。
- 选择态：`.is-open`、`.is-unavailable`、`.is-unconfigured`、`.is-highlighted`、`.is-selected`。
- 设置页通用：`.opencodian-settings*`、`.opencodian-settings-quick-nav*`、`.opencodian-settings-tabs-*`、`.opencodian-settings-tab-*`、`.opencodian-tooltip-trigger`。
- 编辑区设置页：`.workspace-leaf-content[data-type="opencodian-settings-view"] > .view-content.opencodian-settings` 是 editor-area 专用根选择器；padding 和 tabbed 标题修正都应落在 `.view-content` 上，避免把设置 UI 挂到 Obsidian leaf 外壳。
- 样式面板通用：`.opencodian-style-*`、`.opencodian-theme-*`、滚动条规则（含 `.opencodian-history-scroll` 皮肤）。

## 近期行为

- **Flat-clean redesign**（当前）：模型选择器下拉面板采用 Obsidian-native flat 风格，移除所有渐变和 glassmorphism 效果。
  - 触发器：`padding: 4px 10px`、`font-weight: 500`；hover 时 `translateY(-1px)` + 柔和阴影抬升；`is-open` 态使用 accent 色边框 + 外发光。
  - Chevron：`cubic-bezier(0.4, 0, 0.2, 1)` 平滑旋转 180°，hover/open 时颜色递进。
  - 下拉面板：`border-radius: 14px`、flat `var(--background-primary)` 背景、两层简洁阴影；移除了 `backdrop-filter`、线性渐变和径向渐变。`model-dropdown-open` 入场动画改为纯 `translateY(4px)` 上滑。
  - 搜索框：`border-radius: 8px`、`var(--background-secondary)` 填充色、简洁边框；`focus-within` 时仅 accent 边框色变化；移除了内阴影和渐变背景。
  - Provider header：`11px` 大写标签、`font-weight: 700`；包含 provider icon（`.opencodian-model-provider-header-icon`），通过 `ProviderIconService` 获取 Lobehub CDN 图标；sticky 时 `var(--background-primary)` 纯色背景 + 6px 渐变淡出。
  - 选项：`padding: 5px 12px`、`font-weight: 450`；hover/highlighted 时仅 `var(--background-modifier-hover)` 背景变化；selected 态使用 accent 背景 tint + `font-weight: 600`；移除了左侧竖线装饰和 `translateX` 位移。
  - 动画简化：选项入场仅为 `opacity` 淡入，移除了按 provider group 交错延迟和 `translateX(-6px)` 滑入。
  - 全链路 `prefers-reduced-motion: reduce` 兜底。
- classic 设置页 quick-nav 的 tooltip 现在不再依赖 `.opencodian-settings-quick-nav-btn` 的伪元素，而是用 `.opencodian-settings-quick-nav-tooltip-layer` / `-bubble` / `-arrow` 这组 body-level overlay 样式。这样提示层可以真正越过 settings 滚动容器，不再受容器裁切影响。
- editor-area 设置页样式现在只匹配 `.workspace-leaf-content[data-type="opencodian-settings-view"] > .view-content.opencodian-settings`。这和 `OpenCodianSettingsView` 渲染到 `ItemView.contentEl` 的结构保持一致，避免 classic/平铺模式下 Obsidian `Setting` 行只剩分隔线、名称和控件被异常层级样式吞掉。
- settings layout visible unification 后，此文件保留 settings 旧类名的兼容样式，但不再承担共享层级合同：
  - `.opencodian-settings-tab-panel` 只保留 `display: contents`，避免重 tab panel 再包一层 section card。
  - `.opencodian-style-section` 去掉粗 `border-left` 侧边条，改用 `--opencodian-settings-section-*` token fallback，使样式设置 section 不再像另一个局部设计系统。
  - quick-nav、tabs、section、ordinary setting row 的可见层级现在由 `settings-layout-contract.css` 统一覆盖。


## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/features/settings/OpenCodianSettings.ts`

## 修改注意点

- 此文件体量大、覆盖面广；若只改模型下拉，务必限制在 `.opencodian-model-*` 作用域。
- `is-unconfigured` 与警示色用于配置异常提示，不建议弱化对比度。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。

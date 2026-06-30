# Core Styles

> **源码**: `src/style/base/core.css`
> **状态**: [FINAL]

## 职责

提供 OpenCodian 全局设计 token 与基础布局骨架，覆盖主题变量、玻璃态参数、消息区/输入区容器、标签页栏、滚动条、主题背景层和若干通用动画。`src/style` 下多数子模块都依赖这里定义的变量。

## 关键类名 / CSS 变量

- `:root`、`.theme-dark`、`.theme-light`：定义 `--opencodian-*` 与 `--lobehub-icon-filter*` 等主题变量；其中 `body[data-opencodian-provider-icon-mode]` 会在 `跟随系统 / 单色 / 彩色` 三种 provider 图标模式之间切换。
- `.opencodian-container`：聊天主容器，声明消息/输入区的尺寸变量（如 `--opencodian-messages-pad-*`、`--opencodian-composer-stack-height`）。
- `.opencodian-messages`、`.opencodian-turn*`：消息列表、分轮结构与 sticky header 行为。
- `.opencodian-tab-bar*`、`.opencodian-tab-bar-parent-breadcrumb*`、`.opencodian-tab-bar-parent-close*`、`.opencodian-tab-overflow-menu*`：多会话标签栏、子会话返回父 tab 面包屑、隐藏子会话关闭按钮与溢出菜单样式。
- `.opencodian-container--tabs-disabled`：禁用会话标签时隐藏普通 tab bar slot 与 header 的 new-tab 专用按钮；当 slot 带有 `is-parent-only` 时仍显示返回父会话面包屑。它只影响可见控件，不改变内部 active tab / `tabState` 数据。
- `.opencodian-header-action-group`、`.opencodian-header-status-group`、`.opencodian-header-conversation-group`、`.opencodian-header-config-group`：聊天 header 的操作分区。status badge 与 LSP 状态在 status group，`new-current-tab` / `new-tab` / `history` 在 conversation group，session settings / plugin settings 在 config group；header action rhythm 统一使用 8px，不再用竖向分隔线切组。
- `.opencodian-header-btn`：聊天 header 的 icon action 基础样式。元素现在由 presenter 渲染为真实 `button[type="button"]`，因此这里显式清零 `padding`/`border`、使用透明背景并继承字体，保持 28px icon button 尺寸和 hover/focus 视觉不被浏览器默认 button 样式污染。`data-action="new-current-tab"` 是 conversation group 的 primary action，使用更明确的 accent 边框和背景。
- `.opencodian-server-status-badge`：聊天 header 的 server/backend 状态按钮。默认为 28px 紧凑 shadcn-style badge，内部的 `.opencodian-server-status-icon` 用 active backend identity 表达后端；OpenCode 使用与标题 logo 同源的 inline brandmark，非 OpenCode backend 使用 provider SVG mask。`.opencodian-server-status-state` 是 badge 级右下角 ring/dot，不参与图标居中；`.opencodian-server-status-text` 留在同一个按钮内部，hover / focus-visible 时用短宽度展开 + opacity/transform 显示，避免长 backend 名称常驻占用右上角工具栏宽度。`.is-disabled` 是后端全部禁用时的灰色状态，与 `.is-checking`/`.is-starting`/`.is-running`/`.is-external`/`.is-offline` 并列。
- `.opencodian-theme-background-*`：主题背景图层、遮罩、叠加高光。
- 关键变量组：`--opencodian-glass-*`、`--opencodian-composer-*`、`--opencodian-status-*`、`--opencodian-shadow-*`。
- 输入区字体默认值由 `--opencodian-composer-font-family` 提供，并可被聊天外观设置生成的容器变量覆盖。
- Layered composer 间距 token：`--opencodian-composer-gap-xs`（6px）、`--opencodian-composer-gap-sm`（8px）、`--opencodian-composer-pad-x`（12px）统一 context strip → textarea → input-row → runtime-dock 的横向节奏，替代此前 footer/grid 中硬编码的 `8px 12px` / `8px` / `6px`。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/ui/NavigationSidebar.ts`
- `src/features/chat/ui/ContextRing.ts`
- `src/features/chat/ui/QuestionDock.ts`
- `src/features/chat/ui/SessionTodoDock.ts`
- `src/features/settings/OpenCodianSettings.ts`

## 修改注意点

- 此文件是全局变量源，改 token 前要检查 `components/`、`features/`、`modals/` 中是否有连锁影响。
- 标签栏与 sticky header 依赖精确层级（`z-index`、`overflow`、`position`），不要单点改动后遗漏滚动场景验证。
- 子会话返回面包屑和隐藏子会话关闭按钮在横向和 `below-header-vertical` 布局下分别共用 `opencodian-tab-bar-parent-breadcrumb*` / `opencodian-tab-bar-parent-close*` 类，调整尺寸时要避免挤压 tab 按钮和溢出菜单。
- 如仅调整样式拼接产物，执行 `npm run build:css`；发版前以 `npm run build` 为准。
- provider 图标颜色模式是全局变量开关，改这里时要同时检查聊天区、设置页、模型工作区和 provider icon modal 的预览表现。

# Modified Files Sidebar Styles

> **源码**: `src/style/components/modified-files-sidebar.css`
> **状态**: [REVIEW]

## 职责

定义右侧 modified files `Popover`、32px 高的胶囊形 outline trigger、文件数 badge、文件列表，以及点击驱动的折叠/展开状态。

## 关键类名 / CSS 变量

- `.opencodian-modified-files-sidebar-host`：绝对定位覆盖层，默认 `pointer-events: none`。
- `.opencodian-modified-files-hover-zone`：默认 48px × 40px 的右缘感知区，指针进入或子元素获得焦点时才显露入口；展开后才放大为 Popover 所需边界。
- `.opencodian-modified-files-trigger-strip`：可键盘访问的 32px 高、44px 起的胶囊形 `Button variant=outline` 入口；默认透明，hover / `:focus-within` / 展开状态才淡入；有 entries 时，图标和内嵌小型 `Badge` 并排显示，未就绪用状态点。
- `.opencodian-modified-files-sidebar`：定位和展开过渡层；视觉框架由共享的 `.opencodian-composer-popover-frame` 提供，面板从入口下方 40px 弹出，宽度在 288px 与容器减 16px 之间取较小值，右侧保留 8px 安全边界。
- `.opencodian-modified-files-hover-zone.is-expanded`：由触发器点击设置的展开状态；hover / `:focus-within` 不负责唯一或主要的展开行为。
- `.opencodian-modified-files-sidebar-list`：可滚动文件列表容器。
- `.opencodian-modified-files-sidebar-item`、`.opencodian-modified-files-sidebar-item > summary`、`.opencodian-modified-files-sidebar-path`：默认展开的原生 `<details>` 文件项、键盘可达折叠摘要与 monospace 路径按钮。
- `.opencodian-modified-files-sidebar-additions` / `.deletions`：增删行数颜色。
- `.opencodian-modified-files-toggle` 与 `.opencodian-modified-files-toggle-badge`：输入 toolbar toggle 与文件数量角标。

## 关联 TS 组件

- `src/features/chat/ui/ModifiedFilesSidebar.ts`
- `src/features/chat/OpenCodianView.ts`

## 修改注意点

- 面板和左侧 `NavigationSidebar` 使用相同 z-index 层级（220），但位于右侧避免遮挡导航按钮。
- host 默认不接收 pointer events；闭合时只有 48px × 40px 感知区可接收 pointer events，展开后容器和面板可交互。感知区不抢占整条右侧滚动条命中区。
- `:focus-visible` 提供键盘焦点可见样式，`prefers-reduced-motion: reduce` 禁用状态过渡。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。

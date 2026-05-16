# Modified Files Sidebar Styles

> **源码**: `src/style/components/modified-files-sidebar.css`
> **状态**: [REVIEW]

## 职责

定义右侧 modified files 浮动侧栏、文件列表、状态 badge、增删行数颜色，以及 composer toolbar 中 toggle 按钮的样式。

## 关键类名 / CSS 变量

- `.opencodian-modified-files-sidebar-host`：绝对定位覆盖层，默认 `pointer-events: none`。
- `.opencodian-modified-files-sidebar`、`.visible`、`.collapsed`：右侧面板尺寸、玻璃背景、滑入/淡出状态。
- `.opencodian-modified-files-sidebar-list`：可滚动文件列表容器。
- `.opencodian-modified-files-sidebar-item`、`.opencodian-modified-files-sidebar-path`：单个文件项与 monospace 路径按钮。
- `.opencodian-modified-files-sidebar-additions` / `.deletions`：增删行数颜色。
- `.opencodian-modified-files-toggle` 与 `.opencodian-modified-files-toggle-badge`：输入 toolbar toggle 与文件数量角标。

## 关联 TS 组件

- `src/features/chat/ui/ModifiedFilesSidebar.ts`
- `src/features/chat/OpenCodianView.ts`

## 修改注意点

- 面板和左侧 `NavigationSidebar` 使用相同 z-index 层级（220），但位于右侧避免遮挡导航按钮。
- `pointer-events` 必须只在 `.visible` 状态开启，否则隐藏面板会挡住聊天内容。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。

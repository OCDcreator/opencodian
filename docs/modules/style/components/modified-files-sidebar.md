# Modified Files Sidebar Styles

> **源码**: `src/style/components/modified-files-sidebar.css`
> **状态**: [REVIEW]

## 职责

定义右侧 modified files 浮动侧栏、文件列表、状态 badge，以及闭合态顶部小热区和展开态完整面板之间的交互样式。

## 关键类名 / CSS 变量

- `.opencodian-modified-files-sidebar-host`：绝对定位覆盖层，默认 `pointer-events: none`。
- `.opencodian-modified-files-sidebar`：右侧面板尺寸、玻璃背景、滑入/淡出状态；宽度在 280px 与容器减 16px 之间取较小值，高度受 `--opencodian-modified-files-expanded-height` 约束。
- `.opencodian-modified-files-hover-zone`：默认只覆盖顶部小触发条高度；hover / `:focus-within` 后才扩展成完整侧栏交互区域，避免闭合态抢占整条右侧滚动条 hover。
- `.opencodian-modified-files-sidebar-list`：可滚动文件列表容器。
- `.opencodian-modified-files-sidebar-item`、`.opencodian-modified-files-sidebar-path`：单个文件项与 monospace 路径按钮。
- `.opencodian-modified-files-sidebar-additions` / `.deletions`：增删行数颜色。
- `.opencodian-modified-files-toggle` 与 `.opencodian-modified-files-toggle-badge`：输入 toolbar toggle 与文件数量角标。

## 关联 TS 组件

- `src/features/chat/ui/ModifiedFilesSidebar.ts`
- `src/features/chat/OpenCodianView.ts`

## 修改注意点

- 面板和左侧 `NavigationSidebar` 使用相同 z-index 层级（220），但位于右侧避免遮挡导航按钮。
- host 默认不接收 pointer events，只有触发条/hover zone 和已展开面板可交互；闭合态 hover zone 必须保持短高度，避免抢占整个右侧滚动条命中区。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。

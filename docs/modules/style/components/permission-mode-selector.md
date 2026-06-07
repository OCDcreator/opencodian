# Permission Mode Selector Styles

> **源码**: `src/style/components/permission-mode-selector.css`
> **状态**: [FINAL]

## 职责

定义聊天工具栏权限模式选择器（yolo / normal / plan）的触发器与下拉选项视觉，并提供模式语义色。输入工具栏内的 trigger 使用统一 control height / inline padding（`4px 10px`），与 Agent / model selector 保持同一横向节奏；默认态采用 glass 背景（`background-primary 54%`）+ 内嵌高光边界，`action-buttons-etched` 下切换为透明刻入态。Trigger hover 时带有 `translateY(-1px)` 抬升与柔和阴影，`is-open` 时显示 accent 边框光晕。下拉面板采用统一 glass surface（`blur(40px) saturate(1.22)`，`border-radius: 16px`），选项 hover 时左侧出现 mode-specific 强调边框 + `translateX(2px)` 滑入，selected 状态使用 mode-specific 背景色 + 左侧边框 + `font-weight: 600`。

## 关键类名 / CSS 变量

- `.opencodian-permission-selector`：选择器容器。
- `.opencodian-permission-trigger` + `mode-yolo|mode-normal|mode-plan`：当前模式显示与颜色。
- `.opencodian-sandbox-config-badge*`：permission trigger 旁的 Claude Code sandbox 配置徽章，用于显示 expanded sandbox 摘要。
- `.opencodian-permission-dropdown`：弹出菜单容器。
- `.opencodian-permission-option*`：选项项、图标、描述与选中勾选。
- `[data-mode="..."]`：按模式给图标着色。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`

## 修改注意点

- 模式色语义与行为绑定（成功/默认/计划），不要把三种模式做成几乎同色。
- 下拉体验与模型选择器需保持视觉一致（圆角、玻璃态、阴影等级）。
- 下拉面板带有 `permission-dropdown-open` 入场动画，由 `.is-open` 类触发。
- 选项支持 `:focus-visible` 焦点轮廓，确保键盘导航可见。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
- 2026-06-07 新增 sandbox badge 样式，覆盖 enabled/disabled/readback 状态和 expanded sandbox 子策略摘要。

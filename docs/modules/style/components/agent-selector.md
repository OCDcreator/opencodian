# Agent Selector Styles

> **源码**: `src/style/components/agent-selector.css`
> **状态**: [REVIEW]

## 职责

定义聊天输入工具栏里的主 Agent 专属样式。它覆盖 trigger icon/text/chevron、紧凑列表标题、OpenCode default 与 primary/all agent 的 label/meta 布局以及 loading/empty/error 状态。Popover 外卡片、通用 option 几何、hover、focus、neutral selected 背景、600 字重和 reduced-motion 都由共享 `composer-popover-frame.css` 负责；Agent trigger 保留 warning-selected 语义，并在 runtime rail 中使用低视觉权重的紧凑 pill 几何。

## 关键类名

- 容器与按钮：`.opencodian-agent-selector`、`.opencodian-agent-trigger*`
- 下拉框：`.opencodian-agent-dropdown`、`.opencodian-agent-dropdown-heading`
- 选项：`.opencodian-agent-option*`、`.opencodian-agent-option-main`、`.opencodian-agent-option-meta`
- 二级文本：`.opencodian-agent-option-desc`
- 状态行：`.opencodian-agent-dropdown-state`

## 关联 TS 组件

- `src/features/chat/services/ChatAgentSelectionCoordinator.ts`

## 修改注意点

- trigger 容器应向 model selector 看齐，保持一致的 runtime-chip 边框、紧凑内边距、11px 文本和小图标，不能膨胀成与 send/add action 同权重的大按钮。
- 下拉框只保留定位、既有 340px / 272px 尺寸约束、320px 最大高度和滚动溢出；共享 frame 提供背景、边框、圆角、阴影与 reduced-motion。
- 下拉框使用 `box-sizing: border-box`；实际宽度与水平偏移由 `AnchoredOverlayLayoutController` 钳制到 Chat 容器 8px 安全区内，不要重新引入 `100vw` 宽度判断。
- 通用选项的 `:focus-visible` 与 selected 状态使用共享 Command 中性背景 + 600 字重；Agent CSS 不再覆盖为黄色选中行，也不再渲染彩色 marker dot（`.opencodian-agent-option-marker` 已通过 `display: none` 隐藏，default 状态改由 `.is-default-mode` 文字 badge 表达）。
- trigger 选中态使用 `var(--text-warning)`，对齐 OpenCode 对 agent reference 的黄色/橙色语义。
- `.opencodian-composer-shell--action-buttons-etched` 下的 trigger 复用刻入玻璃按钮语法：透明底、无独立边框、轻量 hover/focus，仅用文字/图标颜色表达 agent 选择。
- dropdown 内部是紧凑 Command-popover 行布局，mode badge 使用低对比 muted 文字 chip；避免把每个 agent 选项做成独立卡片或染满整行颜色。`.opencodian-agent-dropdown-state` 不再使用 `background-secondary` 染色，状态行直接落在共享 surface 上。
- 修改后执行 `npm run build:css` 或完整 `npm run build`，刷新根目录 `styles.css`。

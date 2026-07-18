# Agent Selector Styles

> **源码**: `src/style/components/agent-selector.css`
> **状态**: [REVIEW]

## 职责

定义聊天输入工具栏里的主 Agent 专属样式。它覆盖 trigger icon/text/chevron、轻量列表标题、OpenCode default 与 primary/all agent 的 marker/main/meta 布局、固定二级描述和 loading/empty/error 状态。Popover 外卡片、通用 option 几何、hover、focus 与 selected accent 由共享 `composer-popover-frame.css` 负责；Agent trigger 的 warning-selected 外观保持不变。

## 关键类名

- 容器与按钮：`.opencodian-agent-selector`、`.opencodian-agent-trigger*`
- 下拉框：`.opencodian-agent-dropdown`、`.opencodian-agent-dropdown-heading`
- 选项：`.opencodian-agent-option*`、`.opencodian-agent-option-marker`、`.opencodian-agent-option-main`、`.opencodian-agent-option-meta`
- 二级文本：`.opencodian-agent-option-desc`
- 状态行：`.opencodian-agent-dropdown-state`

## 关联 TS 组件

- `src/features/chat/services/ChatAgentSelectionCoordinator.ts`

## 修改注意点

- trigger 容器应向 model selector 看齐，保持一致的默认边框、内边距、hover/open 反馈和图标尺寸。当前 trigger padding 为 `4px 10px`，与 model selector 一致。
- 下拉框只保留定位、既有 340px / 272px 尺寸约束、320px 最大高度、滚动溢出和 `agent-dropdown-open` 入场动画；共享 frame 提供背景、边框、圆角和阴影。
- 下拉框使用 `box-sizing: border-box`；实际宽度与水平偏移由 `AnchoredOverlayLayoutController` 钳制到 Chat 容器 8px 安全区内，不要重新引入 `100vw` 宽度判断。
- 通用选项的 `:focus-visible` 与 selected 状态使用共享 product accent；Agent CSS 不再覆盖为黄色选中行。
- trigger 选中态使用 `var(--text-warning)`，对齐 OpenCode 对 agent reference 的黄色/橙色语义。
- `.opencodian-composer-shell--action-buttons-etched` 下的 trigger 复用刻入玻璃按钮语法：透明底、无独立边框、轻量 hover/focus，仅用文字/图标颜色表达 agent 选择。
- default row 使用 `is-default` 与 muted marker / small default badge 轻微区分，但仍和 agent row 共用同一 option 几何；不要用彩色侧边条表达 default/selected 状态。
- dropdown 内部是紧凑 command-popover 行布局，避免把每个 agent 选项做成独立卡片。
- 修改后执行 `npm run build:css` 或完整 `npm run build`，刷新根目录 `styles.css`。

# Agent Selector Styles

> **源码**: `src/style/components/agent-selector.css`
> **状态**: [REVIEW]

## 职责

定义聊天输入工具栏里的主 Agent 下拉框样式。它覆盖 trigger icon/text/chevron、轻量列表标题、OpenCode default 选项、primary/all agent option、marker/main/meta 紧凑行布局、固定二级描述、loading/empty/error 状态，以及选中态的黄色强调。Trigger 跟随输入工具栏统一高度/间距 token，并在默认态对齐 model selector trigger 的容器几何、边框、背景和 inset highlight；`etched` 时融入 composer 面板。

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
- 下拉框与 model / permission selector 保持同一 popover 视觉语言：`border-radius: 16px`、`blur(40px) saturate(1.22)`、统一分层阴影，并带有 `agent-dropdown-open` 入场动画。
- 选项支持 `:focus-visible` 焦点轮廓，确保键盘导航可见。
- trigger 选中态使用 `var(--text-warning)`，对齐 OpenCode 对 agent reference 的黄色/橙色语义。
- `.opencodian-composer-shell--action-buttons-etched` 下的 trigger 复用刻入玻璃按钮语法：透明底、无独立边框、轻量 hover/focus，仅用文字/图标颜色表达 agent 选择。
- default row 使用 `is-default` 与 muted marker / small default badge 轻微区分，但仍和 agent row 共用同一 option 几何；不要用彩色侧边条表达 default/selected 状态。
- dropdown 内部是紧凑 command-popover 行布局，避免把每个 agent 选项做成独立卡片。
- 修改后执行 `npm run build:css` 或完整 `npm run build`，刷新根目录 `styles.css`。

# Agent Selector Styles

> **源码**: `src/style/components/agent-selector.css`
> **状态**: [REVIEW]

## 职责

定义聊天输入工具栏里的主 Agent 下拉框样式。它覆盖 trigger icon/text/chevron、OpenCode default 选项、primary/all agent option、详情展开按钮、loading/empty/error 状态，以及选中态的黄色强调。

## 关键类名

- 容器与按钮：`.opencodian-agent-selector`、`.opencodian-agent-trigger*`
- 下拉框：`.opencodian-agent-dropdown`
- 选项：`.opencodian-agent-option*`
- 详情切换：`.opencodian-agent-option-detail-toggle`、`.opencodian-agent-option-detail-chevron`
- 状态行：`.opencodian-agent-dropdown-state`

## 关联 TS 组件

- `src/features/chat/services/ChatAgentSelectionCoordinator.ts`

## 修改注意点

- 下拉框与 model / permission selector 保持同一 popover 视觉语言。
- trigger 选中态使用 `var(--text-warning)`，对齐 OpenCode 对 agent reference 的黄色/橙色语义。
- 修改后执行 `npm run build:css` 或完整 `npm run build`，刷新根目录 `styles.css`。

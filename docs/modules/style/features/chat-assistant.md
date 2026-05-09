# Chat Assistant Styles

> **源码**: `src/style/features/chat-assistant.css`
> **状态**: [FINAL]

## 职责

定义助手消息主视图样式，包括助手气泡、通知卡、复制按钮、时间/模型元信息、问题停靠区、会话 TODO 面板、slash autocomplete menu 与输入区整体布局。

## 关键类名 / CSS 变量

- 助手消息：`.opencodian-message--assistant`、`.opencodian-message-time-row`、`.opencodian-message-model-id`。
- 用户消息高亮：`.opencodian-message-highlight-agent`（`@agent`）、`.opencodian-message-highlight-command`（普通 `/command`）与 `.opencodian-message-highlight-skill`（direct `/skill`、`/skills skill`）。
- 通知卡：`.opencodian-chat-notice-card*`、`.opencodian-chat-notice-action-btn`。
- 交互按钮：`.opencodian-copy-btn-inline`、`.opencodian-user-action-btn*`。
- 问题与 TODO：`.opencodian-question-dock*`、`.opencodian-session-todo-*`。
- 输入区：`.opencodian-composer-*`、`.opencodian-slash-command-menu*`、`.opencodian-slash-command-menu-state*`、`.opencodian-input-toolbar`、`.opencodian-context-ring*`。
- 输入高亮：`.opencodian-input-highlight-container`（textarea 包裹层）、`.opencodian-input-highlight-backdrop`（镜像 backdrop）、`.opencodian-input-highlight-token`（通用 token 基础样式）、`.opencodian-input-highlight-agent`（backdrop 内 selected `@agent` pill span）、`.opencodian-input-highlight-command`（backdrop 内已知 slash command 高亮 span）与 `.opencodian-input-highlight-skill`（backdrop 内已知 direct / prefixed skill 高亮 span）。textarea 设为 `color: transparent; caret-color: var(--text-normal)`，backdrop 承担全部文本渲染；selected `@agent` 使用 pill 半径、小幅非排版型 `box-shadow` 外扩、cloned box decoration，以及与 textarea 完全一致的行高和 padding 呼吸空间，不能通过 token 自身的 padding / font-weight 改变镜像层文本宽度，否则会造成 textarea caret 与渲染文本错位；实际 metadata / 原子编辑保护由 `AgentMentionComposerController` 和 `ComposerInputShellCoordinator` 维护；未知 `/xxx` typo 不应被着色。
- 输入工具栏现在为 Agent / permission / model / effort selector 统一保留 flex slot，并通过 `--opencodian-input-toolbar-control-gap` / `--opencodian-input-toolbar-control-height` 统一控制横向节奏与控件高度；context usage ring 也跟随该高度，并在 `action-buttons-etched` 下切换成刻入式透明状态。ring 内部通过 `.opencodian-context-ring-meter` 固定 34px 仪表盒，`classic` 样式显示原有连续环形进度，`segmented` 样式显示 24 个留有间隔的较长 SVG 刻度线段；状态只由环形进度色/刻度色和中心数字表达，不渲染额外 LOW / MEDIUM / HIGH 文本，也不再通过 CSS 伪元素追加 `%` 后缀。中心数字使用 bundled Oxanium 字体文件 `assets/fonts/oxanium/Oxanium[wght].ttf`，不依赖运行时外链。Agent 下拉框本体样式在 `components/agent-selector.css`。
- 动画：`opencodian-spin`、`opencodian-todo-pulse`、若干玻璃态 hover 过渡。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ComposerInputShellCoordinator.ts`
- `src/features/chat/ui/QuestionDock.ts`
- `src/features/chat/ui/SessionTodoDock.ts`
- `src/features/chat/ui/ContextRing.ts`

## 修改注意点

- 该文件覆盖面非常广，建议先锁定子域（消息 / 通知 / 输入区）再改，避免回归。
- `--opencodian-assistant-*`、`--opencodian-composer-*` 与 `base/core.css` 变量紧耦合，改值要联动检查。
- slash menu 现在是 composer shell 上方的 absolute overlay，不参与输入区高度计算；如果调整 `.opencodian-slash-command-menu*` 或 `.opencodian-slash-command-menu-state*`，记得同时检查上方弹出位置、长文本换行、状态行可读性与 hover/focus 对比度。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。

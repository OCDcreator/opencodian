# Chat Assistant Styles

> **源码**: `src/style/features/chat-assistant.css`
> **状态**: [FINAL]

## 职责

定义助手消息主视图样式，包括助手气泡、通知卡、复制按钮、时间/模型元信息、问题停靠区、会话 TODO 面板、slash autocomplete menu 与输入区整体布局。

## 关键类名 / CSS 变量

- 助手消息：`.opencodian-message--assistant`、`.opencodian-message-time-row`、`.opencodian-message-model-id`。
- 通知卡：`.opencodian-chat-notice-card*`、`.opencodian-chat-notice-action-btn`。
- 交互按钮：`.opencodian-copy-btn-inline`、`.opencodian-user-action-btn*`。
- 问题与 TODO：`.opencodian-question-dock*`、`.opencodian-session-todo-*`。
- 输入区：`.opencodian-composer-*`、`.opencodian-slash-command-menu*`、`.opencodian-input-toolbar`、`.opencodian-context-ring*`。
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
- slash menu 现在跟输入区 layout metrics 同步；如果调整 `.opencodian-slash-command-menu*`，记得同时检查输入区 stack height 与 hover/focus 对比度。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。

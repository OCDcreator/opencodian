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
- Fork target modal：`.opencodian-fork-target-list`、`.opencodian-fork-target-option` 和 `.opencodian-fork-target-note`，后者用于禁用会话标签时解释 why “fork to new tab” 不显示。
- 问题与 TODO：`.opencodian-question-dock*`、`.opencodian-question-dock-collapse-toggle`、`.opencodian-question-dock.is-collapsed`、`.opencodian-session-todo-*`。
- 输入区：`.opencodian-composer-*`、`.opencodian-slash-command-menu*`、`.opencodian-slash-command-menu-state*`、`.opencodian-slash-command-menu-hint`、`.opencodian-input-toolbar`、`.opencodian-context-ring*`。
- 输入禁用壳层：`.opencodian-input-wrapper.is-composer-disabled` 继续只负责降低 textarea/footer 可交互性；“无 backend / backend offline”说明不再作为输入区内嵌块存在，而是由 `.opencodian-composer-availability-notice` 这张外部 notice card 承载，落在消息区下缘与 composer 之间。
- 输入高亮：`.opencodian-input-highlight-container`（textarea 包裹层）、`.opencodian-input-highlight-backdrop`（镜像 backdrop）、`.opencodian-input-highlight-token`（通用 token 基础样式）、`.opencodian-input-highlight-agent`（backdrop 内 selected `@agent` pill span）、`.opencodian-input-highlight-command`（backdrop 内已知 slash command 高亮 span）与 `.opencodian-input-highlight-skill`（backdrop 内已知 direct / prefixed skill 高亮 span）。textarea 设为 `color: transparent; caret-color: var(--text-normal)`，backdrop 承担全部文本渲染；selected `@agent` 使用 pill 半径、小幅非排版型 `box-shadow` 外扩、cloned box decoration，以及与 textarea 完全一致的行高和 padding 呼吸空间，不能通过 token 自身的 padding / font-weight 改变镜像层文本宽度，否则会造成 textarea caret 与渲染文本错位；实际 metadata / 原子编辑保护由 `AgentMentionComposerController` 和 `ComposerInputShellCoordinator` 维护；未知 `/xxx` typo 不应被着色。
- 输入区采用 **layered composer** 布局（narrow-first，专为 Obsidian 侧边栏窄面板设计）：`.opencodian-input-area` 左右 padding 固定为 0，让输入框外框贴齐聊天容器左右边界；`.opencodian-composer-content` 内部为 context strip → textarea → `.opencodian-composer-input-row.opencodian-composer-action-zone` → `.opencodian-composer-runtime-dock.opencodian-composer-runtime-rail`。action zone 是两栏 flex（左侧放 add context、image attach、compact `{ } JSON` capability hint，右侧放 context usage ring 与 send/stop）；runtime rail 位于其下方，承载 Agent / permission / model / effort，自带 flex-wrap 且不重新引入横线。
- 输入工具栏宽度保持 `100%`，通过 `--opencodian-input-toolbar-control-gap` / `--opencodian-input-toolbar-control-height` 控制横向节奏；context usage ring 留在 submit controls，runtime rail 在 etched 模式下从 composer shell 继承透明刻入样式。
- `.opencodian-runtime-overflow` / `.opencodian-runtime-overflow-trigger` / `.opencodian-runtime-overflow-panel` 收纳 sandbox、additional directories 和 Codex runtime defaults 等低优先级只读状态。`.opencodian-effort-slot` 位于右侧，overflow trigger 保持最后一个视觉 affordance。
- 输入文本层（`.opencodian-input`、highlight backdrop 与 placeholder）使用 `--opencodian-composer-font-family`，默认落到 bundled `OpenCodian Newsreader` + serif fallback；`.opencodian-input-area` 保持 `font-family: inherit`，toolbar 控件仍使用 Obsidian/system UI 字体。
- Structured Output 可折叠渲染：`.opencodian-structured-output-details`、`.opencodian-structured-output-summary`、`.opencodian-structured-output-body`、`.opencodian-structured-output-pre`、`.opencodian-structured-output-code`，用于在 assistant message 底部展示从 `backend_event` 捕获的结构化输出 JSON。
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
- composer disabled shell 只应降低 textarea/footer 的可交互性；availability 文案应作为外部 notice 呈现，不应再把说明块塞回 input area，也不应影响 history/tabs/question/todo 等相邻 runtime 区块。

本轮继续收口 backend availability 提示：旧的 `.opencodian-composer-disabled-state` 内嵌说明块已移除，改为 `.opencodian-composer-availability-notice`。该 notice 复用现有 warning card 视觉语言，但挂在 `.opencodian-input-area` 之外，因此“当前 backend 不可用”不再破坏输入区的一致性。禁用输入时仍会 dim 掉 textarea/footer；只是状态说明回到更合适的消息区边界。
- QuestionDock collapse 只调整 above-input dock shell：折叠时 header 保留，tabs/body/footer 不渲染，样式只负责 toggle button 与 collapsed gap，不应影响 inline question cards。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。


本轮调整 `.opencodian-input-capability-hint`、`.opencodian-input-capability-hint-glyph` 与 `.opencodian-input-capability-hint-text`：它们不再占用 textarea 下方的一整行提示，也不再贴着 send 按钮，而是作为 context actions cluster 里的紧凑小按钮，和 add context / image attach 同区。当前唯一 capability chip 是 Claude Code 和 Codex backend 共用的 structured-output affordance（OpenCode 不显示），对用户展示为 `{ } JSON`；完整说明留在 tooltip，点击后仍只插入 `/json `，不会自动发送。

本轮同步收口 prompt suggestion chip 样式：`.opencodian-suggestion-bar` 不再挂在 composer footer 或输入区顶部，而是作为最后一条 assistant message 的后继 sibling 插入同一个 turn body，视觉上紧跟该回复本身。`.opencodian-suggestion-chip` 继续是可点击 pill，点击后仅将文本插入 textarea，不会自动发送。这样 `{ } JSON` capability chip 留在 context actions，负责固定能力入口；prompt suggestion 则真正回到 assistant follow-up 的语义位置，不再与 add/send action 混成同一层。

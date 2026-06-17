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
- 输入区采用 **layered composer** 布局（narrow-first，专为 Obsidian 侧边栏窄面板设计）：`.opencodian-composer-content` 内部为 context strip → textarea → `.opencodian-composer-input-row` → `.opencodian-composer-runtime-dock`。`.opencodian-composer-input-row` 是两栏 flex（左 `opencodian-composer-context-actions` 放 add context、image attach、capability hint，右 `opencodian-composer-submit-controls` 放 context usage ring 与 send/stop），不再使用三段式 grid 或宽度断点。`.opencodian-composer-runtime-dock` 位于 input-row 下方，是低视觉权重状态行，放 Agent / permission / model / badges / effort selector，自带 `flex-wrap` 与淡分隔线，在窄面板下自动换行不溢出。`.opencodian-composer-add-btn` 与 `.opencodian-composer-image-btn` 共享 30px utility button baseline；send/stop 保持 34px 主提交 affordance，视觉上仍是 accent 但阴影更克制。composer 间距统一用 `--opencodian-composer-gap-xs/sm` token，避免硬编码。
- 输入工具栏现在作为 `.opencodian-composer-runtime-dock` 内的 Agent / permission / model / effort selector 统一 flex slot，并通过 `--opencodian-input-toolbar-control-gap` / `--opencodian-input-toolbar-control-height` 控制横向节奏与控件高度；它定义 sizing token，但 wrapping/spacing 交给 dock 父级统一管理，避免两套布局打架。context usage ring 移到 submit controls，并在 `action-buttons-etched` 下切换成刻入式透明状态；runtime-dock 位于玻璃壳内部，刻入玻璃样式从 `.opencodian-composer-shell--action-buttons-etched` 自动级联，dock 本身无需额外 etched CSS。ring 内部通过 `.opencodian-context-ring-meter` 固定 34px 仪表盒，`classic` 样式显示原有连续环形进度，`segmented` 样式显示 24 个留有间隔的较长 SVG 刻度线段；状态只由环形进度色/刻度色和中心数字表达，不渲染额外 LOW / MEDIUM / HIGH 文本，也不再通过 CSS 伪元素追加 `%` 后缀。中心数字使用 bundled Oxanium 字体文件 `assets/fonts/oxanium/Oxanium[wght].ttf`，不依赖运行时外链。Agent 下拉框本体样式在 `components/agent-selector.css`。
- `.opencodian-sandbox-config-badge-container`：输入工具栏中的 sandbox badge 容器，用于在 permission controls 附近展示 expanded Claude Code sandbox 摘要。
- `.opencodian-codex-runtime-defaults-badge-container`：输入工具栏中的 Codex runtime defaults badge 容器，用于在 permission controls 附近展示网络/网页搜索/额外目录等非默认 Codex 默认项。
- `.opencodian-input-area` 现在使用 `font-family: var(--opencodian-composer-font-family, inherit)`，让输入区跟随外观设置里的中英文字体组合。
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


本轮调整 `.opencodian-input-capability-hint` 与 `.opencodian-input-capability-hint-text`：它们不再占用 textarea 下方的一整行提示，也不再贴着 send 按钮，而是作为 context actions cluster 里的小按钮，和 add context / image attach 同区。当前唯一 capability chip 是 Claude Code 和 Codex backend 共用的 structured-output affordance（OpenCode 不显示），对用户展示的按钮文案是更直白的“结构化回复”；视觉权重收敛为与 utility action 同级的小 pill，tooltip 则继续承载完整功能说明。

本轮同步收口 prompt suggestion chip 样式：`.opencodian-suggestion-bar` 不再挂在 composer footer 或输入区顶部，而是作为最后一条 assistant message 的后继 sibling 插入同一个 turn body，视觉上紧跟该回复本身。`.opencodian-suggestion-chip` 继续是可点击 pill，点击后仅将文本插入 textarea，不会自动发送。这样“结构化回复” capability chip 留在 context actions，负责固定能力入口；prompt suggestion 则真正回到 assistant follow-up 的语义位置，不再与 add/send action 混成同一层。

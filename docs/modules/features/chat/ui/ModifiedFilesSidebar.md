# ModifiedFilesSidebar

> **源码**: `src/features/chat/ui/ModifiedFilesSidebar.ts`
> **状态**: [REVIEW]

## 概述

浮动的会话修改文件侧栏，定位在聊天视图右侧。它只消费当前 OpenCode session 的 `session.diff` 汇总（`SessionDiffEntry[]`），不读取 Git 状态、不主动请求 diff 数据，也不渲染伪造 patch。

## 导入关系

上游: `obsidian`（App/Component/setIcon）、`core/types/chat`、`i18n`
下游: 被 `OpenCodianView` 创建并在 `session.diff` live signal 或 active pane 重建时刷新

## 核心逻辑

- constructor 创建 `opencodian-modified-files-sidebar-host`、48px × 40px 边缘感知区、按悬浮或键盘焦点淡入的 32px outline icon button、带数量的 badge 和 `opencodian-modified-files-sidebar`，随后加载 Obsidian `Component` lifecycle。
- 面板复用 chat 既有的 `opencodian-composer-popover-frame` / header / title 样式，保持和模型、智能体、权限弹层一致的 shadcn Popover 语法；触发器下方 40px 锚定面板，面板宽度限制为 `min(288px, calc(100% - 16px))`，在窄 workspace leaf 中保持右侧 8px 安全边界。
- `updateEntries(entries, availability)` 复制传入的 `SessionDiffEntry[]`，并保留 `ready` / `unavailable` 状态，避免 UI 层持有可变服务缓存引用。
- 入口使用 shadcn `Button variant=outline, size=icon` 对应的 32px 图标按钮：默认透明，仅在指针进入右缘 48px × 40px 区域、键盘聚焦或面板展开时淡入；仅在有变更时显示 `Badge` 文件数，未就绪用低权重状态点，不再把计数和状态纵向堆进“竖条”。点击切换 `is-expanded`，空/未就绪状态也可打开。头部关闭按钮会阻止冒泡、立即收起并将焦点还给入口，Escape 也会收起且恢复入口焦点；展开后的面板不会因失焦、鼠标移开或刷新条目自动关闭。
- CSS 由 `is-expanded` 状态负责右侧滑入/淡出；hover/focus 不再是展开的唯一机制，并提供 `prefers-reduced-motion` 和 `:focus-visible` 规则。
- `render()` 在 ready 空状态显示 `modifiedFiles.empty`，在不可用状态显示 `modifiedFiles.unavailable`；头部摘要使用短的 `modifiedFiles.readyShort` / `modifiedFiles.unavailableShort`，并通过省略号适配窄 pane，完整说明只留在正文；有内容时渲染默认展开、原生 `<details>` 可折叠的逐文件条目，摘要显示可点击路径，内容显示 `+N`/`-N` 统计和状态 badge；列表项使用随 DOM 替换一起释放的元素级 click listener，避免重复 render 积累 Component 级事件注册。
- 每个组件实例生成生命周期内稳定且唯一的 panel id，并由触发器的 `aria-controls` 关联，避免多 chat leaf 的 DOM id 冲突。
- `formatPath()` 会在桌面 adapter 可用时去掉 vault base path，便于 `workspace.openLinkText()` 以 vault 相对路径打开文件。

## 与其他模块的交互

- **OpenCodianView**: 负责创建/销毁组件、按设置控制入口显隐，并根据当前 backend/session/capability 推送 entries 与 `ready` / `unavailable` 状态；不把不可用状态伪装成 Git 工作区状态。
- **modified-files-sidebar.css**: 控制右侧浮层、列表、状态 badge 和 toolbar toggle 样式。
- **i18n locales**: 提供标题、空状态、状态文案和 toggle tooltip。
- **ConversationRenderService**: collapse 按钮的 tooltip/accessibility label 通过 `setTooltipLabel()` 挂载，保持和 chat 其余 shared tooltip trigger 一致，并避免额外原生 hover tooltip。

## 注意事项

- 不替代 `ConversationNoticeCoordinator` 的 inline diff notice；这是额外的持久侧栏。
- 不应在组件内拉取 OpenCode diff，保持数据来源单向：service cache -> view -> sidebar。
- 如果未来需要跨 tab 显示，应继续由 `OpenCodianView` 根据 active conversation/session 选择 entries。

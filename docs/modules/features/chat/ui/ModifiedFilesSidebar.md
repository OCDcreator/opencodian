# ModifiedFilesSidebar

> **源码**: `src/features/chat/ui/ModifiedFilesSidebar.ts`
> **状态**: [REVIEW]

## 概述

浮动的会话修改文件侧栏，定位在聊天视图右侧。它只消费 `SessionDiffEntry[]` 缓存，不主动请求 diff 数据，用于把当前 session 的文件路径、增删行数和 added/modified/deleted 状态持续展示出来。

## 导入关系

上游: `obsidian`（App/Component/setIcon）、`core/types/chat`、`i18n`
下游: 被 `OpenCodianView` 创建并在 `session.diff` live signal 或 active pane 重建时刷新

## 核心逻辑

- constructor 创建 `opencodian-modified-files-sidebar-host` 和 `opencodian-modified-files-sidebar`，随后加载 Obsidian `Component` lifecycle。
- `updateEntries(entries)` 复制传入的 `SessionDiffEntry[]`，避免 UI 层持有可变服务缓存引用。
- `toggle()` 控制 `visible` / `collapsed` class，CSS 负责右侧滑入/淡出动画。
- `render()` 空状态显示 `modifiedFiles.empty`；有内容时渲染可点击路径、`+N`/`-N` 统计和状态 badge；列表项使用随 DOM 替换一起释放的元素级 click listener，避免重复 render 积累 Component 级事件注册。
- `formatPath()` 会在桌面 adapter 可用时去掉 vault base path，便于 `workspace.openLinkText()` 以 vault 相对路径打开文件。

## 与其他模块的交互

- **OpenCodianView**: 负责创建/销毁组件、从 `OpenCodeService.getCachedSessionDiffEntries(sessionId)` 推送当前 session entries。
- **modified-files-sidebar.css**: 控制右侧浮层、列表、状态 badge 和 toolbar toggle 样式。
- **i18n locales**: 提供标题、空状态、状态文案和 toggle tooltip。
- **ConversationRenderService**: collapse 按钮的 tooltip/accessibility label 通过 `setTooltipLabel()` 挂载，保持和 chat 其余 shared tooltip trigger 一致，并避免额外原生 hover tooltip。

## 注意事项

- 不替代 `ConversationNoticeCoordinator` 的 inline diff notice；这是额外的持久侧栏。
- 不应在组件内拉取 OpenCode diff，保持数据来源单向：service cache -> view -> sidebar。
- 如果未来需要跨 tab 显示，应继续由 `OpenCodianView` 根据 active conversation/session 选择 entries。

# UserMessageContentRenderer

> **源码**: `src/features/chat/runtime/UserMessageContentRenderer.ts`
> **状态**: [REVIEW]

## 概述

`UserMessageContentRenderer` 是 user message body 的 DOM 组装模块。它把 visible text 渲染、context attachment chips、OMO user injection 面板，以及 compaction divider 的渲染从 `OpenCodianView` 中抽出。

## 公开接口

- `UserMessageContentRenderer.renderUserMessageContent(container, message)`：在指定 content 容器内组装 user message body，返回 visible text
- `UserMessageContentRenderer.renderCompactionDivider(messageEl, divider)`：在指定 message element 内渲染 compaction divider 分割线

## Host 端口

`UserMessageContentRendererHost` 由 view 实现，提供以下能力：

- `getRenderUserMarkupAsCodeBlocks()`：是否把用户输入中的 CSS/JS/HTML 片段包装成 fenced code blocks
- `renderMarkdownInto(container, markdown)`：把 markdown 渲染进指定容器
- `scheduleActiveSettledScrollToBottomIfNeeded()`：在 collapsible toggle 时触发滚动到底部
- `openContextAttachment(path)`：点击 context attachment chip 时打开对应文件

## 设计目的

- 让 `OpenCodianView` 不再直接持有 user message body 的 DOM 组装细节
- 把 user text、context chips、OMO injection、compaction divider 统一为一个渲染关注点
- 让 markdown 渲染与文件打开等副作用继续留在 view host，renderer 只负责 DOM 结构
- 保持 `.opencodian-message-text`、`.opencodian-user-context-list`、`.opencodian-omo-injection` 等选择器不变
- 在 markdown 渲染完成后调用 `extractUserMessageTextHighlightSpans()`：既会读取 OpenCode native `agent` part 的 `source` span，把匹配的可见 `@agent` 文本包成 `.opencodian-message-highlight-agent`，也会读取 `message.parts` 中的 `skill-expansion` metadata，只把真实 expanded skill 对应的 `/skill` / `/skills skill` 包成 `.opencodian-message-highlight-command`

## 注意事项

- renderer 内部使用 `prepareUserMessageMarkdownForDisplay()` 处理 code block 包装，但只在 `getRenderUserMarkupAsCodeBlocks()` 返回 true 时生效
- `@agent` 与 skill slash 高亮都只在渲染后的 textContent 与原始 visible text 完全一致时应用；如果 markdown/OMO 转换改变文本，renderer 会跳过 span 包裹以避免错位
- collapsible 的 showMore/showLess label 通过 `t()` 从 i18n 获取
- OMO injection 的 badge label（search/analyze/custom）和 headline 也走 i18n
- compaction divider 的 live/auto/manual/overflow 文本同样走 i18n
- context attachment chip 的 `aria-label` 使用 `getContextKindLabel()` 根据 kind 生成可访问文本

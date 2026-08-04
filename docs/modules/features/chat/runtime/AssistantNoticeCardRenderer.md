# AssistantNoticeCardRenderer

> **源码**: `src/features/chat/runtime/AssistantNoticeCardRenderer.ts`
> **状态**: [REVIEW]

## 概述

`AssistantNoticeCardRenderer` 是 assistant notice card 的 DOM 组装模块。它把 notice tone / icon、标题、Markdown body、OMO system-reminder raw block，以及 notice action button label 的组装从 `OpenCodianView` 中抽出。

对有效 turn-diff notice（`getTurnDiffNoticeMeta(message)` 返回非空）走专用紧凑分支 `renderTurnDiffNotice()`：无 icon、不渲染 Markdown body、以 frozen `noticeMeta.entries` 为唯一数据源，渲染标题 + 数量徽标 + 单行文件列表 + DOM-local 展开/收起 toggle；其他 notice 继续走原 generic 分支。

## 公开接口

- `AssistantNoticeCardRenderer.render()`：在指定 container 内渲染 notice card；turn-diff 优先走专用分支并直接 return
- `AssistantNoticeCardRendererHost.renderMarkdownInto()`：由 view 提供 Markdown 渲染能力（仅 generic 分支使用）
- `AssistantNoticeCardRendererHost.handleNoticeAction()`：由 view 提供 notice action 的真实副作用入口
- `AssistantNoticeCardRendererHost.handleCollapsibleToggle()`：由 view 在 raw block / turn-diff 列表展开收起后决定是否安排滚动补偿
- `AssistantNoticeCardRendererHost.resolveVaultRelativePath()`：由 view 用共享 `toVaultRelativePath()` + vault base path 把 session-diff 文件路径解析为 vault 相对路径；解析失败返回 `null`
- `AssistantNoticeCardRendererHost.openVaultFile()`：由 view 以完整 vault 相对路径打开文件

## Turn-diff 专用分支

- 卡片结构：`.opencodian-chat-notice-card.is-<tone>.is-turn-diff` → body → header（标题 + `.opencodian-turn-diff-count` 数量徽标，带本地化 `aria-label`）→ `.opencodian-turn-diff-list`（原生 `button.opencodian-turn-diff-row` 行）→ 可选 `.opencodian-turn-diff-toggle`。
- 路径展示是 renderer 的 presentation 责任：深层路径只保留首个父目录 + `…/` + 文件名；超过 40 字符的文件名做确定性中间省略（保留开头、末尾和扩展名）；tooltip（`title`）和 `openVaultFile()` 始终使用完整 vault 相对路径，compact label 不会回流到打开参数。
- 统计徽标 `+N` / `−N` 无条件渲染（含 `+0`/`−0`，deletions 使用 U+2212）；状态标签只在 `added` / `deleted` 时渲染，`modified` 无标签；`.status-renamed` 仅预留 CSS 视觉规则，不伪造数据。
- 默认最多 5 行，第 6 行起用 `hidden` 属性隐藏；toggle 同步 `hidden`、`aria-expanded`、`aria-controls` 与文案，状态只保存在当前 DOM（闭包 + 属性），reload/重渲染后恢复默认折叠，不写入 message/meta/storage。
- 无法证明位于 vault 内的绝对路径 fail closed：行只显示 basename、`disabled`、不可打开，DOM 与 tooltip 均不泄露主机绝对路径。
- generic 分支保持不变：`.opencodian-chat-notice-icon` 只对 warning / error / 普通 info / OMO notice 创建。

## 设计目的

- 让 `OpenCodianView` 不再直接持有 notice card 的 DOM / OMO body 解析 / action label 细节
- 让 persisted notice 与 streaming placeholder notice 继续复用同一份 card 组装逻辑
- 把 action 副作用留在 host，避免 runtime renderer 直接依赖 settings tab、rewind restore 等 view 级状态
- turn-diff 的结构化 DOM 不回流 `message.content`；持久化 Markdown 只承担兼容职责

## 注意事项

- OMO system-reminder 的标题、正文 fallback 和 raw block 展开行为在这里保持集中；raw block 现在会把 toggle 事件回传给 host，用于处理消息面板的 settled scroll；新增 reminder 类型时优先更新本模块。
- notice footer / timestamp row 不属于本模块，仍由 `AssistantShellViewHostAdapter` 经 `AssistantFooterRenderer` 处理。
- notice action type 的业务副作用仍由 `OpenCodianView` host 回调承接；不要在 renderer 内直接打开设置页或修改 conversation state。
- renderer 不直接依赖 `App` / workspace；vault 路径解析与文件打开只通过 host 的两个窄 seam 完成。

# settings-claude-resources.css

> **源码**: `src/style/components/settings-claude-resources.css`
> **状态**: [ACTIVE]

## 概述

Claude 资源管理设置面板的样式，与 `settings-codex-resources.css` 对称、同属 Settings Extension Surface 词汇。**层级统一**：资源页无外层 section 大卡片；每个资源类型（commands / skills / agents）的 `.opencodian-resource-group-card` 是 layout-only 分组容器（仅 `min-width: 0`），不再承担背景/边框/内边距，避免与行卡形成嵌套卡片。为 `.opencodian-claude-resource-*` 元素提供：扁平紧凑组头（h4、History 与新建按钮）、ScrollArea 有界列表、结构化 row-card（名称 + tonal scope badge + ghost 操作 / 描述 / canonical path + revision 等宽 metadata）、整框 tonal 的 user-source 提示、创建/编辑/预览弹窗（等宽 textarea + MarkdownRenderer div preview + 右对齐 action 行）、读失败/冲突提示和组级历史列表。Skills & Commands 保持每组的紧凑滚动上限；独立的 Agents tab 使用测量后的剩余设置窗口高度。

## 导入关系

由 `src/style/index.css` 通过 `@import 'components/settings-claude-resources.css'` 引入，经 `npm run build:css` 合并进根 `styles.css`。

## 注意事项

- scope badge 一律低色度 tonal（project = accent 12% 底 + `var(--text-normal)` 前景保证任何主题下 AA 对比度，global = 中性 hover 底，global-disabled = warning 14% 底 + `var(--text-normal)` 前景，表达"未启用"而非错误），不用实心 accent 填充或斜体。
- Claude `skills-commands` 与 `agents` 的 row card 使用 14px inline padding，对齐其余 Claude settings card 的左右内容留白；只改变行卡 inline inset，保留资源列表更紧凑的 vertical padding，也不影响共享的 Codex resource card。组容器为 layout-only，不再承担 padding。
- 删除按钮继续使用 Obsidian 的 `trash` SVG；该 SVG 固定为 `flex: 0 0 14px`，防止 host SVG 规则将其压缩成 0px 宽的空白按钮。
- 组头使用 `justify-content: space-between` 保持 h4 在左、primary 新建操作在右；`align-items: center` 使两者稳定垂直居中。标题规则必须由 `.opencodian-settings` 限定作用域，并以 `margin: 0; padding: 0` 覆盖宿主 h4 的默认间距。行头 `flex-wrap: wrap`，窄侧栏下操作按钮可换行而不挤压名称与 badge。
- 行卡复用 `--opencodian-settings-form-row-*` token；间距使用 `--opencodian-settings-space-*`，不写 ad-hoc em margin。
- `[data-claude-code-section='agents']` 只覆盖 Agents 的 ScrollArea viewport：使用 `--opencodian-settings-scrollarea-available-height` 填充剩余窗口高度，同时维持 viewport 内滚动；不能放宽 Skills & Commands 或 Codex 的列表上限。
- 路径文本走 Mono Evidence Rule（`--font-monospace` 11px `--text-muted`，AA 对比度），`word-break: break-all` 容纳长绝对路径。
- Preview pane、冲突提示和 history target/entry 使用同一组边框、间距和等宽 evidence tokens；归档失败提示不复用空态样式。
- Preview pane 允许 Obsidian MarkdownRenderer 生成的块级内容，不使用 `white-space: pre-wrap` 原文模拟；read-error 与 conflict 都是独立的 warning-tonal 状态块。
- 警告类提示使用整框 1px 边框 + tonal 底；禁止 `border-left` 侧色条（impeccable side-stripe 禁令）。

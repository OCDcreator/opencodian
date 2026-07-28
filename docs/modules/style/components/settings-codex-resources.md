# settings-codex-resources.css

> **源码**: `src/style/components/settings-codex-resources.css`
> **状态**: [ACTIVE]

## 概述

Codex 资源管理设置面板的样式，遵循 Settings Extension Surface 词汇（Skills/Tools 行卡同一 family）。**层级统一**：资源页无外层 section 大卡片；每个资源类型（skills / agents）的 `.opencodian-resource-group-card` 是 layout-only 分组容器（仅 `min-width: 0` 防止长内容撑破布局），不再承担背景/边框/内边距，避免与行卡形成嵌套卡片。为 `.opencodian-codex-resource-*` 元素提供：扁平紧凑组头（h4、History 与新建按钮）、ScrollArea 有界列表（viewport max-height `min(38vh, 360px)`）、结构化 row-card（名称 + tonal scope badge + ghost 操作 / 描述 / canonical path + revision 等宽 metadata）、读失败/冲突提示、history target/entry 列表、MarkdownRenderer div preview pane，以及创建/编辑弹窗（等宽 textarea + 右对齐 action 行）。资源页底部继续保留扁平 reload-boundary note；skills/list 分组回读样式位于 Codex 设置 owner。

## 导入关系

由 `src/style/index.css` 通过 `@import 'components/settings-codex-resources.css'` 引入，经 `npm run build:css` 合并进根 `styles.css`。

## 注意事项

- scope badge 一律低色度 tonal（project = accent 12% 底 + `var(--text-normal)` 前景保证任何主题下 AA 对比度，global = 中性 hover 底），不用实心 accent 填充。
- 组头使用 `justify-content: space-between` 保持 h4 在左、primary 新建操作在右；`align-items: center` 使两者稳定垂直居中。`.opencodian-codex-resource-group-title` 与 `.opencodian-codex-runtime-skill-groups-title` 的标题规则必须由 `.opencodian-settings` 限定作用域，并以 `margin: 0; padding: 0; padding-inline-start: 0` 覆盖宿主 heading 的默认间距；标题自身保留 `min-width: 0` 与 `overflow-wrap: anywhere`，窄面板不会撑出横向溢出。
- 行头 `flex-wrap: wrap`，窄侧栏下操作按钮可换行而不挤压名称与 badge；删除按钮的 trash SVG 固定 `flex: 0 0 14px`，防止宿主全局 SVG 规则把它压缩成 0px 宽的空白按钮。
- 行卡复用 `--opencodian-settings-form-row-*` token；间距使用 `--opencodian-settings-space-*`，不写 ad-hoc em margin。
- 路径文本走 Mono Evidence Rule（`--font-monospace` 11px `--text-muted`，AA 对比度），`word-break: break-all` 容纳长绝对路径。
- 操作按钮（编辑/查看/删除）为 ghost compact 样式，hover 才显 tonal 底；删除 hover 用 `--text-error`。
- 空态使用共享 `.opencodian-settings-inline-empty`，不自定义空态样式。
- Preview、冲突和 history 状态使用明确的边框/间距样式；归档读取失败不降级为 `.opencodian-settings-inline-empty`。
- Preview pane 允许 Obsidian MarkdownRenderer 生成块级内容，不使用 `white-space: pre-wrap` 原文模拟；read-error 与 conflict 都是独立的 warning-tonal 状态块。
- `.opencodian-codex-runtime-skill-*` 仅服务 settings 内 grouped `skills/list` readback，保留 cwd、source 与 errors 的等宽 evidence 文本；`.opencodian-codex-runtime-skill-groups` 有 `max-height: 320px` + 内部滚动，长分组列表不会撑爆设置页。

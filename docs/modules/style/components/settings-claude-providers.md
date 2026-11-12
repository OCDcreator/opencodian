# settings-claude-providers.css

> **源码**: `src/style/components/settings-claude-providers.css`
> **状态**: [ACTIVE]

## 概述

“服务与模型”设置页的 scoped 样式：local-source 阻塞门禁、当前配置回读面板（framed）、无边框 preset 行列表、逐字段回读 dl 栅格、details 折叠区、local revision/三轴状态、partial-persistence alert 和配置层 modal。2026-11-12 随页面重设计更新：current 面板取代旧 active 卡片的边框容器，preset 列表去卡片化，回读值/来源/路由 chip 与 600px 窄宽堆叠为新增块。

## 约束

- 复用 settings form-row token 的边框、圆角和背景，避免引入另一套卡片体系。只有 current 回读面板、gate 与 config-modal 层保持 framed；preset 行去掉外框，仅用 `border-top` 细线分隔，`min-width: 0` 防止长地址撑破行。
- gate 使用警告 tonal 背景；预设的“已选择”badge 使用中性前景和次级背景，表达插件选择记录。current 的配置按钮与 preset modal 的保存应用按钮用 `text-normal` / `background-primary` 反向配对，保持明暗主题的文字对比度，hover 不回退到宿主不匹配的 accent 前景。
- 回读 dl 栅格（`140px` dt + `minmax(0,1fr)` dd）使用 muted source 小字与低饱和 route chip；`opencodian-claude-provider-exact` 保持等宽字体与 `user-select: text`，secret masking 的可读性边界不得被样式弱化；token 行不渲染明文值。
- current 面板 footer 与列表头使用可换行 flex（`flex-wrap` + gap），按钮 `min-height: 32px`、`white-space: normal`，长文案允许换行不溢出。
- details 折叠区为单边框原生 disclosure；内部 `.setting-item` 与 local 状态行重置为无边框透明，summary 有 `focus-visible` outline，current/list/card 按钮同样保留 `focus-visible` outline。
- revision/status 与 conflict alert 采用可换行边框容器；窄宽下路径、revision 与原生键盘可操作按钮不会溢出。
- partial-persistence alert 复用 scoped 容器和 wrapping action row，明确 warning tonal 背景；346px 级窄宽下恢复按钮允许换行且不会扩大面板。
- 346px 级窄宽下，providers section、setting-item、控制项和 global summary 子项统一允许收缩到实际内容列宽；长 URL/path 断行，按钮保留可聚焦且不扩大面板。
- `@container opencodian-settings-pane (max-width: 600px)` 下 current 面板收窄 padding，回读行从两列堆叠为单列（dt/dd 各占一行，4px gap）。
- 87px 内容列下 providers block 禁止 flex shrink，并以 `overflow-x: clip`、`overflow-y: visible` 将长内容交给父级 Settings scroller，避免内部滚动嵌套或垂直裁剪。
- 该模块从 `src/style/index.css` 引入，根 `styles.css` 只能由 `npm run build:css` 生成。

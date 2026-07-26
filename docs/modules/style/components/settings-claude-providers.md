# settings-claude-providers.css

> **源码**: `src/style/components/settings-claude-providers.css`
> **状态**: [ACTIVE]

## 概述

Providers 设置页的 scoped 样式：local-source 阻塞门禁、preset 卡片、active badge、逐字段全局只读摘要、local revision/三轴状态和配置层 modal。

## 约束

- 复用 settings form-row token 的边框、圆角和背景，避免引入另一套卡片体系。
- gate 使用警告 tonal 背景；仅 `active` badge 使用低饱和 accent。
- 全局对照值按行栅格展示并使用 muted text；不得用样式弱化 secret masking 的可读性边界。
- revision/status 与 conflict alert 采用可换行边框容器；窄宽下路径、revision 与原生键盘可操作按钮不会溢出。
- partial-persistence alert 复用 scoped 容器和 wrapping action row，明确 warning tonal 背景；346px 级窄宽下恢复按钮允许换行且不会扩大面板。
- 346px 级窄宽下，providers section、setting-item、控制项和 global summary 子项统一允许收缩到实际内容列宽；长 URL/path 断行，按钮保留可聚焦且不扩大面板。
- 当实际内容列宽压缩到约 87px 时，section heading、preset list/card 及其 heading 子项也 reset intrinsic minimums，避免隐藏 overflow 造成截断。
- 87px 内容列下 providers block 禁止 flex shrink，并以 `overflow-x: clip`、`overflow-y: visible` 将长内容交给父级 Settings scroller，避免内部滚动嵌套或垂直裁剪。
- 该模块从 `src/style/index.css` 引入，根 `styles.css` 只能由 `npm run build:css` 生成。

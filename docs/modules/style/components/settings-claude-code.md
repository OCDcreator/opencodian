# settings-claude-code.css

> **源码**: `src/style/components/settings-claude-code.css`
> **状态**: [REVIEW]

## 概述

Claude Code 设置面板的专用样式，负责 tab body、语义 group、readback、advanced sandbox 和 proof-status notice 的视觉语义。该文件同时保留新的 `opencodian-claude-code-*` class 与既有 `opencodian-settings-*` alias，避免测试、定位和旧样式契约断裂。

核心规则是：`readback` 是运行时回读或 supporting evidence，不是行为通过。只有 `data-proof-state="pass"` 使用 success tint；`readback` 使用 neutral/info tint，`wiring` 与 lifecycle 使用 warning tint。

## 样式规则

### Tab Body

`.opencodian-claude-code-tab-body` / `.opencodian-settings-claude-code-tab-body`

- 使用 flex column 布局
- group 之间固定 12px 间距

### Group Chrome

`.opencodian-claude-code-group` / `.opencodian-settings-claude-code-group`

- 每个 Claude Code 设置组的稳定容器，对应 `data-claude-code-group`
- padding 为 `14px 16px`
- 组内使用 8px stack gap，组 header 内 title/desc 使用 6px gap
- `h4` title 使用 `.opencodian-claude-code-group-title` / `.opencodian-settings-claude-code-group-title`
- desc 使用 `.opencodian-claude-code-group-desc` / `.opencodian-settings-claude-code-group-desc`
- 控件 stack 使用 `.opencodian-claude-code-stack` / `.opencodian-settings-claude-code-group-stack`

### Readback

`.opencodian-claude-code-readback` / `.opencodian-settings-readback`

- 只读回读 / supporting evidence 输出的中性信息样式
- 使用 `var(--text-accent)` 的低强度混合背景和边框
- 不使用 `var(--text-success)`，避免把 readback 误表达为行为通过

### Inline Meta

`.opencodian-claude-code-inline-meta` / `.opencodian-settings-inline-meta`

- 用于 readback 摘要中的短 metadata 文本
- 使用 `var(--text-muted)`
- 字体大小 12px，行高 1.45

### Advanced Sandbox

`.opencodian-claude-code-advanced` / `.opencodian-settings-advanced-sandbox`

- Permissions 标签中 advanced sandbox 子策略的弱化容器
- 使用轻量边框和低强度 secondary 背景
- 内部 setting item 和 notice opacity 降低到 0.86
- 用于 `data-claude-code-advanced-sandbox="true"` 的高级沙盒策略块
- summary title 通过 `.opencodian-claude-code-advanced-summary` 保持紧凑但可扫描

### Boundary / Lifecycle

`.opencodian-claude-code-notice--boundary`

- 表示 next-query、restart-sensitive、readback-only 这类边界说明
- 使用 accent/info 边框，不套额外 notice-card 质感

`.opencodian-claude-code-notice--lifecycle`

- 表示下次 query / restarted session 才生效的生命周期提示
- 使用 warning tint，避免与 readback 或 pass 混淆

### Proof Status

`.opencodian-settings-proof-status`

- Compact inline notice，用于显示运行时验证状态
- 默认是中性 row 背景和边框
- padding: 8px 12px，圆角 6px
- 字体大小 12px，颜色 `var(--text-muted)`

`[data-proof-state="pass"]`

- 使用 success tint
- 只表示该设置有运行时行为验证，不可用于 readback/supporting evidence

`[data-proof-state="readback"]`

- 使用 neutral/info tint
- 表示设置已被运行时回读或作为 supporting evidence 展示，但不等同于行为通过

`[data-proof-state="wiring"]`

- 使用 warning tint
- 表示选项已连接但行为尚未验证

## 维护约束

- 新增 Claude Code 设置相关样式时优先放入此文件
- 保持 Claude-specific class 与旧 alias class 同步
- proof-status notice 应保持 compact，不要与 boundary notice 或 Capability Lab chip 的视觉层级冲突
- `readback` 必须保持 neutral/info 语义，不要改回 success-green
- 只有 `data-proof-state="pass"` 才表达行为通过

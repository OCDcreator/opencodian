# settings-claude-code.css

> **源码**: `src/style/components/settings-claude-code.css`
> **状态**: [REVIEW]

## 概述

Claude Code 设置面板的专用样式，负责 tab body、语义 group、readback、advanced sandbox 和 proof-status notice 的视觉语义。该文件同时保留新的 `opencodian-claude-code-*` class 与既有 `opencodian-settings-*` alias，避免测试、定位和旧样式契约断裂。

核心规则是：`readback` 是运行时回读或 supporting evidence，不是行为通过。只有 `data-proof-state="pass"` 使用 success tint；`readback` 使用 neutral/info tint，`wiring` 与 lifecycle 使用 warning tint。

**卡片层级约束**：Claude Code 设置表面遵循"卡片不超过两层"的视觉契约（与 Codex 设置表面一致）。`data-claude-code-group` 容器是**扁平语义分组**（仅 margin + 标题 + 描述，无 border/bg/radius），card base（border + radius + `--background-secondary` + padding）只作用到组 stack 内的 `setting-item` / notice strip / readback / proof-status 上。最终 DOM 层级为：`section-card → setting-item-card`（两层），notice 与 readback 与 setting-item 平级，不嵌套成卡片。

## 间距 Token

`.opencodian-settings-claude-code-block` 上定义本 surface 专用间距 token（与 Codex `--oc-codex-*` 对齐，使两个 backend 设置区视觉一致）：

- `--oc-claude-card-gap: 12px` — 组间与组内卡片间垂直间距
- `--oc-claude-group-header-gap: 16px` — 组 header 到控件 stack 的间距
- `--oc-claude-card-title-body-gap: 8px` — 组 title 到 desc 的间距
- `--oc-claude-card-body-gap: 10px` — readback 卡片内部块间距
- `--oc-claude-card-padding: 14px 16px` — 卡片内边距

## 样式规则

### Tab Body

`.opencodian-claude-code-tab-body` / `.opencodian-settings-claude-code-tab-body`

- 使用 flex column 布局
- group 之间固定 `--oc-claude-card-gap` (12px) 间距

### Group Chrome

`.opencodian-claude-code-group` / `.opencodian-settings-claude-code-group`

- 每个 Claude Code 设置组的稳定语义容器，对应 `data-claude-code-group`
- **扁平**：无 border / background / radius / padding，仅 margin；组间用 `+` 选择器加 `--oc-claude-card-gap` 上间距
- header 是 `flex-direction: row`，让 h4 标题与 help 按钮横排成单行
- `h4` title 使用 `.opencodian-claude-code-group-title` / `.opencodian-settings-claude-code-group-title`
- **组描述已收进标题旁的 help 按钮**：`.opencodian-claude-code-group-help-button`（22×22 `clickable-icon`，`help-circle` 图标），hover/focus 通过 `data-settings-tooltip` 显示组描述全文；描述文字同时以 sr-only `.opencodian-claude-code-group-desc` span 保留在 DOM 中（维持 textContent 可达）。不再渲染整行 `<p>` 描述段落
- 控件 stack 使用 `.opencodian-claude-code-stack` / `.opencodian-settings-claude-code-group-stack`，与 header 间隔 `--oc-claude-group-header-gap` (16px)

### Level-2 Card Base

`.opencodian-settings-claude-code-block .opencodian-claude-code-stack > .setting-item` 等

- 组 stack 内的 `setting-item` / `opencodian-settings-proof-status` / `opencodian-settings-readback` / `opencodian-claude-code-readback` 统一应用 card base：`border + radius(--opencodian-settings-radius-row) + background-secondary + padding(--oc-claude-card-padding)`
- 与 Codex `settings-codex-account.css` 的 group-controls > .setting-item 规则同形，保证两 backend 一致

### Readback

`.opencodian-claude-code-readback` / `.opencodian-settings-readback`

- 只读回读 / supporting evidence 输出的中性信息样式
- 使用 `var(--text-accent)` 的低强度混合背景和边框
- 不使用 `var(--text-success)`，避免把 readback 误表达为行为通过

### Collapsed Notice Text Carrier

`.opencodian-claude-code-notice-text`

- 当 boundary/lifecycle/proof notice 文字从设置表面收进 help 按钮 + tooltip + Modal 后，文字仍需保留在 DOM 中以维持 `textContent` 断言和无障碍访问
- 该类把文字放在 1px clip 的 sr-only span（视觉隐藏，但 DOM 文本可达）
- carrier 同时保留原有 `data-claude-code-*-boundary/-lifecycle` 属性与 `opencodian-claude-code-notice--boundary/-lifecycle` 类，让 compound 选择器测试继续匹配

### Proof-status Chip

`.opencodian-claude-code-proof-chip`

- proof-status（pass/readback）从全宽 notice strip 降级为 setting 控件旁的 10px 圆点
- `[data-proof-state="pass"]` 绿色（`--text-success`），`[data-proof-state="readback"]` 蓝/accent（`--text-accent`），`[data-proof-state="wiring"]` 黄（`--text-warning`）
- tooltip（`data-settings-tooltip` / `aria-label`）承载证据文字；`data-claude-code-proof-status` 与 `data-proof-state` 属性保留在 chip 上

### Inline Meta

`.opencodian-claude-code-inline-meta` / `.opencodian-settings-inline-meta`

- 用于 readback 摘要中的短 metadata 文本
- 使用 `var(--text-muted)`
- 字体大小 12px，行高 1.45

### Advanced Sandbox

`.opencodian-claude-code-advanced` / `.opencodian-settings-advanced-sandbox`

- Permissions 标签中 advanced sandbox 子策略的弱化容器
- **扁平**：仅额外 `--oc-claude-card-gap` 上间距，不再叠加额外 border/background（避免"卡片套卡片"）
- 内部 setting item 和 notice opacity 降低到 0.86，作为弱化语义
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

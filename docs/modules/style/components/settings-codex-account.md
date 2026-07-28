# settings-codex-account.css

> **源码**: `src/style/components/settings-codex-account.css`
> **状态**: [REVIEW]

> **更新**: 2026-07-26 G9 — added compact external-managed Provider status and masked legacy-credential status styling.
> **Updated**: 2026-07-28 — adds responsive CSS for global config summary provider-row grid layout (desktop columns, <=720px stack) and project config diagnostics styling.
> **Updated**: 2026-07-28 — Codex Settings / Account / Provider headings now explicitly flush host heading spacing and use parent flex/grid alignment; title-to-content rhythm is owned by container gaps.

## 概述

Codex 账号与能力产品面的专用样式。把四个官方 app-server 表面（account/read、account/usage/read、account/rateLimits/read、modelProvider/capabilities/read）渲染为真实的设置卡片（徽章、统计磁贴、能力 chip、诚实的 auth-required 状态），而不是 JSON dump。

## 样式规则

### 固定间距体系（Codex 三个子标签页共用）

所有 Codex 设置子标签页（Connection / Resume & Inspect / Account）共享同一组间距 token，定义在 `.opencodian-settings-codex-block` 上：

| Token | 值 | 用途 |
|-------|-----|------|
| `--oc-codex-card-gap` | `12px` | 同一分组内卡片/setting 行之间的垂直间距 |
| `--oc-codex-group-header-gap` | `16px` | 分组标题/描述到第一个卡片/控件堆栈的距离 |
| `--oc-codex-card-title-body-gap` | `8px` | 卡片标题/头部到卡片主体的距离 |
| `--oc-codex-card-body-gap` | `10px` | 卡片主体内部各块之间的垂直间距 |
| `--oc-codex-card-padding` | `14px 16px` | 卡片内部padding |

实现层通过以下 class 落地：

- `.opencodian-settings-codex-group-stack`：`display: flex; flex-direction: column; gap: var(--oc-codex-card-gap)`，每个分组的控件/卡片容器都带这个 class。
- `.opencodian-settings-codex-group-controls`：`margin-top: var(--oc-codex-group-header-gap)`，承载上述 stack。
- `.opencodian-codex-account-card-header`：`margin-bottom: var(--oc-codex-card-title-body-gap)`。
- `.opencodian-codex-account-card-body` / `.opencodian-settings-codex-readback`：`gap: var(--oc-codex-card-body-gap)`。

### `.opencodian-settings-codex-card`、`.opencodian-settings-codex-readback`、`.opencodian-settings-codex-connection-summary`、`.opencodian-codex-account-card`、Codex `.setting-item`

共用卡片基座：次级背景、`1px` 边框、`10px` 圆角、`14px 16px` padding。这样 Connection 的 setting 行与摘要条、Resume & Inspect 的 readback 输出、Account 的产品卡片在视觉上属于同一 family，只是内容不同。

### `.opencodian-settings-codex-group`

Codex 设置面板的三大分组容器（连接与运行默认项 / 恢复与检查 / 账号与 provider 状态）。分组标题使用 `h4`；`.opencodian-settings .opencodian-settings-codex-group-title` 以更高特异性设置 `padding: 0`，覆盖 Obsidian `.vertical-tab-content h4` 的水平 padding，使标题文本与 muted 描述左缘对齐。分组本身不再使用 `margin` 控制间距，而是依赖内部 stack 和相邻分组选择器（`+`）的 `margin-top: var(--oc-codex-card-gap)`。

标题与描述由 `.opencodian-settings-codex-group-header-text` 的 column flex `gap: 4px` 分隔；标题自身保持 `margin: 0; padding: 0; padding-inline-start: 0`，右侧组级按钮由 header 的 `align-items: center` 垂直居中。

### `.opencodian-settings-codex-connection-summary`

连接来源摘要条：flex 行，标签 + 当前来源值。作为卡片基座的一员，它与下方第一个分组的间距由 `margin-bottom: var(--oc-codex-group-header-gap)` 固定为 `16px`。

### `.opencodian-codex-provider-configuration-status`

Account 标签顶部的紧凑 Provider 配置状态条。它用 `data-provider-config-state="external-managed"` 和 `role="status"` 明确表示 Codex 原生 Provider 配置由 Codex 登录、环境变量或原生配置管理；状态条只展示 auth source 与下方 capabilities live readback，不渲染 Provider 操作控件。`grid` 在窄宽度下折叠为单列（`max-width: 480px`），来源值允许 `overflow-wrap: anywhere`，避免设置面板水平溢出。

`.opencodian-codex-provider-configuration-status-header` 是标题行的 flex owner，使用 `align-items: center`；标题通过高特异性规则清除 Obsidian `h4` 的四侧 margin/padding，避免用单侧 margin 做视觉补偿。

### `.opencodian-settings-codex-legacy-credential-status`

Connection 标签中的旧版插件凭据状态容器。它只显示“已配置（值已隐藏）”或 Codex login/environment 指引，永远不放置 `input`；已配置时唯一操作是带确认的清除按钮，保留普通 `Setting` 行的键盘语义。状态文案使用 `.opencodian-settings-codex-legacy-credential-status-copy`，不得把凭据值插入 text、attribute 或日志。

### `.opencodian-codex-account-card`

四张产品卡片的容器：`data-codex-account-card` 属性区分 `identity` / `usage` / `rate-limits` / `capabilities`。卡片 margin 归零，间距完全由外层 stack 的 gap 提供。

### `.opencodian-codex-account-card-header` / `.opencodian-codex-account-card-title`

卡片头部：标题 + 右侧 Refresh 按钮的 flex 布局。

标题由 `.opencodian-settings .opencodian-codex-account-card-title` 负责 `margin: 0; padding: 0; padding-inline-start: 0`，并保留 `min-width: 0` / `overflow-wrap: anywhere`；header 的 `align-items: center` 负责标题与按钮的垂直居中，标题下方间距仍归 header 的 `margin-bottom: var(--oc-codex-card-title-body-gap)` 所有。

### `.opencodian-codex-account-card-refresh` / `.opencodian-codex-account-refresh-all`

卡片 Refresh 按钮与组级「全部刷新」按钮共享同一套 ghost 样式：透明背景、muted 文字、hover 时 tonal 底色、`focus-visible` 2px accent 描边，避免多个重复按钮与 readback 内容争夺视觉权重。两者都直接渲染为原生 `<button>`（不包裹在 Obsidian `Setting` 行内），并带 `title`/`aria-label`（分别来自 `refreshTooltip` / `refreshAllTooltip` 文案）。`flex-shrink: 0` 保持按钮在头部右侧不被挤压。

### `.opencodian-settings-codex-group-header`

账号分组头部 flex 行：左侧 `.opencodian-settings-codex-group-header-text` 承载标题 + 一句话描述，右侧放置组级「全部刷新」按钮。分组到卡片栈的间距仍由 `.opencodian-settings-codex-group-controls` 的 `--oc-codex-group-header-gap` 提供。

### `.opencodian-settings-codex-readback`

Resume & Inspect 标签页中按钮触发的 readback 输出、以及 session browser 信息/内存提示的卡片化容器。与 account cards 共用卡片基座，内部 `flex column` + `gap: var(--oc-codex-card-body-gap)`。`pre` 块带等宽字体与内部边框。

### `.opencodian-settings-codex-group-controls > .setting-item`

分组内的 Obsidian Setting 行覆盖通用 settings-row 样式，使用同一套 Codex 卡片基座（`14px 16px` padding、`10px` 圆角、`1px` 边框、次级背景）。标题与说明之间使用 `--oc-codex-card-title-body-gap`（`8px`），行与行之间由外层 stack 的 `12px` gap 统一控制。

### `.opencodian-codex-account-badge`

账号认证模式徽章。`.is-chatgpt` 使用绿色系（ChatGPT 登录），`.is-apikey` 使用中性色（API-key 鉴权）。身份卡中徽章与主标题并列于 `.opencodian-codex-account-identity-primary`；凭据来源作为 muted 说明放在 `.opencodian-codex-account-identity-detail`，邮箱/套餐以 chip 形式放在 `.opencodian-codex-account-identity-meta`，不再使用横向 key/value 表，也不再显示“需要 ChatGPT 认证：是”字段。

### `.opencodian-codex-account-identity-overview` / `.opencodian-codex-account-identity-primary` / `.opencodian-codex-account-identity-title` / `.opencodian-codex-account-identity-detail` / `.opencodian-codex-account-identity-meta`

账号身份卡的“认证摘要块”布局：

- `.opencodian-codex-account-identity-overview`：垂直 flex 容器，内部块间距使用 `--oc-codex-card-body-gap`（`10px`）。
- `.opencodian-codex-account-identity-primary`：徽章 + 强主标题（如“API 密钥认证”）的水平行。
- `.opencodian-codex-account-identity-detail`：主标题下方的 muted 说明，展示“当前来源：…”。
- `.opencodian-codex-account-identity-meta`：邮箱/套餐 chip 行，使用小号 chip 样式，避免与主状态同权。

### `.opencodian-codex-account-rows` / `.opencodian-codex-account-row`

键/值行布局。账号身份卡里使用最多两列的字段网格（`repeat(2, minmax(180px, 1fr))`），每个字段内部是 label/value 的紧凑两列，小宽度下折成单列；速率限制条目复用同一行结构。

### `.opencodian-codex-account-tiles` / `.opencodian-codex-account-stat-tile`

Token 使用量的扁平统计行（flex wrap，间距分组）：每对是 value-over-label（`--font-ui-medium` 700 值 + `--font-smallest` muted 标签），没有磁贴边框/背景/圆角——卡片内部不再嵌套卡片，数字本身承担层级。

### `.opencodian-codex-account-usage-bars` / `.opencodian-codex-account-usage-bar` / `.opencodian-codex-account-usage-labels`

最近每日用量的柱状图：flex 底对齐，柱高按最近窗口归一化，实色 `var(--interactive-accent)`（无渐变），hover 时提升到全不透明；每根柱子带 `title`（`日期 · tokens`）tooltip。日期标签在独立的 `.opencodian-codex-account-usage-labels` 行中与柱子一一对齐（9px `--text-faint`），不再使用 8px 绝对定位溢出标签。图表区通过 `border-top` 与统计行分隔。

`.opencodian-codex-account-usage-buckets-title` 不再携带底部 margin；图表容器用 column `gap` 管理标题、柱体和日期标签的节奏。

### `.opencodian-codex-account-rate-limit-group`

速率限制“按层级”分组：顶部边框分隔，层级标题大写。不再使用左侧色条缩进，避免装饰性 side-stripe。

`.opencodian-codex-account-rate-limit-groups` 与每个 tier group 都是 column flex，间距由 `gap` 提供；tier 标题保持四侧零 margin/padding。Global provider summary 的 `h5` 标题与 Project advanced TOML 的 `h5` 标题同样由 Codex settings owner 清除宿主 heading inset；advanced 区域以 column `gap` 保持标题、说明和编辑器间距。

### `.opencodian-codex-account-capability-chip`

Provider 能力行：垂直扁平列表，行间 `border-top` 细分隔线。每行是状态圆点图标 + 标签 + 说明 + 右侧 pill 状态 badge（`.is-enabled` 绿色 tonal，`.is-disabled` 中性 tonal）。不再使用嵌套卡片的边框/背景/降透明度。

### `.opencodian-codex-account-card-notice` / `.opencodian-codex-account-card-code`

auth-required 与信息提示框：使用完整的 1px 黄色（warning）边框 + 淡黄色背景，而不是左侧色条。内部 `code` 元素（如 `codex login`）带等宽字体与边框。Impeccable 规则禁止 alert/callout 风格的 side-stripe（>1px 的左侧色条），因此此处改为整框边框 + 淡背景以传达 warning 语义。完整块级形式只出现在身份卡（权威说明，每页一次）；Token 使用量与速率限制卡使用 `.is-compact` 单行变体（标题 + 提示 + `codex login` code），不重复长文案。

## 维护约束

- 这些样式服务于 `SettingsCodexSection` 的分组结构、`SettingsCodexAccountSurface` 渲染的产品卡片、`SettingsCodexReadbackControls` 的 readback 输出，以及连接来源摘要条，不要用于普通 settings-row
- 所有 Codex 子标签页的卡片/setting 行间距统一使用 `--oc-codex-card-gap`（`12px`），不要写 ad-hoc margin
- 新增 readback/信息卡片优先使用 `.opencodian-settings-codex-readback` 与卡片基座，不要复刻一份 card 样式
- 颜色优先使用 Obsidian CSS 变量（`--color-green`、`--background-secondary`、`--text-muted` 等），跟随主题
- 新增账号/能力相关视觉元素优先放入此文件，不要散落到通用 settings 样式中
- 避免装饰性 side-stripe；分组与层级分隔使用边框间距而非左侧色条

# settings-codex-account.css

> **源码**: `src/style/components/settings-codex-account.css`
> **状态**: [REVIEW]

## 概述

Codex 账号与能力产品面的专用样式。把四个官方 app-server 表面（account/read、account/usage/read、account/rateLimits/read、modelProvider/capabilities/read）渲染为真实的设置卡片（徽章、统计磁贴、能力 chip、诚实的 auth-required 状态），而不是 JSON dump。

## 样式规则

### `.opencodian-codex-account-card`

四张产品卡片的容器：圆角边框、次级背景、卡片间距。`data-codex-account-card` 属性区分 `identity` / `usage` / `rate-limits` / `capabilities`。

### `.opencodian-codex-account-card-header` / `.opencodian-codex-account-card-title`

卡片头部：标题 + 右侧 Refresh 按钮的 flex 布局。

### `.opencodian-codex-account-badge`

账号认证模式徽章。`.is-chatgpt` 使用绿色系（ChatGPT 登录），`.is-apikey` 使用中性色（API-key 鉴权）。

### `.opencodian-codex-account-rows` / `.opencodian-codex-account-row`

键/值行布局（label 左、value 右对齐），用于账号身份字段和速率限制条目。

### `.opencodian-codex-account-tiles` / `.opencodian-codex-account-stat-tile`

Token 使用量的统计磁贴网格（`auto-fit minmax(96px,1fr)`）。每块显示格式化后的值（K/M、时长、天数）和标签。

### `.opencodian-codex-account-usage-bars` / `.opencodian-codex-account-usage-bar`

最近每日用量的柱状图：flex 底对齐，柱高按比例，accent 色渐变。

### `.opencodian-codex-account-rate-limit-group`

速率限制“按层级”分组：左侧边框缩进，层级标题大写。

### `.opencodian-codex-account-capability-chip`

Provider 能力 chip：图标 + 标签 + 说明 + 状态。`.is-enabled` 绿色边框，`.is-disabled` 降透明度。

### `.opencodian-codex-account-card-notice` / `.opencodian-codex-account-card-code`

auth-required 与信息提示框：黄色左边框，内部 `code` 元素（如 `codex login`）带等宽字体与边框。

## 维护约束

- 这些样式只服务于 `SettingsCodexAccountSurface` 渲染的产品卡片，不要用于普通 settings-row
- 颜色优先使用 Obsidian CSS 变量（`--color-green`、`--background-secondary`、`--text-muted` 等），跟随主题
- 新增账号/能力相关视觉元素优先放入此文件，不要散落到通用 settings 样式中

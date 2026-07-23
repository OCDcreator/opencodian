# settings-claude-resources.css

> **源码**: `src/style/components/settings-claude-resources.css`
> **状态**: [ACTIVE]

## 概述

Claude 资源管理设置面板的样式，与 `settings-codex-resources.css` 对称、同属 Settings Extension Surface 词汇。**层级统一**：资源页无外层 section 大卡片；每个资源类型（commands / skills / agents）是独立的 `.opencodian-resource-group-card`（与 Codex 资源页共享同一 card 类）。为 `.opencodian-claude-resource-*` 元素提供：扁平组头（h4 + 右侧 primary 新建按钮）、ScrollArea 有界列表、结构化 row-card（名称 + tonal scope badge + ghost 操作 / 描述 / 等宽 11px 路径）、整框 tonal 的 user-source 提示（无左侧色条），以及创建/编辑弹窗（等宽 textarea + 右对齐 action 行）。独有 `.is-global-disabled`（warning tonal，无斜体）表达「已发现，未启用」。

## 导入关系

由 `src/style/index.css` 通过 `@import 'components/settings-claude-resources.css'` 引入，经 `npm run build:css` 合并进根 `styles.css`。

## 注意事项

- scope badge 一律低色度 tonal（project = accent 12% 底，global = 中性 hover 底，global-disabled = warning 14% 底），不用实心 accent 填充或斜体。
- 行卡复用 `--opencodian-settings-form-row-*` token；间距使用 `--opencodian-settings-space-*`，不写 ad-hoc em margin。
- 路径文本走 Mono Evidence Rule（`--font-monospace` 11px `--text-faint`），`word-break: break-all` 容纳长绝对路径。
- 警告类提示使用整框 1px 边框 + tonal 底；禁止 `border-left` 侧色条（impeccable side-stripe 禁令）。

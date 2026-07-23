# settings-claude-providers.css

> **源码**: `src/style/components/settings-claude-providers.css`
> **状态**: [ACTIVE]

## 概述

Providers 设置页的 scoped 样式：local-source 阻塞门禁、preset 卡片、active badge、逐字段全局只读摘要和配置层 modal。

## 约束

- 复用 settings form-row token 的边框、圆角和背景，避免引入另一套卡片体系。
- gate 使用警告 tonal 背景；仅 `active` badge 使用低饱和 accent。
- 全局对照值按行栅格展示并使用 muted text；不得用样式弱化 secret masking 的可读性边界。
- 该模块从 `src/style/index.css` 引入，根 `styles.css` 只能由 `npm run build:css` 生成。

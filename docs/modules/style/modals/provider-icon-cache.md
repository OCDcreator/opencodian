# Provider Icon Cache Styles

> **源码**: `src/style/modals/provider-icon-cache.css`
> **状态**: [FINAL]

## 概述

负责提供 `ProviderIconCacheModal`（提供商图标缓存管理弹窗）与 `ProviderBuiltinIconPickerModal`（内置图标选择器弹窗）的视觉样式。该模块在近期进行过现代化视觉重构，具有卡片化设计、玻璃态效果以及平滑的交互动画。

## 核心类名 / CSS 变量

- `.opencodian-icon-cache-modal-summary` : 顶部信息汇总卡片。
- `.opencodian-icon-cache-quick-jump` : 提供商快速跳转导航区，采用 `sticky` 粘性定位与毛玻璃背景，作为 inset 卡片与内容保持一致的内部边距，避免负边距导致横向溢出。
- `.opencodian-icon-cache-card` : 图标提供商的卡片化展示容器，具有 hover 的浮动阴影与边框提亮效果。
- `.opencodian-builtin-icon-picker-modal` : 扩展了原生宽度的内置图标选择器弹窗。
- `.opencodian-builtin-icon-picker-card` : 类似应用商店风格的图标选择卡片，Hover 时内部的图标拥有缩放（Scale）效果。

## 关联组件

- `src/features/settings/ProviderIconCacheModal.ts`
- `src/features/settings/ProviderBuiltinIconPickerModal.ts`

## 特殊交互或动画

- **Quick Jump 粘性导航**: 滑动时吸顶，背景变为半透明 `backdrop-filter: blur(8px)`，防止与下层内容视觉冲突；使用 `border-radius` 与内部边距保持和汇总卡片一致的 inset 卡片节奏，避免负边距撑破弹窗内容区。
- **卡片 Hover 态**:
  - 阴影加深：`box-shadow: 0 8px 24px color-mix(...)`
  - 轻微上浮：`transform: translateY(-2px)`
  - 边框过渡为品牌强调色。
- **图标展示微缩放**: 内置图标选择器中的小图标在父级卡片被 Hover 时会触发 `transform: scale(1.1)` 放大效果。

## 注意事项

- 在修改此文件后，须运行 `node scripts/build-css.mjs`，以确保更新后的样式被合并到根目录的 `styles.css` 中。

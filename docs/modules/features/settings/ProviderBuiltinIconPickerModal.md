# ProviderBuiltinIconPickerModal

> **源码**: `src/features/settings/ProviderBuiltinIconPickerModal.ts`
> **状态**: [REVIEW]

## 概述

Provider 内置图标选择 Modal。面向单个 provider 展示 `LobeHub` 与 `OpenCode` 两套内置图标，支持搜索、库过滤、推荐排序与当前选中高亮；当前实现采用响应式卡片网格，每个图标单独占据一张卡片，优先保证图标、名称、来源与选中状态都能完整显示，点击卡片后回调给 `ProviderIconCacheModal` 持久化为默认图标。

## 核心逻辑

- 顶部控件包含库过滤下拉（全部 / LobeHub / OpenCode）与搜索框
- 列表数据来自 `ProviderIconService.listBuiltinIconOptions()`
- 卡片展示图标预览、显示名、icon id、库来源，以及“推荐 / 当前”徽章
- 图标预览失败时会自动回退到首字母占位，避免破图撑坏布局
- 点击卡片后调用 `onChoose({ libraryId, iconId })`，由上层写回 `providerIconLibrary`

## 依赖关系

- 上游：`obsidian`（Modal、setIcon）、`i18n`、`ProviderIconService`、`searchInputEnhancer`
- 下游：由 `ProviderIconCacheModal` 打开

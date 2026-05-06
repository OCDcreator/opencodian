# ProviderBuiltinIconPickerModal

> **源码**: `src/features/settings/ProviderBuiltinIconPickerModal.ts`
> **状态**: [REVIEW]

## 概述

Provider 内置图标选择 Modal。面向单个 provider 展示 `LobeHub` 与 `OpenCode` 两套内置图标，支持搜索、库过滤、LobeHub variant 过滤、推荐排序、当前选中高亮，以及全局 provider 图标颜色模式（跟随系统 / 单色 / 彩色）的实时预览与保存；点击卡片后会把 `{ libraryId, iconId, variant }` 一起回调给 `ProviderIconCacheModal` 持久化。顶部两个过滤 select 由 `SettingsDropdownControl` 接管视觉层，和主设置页下拉保持一致。

## 核心逻辑

- 顶部控件包含库过滤下拉（全部 / LobeHub / OpenCode）、LobeHub variant 下拉（Auto / Mono / Color / Brand / …）与搜索框；两个下拉保留原 select change 逻辑，但以设置专用自绘菜单展示
- 顶部控件额外包含 provider 图标颜色模式按钮组；切换后会立即写回插件设置，并让整个 Modal 的图标预览同步刷新
- 控件区内置一组 preview chips，优先抽取当前图库前几个可渲染图标，便于比较彩色与单色效果
- 列表数据来自 `ProviderIconService.listBuiltinIconOptions()`，不再依赖 `<img onerror>` 猜 variant 是否存在
- 卡片展示图标预览、显示名、icon id、库来源，以及“推荐 / 当前 / 命中 variant / 命中 format / fallback”徽章
- 图标预览失败时会自动回退到首字母占位，避免破图撑坏布局
- 点击卡片后调用 `onChoose({ libraryId, iconId, variant })`，由上层写回 `providerIconLibrary`

## 依赖关系

- 上游：`obsidian`（Modal、setIcon）、`i18n`、`ProviderIconService`、`searchInputEnhancer`
- 下游：由 `ProviderIconCacheModal` 打开

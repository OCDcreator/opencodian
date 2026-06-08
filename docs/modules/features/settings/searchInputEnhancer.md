# Settings Search Input Enhancer

> **源码**: `src/features/settings/searchInputEnhancer.ts`
> **状态**: [REVIEW]

## 概述

`searchInputEnhancer.ts` 为设置页搜索框增加通用增强能力：清空按钮、最近搜索历史、输入防抖提交和销毁清理。它让模型选择、provider icon 选择和模型目录搜索等 UI 可以复用同一套搜索输入交互。

## 导入关系

```text
上游: obsidian.setIcon, src/i18n, src/features/settings/SettingsPopoverController
下游: ModelPickerModal.ts, ProviderBuiltinIconPickerModal.ts, SettingsModelCatalogPresenter.ts
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `SearchInputEnhancerHandle` | 返回给调用方的控制柄，包含提交当前值和销毁方法 |
| `enhanceSearchInput()` | 给现有 input 和 container 挂载历史 popover 与清空按钮 |

## 核心逻辑

### 搜索历史

模块以 `opencodian:settings-search-history:<historyKey>` 写入 `localStorage`，最多保留 8 条非空历史。输入变化后 450ms 防抖提交，`change`、`blur`、Enter 会 flush pending value。

### UI 增强

`enhanceSearchInput()` 会：

- 禁用 input 原生 autocomplete
- 创建历史 popover 并通过 `SettingsPopoverController` 将其挂载到 `document.body`（而非 `containerEl`），避免滚动容器裁剪
- 创建带 `x` 图标的清空按钮
- 根据焦点和 query 过滤展示历史项
- 点击历史项后回填 input 并派发 `input` 事件
- `destroy()` 时通过控制器隐藏并移除 body-level popover

## 数据流

```text
调用方创建 input
  → enhanceSearchInput({ historyKey, inputEl, containerEl })
  → 用户输入 / focus / blur / click
  → localStorage 搜索历史更新
  → 调用方通过 input 事件刷新搜索结果
```

## 与其他模块的交互

- `ModelPickerModal.ts` 使用它增强模型搜索。
- `ProviderBuiltinIconPickerModal.ts` 使用它增强 builtin icon 搜索。
- `SettingsModelCatalogPresenter.ts` 使用它增强设置页模型目录搜索。

## 配置项

无插件设置项；每个调用方通过 `historyKey` 隔离自己的搜索历史。

## 注意事项

- `destroy()` 只移除 enhancer 创建的 body-level popover 和按钮；调用方仍负责管理 input 本身。
- `localStorage` 读写异常会被吞掉，避免隐私模式或存储不可用时破坏设置页。
- 历史 popover 使用 `SettingsPopoverController` 进行 body-level fixed 定位（z-index 2280），搜索历史状态和防抖逻辑仍由本模块管理。
- popover 定位自动从 `inputEl` 的最近 `.vertical-tab-content-container` / `.vertical-tab-content` / `.modal-content` 祖先解析钳制边界；调用方也可显式传入 `boundaryEl` 覆盖。当无匹配祖先时回退到视口级钳制。

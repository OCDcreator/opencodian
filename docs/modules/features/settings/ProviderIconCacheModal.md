# ProviderIconCacheModal

> **源码**: `src/features/settings/ProviderIconCacheModal.ts`
> **状态**: [REVIEW]

## 概述

Provider 图标缓存管理 Modal。展示所有 provider 的图标缓存状态，支持查看、选择默认图标、打开内置图标选择器、添加自定义图标源（URL/SVG/路径）、拖拽排序、删除自定义条目。除了是否已缓存外，当前还会展示每个条目的请求 variant、实际命中 variant、命中 format 与是否发生 fallback。

## 导入关系
上游: `obsidian`（App、Modal、Notice）、`ProviderIconEntry`（core/types）、`i18n`、`main`（OpenCodianPlugin）、`ProviderIconService`（utils/icons）
下游: 被 `OpenCodianSettings` 的图标缓存按钮打开

## 核心类型 / 接口

无独立导出类型。依赖 `ProviderIconProviderState`（来自 ProviderIconService）。

## 核心逻辑

### 概览渲染

`render()` 调用 `ProviderIconService.getProviderCacheState()` 获取 `{ providers, summary }`，显示缓存概要和 provider 列表。

### 快速跳转栏

顶部按钮栏，每个 provider 一个按钮，点击时通过原生 `scrollIntoView()` 跳转，并给目标 section 设置 `scroll-margin-top`，避免标题被粘性快捷跳转栏遮住。

### Provider Section

每个 provider 渲染：
- Header：provider ID + 状态徽章（current/saved）
- Header Action：打开内置图标选择器
- Entry 列表：图标预览、类型（mapped/builtin/custom）、选中状态、缓存状态、fallback 状态、源信息，以及 `requestedVariant / resolvedVariant / resolvedFormat`
- 操作：选为默认、删除（仅 custom）、拖拽排序
- 添加行：textarea 输入自定义源 + 添加按钮

### 内置图标选择

`openBuiltinPicker()` 会打开 `ProviderBuiltinIconPickerModal`。用户点选卡片后：
1. 调用 `ProviderIconService.selectBuiltinIcon()`，并把 picker 返回的显式 `variant` 一起写入
2. 写回 `plugin.settings.providerIconLibrary`
3. `persistLibrary()` 保存设置
4. 重新渲染当前 modal，并显示成功 Notice

### 拖拽排序

使用 HTML5 Drag & Drop API。`dragstart` → `dragover` → `drop` → `reorderProviderEntries()`。

### 添加自定义源

`addCustomSource()`: 调用 `ProviderIconService.splitCustomIconSourcesInput()` 解析输入 → 逐个 `addCustomIconSource()` → 部分成功也保存 → 刷新渲染。

### 滚动位置恢复

`restoreScrollPosition()` 在重新渲染后恢复 scrollTop。

## 关键方法

| 方法 | 说明 |
|------|------|
| `onOpen()` | 设置标题、触发首次渲染 |
| `render(restoreScrollTop?)` | 清空并重建完整 UI |
| `renderProviderSection(provider)` | 渲染单个 provider 的完整 section |
| `addCustomSource(providerId, inputEl)` | 添加自定义图标源 |
| `removeCustomEntry(providerId, entryId)` | 删除自定义条目 |
| `moveEntryToFront(providerId, entryId)` | 将条目移到首位（设为默认） |
| `reorderProviderEntries(providerId, draggedId, targetId)` | 拖拽排序 |
| `persistLibrary()` | 保存到 settings 并触发 UI 刷新回调 |

## 数据流

```
ProviderIconService.getProviderCacheState() → providers + summary
        ↓ 用户操作
selectBuiltinIcon / addCustomIconSource / removeProviderEntry / updateProviderEntries
        ↓
plugin.settings.providerIconLibrary → persistLibrary() → saveSettings()
        ↓
render(restoreScrollTop) 重新渲染
```

## 与其他模块的交互

- **ProviderIconService**: 缓存状态查询、内置图标选择、自定义源添加/删除/排序
- **ProviderBuiltinIconPickerModal**: 内置图库浏览与选择
- **OpenCodianSettings**: 打开入口，传入 `onLibraryChanged` 回调
- **plugin.settings.providerIconLibrary**: 持久化自定义图标配置

## 配置项

无直接配置项。

## 注意事项

- 每次操作后完全重新渲染，使用 `restoreScrollTop` 保持视觉位置
- `Ctrl+Enter` 快捷键触发添加
- mapped 类型条目不可删除
- 拖拽仅在条目数 > 1 时启用

## 补充说明

- `ProviderIconService` 核心方法：`getProviderCacheState()` 返回 `{ providers, summary }`，`addCustomIconSource(app, providerId, source, library)` 返回更新后的 library，`splitCustomIconSourcesInput(input)` 按行分割并去空行
- 自定义图标源支持格式：URL（`https://...`）、SVG 文本（`<svg>...</svg>`）、Obsidian vault 内文件路径（相对路径，如 `assets/icon.svg`），由 `ProviderIconService.addCustomIconSource()` 自动检测类型
- 自定义图标源 textarea 通过 `TextareaSizeMemory` 使用 `provider-icon-cache-input` key 记忆手动调整高度，并在重新渲染或关闭 modal 时销毁 observer。

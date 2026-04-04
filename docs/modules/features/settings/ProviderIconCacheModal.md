# ProviderIconCacheModal

> **源码**: `src/features/settings/ProviderIconCacheModal.ts`
> **状态**: [DRAFT]

## 概述

Provider 图标缓存管理 Modal。展示所有 provider 的图标缓存状态，支持查看、选择默认图标、添加自定义图标源（URL/SVG/路径）、拖拽排序、删除自定义条目。数据来源于 `ProviderIconService` 和 `plugin.settings.providerIconLibrary`。

## 导入关系
上游: `obsidian`（App、Modal、Notice）、`ProviderIconEntry`（core/types）、`i18n`、`main`（OpenCodianPlugin）、`ProviderIconService`（utils/icons）
下游: 被 `OpenCodianSettings` 的图标缓存按钮打开

## 核心类型 / 接口

无独立导出类型。依赖 `ProviderIconProviderState`（来自 ProviderIconService）。

## 核心逻辑

### 概览渲染

`render()` 调用 `ProviderIconService.getProviderCacheState()` 获取 `{ providers, summary }`，显示缓存概要和 provider 列表。

### 快速跳转栏

顶部按钮栏，每个 provider 一个按钮，点击滚动到对应 section。

### Provider Section

每个 provider 渲染：
- Header：provider ID + 状态徽章（current/saved）
- Entry 列表：图标预览、类型（mapped/custom）、选中状态、缓存状态、源信息
- 操作：选为默认、删除（仅 custom）、拖拽排序
- 添加行：textarea 输入自定义源 + 添加按钮

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
addCustomIconSource / removeProviderEntry / updateProviderEntries
        ↓
plugin.settings.providerIconLibrary → persistLibrary() → saveSettings()
        ↓
render(restoreScrollTop) 重新渲染
```

## 与其他模块的交互

- **ProviderIconService**: 缓存状态查询、自定义源添加/删除/排序
- **OpenCodianSettings**: 打开入口，传入 `onLibraryChanged` 回调
- **plugin.settings.providerIconLibrary**: 持久化自定义图标配置

## 配置项

无直接配置项。

## 注意事项

- 每次操作后完全重新渲染，使用 `restoreScrollTop` 保持视觉位置
- `Ctrl+Enter` 快捷键触发添加
- mapped 类型条目不可删除
- 拖拽仅在条目数 > 1 时启用

## 待补充
- [ ] ProviderIconService 的完整 API 说明
- [ ] 自定义图标源支持的格式（URL、SVG、文件路径）

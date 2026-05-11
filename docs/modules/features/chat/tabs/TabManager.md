# TabManager

> **源码**: `src/features/chat/tabs/TabManager.ts`
> **状态**: [REVIEW]

## 概述

多标签对话管理器。管理标签的创建、切换、关闭和恢复，维护当前激活标签和最大标签数限制。每个标签持有独立的对话引用、可选父标签引用、流式状态、模型覆盖和上下文用量。支持批量关闭、对话标题同步、按标签设置流式/背景任务/注意力状态。通过 `onChanged` 回调通知 UI 刷新。

## 导入关系

**上游**:
- `../../../core/types` — `TabContextState`
- `./Tab` — 标签数据模型
- `./types` — `TabId`, `TabData`, `TabBarItem`, `TabCreateOptions`, `TabManagerOptions`, `RestoredTabState`, `CloseTabResult`, `CloseTabsResult`, `TabConversationLike`, `TabModelOverride`

**下游**: `OpenCodianView` — 持有 `TabManager` 实例，驱动标签生命周期。

## 核心类型 / 接口

消费 `./types` 中的类型，无自定义类型。

## 核心逻辑

### 标签创建
`createTab()` 检查最大标签数限制，创建 `Tab` 实例，自动切换到新标签，触发 `onChanged` 通知。调用方可通过 `TabCreateOptions.parentTabId` 记录 child tab 的父 tab。

### 标签切换
`switchToTab()` 设置目标标签为激活状态，取消其他标签的激活，更新 `activeTabId`。

### 标签关闭
`closeTab()` 移除指定标签。若关闭的是激活标签，自动切换到前一个标签（`index - 1`）。若关闭后无标签，`activeTabId` 设为 `null`。`closeTabs()` 批量关闭多个标签。

### 标签恢复
`restoreTabs()` 从持久化状态数组恢复标签。跳过引用不存在对话的条目。限制恢复数量不超过 `maxTabs`。按 `activeTabIndex` 设置激活标签。若持久化条目包含 `id` / `parentTabId`，恢复时会建立旧 tab id 到新 tab id 的映射，再把 child tab 的 `parentTabId` 指向恢复后的父 tab。

### 标签栏数据
`getTabBarItems()` 生成 `TabBarItem[]`，包含可选父标签 ID、序号、标题、状态标记（streaming/backgroundTask/needsAttention）和 `canClose` 标志。

### 对话同步
`syncConversationTitle()` 按对话 ID 查找所有关联标签并同步标题。`setActiveTabConversation()` 更新激活标签的对话引用。

### 状态管理
提供细粒度的按标签状态设置方法：`setTabStreaming()`, `setTabBackgroundTaskRunning()`, `setTabNeedsAttention()`, `setTabContextUsage()`。流式结束时自动清除注意力标记，背景任务开始时同样清除。

## 关键方法

| 方法 | 说明 |
|------|------|
| `canCreateTab()` | 检查是否可创建新标签 |
| `createTab(conversation?, options?)` | 创建新标签并切换到它，可记录运行时父标签 ID |
| `switchToTab(tabId)` | 切换到指定标签 |
| `closeTab(tabId)` | 关闭指定标签，返回关闭结果和下一个激活标签 |
| `closeTabs(tabIds)` | 批量关闭多个标签 |
| `getActiveTab()` | 获取激活标签数据 |
| `getTab(tabId)` | 获取指定标签数据 |
| `getTabCount()` | 获取标签总数 |
| `getAllTabs()` | 获取所有标签数据 |
| `restoreTabs(items, activeTabIndex, conversations)` | 从持久化状态恢复标签 |
| `getTabBarItems()` | 生成标签栏 UI 数据 |
| `setActiveTabConversation(conversation)` | 设置激活标签的对话引用 |
| `setActiveTabTitle(title)` | 设置激活标签标题 |
| `syncConversationTitle(conversationId, title)` | 按对话 ID 同步标签标题 |
| `setTabStreaming(tabId, isStreaming)` | 设置指定标签的流式状态 |
| `setTabBackgroundTaskRunning(tabId, hasBackgroundTask)` | 设置指定标签的背景任务状态 |
| `setTabNeedsAttention(tabId, needsAttention)` | 设置指定标签的注意力标记 |
| `getActiveTabModelOverride()` | 获取激活标签的模型覆盖 |
| `setActiveTabModelOverride(modelOverride)` | 设置激活标签的模型覆盖 |
| `getTabContextUsage(tabId)` | 获取指定标签的上下文用量 |
| `setTabContextUsage(tabId, contextUsage)` | 设置指定标签的上下文用量 |
| `setActiveTabStreaming(isStreaming)` | 设置激活标签的流式状态 |
| `setActiveTabBackgroundTaskRunning(hasBackgroundTask)` | 设置激活标签的背景任务状态 |
| `getActiveTabContextUsage()` | 获取激活标签的上下文用量 |
| `setActiveTabContextUsage(contextUsage)` | 设置激活标签的上下文用量 |

## 数据流

```
用户操作（新建/切换/关闭）
  → TabManager.createTab() / switchToTab() / closeTab()
    → 内部 Tab[] 数组变更
    → options.onChanged() 回调
    → OpenCodianView 重新渲染标签栏和消息面板

持久化恢复:
  StorageService.loadTabStates()
    → TabManager.restoreTabs()
      → 重建 Tab[] 数组
```

## 与其他模块的交互

- **OpenCodianView**: 持有 `TabManager` 实例，监听 `onChanged` 刷新 UI
- **Tab**: 内部管理的标签数据模型
- **TabBar**: 消费 `getTabBarItems()` 渲染标签栏
- **StorageService**: 标签状态持久化/恢复
- **types.ts**: 所有标签相关类型定义

## 配置项

- `maxTabs` — 通过 `options.getMaxTabs()` 动态获取，来自 `plugin.settings.maxTabs`

## 注意事项

- 关闭激活标签时自动切换到 `index - 1`（前一个），而非后一个
- `restoreTabs()` 会清空现有标签再重建，不是增量操作
- 恢复时跳过对话 ID 不在 `conversations` Map 中的条目
- 恢复父子关系时只接受本次成功恢复出来的父 tab；父 tab 缺失或被跳过时，child tab 不保留悬空 `parentTabId`
- `onChanged` 回调在大多数修改操作后触发，调用方需注意避免无限循环
- `TabData` 通过 `getData()` 返回的是浅拷贝（`modelOverride` 和 `contextUsage` 为一级拷贝）
- `setTabContextUsage()` 和 `setActiveTabContextUsage()` **不触发** `notifyChanged()`，调用方需自行决定是否刷新 UI

## 补充说明

- 标签持久化格式：`RestoredTabState[]` 由 `StorageService` 以 JSON 数组存储在 tab state 字段中，每个条目包含 `id`、可选 `parentTabId`、`conversationId`、`title`、`modelOverride`
- `activeTabId` 为 null 时：表示无标签存在（`tabs.length === 0`），`getActiveTab()` 返回 null，OpenCodianView 应展示空状态
- 标签数达到上限时：`canCreateTab()` 返回 false，`createTab()` 返回 null，OpenCodianView 应在 UI 层给出提示
- 子会话返回路径通过 `parentTabId` 保存在运行时 `TabData` / `TabBarItem` 中；tab 恢复会重建 ID，因此恢复时必须通过持久化旧 ID 映射到新 ID

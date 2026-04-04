# Tab

> **源码**: `src/features/chat/tabs/Tab.ts`
> **状态**: [DRAFT]

## 概述

单个标签的数据模型类。封装标签 ID、关联对话 ID、标题、激活状态、流式传输状态、背景任务标记、注意力标记、模型覆盖和上下文用量。所有状态变更通过 setter 方法，`getData()` 返回一级深拷贝防止外部直接修改内部状态。

## 导入关系

**上游**:
- `../../../core/types` — `TabContextState`, `createEmptyTabContextState`
- `./types` — `TabData`, `TabId`, `TabModelOverride`, `TabConversationLike`, `generateTabId`

**下游**: `TabManager` — 内部管理 `Tab[]` 数组。

## 核心类型 / 接口

无自定义类型，实现 `TabData` 接口。

## 核心逻辑

### 构造
构造函数接收默认标题和可选的对话引用，生成唯一 `TabId`（通过 `generateTabId()`），初始化所有状态字段为默认值。

### 数据获取
`getData()` 返回 `TabData` 的浅拷贝，其中 `modelOverride` 和 `contextUsage` 进行一级拷贝，确保调用方修改不影响内部状态。

### 对话设置
`setConversation()` 更新对话引用和标题。当对话 ID 变化时自动重置 `contextUsage` 为空状态。

### 标题同步
`setTitle()` 同步更新 `title` 和 `contextUsage.sessionTitle`。

## 关键方法

| 方法 | 说明 |
|------|------|
| `getId()` | 返回标签唯一 ID |
| `getData()` | 返回标签数据的保护性拷贝 |
| `setActive(active)` | 设置激活状态 |
| `setStreaming(streaming)` | 设置流式传输状态 |
| `setBackgroundTaskRunning(hasBackgroundTask)` | 设置背景任务标记 |
| `setNeedsAttention(needsAttention)` | 设置注意力标记 |
| `setConversation(conversation, fallbackTitle)` | 设置关联对话（ID 变化时重置上下文用量） |
| `setTitle(title)` | 设置标题 |
| `setModelOverride(modelOverride)` | 设置模型覆盖（一级拷贝） |
| `setContextUsage(contextUsage)` | 设置上下文用量（一级拷贝） |

## 数据流

```
TabManager 操作
  → tab.setXxx(value)
    → 内部 data 字段更新
  → tab.getData()
    → 返回保护性拷贝的 TabData
```

## 与其他模块的交互

- **TabManager**: 唯一直接消费者，持有和管理 Tab 实例
- **types.ts**: `TabId` 生成和 `TabData` 接口定义

## 配置项

无。

## 注意事项

- `getData()` 的一级拷贝意味着嵌套对象（如 `contextUsage` 内的 `preciseTokens`）仍可能被外部修改
- `setConversation()` 在对话 ID 不变时不重置上下文用量，仅更新标题
- `generateTabId()` 格式为 `tab-{timestamp}-{random}`

## 待补充

- [ ] `getData()` 的拷贝深度是否足够（`preciseTokens` 嵌套问题）
- [ ] 标签 ID 的唯一性保证

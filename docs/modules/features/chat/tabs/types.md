# Tab Types

> **源码**: `src/features/chat/tabs/types.ts`
> **状态**: [REVIEW]

## 概述

标签系统的类型定义模块。定义标签 ID、标签数据接口、标签栏项、布局模式、持久化状态、管理器选项以及关闭操作结果等核心类型。为 `Tab`、`TabManager`、`TabBar` 提供共享的类型契约。

## 导入关系

**上游**:
- `../../../core/types` — `Conversation`, `TabContextState`

**下游**: `Tab`, `TabManager`, `TabBar`, `OpenCodianView` — 所有标签相关模块。

## 核心类型 / 接口

```typescript
type TabId = string;

interface TabModelOverride {
  provider: string;
  model: string;
}

interface TabData {
  id: TabId;
  parentTabId?: TabId;
  conversationId: string | null;
  title: string;
  isActive: boolean;
  isStreaming: boolean;
  hasBackgroundTask: boolean;
  needsAttention: boolean;
  modelOverride: TabModelOverride | null;
  contextUsage: TabContextState;
}

interface TabBarItem {
  id: TabId;
  parentTabId?: TabId;
  index: number;
  title: string;
  isActive: boolean;
  isStreaming: boolean;
  hasBackgroundTask: boolean;
  needsAttention: boolean;
  canClose: boolean;
}

type TabBarLayoutMode = 'header' | 'input' | 'below-header-grid' | 'below-header-vertical';

interface RestoredTabState {
  id?: TabId;
  parentTabId?: TabId;
  conversationId: string | null;
  title: string;
  modelOverride: TabModelOverride | null;
}

interface TabCreateOptions {
  parentTabId?: TabId | null;
}

interface TabManagerOptions {
  getMaxTabs: () => number;
  areTabsEnabled?: () => boolean;
  onChanged?: () => void;
}

type TabConversationLike = Pick<Conversation, 'id' | 'title'>;

interface CloseTabResult {
  closed: boolean;
  nextActiveTabId: TabId | null;
}

interface CloseTabsResult {
  closedTabIds: TabId[];
  nextActiveTabId: TabId | null;
}
```

## 核心逻辑

### ID 生成
`generateTabId()` 返回 `tab-{timestamp}-{random}` 格式的唯一标识符。

### 类型说明

| 类型 | 用途 |
|------|------|
| `TabId` | 标签唯一标识符 |
| `TabModelOverride` | 标签级别的模型覆盖（provider + model） |
| `TabData` | 标签完整数据（ID、可选父标签 ID、对话引用、标题、状态标记、模型覆盖、上下文用量） |
| `TabBarItem` | 面向标签栏 UI 的精简数据（含可选父标签 ID、序号和 canClose） |
| `TabBarLayoutMode` | 标签栏布局模式（4 种） |
| `RestoredTabState` | 持久化/恢复时的标签状态快照，包含旧 tab id 与旧 parent id 以便恢复父子关系 |
| `TabCreateOptions` | 创建标签时的运行时选项，用于记录子会话返回父标签的 `parentTabId`，以及让隐藏子会话通过 `ignoreMaxTabs` 跳过可见标签上限 |
| `TabManagerOptions` | TabManager 构造选项（动态最大标签数、可选标签启用状态 + 变更回调） |
| `TabConversationLike` | 对话的最小公共类型（只需 id + title） |
| `CloseTabResult` | 单标签关闭结果 |
| `CloseTabsResult` | 批量关闭结果 |

## 关键方法

| 方法 | 说明 |
|------|------|
| `generateTabId()` | 生成 `tab-{timestamp}-{random}` 格式 ID |

## 数据流

类型定义模块，无运行时数据流。

## 与其他模块的交互

- **Tab**: 实现 `TabData` 接口，使用 `TabId`, `TabModelOverride`, `TabConversationLike`
- **TabManager**: 消费所有类型，管理 `TabData` 生命周期，输出 `TabBarItem[]`
- **TabBar**: 消费 `TabBarItem`, `TabBarLayoutMode`, `TabId`
- **OpenCodianView**: 使用 `RestoredTabState`, `TabBarLayoutMode`, `TabId`
- **StorageService**: 持久化 `RestoredTabState[]`

## 配置项

无直接配置。`TabManagerOptions.getMaxTabs` 来自 `plugin.settings.maxTabs`，`areTabsEnabled` 通常来自 `plugin.settings.enableTabs`。

## 注意事项

- `TabConversationLike` 使用 `Pick<Conversation, 'id' | 'title'>` 避免完整 Conversation 依赖
- `RestoredTabState` 不包含运行时状态（streaming/attention 等），但会持久化 tab `id` 和 `parentTabId`，供重启恢复时重建子会话返回路径
- `TabBarLayoutMode` 的 `below-header-grid` 和 `below-header-vertical` 在 TabBar 中使用相同的最大可见数（5）

## 补充说明

- `TabContextState` 定义在 `src/core/types/chat.ts`，包含 `sessionTitle`、`provider`、`model`、`preciseTokens`、`totalCost`、`createdAt`、`updatedAt` 等字段，由 `createEmptyTabContextState()` 创建初始值
- `RestoredTabState` 序列化格式：`{ id?: string, parentTabId?: string, conversationId: string | null, title: string, modelOverride: { provider: string, model: string } | null }`，以 JSON 数组形式存储在 StorageService 的 tab state 中
- `parentTabId` 是当前 tab 图里的导航引用，用于子会话 tab 的 “Back to parent” 面包屑；恢复时 tab ID 会重建，`TabManager.restoreTabs()` 会把旧 id 映射到新 id 后再写回 child tab。

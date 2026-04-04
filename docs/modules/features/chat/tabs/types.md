# Tab Types

> **源码**: `src/features/chat/tabs/types.ts`
> **状态**: [DRAFT]

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
  conversationId: string | null;
  title: string;
  modelOverride: TabModelOverride | null;
}

interface TabManagerOptions {
  getMaxTabs: () => number;
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
| `TabData` | 标签完整数据（ID、对话引用、标题、状态标记、模型覆盖、上下文用量） |
| `TabBarItem` | 面向标签栏 UI 的精简数据（含序号和 canClose） |
| `TabBarLayoutMode` | 标签栏布局模式（4 种） |
| `RestoredTabState` | 持久化/恢复时的标签状态快照 |
| `TabManagerOptions` | TabManager 构造选项（动态最大标签数 + 变更回调） |
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

无直接配置。`TabManagerOptions.getMaxTabs` 来自 `plugin.settings.maxTabs`。

## 注意事项

- `TabConversationLike` 使用 `Pick<Conversation, 'id' | 'title'>` 避免完整 Conversation 依赖
- `RestoredTabState` 不包含运行时状态（streaming/attention 等），仅持久化必要的对话引用和标题
- `TabBarLayoutMode` 的 `below-header-grid` 和 `below-header-vertical` 在 TabBar 中使用相同的最大可见数（5）

## 待补充

- [ ] `TabContextState` 在 core/types 中的完整定义
- [ ] 四种布局模式的截图对比
- [ ] `RestoredTabState` 与 StorageService 的序列化格式

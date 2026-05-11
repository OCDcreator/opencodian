# Chat Tabs Barrel

> **源码**: `src/features/chat/tabs/index.ts`
> **状态**: [REVIEW]

## 概述

多标签聊天子系统的聚合入口，统一导出 `Tab`、`TabBar`、`TabManager` 以及标签相关类型。它为聊天主视图提供一站式的 tabs API 面，是多会话并发与界面切换能力的装配点。

## 导入关系

```text
上游: ./Tab, ./TabBar, ./TabManager, ./types
下游: OpenCodianView、features/chat/index.ts、测试
```

## 核心类型 / 接口

```typescript
export { Tab } from './Tab';
export { TabBar, type TabBarCallbacks } from './TabBar';
export { TabManager } from './TabManager';
export type { CloseTabResult, CloseTabsResult, RestoredTabState, TabBarItem, TabBarLayoutMode, TabData, TabId, TabManagerOptions, TabModelOverride } from './types';
```

## 核心逻辑

### tabs 运行时聚合

该 barrel 收口三个运行时类和一组标签状态类型，使聊天视图能够从单一路径装配多标签系统。

### 类型与实现同入口暴露

`TabManagerOptions`、`TabData`、`TabCreateOptions`、`TabModelOverride` 等高频类型与类导出放在一起，方便主视图一次性导入。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `Tab` | 单个标签页状态对象 |
| `TabBar` | 标签栏 UI 组件 |
| `TabManager` | 标签生命周期与集合管理器 |
| `TabBarCallbacks` 等类型 | 标签栏与管理器协作的类型契约 |

## 数据流

典型链路：`OpenCodianView` 创建 `TabManager` -> `TabManager` 管理多个 `Tab` -> `TabBar` 根据当前 tab 列表渲染 UI 并回调交互事件。

## 与其他模块的交互

- 被 [features/chat/index.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/chat/index.md) 再次聚合
- 具体模块见 [Tab.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/chat/tabs/Tab.md)、[TabBar.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/chat/tabs/TabBar.md)、[TabManager.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/chat/tabs/TabManager.md)、[types.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/chat/tabs/types.md)

## 配置项

无直接配置，但标签上限、布局方式等设置由上层消费对应类型。

## 注意事项

- 该 barrel 使用较多类型 re-export，改动时要同步检查主视图 import 是否受影响

## 补充说明

- 当前 tabs 子系统在视图恢复流程中的实际导入链如下

> **验证结果**: `OpenCodianView` 直接从 `./tabs` 导入 `TabManager`，在视图初始化时调用 `restoreTabs(items, activeTabIndex, conversations)`，其中 `items` 来自 `StorageService` 持久化的 `RestoredTabState[]`，`conversations` 来自预加载的 `Map<string, TabConversationLike>`。恢复后 `TabManager.onChanged` 回调触发 TabBar 重新渲染。

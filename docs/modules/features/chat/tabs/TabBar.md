# TabBar

> **源码**: `src/features/chat/tabs/TabBar.ts`
> **状态**: [REVIEW]

## 概述

标签栏 UI 组件。渲染标签按钮列表，处理标签切换和关闭交互，管理溢出菜单（overflow menu）用于超出显示限制的标签。支持四种布局模式（header / input / below-header-grid / below-header-vertical），每种模式有不同的最大可见标签数。提供 tooltip、状态指示器（streaming/backgroundTask/needsAttention）和辅助功能支持。

## 导入关系

**上游**:
- `obsidian` — `setIcon`
- `../../../i18n` — `t()` 国际化
- `./types` — `TabBarItem`, `TabBarLayoutMode`, `TabId`

**下游**: `OpenCodianView` — 持有 `TabBar` 实例，在标签状态变更时调用 `render()`。

## 核心类型 / 接口

```typescript
interface TabBarCallbacks {
  onTabClick: (tabId: TabId) => void;
  onTabClose: (tabId: TabId) => void;
}
```

## 核心逻辑

### 渲染
`render(items, layout)` 接收标签项数组和布局模式，清空容器后渲染可见标签按钮。超出限制的标签归入溢出菜单。

### 分区策略
`partitionItems()` 按布局模式确定最大可见数（header=4, input=5, below-header=5）。当激活标签不在可见范围内时，保留前 N-1 个标签并将激活标签添加到可见列表末尾。

### 标签按钮
每个标签按钮显示序号徽章、标题文本和状态指示器。支持 CSS class 标记（`is-active`, `is-streaming`, `has-background-task`, `needs-attention`）。左键点击切换标签，右键点击关闭标签。

### 溢出菜单
超出可见限制的标签显示为 `+N` 按钮。点击后在 `document.body` 上创建浮动菜单，支持 Escape 和外部点击关闭。菜单位置根据锚点和视口空间自动计算（上方/下方）。

### 辅助功能
每个按钮附带 `aria-labelledby` 指向隐藏的文本标签。溢出菜单使用 `role="menu"` / `role="menuitem"`。可展开按钮支持 Enter/Space 键盘操作。

### 状态指示
- streaming: 主标签栏中无图标（通过 CSS 动画 `is-streaming`），溢出菜单中显示 `loader-circle` 图标 + `is-streaming` 类
- background task: 三点动画（`opencodian-tab-activity-dots` → 3 个 `opencodian-tab-activity-dot` span）
- needs attention: `bell-ring` 图标

## 关键方法

| 方法 | 说明 |
|------|------|
| `render(items, layout)` | 渲染标签栏（清空后重建） |
| `destroy()` | 销毁组件，清理 DOM 和事件 |

## 数据流

```
TabManager.getTabBarItems()
  → TabBarItem[]
  → TabBar.render(items, layout)
    → 可见标签按钮 + 溢出按钮
    → 用户点击 → callbacks.onTabClick(tabId)
    → 用户右键 → callbacks.onTabClose(tabId)
```

## 与其他模块的交互

- **OpenCodianView**: 持有实例，提供 `onTabClick` / `onTabClose` 回调
- **TabManager**: 数据来源（`getTabBarItems()`）
- **i18n**: tooltip 和标签文本
- **types.ts**: `TabBarItem`, `TabBarLayoutMode`

## 配置项

- `tabBarPosition` — 决定布局模式（header / below-header / input）

## 注意事项

- `render()` 每次调用都完全重建 DOM，非增量更新
- 溢出菜单挂载在 `document.body` 上，不在容器内部
- `tooltipLabelId` 为静态计数器，组件销毁后不清零（不影响功能）
- `below-header-vertical` 布局不显示 tooltip（空间不足）
- `shouldOpenOverflowAbove()` 判断是否在 input 布局下向上打开菜单

## 补充说明

- 四种布局模式差异：`header` = 标签栏在消息区上方（max 4），`input` = 标签栏在输入框区域（max 5，溢出菜单向上弹出），`below-header-grid` = header 下方的网格布局（max 5），`below-header-vertical` = 垂直排列且禁用 tooltip（空间受限）
- 溢出菜单定位：水平方向 `left = min(max(margin, rect.right - menuWidth), viewportWidth - menuWidth - margin)`，宽度至少 220px；垂直方向根据 `shouldOpenOverflowAbove()` 判断优先向上（input 模式）或向下，`maxHeight` 至少 120px
- CSS 动画类名：`is-streaming` 由 CSS 驱动旋转/脉冲效果，`has-background-task` 配合 `opencodian-tab-activity-dot` 的逐帧动画，`needs-attention` 使用 `bell-ring` SVG 图标

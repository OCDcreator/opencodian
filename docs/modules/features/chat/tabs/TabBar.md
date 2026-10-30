# TabBar

2026-10-30：标签栏自带末尾新增按钮（含创建中／上限禁用），不再依赖头部工具按钮。宽度变化由 ResizeObserver 触发重排：header 最多 4 项，其余位置最多 5 项；空间不足逐项收入 +N 菜单，始终保留 active 项。新增、溢出菜单与各布局共享 24px 控件／28px 轨道。保留右键关闭，增加中键与 Delete；方向键／Home／End 移动焦点，重渲染按 tab id 恢复焦点，菜单支持键盘和 detached-window 视口约束。串流状态重渲染时保留已打开的溢出菜单及其焦点；父子会话在窄栏中自动切换为编号和返回图标，避免长面包屑挤住 active 项。

> **源码**: `src/features/chat/tabs/TabBar.ts`
> **状态**: [REVIEW]

## 概述

标签栏 UI 组件。渲染标签按钮列表，处理标签切换、父会话返回和关闭交互，管理溢出菜单（overflow menu）用于超出显示限制的标签。支持四种布局模式（header / input / below-header-grid / below-header-vertical），每种模式有不同的最大可见标签数。提供 tooltip、状态指示器（streaming/backgroundTask/needsAttention）和辅助功能支持。

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
每个标签按钮显示序号徽章、标题文本和状态指示器。支持 CSS class 标记（`is-active`, `is-streaming`, `has-background-task`, `needs-attention`）。左键点击切换标签，右键点击关闭标签。非 `below-header-vertical` 布局会在 render 时确保 `TooltipLayerController` 已注册，让 tab tooltip 统一走 body-level overlay；竖排布局仍故意禁用 tooltip 以避免窄栏拥挤。

样式由 `src/style/base/core.css` 统一维护：参考 daisyUI Pagination 的分段按钮组，使用一个轻描边轨道、透明未选中项和圆角淡色选中项。轨道外高为 28px，与 header 工具按钮一致；内部数字项为 24px、徽章为 16px。`body` 上的 `--opencodian-tab-accent` 先解析宿主 Obsidian 强调色，再继承到标签栏，避免聊天容器的内部黑色强调色覆盖宿主配色。选中底色仅混入 10% 宿主强调色（hover 为 15%），数字使用主题正文色，未选中数字使用次级文字色；选中态同时通过边框和 600 字重识别，避免黑色或高饱和强调色铺满按钮。四种布局共享配色，键盘焦点保留宿主强调色 outline，运行与告警信号独立于选中底色。

### 父会话返回
当激活标签的 `parentTabId` 指向当前 tab 列表中的父标签时，`render()` 会在标签按钮前渲染 `opencodian-tab-bar-parent-breadcrumb`。点击面包屑复用 `onTabClick(parentTabId)` 切回父 tab，不内联渲染子会话内容。`renderParentNavigation()` 会只渲染父会话面包屑和关闭当前子 tab 的 `opencodian-tab-bar-parent-close` 图标按钮，不渲染标签按钮或溢出菜单，供禁用可见标签 UI 后的隐藏子会话返回与清理入口使用。若父 tab 已缺失但 active child 仍有 `parentTabId`，则省略返回面包屑并保留 close-only 图标，方便清理孤儿隐藏子会话。

### 溢出菜单
超出可见限制的标签显示为 `+N` 按钮。点击后在 `document.body` 上创建浮动菜单，支持 Escape 和外部点击关闭。菜单位置根据锚点和视口空间自动计算（上方/下方）。

### 辅助功能
每个按钮附带 `aria-labelledby` 指向隐藏的文本标签；本轮连 parent-close 这种 icon-only 子会话清理按钮也统一回到这条合同，不再额外保留 raw `aria-label`，避免在 Obsidian/Electron 中叠出第二层 hover tooltip。溢出菜单使用 `role="menu"` / `role="menuitem"`。可展开按钮支持 Enter/Space 键盘操作。

### 状态指示
- streaming: 主标签栏中无图标（通过 CSS 动画 `is-streaming`），溢出菜单中显示 `loader-circle` 图标 + `is-streaming` 类
- background task: 三点动画（`opencodian-tab-activity-dots` → 3 个 `opencodian-tab-activity-dot` span）
- needs attention: `bell-ring` 图标

## 关键方法

| 方法 | 说明 |
|------|------|
| `render(items, layout)` | 渲染标签栏（清空后重建） |
| `renderParentNavigation(items, layout)` | 只渲染 active child 的返回父会话面包屑和关闭当前子会话按钮 |
| `destroy()` | 销毁组件，清理 DOM 和事件 |

## 数据流

```
TabManager.getTabBarItems()
  → TabBarItem[]
  → TabBar.render(items, layout)
    → 可选父会话面包屑 + 可见标签按钮 + 溢出按钮
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
- 父会话面包屑只在 active child 的 `parentTabId` 能匹配当前 tab 列表时显示；父 tab 已关闭时不显示
- 溢出菜单挂载在 `document.body` 上，不在容器内部
- `tooltipLabelId` 为静态计数器，组件销毁后不清零（不影响功能）
- `below-header-vertical` 布局不显示 tooltip（空间不足），也不会注册共享 tooltip overlay
- `shouldOpenOverflowAbove()` 判断是否在 input 布局下向上打开菜单

## 补充说明

- 四种布局模式差异：`header` = 标签栏在消息区上方（max 4），`input` = 标签栏在输入框区域（max 5，溢出菜单向上弹出），`below-header-grid` = header 下方的网格布局（max 5），`below-header-vertical` = 垂直排列且禁用 tooltip（空间受限）
- 溢出菜单定位：水平方向 `left = min(max(margin, rect.right - menuWidth), viewportWidth - menuWidth - margin)`，宽度至少 220px；垂直方向根据 `shouldOpenOverflowAbove()` 判断优先向上（input 模式）或向下，`maxHeight` 至少 120px
- CSS 动画类名：`is-streaming` 由 CSS 驱动旋转/脉冲效果，`has-background-task` 配合 `opencodian-tab-activity-dot` 的逐帧动画，`needs-attention` 使用 `bell-ring` SVG 图标

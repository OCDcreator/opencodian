# SessionTodoDock

> **源码**: `src/features/chat/ui/SessionTodoDock.ts`
> **状态**: [REVIEW]

## 概述

Session Todo Dock 是可折叠的浮动面板，用于展示当前 AI 会话的任务清单（session todo）。数据来源于 OpenCode 的 `session.todo()` 快照和 `todo.updated` 同步事件。显示任务完成进度（已完成/总数），预览当前活跃任务文本，可展开查看完整任务列表。

## 导入关系
上游: `obsidian`（setIcon）、`SessionTodo`（core/types）、`i18n`
下游: 被 `OpenCodianView` 在输入区域附近实例化

## 核心类型 / 接口

无独立导出类型。依赖 `SessionTodo`（core/types）：

```typescript
interface SessionTodo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}
```

## 核心逻辑

### 可见性控制

当 `todos.length === 0` 或所有任务均已完成/取消时，面板隐藏（`is-hidden`）。新增未完成任务时自动展开。

### 折叠/展开

点击 header 区域切换 `collapsed` 状态：
- 折叠：仅显示 header（进度 + 预览文本）
- 展开：显示 header + 完整任务列表

### 任务列表渲染

每个任务项显示：
- **Marker**: `completed` → check 图标；`in_progress` → 脉冲动画（`opencodian-session-todo-pulse`）；其他 → 空白
- **文本**: `todo.content`
- **状态**: `itemEl.dataset.state` 设置为 `todo.status`

### 预览文本

`getPreviewText()`: 优先显示 `in_progress` 的任务，其次 `pending`，最后列表末尾项。

### 完成状态

`hasIncompleteTodos()`: 检查是否存在 `status !== 'completed' && status !== 'cancelled'` 的任务。全部完成时面板自动隐藏。

## 关键方法

| 方法 | 说明 |
|------|------|
| `constructor(parentEl)` | 创建根容器、header（label + preview + toggle 按钮）、列表容器，绑定事件 |
| `update(todos)` | 接收新 todo 数组，更新进度文本、预览文本、渲染列表、同步折叠状态 |
| `renderList()` | 清空并重建任务项列表 |
| `getPreviewText()` | 返回当前最相关任务的文本 |
| `destroy()` | 移除根元素 |

## 数据流

```
OpenCode session.todo() / todo.updated sync event
        ↓
OpenCodeService → OpenCodianView → SessionTodoDock.update(todos)
        ↓
进度标签 + 预览文本 + 任务列表渲染
```

## 与其他模块的交互

- **OpenCodeService**: 通过 SDK `session.todo()` 获取快照，`todo.updated` 事件推送增量更新
- **OpenCodianView**: 持有实例，在 sync 事件触发时调用 `update()`
- **i18n**: `chat.todo.*` 命名空间

## 配置项

无直接配置项。

## 注意事项

- `update()` 保留前一次 `todos` 引用用于检测从 0 → 有任务的展开时机
- `syncCollapsedState()` 同时处理隐藏和折叠两种情况的 CSS 类
- `aria-expanded` 属性跟随折叠状态

## 补充说明

- `session.todo()` SDK 调用：由 `OpenCodeService` 在 stream 完成后主动调用获取快照，不进行定时轮询
- `todo.updated` 同步事件：通过 `global.syncEvent.subscribe('todo.updated', ...)` 订阅，事件数据为最新的 `SessionTodo[]` 数组，由 `OpenCodianView` 接收后调用 `SessionTodoDock.update(todos)`
- `cancelled` 状态的视觉处理：marker 区域不显示任何图标（与 `pending` 相同），通过 `itemEl.dataset.state = 'cancelled'` 传递给 CSS 控制透明度/灰度样式

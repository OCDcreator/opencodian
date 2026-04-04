# Fork Target Modal

> **源码**: `src/shared/modals/ForkTargetModal.ts`
> **状态**: [REVIEW]

## 概述

对话分叉目标选择模态框。当用户选择分叉对话时，提供两种选择：在当前标签页分叉（替换当前内容）或在新标签页分叉（保留原对话）。使用 Promise 封装，返回用户选择或 `null`（取消）。

## 导入关系
上游: `obsidian` (App, Modal), `../../i18n` (t)
下游: `OpenCodianView` (分叉对话入口)

## 核心类型 / 接口

### ForkTarget
```typescript
type ForkTarget = 'new-tab' | 'current-tab';
```

## 核心逻辑

### Promise 封装

`chooseForkTarget(app)` 返回 `Promise<ForkTarget | null>`：
- 用户点击选项 → resolve 对应 `ForkTarget`
- 用户关闭模态框（点击外部/ESC） → resolve `null`

### UI 结构

模态框内容：
1. 标题：`t('chat.fork.chooseTarget')`
2. 两个选项卡片（包裹在 `.opencodian-fork-target-list` 容器中，每个选项使用 `.opencodian-fork-target-option` CSS class）：
   - `current-tab`: `t('chat.fork.targetCurrentTab')`
   - `new-tab`: `t('chat.fork.targetNewTab')`

### 状态保护

`resolved` 标志防止双重 resolve（`onClose` + 点击选项）。

## 关键方法

| 方法 | 说明 |
|------|------|
| `chooseForkTarget(app)` | 打开模态框，返回 Promise |

## 数据流

```
OpenCodianView (用户触发分叉)
  → chooseForkTarget(app)
    → new ForkTargetModal(app, resolve).open()
    → 用户点击 'new-tab'
      → resolve('new-tab')
    → 或用户关闭
      → resolve(null)
  → OpenCodianView 根据 target 执行分叉逻辑
```

## 与其他模块的交互

- **OpenCodianView**: 在分叉操作时调用 `chooseForkTarget()`

## 配置项

无

## 注意事项

- 模态框文本通过 i18n 系统获取
- 选项卡片使用 `.opencodian-fork-target-option` CSS class
- `onClose` 清空内容并处理未 resolve 的情况
- 模态框内部类 `ForkTargetModal` 不导出，仅通过 `chooseForkTarget()` 函数使用



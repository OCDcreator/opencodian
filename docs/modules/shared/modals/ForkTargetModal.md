# Fork Target Modal

> **源码**: `src/shared/modals/ForkTargetModal.ts`
> **状态**: [REVIEW]

## 概述

对话分叉目标选择模态框。当用户选择分叉对话时，提供可用目标：在当前标签页分叉（替换当前内容），以及在标签启用时可选的“在新标签页分叉”（保留原对话）。使用 Promise 封装，返回用户选择或 `null`（取消）。

## 导入关系
上游: `obsidian` (App, Modal), `../../i18n` (t)
下游: `OpenCodianView` (分叉对话入口)

## 核心类型 / 接口

### ForkTarget
```typescript
type ForkTarget = 'new-tab' | 'current-tab';
```

### ForkTargetModalOptions
```typescript
interface ForkTargetModalOptions {
  allowNewTab?: boolean;
}
```

## 核心逻辑

### Promise 封装

`chooseForkTarget(app, options)` 返回 `Promise<ForkTarget | null>`：
- 用户点击选项 → resolve 对应 `ForkTarget`
- 用户关闭模态框（点击外部/ESC） → resolve `null`
- 当 `options.allowNewTab === false` 时，模态框不渲染 `new-tab` 选项，避免禁用会话标签后给出会被降级的误导性选择
- 当隐藏 `new-tab` 选项时，模态框会渲染 `chat.fork.newTabDisabled` 说明，明确该选项因为会话标签已禁用而不可用

### UI 结构

模态框内容：
1. 标题：`t('chat.fork.chooseTarget')`
2. 选项卡片（包裹在 `.opencodian-fork-target-list` 容器中，每个选项使用 `.opencodian-fork-target-option` CSS class）：
   - `current-tab`: `t('chat.fork.targetCurrentTab')`
   - `new-tab`: `t('chat.fork.targetNewTab')`（仅 `allowNewTab !== false` 时显示）
3. 说明文本：`t('chat.fork.newTabDisabled')`（仅 `allowNewTab === false` 时显示，使用 `.opencodian-fork-target-note`）

### 状态保护

`resolved` 标志防止双重 resolve（`onClose` + 点击选项）。

## 关键方法

| 方法 | 说明 |
|------|------|
| `chooseForkTarget(app, options?)` | 打开模态框，返回 Promise |
| `ForkTargetModal` | 导出的模态框类，供 DOM contract 测试直接验证可用目标渲染 |

## 数据流

```
OpenCodianView (用户触发分叉)
  → chooseForkTarget(app, { allowNewTab })
    → new ForkTargetModal(app, resolve, options).open()
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
- `ForkTargetModal` 会导出以便单元测试验证选项渲染，但生产入口仍优先通过 `chooseForkTarget()` 使用

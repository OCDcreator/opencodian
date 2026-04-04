# userMessageActions

> **源码**: `src/features/chat/userMessageActions.ts`
> **状态**: [DRAFT]

## 概述

用户消息操作按钮的流式状态同步工具。提供单一函数 `syncUserMessageStreamingActionState()`，在流式传输开始/结束时批量启用或禁用所有用户消息上的操作按钮（如编辑、分叉、复制、删除），防止用户在助手响应期间执行破坏性操作。

## 导入关系

**上游**: 无外部导入。

**下游**: `OpenCodianView` — 在流式传输状态变更时调用。

## 核心类型 / 接口

无。

## 核心逻辑

### 按钮状态同步
遍历容器内所有 `.opencodian-user-action-btn` 按钮，设置 `disabled` 属性。流式传输中（`isStreaming === true`）禁用所有按钮，传输结束后重新启用。

## 关键方法

| 方法 | 说明 |
|------|------|
| `syncUserMessageStreamingActionState(container, isStreaming)` | 根据流式状态启用/禁用用户消息操作按钮 |

## 数据流

```
流式传输开始 → syncUserMessageStreamingActionState(container, true)
  → 所有 .opencodian-user-action-btn 设置 disabled = true

流式传输结束 → syncUserMessageStreamingActionState(container, false)
  → 所有 .opencodian-user-action-btn 设置 disabled = false
```

## 与其他模块的交互

- **OpenCodianView**: 在 `syncTabStreamLikeState()` / `syncTabUserMessageActionButtons()` 中调用
- **styles.css**: `.opencodian-user-action-btn` 样式定义

## 配置项

无。

## 注意事项

- CSS 选择器 `.opencodian-user-action-btn` 需与渲染用户消息时的 class 保持一致
- 这是纯 DOM 操作，无状态管理

## 待补充

- [ ] 各操作按钮（编辑/重发/分叉/复制/删除）的具体 handler 分布
- [ ] 按钮禁用状态的视觉反馈样式

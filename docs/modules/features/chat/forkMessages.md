# forkMessages

> **源码**: `src/features/chat/forkMessages.ts`
> **状态**: [DRAFT]

## 概述

对话分叉的消息处理工具。提供纯函数 `cloneMessagesBeforeForkTarget()`，根据目标消息 ID 或 `sourceMessageId` 将消息列表截断到分叉点之前，返回深拷贝的历史消息子集。此模块不涉及服务端分叉操作，仅负责客户端侧的消息裁剪。

## 导入关系

**上游**:
- `../../core/types` — `ChatMessage`

**下游**: `OpenCodianView` — 在执行分叉操作时调用，获取分叉前的消息快照。

## 核心类型 / 接口

无自定义类型。消费 `ChatMessage`。

## 核心逻辑

### 分叉点定位
`cloneMessagesBeforeForkTarget()` 在消息列表中查找目标消息，匹配规则：
1. 首先按 `message.id === targetMessage.id` 匹配
2. 若 `targetMessage.sourceMessageId` 存在，则按 `message.sourceMessageId` 匹配

### 消息裁剪
找到目标消息后，取其之前的所有消息（`slice(0, targetIndex)`）。若未找到目标，返回完整消息列表。

### 深拷贝
通过 `JSON.parse(JSON.stringify())` 进行深拷贝，确保分叉后的消息与原始列表完全独立。

## 关键方法

| 方法 | 说明 |
|------|------|
| `cloneMessagesBeforeForkTarget(messages, targetMessage)` | 克隆目标消息之前的所有消息 |

## 数据流

```
用户点击分叉按钮
  → OpenCodianView 选择分叉目标消息
  → cloneMessagesBeforeForkTarget(messages, targetMessage)
    → ChatMessage[] (深拷贝的子集)
  → OpenCodeService.forkSession(sessionId, messageID)
  → 创建新对话标签页
```

## 与其他模块的交互

- **OpenCodianView**: 调用此函数获取分叉前的消息列表，用于本地预览或传递给服务端
- **OpenCodeService.forkSession()**: 服务端执行实际分叉
- **chooseForkTarget (shared/modals)**: 用户选择分叉点的 UI

## 配置项

无。

## 注意事项

- `JSON.parse(JSON.stringify())` 不处理 `undefined` 值、函数、循环引用——但 `ChatMessage` 纯数据结构中不包含这些
- 匹配时优先使用 `id`，`sourceMessageId` 作为备选匹配条件
- 未找到目标消息时返回完整列表（不裁剪），调用方需注意此行为

## 待补充

- [ ] 与服务端 `forkSession()` 的完整交互时序
- [ ] 分叉后新标签页的消息加载策略

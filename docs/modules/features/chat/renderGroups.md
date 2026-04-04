# renderGroups

> **源码**: `src/features/chat/renderGroups.ts`
> **状态**: [DRAFT]

## 概述

助手消息渲染分组工具。将连续的多条助手消息合并为一个渲染组，避免同回合内的多段助手响应被显示为独立气泡。处理 `contentBlocks` 和纯文本内容的合并，为 UI 层提供统一的合并后消息。

## 导入关系

**上游**:
- `../../core/types` — `ChatMessage`, `ContentBlock`

**下游**: `OpenCodianView` — 在渲染消息列表时调用 `buildMessageRenderGroups()` 和 `mergeAssistantMessagesForRender()`。

## 核心类型 / 接口

```typescript
interface MessageRenderGroup {
  mergedAssistant: boolean;
  messages: ChatMessage[];
}
```

## 核心逻辑

### 消息分组
`buildMessageRenderGroups()` 遍历消息列表，将连续的可合并助手消息归入同一组。可合并条件：`role === 'assistant'` 且 `displayStyle !== 'notice'`。非助手消息或 notice 类型的助手消息始终开启新组。

### 助手消息合并
`mergeAssistantMessagesForRender()` 将同一组内的多条助手消息合并为一条虚拟消息：
- `id` 用 `__` 拼接所有消息 ID
- `content` 用 `\n\n` 拼接文本内容
- `contentBlocks` 扁平化合并所有块
- `modelId` 取最后一条有 modelId 的消息
- 其他元数据（如时间戳）取最后一条消息

### 文本提取
`extractTextContent()` 优先从 `contentBlocks` 中提取 text 块，回退到 `content` 字段。

### 内容块扁平化
`flattenContentBlocks()` 将多条消息的 `contentBlocks` 合并为一个数组，无 contentBlocks 的消息退化为 `{ type: 'text', text }` 块。

## 关键方法

| 方法 | 说明 |
|------|------|
| `buildMessageRenderGroups(messages)` | 将消息列表分组（连续助手消息合并） |
| `mergeAssistantMessagesForRender(messages)` | 将同组助手消息合并为单条虚拟消息 |
| `isMergeableAssistantMessage(message)` | 判断消息是否可合并（内部函数） |
| `extractTextContent(message)` | 从消息中提取纯文本（内部函数） |
| `flattenContentBlocks(messages)` | 扁平化多条消息的内容块（内部函数） |

## 数据流

```
ChatMessage[] (服务端返回 / 本地存储)
  → buildMessageRenderGroups()
    → MessageRenderGroup[]
      → 遍历渲染:
          mergedAssistant === true → mergeAssistantMessagesForRender() → 单条合并消息
          mergedAssistant === false → 直接使用 messages[0]
```

## 与其他模块的交互

- **OpenCodianView**: 在消息渲染循环中调用，是消息列表到 UI 的必经转换层
- **core/types**: 消息和内容块类型定义

## 配置项

无。

## 注意事项

- `mergeAssistantMessagesForRender()` 要求至少传入一条消息，空数组会抛出异常
- 合并后的消息 `id` 格式为 `id1__id2__id3`，调用方需注意此格式
- `parts` 和 `sourceMessageId` 在合并时被清除（`undefined`）
- notice 类型的助手消息（如 OMO 提醒）不会被合并，保持独立显示

## 待补充

- [ ] 合并 id 格式在消息操作（fork/revert）中的影响
- [ ] contentBlocks 合并后块类型顺序的视觉表现

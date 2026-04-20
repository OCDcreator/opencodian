# OpenCodeSessionStateStore

> **源码**: `src/core/opencode/OpenCodeSessionStateStore.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeSessionStateStore` 是 `OpenCodeService` 内部的 canonical `session/message/part` graph owner。它把整份会话真相层收束到一个 reducer 风格 store 里，负责：

- 全量 session snapshot replace
- message / part 的 upsert 与 remove
- `message.part.delta` 风格的字符串字段增量合并
- 对外提供稳定、克隆后的 canonical state 读取视图

它不负责 SDK/legacy transport，也不负责 turn 渲染；当前只承接 session graph 状态本身。

## 导入关系

```text
上游:
- `./types`

下游:
- `src/core/opencode/OpenCodeService`
- 单元测试
```

## 核心类型 / 状态

- `OpenCodeCanonicalSessionState`: 单个 session 的规范状态，包含排序后的 `messages` 与按 message 聚合的 `partsByMessageID`。
- `OpenCodeSessionMessageWithParts`: `session.messages()` / legacy `/message` 读回的 `{ info, parts[] }` 结构。
- `sessions`: 以 `sessionID` 为键的内存状态表。

## 核心逻辑

### Snapshot replace

`replaceSessionSnapshot()` 会：

1. 用当前 session 的 authoritative 消息数组重建 state
2. 补齐缺失的 `sessionID` / `messageID`
3. 按 `id` 稳定排序 message 与 part
4. 丢弃旧 snapshot 中已经不存在的 message/part

### Incremental mutation

- `upsertMessage()`：按 `message.id` 写入或更新 message
- `upsertPart()`：按 `messageID + part.id` 写入或更新 part
- `removeMessage()`：删除 message 并一并清掉其 parts
- `removePart()`：删除指定 part；最后一个 part 删除后清掉对应 message bucket
- `appendPartDelta()`：把 `delta` 追加到现有字符串字段，供后续 sync-event / streaming reducer 复用

### Read isolation

`getSessionState()` 与所有 mutation 返回值都会先 clone，再交给外部调用方，避免 UI 或测试直接反向修改 store 内部状态。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `replaceSessionSnapshot()` | 用 authoritative `{info, parts[]}` 快照重建 canonical session graph |
| `upsertMessage()` | 写入或覆盖单条 message info |
| `removeMessage()` | 删除 message 并清理关联 parts |
| `upsertPart()` | 写入或覆盖单条 message part |
| `removePart()` | 删除单条 part |
| `appendPartDelta()` | 向现有字符串字段追加 delta |
| `getSessionState()` | 读取某个 session 的克隆后 canonical state |

## 数据流

```mermaid
graph TD
    A[OpenCodeService getSessionMessages] --> B[OpenCodeSessionStateStore]
    B --> C[canonical session graph]
    C --> D[getCanonicalSessionState]
```

## 与其他模块的交互

- `OpenCodeService` 保留对外 session façade，但 authoritative `getSessionMessages()` snapshot 会立即写入本 store。
- `types.ts` 现在提供 canonical message/part/session state 类型，避免服务层和测试各自再定义一份结构。
- 后续 sync-event graph mutation slice 会继续复用同一个 owner，而不是重新引入第三份临时消息状态。

## 配置项

无独立配置项。store 完全依赖调用方传入的 session/message/part 数据。

## 注意事项

- 这是 canonical truth layer，不要把 UI 级 `ChatMessage.content` 拼接状态写回这里。
- 目前排序策略与 OpenCode sync reducer 一样偏向稳定 `id` 顺序；若未来改为显式 time/order 字段，应该在这里统一调整。

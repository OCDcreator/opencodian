# conversationAuthoritativeReloadLocalFallback

> **源码**: `src/features/chat/services/conversationAuthoritativeReloadLocalFallback.ts`
> **状态**: [REVIEW]

## 概述

`conversationAuthoritativeReloadLocalFallback` 收束 `ConversationAuthoritativeReloadCoordinator` 里最容易回归的一段本地兜底策略：

- timeout 后本地生成 `assistant-interrupted-*` warning notice 时，判断当前 canonical graph 是否已经落到最新 user turn 对应的 assistant；
- 如果 canonical 还停留在“只有 user、没有 assistant”的旧状态，要求上层跳过 canonical、直接回退到 server truth；
- server truth 仍未补回 assistant 时，决定是否暂时保留这张 timeout notice，避免 visible background sync 把用户看到的等待/中断提示提前抹掉。

它不负责真正的 hydrate、message merge、save 或 rerender，只输出两类布尔决策，让 reload coordinator 继续保留 authoritative sync owner 身份。

## 公开接口

```typescript
export function shouldBypassCanonicalSyncForInterruptedNotice(
  existingMessages: ChatMessage[],
  canonicalMessages: OpenCodeSessionMessageWithParts[],
): boolean;

export function shouldPreserveInterruptedNoticeOnSync(
  existingMessages: ChatMessage[],
  syncedMessages: ChatMessage[],
  message: ChatMessage,
): boolean;
```

## 关键行为

- 只处理本地 `assistant-interrupted-*` warning notice；普通 error notice、anchored notice 或普通 interrupted assistant 仍沿用原有 merge 规则。
- `shouldBypassCanonicalSyncForInterruptedNotice()` 会找到 timeout notice 前的最新 user turn，并检查 canonical assistant 的 `parentID` 是否已经挂回这个 user；没有就说明 canonical 仍是 stale snapshot，应回退到 server。
- `shouldPreserveInterruptedNoticeOnSync()` 会检查 authoritative synced messages 是否已经在该最新 user turn 后面补出 assistant；若还没有，就继续保留 warning notice，直到真正 assistant 到达。

## 与相邻模块的边界

- `ConversationAuthoritativeReloadCoordinator`：负责调用这些决策并继续执行 authoritative merge / save / fingerprint。
- `ConversationTurnViewModelBuilder`：负责 canonical graph 的 turn 组装；这里仅消费 assistant `parentID` 做 stale-canonical 判定。
- `AssistantNoticeRenderer`：继续负责 timeout notice 的具体 message shape 与渲染样式；这里不创建 notice，只识别它。

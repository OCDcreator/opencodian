# messageFinalizationErrors

> **源码**: `src/features/chat/services/messageFinalizationErrors.ts`
> **状态**: [REVIEW]

## 概述

纯函数错误消息辅助模块，从 `MessageFinalizationService` 提取以控制该文件大小。

提供两类错误消息：
- `getFriendlyServerStartErrorMessage` — 将服务器启动异常转换为用户友好的本地化提示
- `getUnavailableServerMessage` — 根据服务器可用性状态返回对应描述

## 导出

```typescript
export type UnavailableServerAvailability = 'checking' | 'disabled' | 'starting' | 'offline';

export function getUnavailableServerMessage(availability: UnavailableServerAvailability): string;
export function getFriendlyServerStartErrorMessage(error: unknown): string;
```

# TitleGenerationPort

> **源码**: `src/features/chat/services/TitleGenerationPort.ts`
> **状态**: [REVIEW]

## 概述

`TitleGenerationPort` 是 `TitleGenerationService` 的 consumer-owned 类型端口。它只描述标题生成所需的最小依赖面，不拥有 runtime、可变 state 或 lifecycle，也不负责查找或转发依赖。

该端口消除了 `TitleGenerationService` 对 `src/main.ts` 的 type-only 依赖；它不是 service locator，也不是 forwarding adapter。消费者在组装服务时提供这些依赖。

## 依赖面

```typescript
export interface TitleGenerationPort {
  readonly settings: Readonly<Pick<
    OpenCodianSettings,
    'aiTitleModel' | 'disabledModelRefs' | 'locale' | 'modelSourceMode'
  >>;
  readonly openCodeService: Pick<
    OpenCodeService,
    'createSession' | 'deleteSession' | 'requestAssistantResponse'
  >;
  readonly modelConfigService: Pick<ModelConfigService, 'getCatalogs'> | null;
  readonly agentServiceRegistry: AgentServiceRegistry;
  getConversationById(id: string, options?: { preferCache?: boolean }): Promise<
    TitleGenerationConversation | undefined
  >;
  generateDefaultTitle(firstMessage: string): string;
}
```

- `settings` 只读取 `aiTitleModel`、`disabledModelRefs`、`locale` 和 `modelSourceMode`。
- `openCodeService` 只暴露创建/删除临时 session 与请求 assistant response 的能力。
- `modelConfigService` 只需要 `getCatalogs`，并允许为 `null`；服务在没有目录服务时仍可解析显式标题模型引用。
- `agentServiceRegistry` 保持具体 `AgentServiceRegistry` 类型，因为 `readBackendSessionTitle` 的 nominal 类型要求该 registry。
- `getConversationById` 只返回标题流程所需的 backend 与 session IDs（`backendSessionId`、`openCodeSessionId`、`acpSessionId`），而不是完整 conversation。
- `generateDefaultTitle` 提供首条消息的本地默认标题生成能力。

## 边界

端口没有自己的缓存、取消控制器、请求生命周期或 UI 回调。标题任务的活动 map、轮询、取消、临时 session 清理和结果回调仍由 `TitleGenerationService` 负责；消费者只负责提供端口实现。

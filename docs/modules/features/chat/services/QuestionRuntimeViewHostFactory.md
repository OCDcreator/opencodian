# QuestionRuntimeViewHostFactory

> **源码**: `src/features/chat/services/QuestionRuntimeViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`QuestionRuntimeViewHostFactory` 把 `OpenCodianView` 里 question runtime 相邻的 late-bound host assembly 收束成单一 factory，专门负责：

- 从一份更窄的 `QuestionRuntimeViewHostFactoryHost` 派生 `QuestionRuntimeViewHost`
- 统一收口 question dock slot、question API、tab attention、conversation sync 与 session-status refresh 这几组原本在 view 构造函数里并排装配的 question 依赖
- 继续复用既有的 `QuestionRuntimeViewHostAdapter`，让 adapter 只负责 question runtime host 适配，而把 view 侧的 late-bound 依赖拼装留在单独的 P2 factory

它不接管 question runtime bundle 的真实装配顺序；真正的 service/coordinator 实例化仍由 `QuestionRuntimeHostAdapter` 负责。

## 公开接口

```typescript
export interface QuestionRuntimeViewHostFactoryHost
  extends QuestionRuntimeViewHostAdapterHost {
  settings: QuestionRuntimeSettingsPort;
  getQuestionDockSlotCoordinator(): QuestionDockSlotCoordinatorPort;
  getQuestionApi(): QuestionRuntimeQuestionApiPort;
  getTabAttention(): QuestionRuntimeTabAttentionPort;
  getConversationSync(): QuestionRuntimeConversationSyncPort;
  getStatusRefresh(): QuestionRuntimeStatusRefreshPort;
}

export function createQuestionRuntimeViewHost(
  host: QuestionRuntimeViewHostFactoryHost,
): QuestionRuntimeViewHost;
```

## 关键行为

- `createQuestionRuntimeViewHost()` 从单一 host 同时读取 view-level runtime seam 与 question 相邻的 late-bound port
- dock slot、question API、tab attention、sync 与 status refresh 都通过 getter 延迟读取，避免 `OpenCodianView` 在构造函数里重新展开这组依赖拼装
- settings 仍保持 call-time 可读，因此 question display mode、answered-card gate 等开关不会退回到 view 里额外包一层
- factory 输出继续复用 `QuestionRuntimeViewHostAdapter`，因此 question runtime host shape 本身保持不变

## 与相邻模块的边界

- `OpenCodianView` 只保留一份 `QuestionRuntimeViewHostFactoryHost`，不再在构造函数里内联 question runtime 的多口依赖装配
- `QuestionRuntimeViewHostAdapter` 继续负责把 dock/settings/API/sync/status 等端口映射成 `QuestionRuntimeViewHost`
- `QuestionRuntimeHostAdapter` 继续负责 question runtime service bundle 的 host 派生与实例化
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：进一步压缩 `OpenCodianView` 里的 question runtime host wiring

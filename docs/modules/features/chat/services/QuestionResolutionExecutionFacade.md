# QuestionResolutionExecutionFacade

> **源码**: `src/features/chat/services/QuestionResolutionExecutionFacade.ts`
> **状态**: [REVIEW]

## 概述

`QuestionResolutionExecutionFacade` 把 question resolve 流程里共享的 **OpenCode reply/reject 执行、resolved-state apply 与错误 notice** 从 `QuestionDockCoordinator` 和 `QuestionResolutionFlowCoordinator` 中收束出来，专门负责：

- 接收共享的 `reply` / `reject` execution action，统一调用 `replyToQuestion()` / `rejectQuestion()`
- 复用同一份 logger 与 `chat.question.notice.error` 提示，保持 dock 与 inline fallback 的报错行为一致
- 在执行成功后把已组装好的 `QuestionResolution` 原样交给共享 lifecycle port，继续触发 resolved-id 标记、resolved-state writeback、可选 queue cleanup 与 post-resolution follow-up

它不负责 dock draft answer 收集、inline action 采集、pending-question queue/runtime writeback，或 dock 的 active/background attention render；这些仍分别由 `QuestionDockResolutionActionFacade`、`QuestionInlineCardRenderer`、`QuestionResolutionFlowCoordinator` 与 `QuestionDockCoordinator` 负责。

## 公开接口

```typescript
export interface QuestionResolutionExecutionFacadeHost {
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
}

export type QuestionResolutionExecutionAction =
  | { type: 'reply'; ... }
  | { type: 'reject'; ... };

export class QuestionResolutionExecutionFacade {
  execute(action: QuestionResolutionExecutionAction): Promise<QuestionResolution | null>;
  executeAndApply(action: QuestionResolutionExecutionAction, context: QuestionResolutionApplyContext): Promise<boolean>;
}
```

## 关键行为

- `execute()` 在 `reply` / `reject` 之间统一分支，避免两个 coordinator 重复持有真实 question API 调用逻辑
- 执行成功时直接返回 action 自带的 `QuestionResolution`，不再让 coordinator 重新拼装 answered/rejected shape
- 执行失败时统一记录错误并显示现有本地化 notice，然后返回 `null`，由调用方跳过后续 writeback
- `executeAndApply()` 在共享执行成功后继续通过 lifecycle port 完成 resolved-id 标记、resolved card/runtime apply、可选 queue cleanup，以及 `QuestionPostResolutionRuntimeFacade` follow-up，让 dock 与 inline fallback 共用同一条 post-resolution lifecycle

## 与 question bundle 的边界

- `QuestionRuntimeHostAdapter` 负责从共享 `QuestionRuntimeViewHost` 派生 `replyToQuestion()` / `rejectQuestion()` host，并把 resolved-id 标记、`QuestionResolutionCoordinator` 与 `QuestionPostResolutionRuntimeFacade` 一起注入这条 execution/apply seam
- `QuestionDockResolutionActionFacade` 与 `QuestionResolutionFlowCoordinator` 都会产出/消费同一份 execution action shape，因此 dock 与 inline fallback 的真实执行与后处理骨架保持一致；`QuestionDockCoordinator` 只补充 dock-specific 的 pending request cleanup 回调
- `OpenCodianView` 不需要新增 execution helper；view 仍只提供 question API 端口，具体执行/报错收束在服务层

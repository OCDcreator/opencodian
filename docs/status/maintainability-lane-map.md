# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。

## 当前优先级

- **P1**: `OpenCodianView` 里剩余的 activation / sync / runtime bridge ownership
- **P2**: question / todo / background task wiring 与 post-sync/activation 协调
- **P3**: context / composer / retained-selection 相关 ownership
- **P4**: message shell / notice / timestamp 组装边界

## 当前热点首查入口

- P2 首查顺序固定为：
  1. `src/features/chat/OpenCodianView.ts` 中 question/todo/background-task 的 host factory 与 wiring 片段
  2. `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
  3. `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
  4. `src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator.ts`
  5. 参考模式：`src/features/chat/services/SessionTodoHostAdapter.ts`、`src/features/chat/services/ConversationSyncHostAdapter.ts`
- P1 首查 `OpenCodianView` 里 activation / sync host 与 runtime bridge 创建区段，再看对应 bridge/service
- P3 首查 composer/context builder、context catalog 与 retained-selection runtime
- P4 首查 assistant shell / notice / footer / timestamp 组装入口，再看现有 renderer/finalizer/service

## 可复用模式

- host wiring 先看 `HostAdapter` / `create*Services()` 的现有模式
- post-sync / activation / runtime 多入口共享逻辑，优先落到 facade / coordinator / runtime bridge
- `OpenCodianView` 只保留 host assembly、bridge 入口和必要 UI writeback

## 低收益规则

- 不要在成功轮次里反复广扫同一大片 `OpenCodianView` 上下文
- `docs/modules/**` 只在模块边界真实变化时再读、再改
- 不要继续深挖 trailing-assistant helper 碎片化链路，除非正确性或构建失败直接阻塞

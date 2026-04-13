# Maintainability Round Roadmap

> **用途**: 这是无人值守 maintainability 的受控轮次队列。Autopilot 必须按顺序执行，不得自由发挥。
> **执行规则**: 每轮只允许处理第一个标记为 `[NEXT]` 的任务；成功后把它改成 `[DONE]`，并把紧随其后的首个 `[QUEUED]` 改成 `[NEXT]`。

## 控制规则

- 不允许跳过当前 `[NEXT]` 去做“顺手的小抽取”。
- 如果当前 `[NEXT]` 已经在仓库中自然完成，先在 phase 文档里说明证据，再把它标记为 `[DONE]` 并推进下一个。
- 如果当前 `[NEXT]` 被测试、构建或正确性问题阻塞，只允许做解除阻塞所需的最小修改，不得借机切换赛道。
- 新增文件必须满足 master plan 的粒度规则；默认优先合并薄 provider / factory / adapter。
- 每个 queue item 的成功轮次都必须运行全量 `npm test` 与 `npm run build`。

## Queue

### [NEXT] Q1 - 收束 P2 question/todo/background-task runtime provider 链

- **Lane**: P2
- **目标**: 先把当前最碎的一段 host/provider/factory/adapter 链收束，减少 question/todo/background-task 的跨文件跳转层级。
- **优先入口**:
  - `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
  - `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
- **约束**:
  - 本轮优先通过合并低价值 provider/factory/adapter 减少层级，不再新增同类薄文件。
  - 至少减少 2 个中间转发 seam，或让一条主调用链减少 2 次跨文件跳转。
  - 如果只是把已有转发重命名/换壳，不算完成。
- **验收**:
  - phase 文档必须说明减少了哪条调用链的层级。
  - 运行全量 `npm test` 与 `npm run build`。

### [QUEUED] Q2 - 收束 P2 question dock / resolution 的写回与 render 状态链

- **Lane**: P2
- **目标**: 合并 question dock 相关的薄 facade / state adapter，避免一个 question flow 跨过过多 “render / writeback / runtime” 文件。
- **优先入口**:
  - `src/features/chat/services/QuestionDockRenderAdapter.ts`
  - `src/features/chat/services/QuestionDockRenderStateFacade.ts`
  - `src/features/chat/services/QuestionDockWritebackFacade.ts`
  - `src/features/chat/services/QuestionDockRefreshFacade.ts`
  - `src/features/chat/services/QuestionResolutionApplyFacade.ts`
  - `src/features/chat/services/QuestionResolutionExecutionFacade.ts`
- **约束**:
  - 优先合并一句话 facade；不要新增新的 `*Facade` / `*Adapter` 文件。
  - 目标是把 question resolution 的读写边界收敛到更少、更厚实的 owner。
- **验收**:
  - 至少合并 2 个薄模块，或显著缩短一个 resolution flow 的跨文件链路。
  - 运行全量 `npm test` 与 `npm run build`。

### [QUEUED] Q3 - 收束 P2 session todo refresh / status 链

- **Lane**: P2
- **目标**: 清理 session todo 的 refresh/status host adapter 层，把状态刷新职责收敛到更稳定的 service owner。
- **优先入口**:
  - `src/features/chat/services/SessionTodoHostAdapter.ts`
  - `src/features/chat/services/SessionTodoRuntimeFacade.ts`
  - `src/features/chat/services/SessionTodoStatusRefreshService.ts`
  - `src/features/chat/services/SessionTodoStateService.ts`
  - `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
- **约束**:
  - 不新增新的 `HostAdapter` / `RuntimeFacade` 文件。
  - 优先减少 `OpenCodianView` 到 session todo 服务之间的转发层。
- **验收**:
  - 明确说明被合并的转发边界，以及 `OpenCodianView` 少持有了什么职责。
  - 运行全量 `npm test` 与 `npm run build`。

### [QUEUED] Q4 - 推进 P3 context/composer/retained-selection ownership 迁移

- **Lane**: P3
- **目标**: 从 `OpenCodianView` 抽走一块真正的 context/composer ownership，而不是继续在 P2 局部打磨。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ContextUsageService.ts`
  - 与 composer/context chips、retained selection 直接相关的 helper / runtime 文件
- **约束**:
  - 必须迁出新的 owner 边界，不接受单纯窄 helper 粉碎。
- **验收**:
  - phase 文档明确写出迁出的 ownership 是什么。
  - 运行全量 `npm test` 与 `npm run build`。

### [QUEUED] Q5 - 推进 P4 message shell / notice / timestamp ownership 迁移

- **Lane**: P4
- **目标**: 让 `OpenCodianView` 更接近 host/assembly，减少消息级 DOM / notice 组装细节留在 view 内。
- **优先入口**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/PersistentAssistantNoticeService.ts`
  - assistant shell / footer / timestamp / notice 相关 renderer 或 service
- **约束**:
  - 优先迁移完整 ownership 片段，不接受只再抽一层 notice adapter。
- **验收**:
  - 明确说明迁出的 notice / shell ownership。
  - 运行全量 `npm test` 与 `npm run build`。

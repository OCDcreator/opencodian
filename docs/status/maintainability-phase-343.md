# 可维护性改进：第三百四十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-342.md`
> **推进的 master-plan lane**: OpenCodeService `session lifecycle`
> **完成的 roadmap queue item**: `R28 - Session lifecycle coordinator`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R28 - Session lifecycle coordinator`。本轮把 `OpenCodeService` 中 session create/list/messages/todos/statuses/delete/update、默认 current session 指针，以及公开 session sync 订阅 API 的共享流程收束到新的 `OpenCodeSessionLifecycleCoordinator`，让 `OpenCodeService` 退回为 host seam 与对外 façade。

## 1. 本轮范围

- 新增 `src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts`
  - 集中承接 session lifecycle 的 SDK / legacy transport 分流、current session tracking，以及公开 session sync 订阅委托
  - 复用 `OpenCodeService` 提供的 revert-state 过滤、todo/status normalization、tool-name 观测与日志 seam
- 缩减 `src/core/opencode/OpenCodeService.ts`
  - `createSession()`、`listSessions()`、`getSessionMessages()`、`getSessionTodos()`、`getSessionStatuses()`、`deleteSession()`、`updateSessionTitle()` 与 session sync 订阅公开接口改为委托给 coordinator
  - `requestAssistantResponse()`、`sendMessage()`、`cancelStream()`、`detachStream()` 改为从 coordinator 读取默认 current session，而不再自己持有该状态
- 补充 focused coverage
  - 新增 `tests/unit/core/opencode/OpenCodeSessionLifecycleCoordinator.test.ts`
  - 覆盖 create/list/messages/todos/statuses/delete/update/current-session/subscription 的共享行为
- 更新直接相关模块文档
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodeSessionLifecycleCoordinator.md`

## 2. 本轮刻意没有动的边界

- 没有改动 `forkSession()` 到 `updateMessagePart()` 的 session control / message orchestration 区段；该部分仍留给 `R29`
- 没有改动 question/permission negotiation、broad query gateway、streaming runtime 或 SDK-first / legacy fallback 的既有语义
- 没有修改 `ServerManager`、`OpenCodeSdkFacade` 或 `OpenCodianView`
- 没有部署到 Test Vault；本轮命中的代码路径不在 AGENTS 约定的 deploy-relevant runtime/style/settings 范围内

## 3. 验证

- Targeted:
  - `npm test -- OpenCodeSessionLifecycleCoordinator.test.ts OpenCodeService.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604141327`

## 4. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts`
- `tests/unit/core/opencode/OpenCodeSessionLifecycleCoordinator.test.ts`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeSessionLifecycleCoordinator.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-343.md`

## 5. 下一步建议

下一轮继续执行 roadmap 已晋升的 `[NEXT]`：`R29 - Session control and messaging orchestrator`。优先从 `forkSession()` 到 `updateMessagePart()` 的共用控制流切入，把 fork/revert/unrevert/diff/context usage、message commands 与 message-part operations 收束到同一个较厚 owner，同时维持 transport fallback 与 session lifecycle 新边界不变。

一句话总结第三百四十三阶段本轮：

> 第三百四十三阶段完成 R28，把 `OpenCodeService` 的 session lifecycle 公开流程收束到 `OpenCodeSessionLifecycleCoordinator`，并将受控队列推进到 `R29 - Session control and messaging orchestrator`。

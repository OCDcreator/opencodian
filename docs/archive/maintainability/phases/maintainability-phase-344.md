# 可维护性改进：第三百四十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-343.md`
> **推进的 master-plan lane**: OpenCodeService `session control / message operations`
> **完成的 roadmap queue item**: `R29 - Session control and messaging orchestrator`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R29 - Session control and messaging orchestrator`。本轮把 `OpenCodeService` 中 fork/revert/unrevert/diff、context-usage snapshot、session message control、message command/shell，以及 message-part operations 的共享流程收束到新的 `OpenCodeSessionControlOrchestrator`，让 `OpenCodeService` 继续退回为 host seam 与对外 façade。

## 1. 本轮范围

- 新增 `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
  - 集中承接 session control / message operations 的 SDK / legacy transport 分流、diff normalization，以及 context-usage snapshot 聚合
  - 统一承接 `initializeSession()`、session tree/share/summarize、message command/shell、message/part 更新删除等 session control surface
- 缩减 `src/core/opencode/OpenCodeService.ts`
  - `getSessionContextUsageSnapshot()`、`forkSession()`、`revertSession()`、`unrevertSession()`、`getSessionRevertState()`、`getSessionDiff()` 改为委托给 orchestrator
  - `initializeSession()`、`getSessionChildren()`、`shareSession()`、`unshareSession()`、`summarizeSession()`、`getSessionMessage()`、`deleteSessionMessage()`、`runSessionCommand()`、`runSessionShell()`、`updateMessagePart()`、`deleteMessagePart()` 改为委托给 orchestrator
  - 删除原先只服务于这条 control/message 链的 fork/revert/context-usage helper 逻辑
- 补充 focused coverage
  - 新增 `tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts`
  - 覆盖 context usage snapshot、SDK/legacy control mutation、diff fallback，以及 session/message/part SDK wrappers
- 更新直接相关模块文档
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodeSessionControlOrchestrator.md`

## 2. 本轮刻意没有动的边界

- 没有改动 `getPendingQuestions()` 到 `respondToPermission()` 的 question/permission negotiation 区段；该部分仍留给 `R30`
- 没有改动 provider/project/file/find/path/VCS/formatter/LSP/MCP auth 这一组条件性 query gateway
- 没有改动 `OpenCodeSessionLifecycleCoordinator`、`ServerManager`、`OpenCodeSdkFacade` 或 `OpenCodianView`
- 没有部署到 Test Vault；本轮命中的代码路径不在 AGENTS 约定的 deploy-relevant runtime/style/settings 范围内

## 3. 验证

- Targeted:
  - `npm test -- OpenCodeSessionControlOrchestrator.test.ts OpenCodeService.test.ts OpenCodeService.sdkCompat.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604141351`

## 4. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
- `tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeSessionControlOrchestrator.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-344.md`

## 5. 下一步建议

下一轮继续执行 roadmap 已晋升的 `[NEXT]`：`R30 - Question and permission hub`。优先从 `getPendingQuestions()` 到 `respondToPermission()` 的交互式 negotiation 区段切入，把 pending questions/replies/reject 与 pending/session permissions/responders 收束到同一个较厚 owner，同时维持本轮新的 session lifecycle / session control 边界不变。

一句话总结第三百四十四阶段本轮：

> 第三百四十四阶段完成 R29，把 `OpenCodeService` 的 session control / message operations 收束到 `OpenCodeSessionControlOrchestrator`，并将受控队列推进到 `R30 - Question and permission hub`。

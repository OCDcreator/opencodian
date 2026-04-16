# 可维护性改进：第四百二十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-425.md`
> **推进的 master-plan lane**: Maintainability / chat composer runtime
> **完成的 roadmap queue item**: `R91 - OpenCodianView send/composer interaction seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R91 - OpenCodianView send/composer interaction seam`。范围限定在 `OpenCodianView` 的 composer submit wiring、`MessageSendPreparationService` 的 draft-context ownership、直接相关测试与 maintainability 状态文档，不扩展到 model selection、input panel theme、question/todo 附着语义或其他 lane。

## 1. 本轮范围

- 把 composer draft context 的读取与清理从 `OpenCodianView` 的 host 装配移入 `MessageSendPreparationService` 构造依赖，让 send preparation owner 直接持有 `ComposerSendContextPort`。
- 让 `ComposerInputShellCoordinator` 的 submit action 直接调用现有 `SendPipelineRuntime`，删除 `OpenCodianView` 中仅转调 pipeline 的 `sendMessage()` 薄方法。
- 更新 `MessageSendPreparationService` 直接相关测试，保持 optimistic append、first-message title kickoff 与 staged draft clearing 顺序不变。
- 同步推进 maintainability 状态文档，把队列从 `R91` 推进到 `R92`。

## 2. 本轮结果

- `MessageSendPreparationService` 现在直接负责 composer draft context snapshot/clear follow-up，不再通过 `OpenCodianView.createMessageSendPreparationHost()` 暴露该端口。
- `OpenCodianView` 的 composer submit wiring 现在直接把输入提交给 `SendPipelineRuntime`，view 对 send action 的残余 pass-through 继续减少。
- `ComposerInputShellCoordinator`、`MessageSendPreparationService` 与 `SendPipelineRuntime` 的现有 owner 边界保持不变，但 send/composer interaction 的 wiring 更集中在既有 composer/send owner 内。
- 未改变 model selection、input panel theme、question/todo 附着、并发 tab/session streaming、hydration/auth-sync gate 或 background-task completion 语义。

## 3. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R91` 标记为 `[DONE]`。
- 下一项 `R92 - Checkpoint after OpenCodianView residual seams` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步更新当前 `[NEXT]` 与最近验证状态。

## 4. 验证

- `npm test -- MessageSendPreparationService`
- `npm test -- ComposerInputShellCoordinator`
- `npm test -- SendPipelineRuntime`
- `npm test`
- `npm run build`

验证结果：

- `npm test -- MessageSendPreparationService`：通过，`1` 个 suite / `7` 个 tests 全部通过
- `npm test -- ComposerInputShellCoordinator`：通过，`1` 个 suite / `3` 个 tests 全部通过
- `npm test -- SendPipelineRuntime`：通过，`1` 个 suite / `3` 个 tests 全部通过
- `npm test`：通过，`277 passed, 277 total` suites；`1149 passed, 1149 total` tests；用时 `5.419 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604152029`

## 5. 部署

- 本轮修改了 chat runtime、send preparation service、直接相关测试与 maintainability 状态文档，但未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 6. 文件变更

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/MessageSendPreparationService.ts`
- `tests/unit/features/chat/MessageSendPreparationService.test.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-426.md`

## 7. 下一步

- 下一推荐切片：`R92 - Checkpoint after OpenCodianView residual seams`
- 继续先做 `R88-R91` 的 residual 收益、lint 变化与验证成本 checkpoint，再决定是否切入 `R93` 的 render residual seam。

一句话总结第四百二十六阶段本轮：

> 第四百二十六阶段完成 `R91`，把 composer draft context 直接收束进 `MessageSendPreparationService`、让 composer submit 直连现有 `SendPipelineRuntime`，并把队列顺序推进到 `R92`。

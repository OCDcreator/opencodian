# 可维护性改进：第三百三十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-333.md`
> **推进的 master-plan lane**: OpenCodeService `sync event runtime`
> **完成的 roadmap queue item**: `R19 - Sync event runtime coordinator`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R19 - Sync event runtime coordinator`。目标是把 `OpenCodeService` 内部的 session todo / session status / message sync event listener registry、wanted state、SDK sync event subscription lifecycle 与 emit path 收束到一个较厚 coordinator，同时不改 SDK-first / legacy fallback 的公共语义，也不混入 tool/MCP catalog、prompt builder 或 streaming runtime。

## 1. 本轮范围

- 新增 `OpenCodeSyncEventRuntimeCoordinator`
  - 持有 `subscribeToSessionTodoUpdates()` / `subscribeToSessionStatusUpdates()` / `subscribeToSessionSyncEvents()` 三类 listener registry
  - 统一管理 `wanted` state、`AbortController`、subscription promise、`ensure` / `stop` / `restart` lifecycle
  - 继续路由 `todo.updated`、`session.status`、`message.updated`、`message.part.updated` 与 `session.diff`
  - 通过 host seam 复用 `OpenCodeService` 的 SDK façade、todo/status normalization、transient connectivity 判断、日志抑制、健康检查与 delay
- 精简 `OpenCodeService`
  - 公开订阅 API 保持不变，只代理到 coordinator
  - `setVaultPath()`、`start()`、`stop()`、`dispose()` 与 `updateSettings()` 继续负责何时确保/停止/重启 sync event runtime
  - `OpenCodeService` 不再直接持有 sync-event listener sets、wanted flag、abort controller、subscription promise 或 event routing helpers
- 更新直接相关模块文档
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodeSyncEventRuntimeCoordinator.md`
  - `docs/modules/README.md`

## 2. 兼容性边界

- 保持 `OpenCodeService` 对外总门面不变；chat runtime 仍只依赖 `OpenCodeService.subscribeToSession*()` API。
- 保持 SDK sync stream 语义不变；coordinator 经 host seam 调用 `OpenCodeSdkFacade.global.syncEvent.subscribe()`，没有新增 legacy fallback 或 transport 分流。
- 保持 transient connectivity 恢复策略不变；sync event stream 失败后仍通过健康检查等待服务恢复，避免离线期每秒刷重复日志。
- 没有触碰 OpenCode event subscription runtime、tool/MCP catalog state、prompt request builder、streaming runtime 或 message normalization；这些留给后续 R20-R26。

## 3. Focused coverage

- 新增 `tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts`
  - 覆盖 todo/status/message sync event routing
  - 覆盖最后一个 listener 释放时中断 SDK stream
  - 覆盖 active listener 下的 restart lifecycle
  - 覆盖 transient connectivity 恢复后重新订阅
- 保留并通过 `tests/unit/core/opencode/OpenCodeService.test.ts` 中既有 SDK sync event 集成覆盖，证明公开 service API 行为未回归。

## 4. 验证

- Targeted:
  - `npm test -- tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.test.ts`
  - `npm test -- tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.test.ts`（修复新增测试语法 typo 后重跑）
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604140007`

## 5. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/core/opencode/**`、`tests/unit/core/opencode/**` 与文档路径，未命中 AGENTS 规定需要部署的 `src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/` 或 `src/features/settings/` 等路径

## 6. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
- `tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts`
- `docs/modules/README.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeSyncEventRuntimeCoordinator.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-334.md`

## 7. 下一步建议

下一轮按 roadmap 当前 `[NEXT]` 执行：

- `R20 - OpenCode event subscription coordinator`

建议从 `OpenCodeService.ts` 中 `hasOpenCodeEventListeners` / `ensureOpenCodeEventSubscriptions` / `stopOpenCodeEventSubscriptions` / `restartOpenCodeEventSubscriptions` / `getEventPayload` / `handleCatalogRelevantEvent` / `emitOpenCodeEvent` / `handleSdkEventEnvelope` 开始，只收束 OpenCode event listener + subscription lifecycle 与 payload routing，不混入 R21 的 tool/MCP catalog state store。

一句话总结第三百三十四阶段本轮：

> 第三百三十四阶段完成 R19 sync event runtime coordinator，把 `OpenCodeService` 的 session sync-event listener registry、订阅生命周期与 emit routing 收束到 `OpenCodeSyncEventRuntimeCoordinator`，并将 roadmap 推进到 R20。

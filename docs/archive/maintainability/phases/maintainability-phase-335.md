# 可维护性改进：第三百三十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-334.md`
> **推进的 master-plan lane**: OpenCodeService `open-code event runtime`
> **完成的 roadmap queue item**: `R20 - OpenCode event subscription coordinator`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R20 - OpenCode event subscription coordinator`。目标是把 `OpenCodeService` 内部的 OpenCode event listener registry、`event` / `global` subscription lifecycle、catalog-relevant payload routing 与 emit path 收束到单一 coordinator，同时保持 tool/MCP catalog state 仍留在 `OpenCodeService`，不和 R21 混做一个超大 owner，也不改 MCP status API / tool list API 的公共语义。

## 1. 本轮范围

- 新增 `OpenCodeEventSubscriptionCoordinator`
  - 持有 `subscribeToOpenCodeEvents()` / `subscribeToCatalogUpdates()` 两类 listener registry
  - 统一管理 `wanted` state、`event` / `global` 双路 `AbortController`、subscription promise、`ensure` / `stop` / `restart` lifecycle
  - 继续路由 `mcp.tools.changed`、`message.part.updated`、`message.updated` 与 `permission.asked`
  - 通过 host seam 复用 `OpenCodeService` 的 SDK façade、runtime tool 观察、MCP status refresh、capability snapshot、日志与 delay
- 精简 `OpenCodeService`
  - `start()`、`stop()`、`dispose()`、`setVaultPath()` 与 `updateSettings()` 继续负责何时确保/停止/重启 open-code event runtime
  - 公开订阅 API 保持不变，只代理到 coordinator
  - tool schema cache、registry tool ids、MCP server status 与 snapshot 构造仍留在 `OpenCodeService`，但 catalog listener emit 已通过 coordinator 收口
- 更新直接相关模块文档
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodeEventSubscriptionCoordinator.md`
  - `docs/modules/README.md`

## 2. 兼容性边界

- 保持 `OpenCodeService` 对外总门面不变；上层仍只依赖 `subscribeToOpenCodeEvents()` / `subscribeToCatalogUpdates()`。
- 保持 SDK-first 的 OpenCode event 语义不变；coordinator 继续经 host seam 调用 `OpenCodeSdkFacade.event.subscribe()` 与 `global.event()`。
- 保持 tool/MCP catalog state 仍在 `OpenCodeService`；本轮没有提前把 registry cache、snapshot 构造或 MCP status map 混入新 coordinator。
- 没有触碰 sync event runtime、prompt request builder、context part serializer、streaming runtime 或 message normalization；这些留给后续 R21-R26。

## 3. Focused coverage

- 新增 `tests/unit/core/opencode/OpenCodeEventSubscriptionCoordinator.test.ts`
  - 覆盖 direct + nested payload 的 catalog-relevant event routing
  - 覆盖最后一个 listener 释放时中断 `event` / `global` 双路 SDK stream
  - 覆盖 active listener 下的 restart lifecycle
  - 覆盖单路订阅失败后的 retry 与 listener 保留
- 保留并通过 `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts` 中既有 service 级覆盖，证明公开订阅 API 的 SDK compat 行为未回归。

## 4. 验证

- Targeted:
  - `npm test -- tests/unit/core/opencode/OpenCodeEventSubscriptionCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604140021`

## 5. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/core/opencode/**`、`tests/unit/core/opencode/**` 与文档路径，未命中 AGENTS 规定需要部署的 `src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/` 或 `src/features/settings/`

## 6. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeEventSubscriptionCoordinator.ts`
- `tests/unit/core/opencode/OpenCodeEventSubscriptionCoordinator.test.ts`
- `docs/modules/README.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeEventSubscriptionCoordinator.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-335.md`

## 7. 下一步建议

下一轮按 roadmap 当前 `[NEXT]` 执行：

- `R21 - Tool and MCP catalog state store`

建议从 `OpenCodeService.ts` 中 `normalizeMcpServerStatusMap` / `updateRegistryToolIds` / `updateToolSchemaCache` / `updateMcpServerStatus` / `createToolCatalogSnapshot` / `createMcpServerSnapshot` 开始，并把 `OpenCodeEventSubscriptionCoordinator.ts` 的 `emitCatalogUpdate()` 一并纳入当前 catalog state owner 的收口设计，但不要顺带混入 R22 的 prompt option assembly。

一句话总结第三百三十五阶段本轮：

> 第三百三十五阶段完成 R20 open-code event subscription coordinator，把 `OpenCodeService` 的 OpenCode event listener registry、双路订阅生命周期、catalog-relevant payload routing 与 emit path 收束到 `OpenCodeEventSubscriptionCoordinator`，并将 roadmap 推进到 R21。

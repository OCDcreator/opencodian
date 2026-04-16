# 可维护性改进：第三百三十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-335.md`
> **推进的 master-plan lane**: OpenCodeService `catalog / MCP state`
> **完成的 roadmap queue item**: `R21 - Tool and MCP catalog state store`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R21 - Tool and MCP catalog state store`。目标是把 `OpenCodeService` 内部的 registry tool ids、tool schema cache、MCP server status map、catalog snapshot 构造与 catalog update listener lifecycle 收束到单一 state store，同时保持 `OpenCodeService` 继续作为对外 API 门面，不改 tool identity、icon fallback 或 MCP summary 语义。

## 1. 本轮范围

- 新增 `OpenCodeCatalogStateStore`
  - 持有 registry tool ids、tool schema cache、observed external tool names、MCP server status、tool/MCP snapshot 构造与 catalog listener lifecycle
  - 统一处理 `subscribeToCatalogUpdates()`、`emitCatalogUpdate()`、`normalizeMcpServerStatusMap()` 与 tool identity context 视图
  - 通过 host seam 在 catalog listener 增减时同步 `OpenCodeEventSubscriptionCoordinator` 的 wanted state
- 精简 `OpenCodeService`
  - `refreshToolIds()`、`listTools()`、`refreshMcpServerStatus()`、`getToolCatalogSnapshot()`、`getMcpServerSnapshot()` 与 `getCapabilitySnapshot()` 改为统一委托给 state store
  - vault path / settings scope 切换时改为通过 state store 清理 tool schema cache
  - MCP add/auth wrapper 继续保持原有对外 API，但内部状态更新与 snapshot 构造不再留在 service 本体
- 收窄 `OpenCodeEventSubscriptionCoordinator`
  - catalog listeners 与 snapshot 广播从 coordinator 迁出
  - coordinator 改为通过 host 感知 catalog listeners 是否存在，并在 catalog-relevant event 发生时触发 state store 广播
- 更新直接相关模块文档
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodeEventSubscriptionCoordinator.md`
  - `docs/modules/core/opencode/OpenCodeCatalogStateStore.md`
  - `docs/modules/README.md`

## 2. 兼容性边界

- 保持 `OpenCodeService` 对外 API 门面不变；调用方仍通过 service 访问 tool list、MCP status 与 catalog updates。
- 保持 tool identity、builtin/MCP/custom 判定、icon fallback 与 MCP summary 语义不变；`OpenCodeCatalogStateStore` 只提供 registry/observed tool 集合与 snapshot。
- 保持 `OpenCodeEventSubscriptionCoordinator` 继续负责 `event` / `global` 双路 SDK event 订阅生命周期；本轮没有混入 R22 的 prompt option assembly。
- `observeRuntimeToolNames()` 仍不会自动广播；只有显式 catalog update 或 state update 方法才会触发 listener，保持原有广播时机。

## 3. Focused coverage

- 新增 `tests/unit/core/opencode/OpenCodeCatalogStateStore.test.ts`
  - 覆盖 catalog listener add/remove 对 open-code event runtime sync 的影响
  - 覆盖 registry ids、tool schema cache、tool identity context 的统一 snapshot 行为
  - 覆盖 MCP status payload 规范化与排序 snapshot
- 更新 `tests/unit/core/opencode/OpenCodeEventSubscriptionCoordinator.test.ts`
  - 改为覆盖 catalog-relevant event 对 state store host 的观察/广播触发
  - 覆盖仅有 catalog listeners 时的 restart lifecycle
- 保留并通过 `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
  - 证明 `OpenCodeService.subscribeToCatalogUpdates()` 与 tool/MCP public API 的 SDK compat 行为未回归

## 4. 验证

- Targeted:
  - `npm test -- tests/unit/core/opencode/OpenCodeCatalogStateStore.test.ts tests/unit/core/opencode/OpenCodeEventSubscriptionCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604140039`

## 5. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/core/opencode/**`、`tests/unit/core/opencode/**` 与文档路径，未命中 AGENTS 规定需要部署的 `src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/` 或 `src/features/settings/`

## 6. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeEventSubscriptionCoordinator.ts`
- `src/core/opencode/OpenCodeCatalogStateStore.ts`
- `tests/unit/core/opencode/OpenCodeEventSubscriptionCoordinator.test.ts`
- `tests/unit/core/opencode/OpenCodeCatalogStateStore.test.ts`
- `docs/modules/README.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeEventSubscriptionCoordinator.md`
- `docs/modules/core/opencode/OpenCodeCatalogStateStore.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-336.md`

## 7. 下一步建议

下一轮按 roadmap 当前 `[NEXT]` 执行：

- `R22 - Prompt request builder`

建议从 `OpenCodeService.ts` 中 `buildSdkPromptParameters()`、`buildAllowedToolsRecord()`、`buildSharedPromptOptions()`、`resolveLocalOutputFormat()`、`resolveSdkOutputFormat()` 与 `resolveSdkVariant()` 开始，把 SDK/legacy 共用 prompt option assembly 收束到单一 builder，但不要顺带混入 R23 的 context/image request-part serialization。

一句话总结第三百三十六阶段本轮：

> 第三百三十六阶段完成 R21 tool and MCP catalog state store，把 `OpenCodeService` 的 tool/MCP cache、snapshot 与 catalog listener lifecycle 收束到 `OpenCodeCatalogStateStore`，并将 roadmap 推进到 R22。

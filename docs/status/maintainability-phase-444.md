# 可维护性改进：第四百四十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-443.md`
> **推进的 master-plan lane**: Maintainability / opencode fallback runtime
> **完成的 roadmap queue item**: `R109 - OpenCodeService health / legacy fallback seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R109 - OpenCodeService health / legacy fallback seam`。范围限定在 `OpenCodeService` 的 health / streaming fallback 入口、直接相关 lifecycle / streaming 单元测试、直接关联模块文档与 maintainability 状态文档；没有提前进入 `R110` 的 session abort/get lane，也没有扩散到 settings、chat runtime 或其他 batch 5 题目。

## 1. 本轮范围

- 沿既有 `OpenCodeServiceLifecycleCoordinator` owner 继续收束 SDK health response normalization 与 health fallback follow-up。
- 沿既有 `OpenCodeStreamingRuntimeCoordinator` owner 收束 `sendMessage()` 的 SDK/legacy transport selection 与 legacy fallback 入口。
- 保留 SDK-first / legacy fallback 判定、HTTP/SSE fallback 语义、首事件前 SDK stream failure 回落规则，以及 final assistant completion 语义不变。
- 没有新增薄 helper / adapter / factory；owner 边界继续留在既有 lifecycle / streaming coordinators 内。
- 因为 module boundary 发生直接扩展，同步更新了直接相关的 `docs/modules/core/opencode/` 文档。

## 2. 本轮改动

- `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts` 现在直接归一化 SDK `global.health()` 的 boolean / `{ healthy }` 响应，再决定是否回退到 `ServerManager.checkHealth(3000)`。
- `src/core/opencode/OpenCodeService.ts` 的 `checkSdkHealth` host seam 现在只暴露原始 SDK health payload；`sendMessage()` 改为统一委托 `streamingRuntime.streamResponse()`，不再直接铺开 SDK/legacy transport 入口分支。
- `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts` 新增单一 `streamResponse()` 入口，把 SDK/legacy transport selection 收进既有 streaming runtime owner，同时保留原有 `streamSdkResponse()` / `streamLegacyResponse()` 语义与首事件前 fallback 行为。
- `tests/unit/core/opencode/OpenCodeServiceLifecycleCoordinator.test.ts` 新增 structured SDK health response 覆盖，确认 lifecycle owner 负责 health payload normalization 而且不会误触发 legacy probe。
- `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts` 新增单一 transport entrypoint 覆盖，确认 runtime owner 按 caller flag 选择 SDK 或 legacy transport。
- `docs/modules/core/opencode/OpenCodeService.md`、`docs/modules/core/opencode/OpenCodeServiceLifecycleCoordinator.md` 与 `docs/modules/core/opencode/OpenCodeStreamingRuntimeCoordinator.md` 同步标记新的 owner 边界。

## 3. 验证

- `npm test -- OpenCodeServiceLifecycleCoordinator OpenCodeStreamingRuntimeCoordinator OpenCodeService.httpRuntime OpenCodeService.sdkStreamEvents`
- `npm test`
- `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M) npm run build`

验证结果：

- targeted suites：通过，`4` 个 suites / `31` 个 tests 全部通过，用时 `0.692 s`
- `npm test`：通过，`276 passed, 276 total` suites；`1157 passed, 1157 total` tests；用时 `2.673 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604160002`

## 4. 部署

- 本轮修改位于 `src/core/opencode/`、`tests/unit/core/opencode/`、`docs/modules/core/opencode/` 与 maintainability 状态文档，未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 5. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts`
- `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
- `tests/unit/core/opencode/OpenCodeServiceLifecycleCoordinator.test.ts`
- `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeServiceLifecycleCoordinator.md`
- `docs/modules/core/opencode/OpenCodeStreamingRuntimeCoordinator.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-444.md`

## 6. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R109` 标记为 `[DONE]`。
- 下一项 `R110 - OpenCodeService session abort/get fallback seam` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 `[NEXT]`、最近验证与 batch 5 热点入口。

## 7. 下一步

- 下一推荐切片：`R110 - OpenCodeService session abort/get fallback seam`
- 从 `src/core/opencode/OpenCodeService.ts` 与 `tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts` 入手，继续收束 session get/abort、session-scoped detach、fallback query 与 runtime follow-up residual，同时保持 session-scoped abort/detach 与 get fallback 语义不变。

一句话总结第四百四十四阶段本轮：

> 第四百四十四阶段完成 `R109`，把 SDK health response normalization 与 `sendMessage()` 的 SDK/legacy transport selection 收进既有 `OpenCodeServiceLifecycleCoordinator` / `OpenCodeStreamingRuntimeCoordinator` owner seams。

# 可维护性改进：第四百四十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-442.md`
> **推进的 master-plan lane**: Maintainability / opencode service lifecycle
> **完成的 roadmap queue item**: `R108 - OpenCodeService sync/bootstrap residual lifecycle seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R108 - OpenCodeService sync/bootstrap residual lifecycle seam`。范围限定在 `OpenCodeService` 的 vault-path scope refresh orchestration、直接相关 lifecycle 单元测试、模块文档与 maintainability 状态文档；没有提前进入 `R109` 的 health / legacy fallback lane，也没有扩散到 settings、chat runtime 或其他 batch 5 题目。

## 1. 本轮范围

- 沿现有 `OpenCodeServiceLifecycleCoordinator` owner 继续收束 vault path 变更后的 sync restart、tool-catalog scope invalidation 与 server working-directory follow-up。
- 保留 SDK-first bootstrap、health probe ordering、sync-event bridge、tool schema cache scope 语义与 server working-directory 写回语义不变。
- 没有新增薄 helper / adapter / factory；owner 边界继续留在既有 `OpenCodeServiceLifecycleCoordinator` 内。
- 因为 lifecycle owner 职责发生直接扩展，同步更新了直接相关的 `docs/modules/core/opencode/` 文档。

## 2. 本轮改动

- `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts` 新增 `setVaultPath(path)` lifecycle 入口，把旧 scope capture、`vaultPath` 写回、`ServerManager.setWorkingDirectory()`、tool schema cache scope invalidation 与 sync/open-code subscription restart 收束到同一条 owner seam。
- `src/core/opencode/OpenCodeService.ts` 的 `setVaultPath()` 现仅委托给 `serviceLifecycle`，不再直接铺开 catalog scope 与 subscription restart orchestration。
- `tests/unit/core/opencode/OpenCodeServiceLifecycleCoordinator.test.ts` 新增 vault-path scope refresh 覆盖，确认 coordinator 负责旧 scope 读取、working-directory 更新、cache invalidation 与 restart 顺序。
- `docs/modules/core/opencode/OpenCodeService.md` 与 `docs/modules/core/opencode/OpenCodeServiceLifecycleCoordinator.md` 同步标记新的 lifecycle owner 边界，避免模块文档继续描述旧的主类内联编排。

## 3. 验证

- `npm test -- OpenCodeServiceLifecycleCoordinator`
- `npm test`
- `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M) npm run build`

验证结果：

- targeted `npm test -- OpenCodeServiceLifecycleCoordinator`：通过，`1` 个 suite / `5` 个 tests 全部通过，用时 `0.33 s`
- `npm test`：通过，`276 passed, 276 total` suites；`1155 passed, 1155 total` tests；用时 `2.675 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604152352`

## 4. 部署

- 本轮修改位于 `src/core/opencode/`、`tests/unit/core/opencode/`、`docs/modules/core/opencode/` 与 maintainability 状态文档，未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 5. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts`
- `tests/unit/core/opencode/OpenCodeServiceLifecycleCoordinator.test.ts`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeServiceLifecycleCoordinator.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-443.md`

## 6. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R108` 标记为 `[DONE]`。
- 下一项 `R109 - OpenCodeService health / legacy fallback seam` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 `[NEXT]`、最近验证与 batch 5 的热点入口。

## 7. 下一步

- 下一推荐切片：`R109 - OpenCodeService health / legacy fallback seam`
- 从 `src/core/opencode/OpenCodeService.ts` 与 `tests/unit/core/opencode/OpenCodeService.httpRuntime.test.ts` 入手，继续收束 health retry、legacy HTTP/SSE fallback 入口与 degraded-state follow-up residual，同时保持 SDK-first / legacy fallback 判定不变。

一句话总结第四百四十三阶段本轮：

> 第四百四十三阶段完成 `R108`，把 vault path 变更后的 scope capture、working-directory 更新、tool schema cache invalidation 与 sync/open-code subscription restart 收进同一条 `OpenCodeServiceLifecycleCoordinator` lifecycle seam。

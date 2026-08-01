# 可维护性改进：第三百九十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-391.md`
> **推进的 master-plan lane**: Maintainability / server shutdown lifecycle
> **完成的 roadmap queue item**: `R57 - ServerManager stop/restart lifecycle seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R57 - ServerManager stop/restart lifecycle seam`。范围只围绕 `src/core/opencode/ServerManager.ts` 与直接相关测试收束 adopted pid terminate、process tree kill、restart/reset 与 managed state cleanup 的 shutdown lifecycle；未混入 launch/adoption、settings/config、public API 或 deploy-relevant 路径改动，也未改变 SIGTERM/SIGKILL、Windows process tree 终止、managed state 回写或 restart 语义。

## 1. 本轮范围

- 更新 `src/core/opencode/ServerManager.ts`，新增统一 `ManagedServerShutdownPlan` + shutdown lifecycle seam，把 `stop()`、`dispose()`、`restartManagedServer()` 与 orphan recycle 共用的 terminate / cleanup / port-release 流程集中到单一 owner。
- 更新 `src/core/opencode/ServerManager.ts`，把 spawned child-process teardown 的 SIGTERM/SIGKILL / Windows tree-kill 路径收口到 `terminateManagedProcess()`，减少 `stop()` 对 platform-specific 退出分支的直接铺开。
- 更新 `tests/unit/core/opencode/ServerManager.test.ts`，补充 shutdown seam 的 focused tests，覆盖 child-process stop、adopted pid stop、dispose sync teardown 与 stale managed restart port-release waiting。
- 更新 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md`，推进 queue 与最新验证基线状态。

## 2. R57 收益

- `ServerManager.stop()` 不再直接铺开 spawned/adopted 两套 stop cleanup 分支，统一改由 shutdown lifecycle plan 决定 terminate、managed state cleanup 与 runtime cleanup。
- `restartManagedServer()` 与 `recycleUnknownLocalServer()` 复用同一 terminate + port-release waiting seam，保留原有 stale/orphan 错误文案与超时口径，避免重复 teardown 逻辑。
- `dispose()` 现在和 async stop/restart 共享同一 shutdown plan 入口，只保留 sync terminate 差异，降低 managed pid 与 spawned pid 清理路径的散落程度。
- Windows process tree kill 与非 Windows SIGTERM/SIGKILL fallback 仍由专属 helper 保持原语义，但 stop/restart 调用点明显收缩。

## 3. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R57` 标记为 `[DONE]`。
- `docs/status/maintainability-round-roadmap.md` 已将 `R58 - ModelConfigService inherited config resolution seam` 提升为新的 `[NEXT]`。
- 下一推荐切片：`R58 - ModelConfigService inherited config resolution seam`。

## 4. 验证

- Focused:
  - `npm test -- tests/unit/core/opencode/ServerManager.test.ts`：通过，`1 passed, 1 total` suites；`31 passed, 31 total` tests
- Full:
  - `npm test`：通过，`262 passed, 262 total` suites；`1116 passed, 1116 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604150441`

## 5. 部署

- 本轮仅改动 `src/core/opencode/**`、直接相关测试与状态文档，不属于本仓库约定的 Test Vault 强制部署路径。
- 因此本轮未执行 Test Vault 部署；最近一次部署仍来自 `R54`。

## 6. 文件变更

- `src/core/opencode/ServerManager.ts`
- `tests/unit/core/opencode/ServerManager.test.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-392.md`

## 7. 下一步

- 继续按 queue 执行 `R58 - ModelConfigService inherited config resolution seam`。
- 从 `src/core/config/ModelConfigService.ts`、`src/core/config/modelConfig.ts` 与直接相关 model config tests 开始，保持 `baseEffective` / `effective` 区分、provider enable/disable layering 与 project-local override 语义不变。

一句话总结第三百九十二阶段本轮：

> 第三百九十二阶段完成 `R57`，把 `ServerManager` 的 stop/restart lifecycle 收口到统一 shutdown seam，在 focused/full 测试与构建通过后，把 maintainability queue 顺延到 `R58` ModelConfigService inherited config resolution seam。

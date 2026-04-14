# 可维护性改进：第三百九十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-390.md`
> **推进的 master-plan lane**: Maintainability / server launch runtime
> **完成的 roadmap queue item**: `R56 - ServerManager launch diagnostics seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R56 - ServerManager launch diagnostics seam`。范围只围绕 `src/core/opencode/ServerManager.ts` 与直接相关测试收束 local launch、stdout/stderr tail、launch snapshot、health wait 与 launch failure reporting 的 runtime seam；未混入 managed adoption、stop/restart teardown、settings UI 或 public API 改动，也未改变 launch command、health wait、output tail 保留数量、failure notice 或 mode-specific 行为。

## 1. 本轮范围

- 更新 `src/core/opencode/ServerManager.ts`，新增 `launchLocalServerRuntime()` seam，把 fresh start、restart-managed 与 recycle-orphan 分支共用的 local launch / health-wait / running-notice 流程集中到单一 helper。
- 更新 `src/core/opencode/ServerManager.ts`，把 stdout/stderr tail 记录、launch snapshot 读取、exit suffix 组装与 launch failure reporting 收口到专属 helper，减少 `doStart()` 与健康等待路径对 `activeLaunch` 细节的直接铺开。
- 更新 `tests/unit/core/opencode/ServerManager.test.ts`，补充 launch runtime seam 的 focused tests，覆盖成功启动完成路径与 immutable launch snapshot failure reporting。
- 更新 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md`，推进 queue 与最新验证基线状态。

## 2. R56 收益

- `ServerManager.doStart()` 不再直接铺开 fresh local start 的 spawn / health-wait / running-notice 细节，launch runtime 成功路径集中到 `launchLocalServerRuntime()` 维护。
- stale managed restart 与 orphan recycle 分支复用同一 local launch helper，只在各自分支保留 restart/recycle 决策与成功后差异化 diagnostics，避免重复 launch 流程。
- launch failure reporting 现在先读取 immutable launch snapshot，再统一组装 exit suffix 与 output tail message，降低 `waitForHealthy()` 对 live `activeLaunch` 结构的直接耦合。
- stdout/stderr tail logging 通过统一 handler creator 收口，保留原有 tail 长度与 logger 级别语义，同时减少重复数据流处理分支。

## 3. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R56` 标记为 `[DONE]`。
- `docs/status/maintainability-round-roadmap.md` 已将 `R57 - ServerManager stop/restart lifecycle seam` 提升为新的 `[NEXT]`。
- 下一推荐切片：`R57 - ServerManager stop/restart lifecycle seam`。

## 4. 验证

- Focused:
  - `npm test -- tests/unit/core/opencode/ServerManager.test.ts`：通过，`1 passed, 1 total` suites；`27 passed, 27 total` tests
- Full:
  - `npm test`：通过，`262 passed, 262 total` suites；`1112 passed, 1112 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604150432`

## 5. 部署

- 本轮仅改动 `src/core/opencode/**`、直接相关测试与状态文档，不属于本仓库约定的 Test Vault 强制部署路径。
- 因此本轮未执行 Test Vault 部署；最近一次部署仍来自 `R54`。

## 6. 文件变更

- `src/core/opencode/ServerManager.ts`
- `tests/unit/core/opencode/ServerManager.test.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-391.md`

## 7. 下一步

- 继续按 queue 执行 `R57 - ServerManager stop/restart lifecycle seam`。
- 从 `src/core/opencode/ServerManager.ts` 与直接相关 server manager tests 开始，保持 adopted pid terminate、process tree kill、restart/reset 与 managed state cleanup 语义不变。

一句话总结第三百九十一阶段本轮：

> 第三百九十一阶段完成 `R56`，把 `ServerManager` 的 local launch/runtime diagnostics 收口到专属 seam，在 focused/full 测试与构建通过后，把 maintainability queue 顺延到 `R57` stop/restart lifecycle seam。

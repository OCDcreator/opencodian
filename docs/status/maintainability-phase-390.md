# 可维护性改进：第三百九十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-389.md`
> **推进的 master-plan lane**: Maintainability / server lifecycle adoption
> **完成的 roadmap queue item**: `R55 - ServerManager managed adoption/conflict seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R55 - ServerManager managed adoption/conflict seam`。范围只围绕 `src/core/opencode/ServerManager.ts` 与直接相关测试收束 previously managed local server adoption、signature drift 判定、stale managed restart、orphan recycle 与 conflict diagnostics 的决策 seam；未混入 launch tail、stop/restart teardown、settings UI 或 public API 改动，也未改变 local managed adoption 规则、signature 比较口径或 orphan restart 语义。

## 1. 本轮范围

- 更新 `src/core/opencode/ServerManager.ts`，新增 occupied local endpoint resolution seam，把 healthy occupied local endpoint 下的 adopt / restart / recycle / conflict 决策集中到专属 helper，并把 managed-state candidate 校验单独收口。
- 更新 `tests/unit/core/opencode/ServerManager.test.ts`，补充 occupied local endpoint resolution seam 的 focused tests，同时保留原有 start/adoption 行为回归覆盖。
- 更新 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md`，推进 queue 与最新基线状态。

## 2. R55 收益

- `ServerManager.doStart()` 不再直接铺开 managed adoption、stale restart、orphan recycle 与 conflict diagnostics 的整段分支；occupied local endpoint 的“接管还是重启”决策集中在单一 seam 内维护。
- managed state 的 host/port、command-line 与 signature candidate 校验现在先集中为 adoptable-state 判定，再由 adoption outcome 决定 adopt / restart / skip，降低 lifecycle 分支重复。
- conflict diagnostics 与 orphan-restarted diagnostics 的组装现在通过专属 builder 收口，保留原有 message、pid、commandLine 与 diagnostics reason 语义。

## 3. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R55` 标记为 `[DONE]`。
- `docs/status/maintainability-round-roadmap.md` 已将 `R56 - ServerManager launch diagnostics seam` 提升为新的 `[NEXT]`。
- 下一推荐切片：`R56 - ServerManager launch diagnostics seam`。

## 4. 验证

- Focused:
  - `npm test -- tests/unit/core/opencode/ServerManager.test.ts`：通过，`1 passed, 1 total` suites；`25 passed, 25 total` tests
- Full:
  - `npm test`：通过，`262 passed, 262 total` suites；`1110 passed, 1110 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604150422`

## 5. 部署

- 本轮仅改动 `src/core/opencode/**`、直接相关测试与状态文档，不属于本仓库约定的 Test Vault 强制部署路径。
- 因此本轮未执行 Test Vault 部署；最近一次部署仍来自 `R54`。

## 6. 文件变更

- `src/core/opencode/ServerManager.ts`
- `tests/unit/core/opencode/ServerManager.test.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-390.md`

## 7. 下一步

- 继续按 queue 执行 `R56 - ServerManager launch diagnostics seam`。
- 从 `src/core/opencode/ServerManager.ts` 与直接相关 server manager tests 开始，保持 local launch、health wait、launch snapshot 与 failure notice 语义不变。

一句话总结第三百九十阶段本轮：

> 第三百九十阶段完成 `R55`，把 `ServerManager` 的 occupied local endpoint adoption/conflict 决策收口到专属 seam，在 focused/full 测试与构建通过后，把 maintainability queue 顺延到 `R56` launch diagnostics seam。

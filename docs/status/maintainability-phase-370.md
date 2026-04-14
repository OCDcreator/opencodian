# 可维护性改进：第三百七十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-369.md`
> **推进的 master-plan lane**: Maintainability / chat runtime wiring
> **完成的 roadmap queue item**: `R35 - OpenCodianView constructor runtime wiring`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R35 - OpenCodianView constructor runtime wiring`。范围只处理 `src/features/chat/OpenCodianView.ts` constructor 与 service/runtime wiring 的 owner 集中问题，把 constructor 内的大段初始化组装收束为同文件 lifecycle helpers；没有改变 concurrent tab/session streaming、hydration/auth-sync、scroll restore 或 background-task completion notice 语义，也没有混入 message rendering、send pipeline 或 settings UI 重构。

## 1. 本轮范围

- 在 `OpenCodianView` 内新增 constructor-owned runtime wiring 分段：surface/runtime shell、background-task runtime、conversation runtime 与 interaction runtime。
- 将 constructor 从直接持有大量 service fan-out 改为按 lifecycle bundle 接收并赋值，保留字段名、外部调用 API 与测试可观测入口。
- 将 conversation/tab/bootstrap coordinator 的初始化依赖收束到 `createConversationRuntimeWiring()`，让 tab activation、hydration、sync bridge 与 background-task indicator 组装顺序更明确。
- 未新增薄 provider / factory / adapter 文件；本轮所有 owner 收束均留在 `OpenCodianView` 同文件内。

## 2. Owner seam 收益

- `OpenCodianView` constructor 不再直接展开所有 OpenCode/chat runtime service 构造细节，初始化责任按 lifecycle helper 分组。
- background-task live signal、conversation hydration / activation、conversation sync bridge、tab recovery/bootstrap 与 interaction runtime 的 wiring 边界更清晰。
- 并发 tab/session streaming、foreground `session.status`、hydration authoritative-sync gate、scroll restore 与 background-task persisted completion notice 行为保持不变。

## 3. 队列推进

- 将 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md` 同步更新为 `R35` 已完成。
- 按 roadmap 队列规则把 `R36 - OpenCodeService residual seam feasibility` 提升为新的 `[NEXT]`。
- `R37` 仍是本批 checkpoint；在此之前不得跳出 `R36 -> R37` 顺序。

## 4. 验证

- Focused:
  - `npm test -- tests/unit/features/chat/persistedTabRestore.test.ts tests/unit/features/chat/conversationTabOpen.test.ts tests/unit/features/chat/conversationTabLifecycleRecovery.test.ts tests/unit/features/chat/backgroundTaskHydrationState.test.ts tests/unit/features/chat/backgroundTaskTimeline.test.ts`：通过，`5 passed, 5 total` suites；`13 passed, 13 total` tests
- Full:
  - `npm test`：通过，`252 passed, 252 total` suites；`1075 passed, 1075 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604142023`

## 5. 部署

- 本轮代码变更只命中 `src/features/chat/OpenCodianView.ts` 与 maintainability status docs，没有命中本轮要求的 Test Vault deploy-relevant 路径。
- 因此未执行 Test Vault 部署；`deploy_ran=false`。

## 6. 文件变更

- `src/features/chat/OpenCodianView.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-370.md`

## 7. 下一步

- 当前可自动执行的 `[NEXT]` 是 `R36 - OpenCodeService residual seam feasibility`。
- 下一轮应先评估 `src/core/opencode/OpenCodeService.ts` 剩余 seam 是否能形成较厚 owner；若无法形成，按 roadmap 记录跳过原因并推进 `R37` checkpoint。

一句话总结第三百七十阶段本轮：

> 第三百七十阶段把 `OpenCodianView` constructor/runtime wiring 收束成同文件 lifecycle helpers，保留 chat runtime 行为语义，并将 maintainability 自动队列推进到 `R36 - OpenCodeService residual seam feasibility`。

# 可维护性改进：第四百三十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-432.md`
> **推进的 master-plan lane**: Maintainability / chat services
> **完成的 roadmap queue item**: `R98 - ContextUsageService usage-breakdown seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R98 - ContextUsageService usage-breakdown seam`。范围限定在 `ContextUsageService` 与其直接 refresh caller/test；没有提前进入 `R99` 的 composer context seam，也没有扩散到 `OpenCodeService`、`OpenCodianView` 或 `docs/modules/**`。

## 1. 本轮范围

- 在 `src/features/chat/services/ContextUsageService.ts` 内收束 usage snapshot、display snapshot 与 breakdown assembly，让 precise/estimated display token 视图、breakdown token fit 与 refresh merge follow-up 由单一 owner 负责。
- 新增 `ContextUsageService.applyUsageSnapshot()`，把 server refresh snapshot 的 identity merge 与 precise usage merge 合并为同一入口。
- 在 `src/features/chat/services/ActiveTabContextUsageCoordinator.ts` 中移除本地 snapshot 拼装细节，改为直接委托 `ContextUsageService` 处理 refresh 后的 state merge。
- 扩展 `tests/unit/features/chat/ContextUsageService.test.ts`，覆盖新的 snapshot merge seam；保留原有 context breakdown / currency / precise summary 行为断言。

## 2. 本轮改动

- `ContextUsageService` 现在通过 `getDisplaySnapshot()` / `buildDisplayTokenBreakdown()` 统一 display token breakdown 与 summary 读取，避免 summary 与 breakdown 各自重复推导 precise/estimated totals。
- `ContextUsageService` 现在通过 `collectBreakdownChars()`、`estimateBreakdownTokens()` 与 `fitBreakdownTokens()` 集中处理 usage breakdown assembly，让 `getContextBreakdown()` 只保留输入 token gating 与最终 segment 输出。
- `ContextUsageService` 现在通过 `cloneState()` / `finalizeState()` 统一 identity merge、usage chunk merge 与 precise usage merge 的 percentage / `updatedAt` follow-up。
- `ActiveTabContextUsageCoordinator` 的 refresh 路径不再单独铺开 snapshot → identity → precise usage 的多段转换，而是调用 `ContextUsageService.applyUsageSnapshot()` 保持 refresh 时机与显示语义不变。

## 3. 验证

- `npm test -- --runTestsByPath tests/unit/features/chat/ContextUsageService.test.ts tests/unit/features/chat/ActiveTabContextUsageCoordinator.test.ts`
- `npm test`
- `npm run build`

验证结果：

- targeted `npm test -- --runTestsByPath tests/unit/features/chat/ContextUsageService.test.ts tests/unit/features/chat/ActiveTabContextUsageCoordinator.test.ts`：通过，`2` 个 suites / `10` 个 tests 全部通过。
- `npm test`：通过，`277 passed, 277 total` suites；`1150 passed, 1150 total` tests；用时 `4.627 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604152131`

## 4. 部署

- 本轮修改位于 `src/features/chat/services/` 与 maintainability 状态文档，未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 5. 文件变更

- `src/features/chat/services/ContextUsageService.ts`
- `src/features/chat/services/ActiveTabContextUsageCoordinator.ts`
- `tests/unit/features/chat/ContextUsageService.test.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-433.md`

## 6. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R98` 标记为 `[DONE]`。
- 下一项 `R99 - ComposerContext coordinator/view runtime seam` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 `[NEXT]`、最近验证与下一批热点入口。

## 7. 下一步

- 下一推荐切片：`R99 - ComposerContext coordinator/view runtime seam`
- 从 `src/features/chat/services/ComposerContextCoordinator.ts` 与 `src/features/chat/services/ComposerContextRuntimeStore.ts` 入手，收束 coordinator/runtime store/view facade 的 residual runtime 交界，同时保持 chips、picker actions、draft state 与 view host 语义不变。

一句话总结第四百三十三阶段本轮：

> 第四百三十三阶段完成 `R98`，把 context usage snapshot、display snapshot、breakdown assembly 与 refresh merge follow-up 收束回 `ContextUsageService`，并把队列顺序推进到 `R99`。

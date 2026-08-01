# 可维护性改进：第三百九十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-393.md`
> **推进的 master-plan lane**: Maintainability / model catalog assembly
> **完成的 roadmap queue item**: `R59 - ModelConfigService server catalog assembly seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R59 - ModelConfigService server catalog assembly seam`。范围只围绕 `src/core/config/ModelConfigService.ts`、`src/core/config/modelConfig.ts` 与直接相关测试 / 文档，收束 runtime/server catalog merge、filtered effective catalog assembly、provider availability probe planning 与 default model resolution；未混入 settings section、message normalization、provider icon、public API shape 或 deploy-relevant 路径改动，也未改变 provider availability probe 结果、default model fallback 或 catalog filtering 语义。

## 1. 本轮范围

- 更新 `src/core/config/modelConfig.ts`，新增 `catalogFromRuntimeResult()`、`buildServerCatalog()`、`assembleModelCatalog()` 与 `resolveProviderAvailabilityProbePlan()` seam，把 runtime result 映射、server catalog merge、`baseEffective`/`effective` 组装与 probe 前置决策集中到同一 owner。
- 更新 `src/core/config/ModelConfigService.ts`，让 `getCatalogs()`、`testProviderAvailability()` 与 `loadServerState()` 改为消费新的 catalog seam，服务层仅保留配置 IO、日志与真实 `probeProviderResponse()` 调用。
- 更新 `tests/unit/core/config/modelConfig.test.ts`，补充 catalog seam focused tests，覆盖 runtime-backed server catalog merge、effective catalog assembly 与 provider probe planning。
- 更新 `docs/modules/core/config/ModelConfigService.md` 与 `docs/modules/core/config/modelConfig.md`，同步记录 R59 后的 catalog assembly / probe planning 边界。
- 更新 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md`，推进 queue 与最新验证基线状态。

## 2. R59 收益

- `ModelConfigService` 不再直接铺开 server catalog merge、`ModelSourceMode` 目录拼装、provider-ID 过滤与默认 probe model 选择细节。
- runtime provider 真值、scoped metadata 覆盖与 `effective` catalog filtering 现在共享同一 catalog assembly seam，降低 `getServerCatalog()`、`getCatalogs()` 与 availability probe 之间逻辑漂移的风险。
- provider probe 现在通过统一 plan 先产出 project/server disable 优先级、model 计数、默认测试模型与“是否需要真实发送”的决策，服务层只负责执行 send probe 并回填成功/失败结果。
- 直接相关模块文档与 seam tests 现在明确记录 catalog assembly owner 边界，后续 `R60` mapper 切片可以继续推进，而不需要回到 `ModelConfigService` 内重复收束相同逻辑。

## 3. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R59` 标记为 `[DONE]`。
- `docs/status/maintainability-round-roadmap.md` 已将 `R60 - OpenCodeMessageNormalizationMapper tool/content seam` 提升为新的 `[NEXT]`。
- 下一推荐切片：`R60 - OpenCodeMessageNormalizationMapper tool/content seam`。

## 4. 验证

- Focused:
  - `npm test -- tests/unit/core/config/modelConfig.test.ts tests/unit/core/config/ModelConfigService.test.ts`：通过，`2 passed, 2 total` suites；`29 passed, 29 total` tests
- Full:
  - `npm test`：通过，`262 passed, 262 total` suites；`1121 passed, 1121 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604150504`

## 5. 部署

- 本轮仅改动 `src/core/config/**`、直接相关测试以及状态 / 模块文档，不属于本仓库约定的 Test Vault 强制部署路径。
- 因此本轮未执行 Test Vault 部署；最近一次部署仍来自 `R54`。

## 6. 文件变更

- `src/core/config/ModelConfigService.ts`
- `src/core/config/modelConfig.ts`
- `tests/unit/core/config/modelConfig.test.ts`
- `docs/modules/core/config/ModelConfigService.md`
- `docs/modules/core/config/modelConfig.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-394.md`

## 7. 下一步

- 继续按 queue 执行 `R60 - OpenCodeMessageNormalizationMapper tool/content seam`。
- 从 `src/core/opencode/OpenCodeMessageNormalizationMapper.ts` 与直接相关 mapper tests 开始，在保留 tool status / result transform、custom tool 行为与 content block shape 的前提下，收束 tool/content assembly lifecycle。

一句话总结第三百九十四阶段本轮：

> 第三百九十四阶段完成 `R59`，把 `ModelConfigService` 的 server catalog assembly、effective catalog assembly 与 provider probe planning 收口到 `modelConfig.ts` seam，在 focused/full 测试与构建通过后，把 maintainability queue 顺延到 `R60` OpenCodeMessageNormalizationMapper tool/content seam。

# 可维护性改进：第三百九十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-392.md`
> **推进的 master-plan lane**: Maintainability / model config inheritance
> **完成的 roadmap queue item**: `R58 - ModelConfigService inherited config resolution seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R58 - ModelConfigService inherited config resolution seam`。范围只围绕 `src/core/config/ModelConfigService.ts`、`src/core/config/modelConfig.ts` 与直接相关测试 / 文档，收束 inherited server config 解析、scope merge、provider enable/disable layering 与 local override 的 resolution lifecycle；未混入 provider icon、settings UI、catalog assembly queue 后续切口、public API 或 deploy-relevant 路径改动，也未改变 `baseEffective` / `effective` 区分、scoped disabled provider 语义、project-local override 行为或 server/default scope 合并顺序。

## 1. 本轮范围

- 更新 `src/core/config/modelConfig.ts`，新增 `resolveInheritedModelConfigResolution()` seam，把 local-disk vs server-default-scope inherited config 选择、scoped supplement、effective provider availability merge 与 current-scope enablement 判定集中到统一 resolution owner。
- 更新 `src/core/config/ModelConfigService.ts`，让 `loadServerState()`、`getServerCatalog()`、`getCatalogs()` 与 `testProviderAvailability()` 统一消费 resolution seam，减少服务层对 inherited-config merge / scope layering 细节的直接铺开。
- 更新 `tests/unit/core/config/modelConfig.test.ts`，补充 resolution seam focused tests，覆盖 local 模式 inherited supplement、remote default-scope fallback 与 project override 清空 inherited disable 的判定行为。
- 更新 `docs/modules/core/config/ModelConfigService.md` 与 `docs/modules/core/config/modelConfig.md`，同步记录 inherited-config resolution seam 的职责边界。
- 更新 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md`，推进 queue 与最新验证基线状态。

## 2. R58 收益

- `ModelConfigService` 不再在 `getCatalogs()`、`testProviderAvailability()` 与 server-state loading 流程中分别手写 inherited config source 选择、effective provider merge 与 current-scope enablement 条件。
- local 模式下“磁盘继承配置优先 + scoped runtime provider arrays 只在项目未显式覆盖时补入”的规则改由单一 seam 维护，减少目录作用域与项目覆盖规则散落在服务层多处的风险。
- remote 模式下 default-scope fallback、`effectiveProviderConfig` 生成与 provider enablement probes 也改为共用同一 resolution 产物，降低 probe / catalog bundle 之间逻辑漂移的可能。
- 直接相关模块文档现在明确记录 `resolveInheritedModelConfigResolution()` 的职责，后续 `R59` catalog assembly seam 可以在此基础上继续收束而不回退到重复层叠逻辑。

## 3. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R58` 标记为 `[DONE]`。
- `docs/status/maintainability-round-roadmap.md` 已将 `R59 - ModelConfigService server catalog assembly seam` 提升为新的 `[NEXT]`。
- 下一推荐切片：`R59 - ModelConfigService server catalog assembly seam`。

## 4. 验证

- Focused:
  - `npm test -- tests/unit/core/config/modelConfig.test.ts tests/unit/core/config/ModelConfigService.test.ts`：通过，`2 passed, 2 total` suites；`26 passed, 26 total` tests
- Full:
  - `npm test`：通过，`262 passed, 262 total` suites；`1118 passed, 1118 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604150451`

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
- `docs/status/maintainability-phase-393.md`

## 7. 下一步

- 继续按 queue 执行 `R59 - ModelConfigService server catalog assembly seam`。
- 从 `src/core/config/ModelConfigService.ts` 与直接相关 model config tests 开始，在保留 provider availability probe、default model resolution 与 filtered effective catalog 语义的前提下，继续收束 catalog assembly lifecycle。

一句话总结第三百九十三阶段本轮：

> 第三百九十三阶段完成 `R58`，把 `ModelConfigService` 的 inherited config resolution 收口到统一 seam，在 focused/full 测试与构建通过后，把 maintainability queue 顺延到 `R59` ModelConfigService server catalog assembly seam。

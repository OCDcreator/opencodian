# 可维护性改进：第四百五十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-455.md`
> **推进的 master-plan lane**: Maintainability / config assembly
> **完成的 roadmap queue item**: `R121 - modelConfig residual merge/assembly seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R121 - modelConfig residual merge/assembly seam`。范围限定在 `src/core/config/modelConfig.ts`、`src/core/config/ModelConfigService.ts`、直接覆盖 model config assembly 的单元测试，以及直接相关模块文档与 maintainability 状态文档；没有提前进入 `R122` checkpoint，也没有扩展到 settings/main 或 heavy test lane。

## 1. 本轮范围

- 在 `src/core/config/modelConfig.ts` 新增 `assembleServerModelCatalog()` seam，把 runtime result 转 catalog、inherited config resolution 与 server catalog merge 收束到同一个 modelConfig owner path。
- 将 `resolveInheritedModelConfigResolution()` 内的 inherited-config source 选择、scoped supplement 与 provider availability layer 拆成同文件内的集中 helper，保留 public resolution shape 不变。
- 将 `assembleModelCatalog()` 的 filtered `effective` projection 收束到 `projectEffectiveCatalog()`，继续明确 `baseEffective` 保留基础事实、`effective` 只包含当前可用 provider/model。
- 让 `src/core/config/ModelConfigService.ts` 的 `loadServerState()` 只负责读取 IO 输入并调用 modelConfig assembly seam，同时删除 service 内残留的重复 provider-id 收集 helper。
- 更新 `tests/unit/core/config/modelConfig.test.ts`，覆盖新的 server catalog state assembly seam；同步刷新直接相关模块文档。

## 2. modelConfig assembly seam 收益

- `ModelConfigService` 不再直接串联 `catalogFromRuntimeResult()`、`resolveInheritedModelConfigResolution()` 与 `buildServerCatalog()`，服务层职责进一步收缩为 IO 编排、日志与真实 provider probe。
- server catalog state assembly 的三个关键输出（`runtime`、`configResolution`、`server`）现在由 `modelConfig.ts` 统一产出，降低调用方误用 scoped/default/disk inherited config 的风险。
- provider resolution follow-up 继续集中：`effectiveProviderConfig`、server/current/effective provider enablement 判定与 `currentEnabledProviderIds` 仍来自同一个 resolution seam。
- `baseEffective` / `effective` 区分保持不变：插件侧 `disabledModelRefs` 与当前 provider 可用性只过滤 `effective`，不会削掉 `baseEffective` 的展示元数据。

## 3. 验收对照

- roadmap 要求的 supplement、effective projection 与 provider resolution follow-up residual 已继续收束到 `modelConfig.ts`。
- 未改变 `baseEffective` / `effective` 区分、provider layering、runtime server catalog 真值来源或 default model fallback 语义。
- 新增 focused test 证明 server catalog state seam 会同时保留 runtime truth、local-mode inherited supplement 与 metadata merge。

## 4. 验证

- `npm test -- tests/unit/core/config/modelConfig.test.ts tests/unit/core/config/ModelConfigService.test.ts`
- `npm test`
- `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M) npm run build`

验证结果：

- `npm test -- tests/unit/core/config/modelConfig.test.ts tests/unit/core/config/ModelConfigService.test.ts`：通过，`2 passed` suites；`30 passed` tests；用时 `0.648 s`
- `npm test`：通过，`276 passed, 276 total` suites；`1178 passed, 1178 total` tests；用时 `3.449 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604160208`

## 5. 部署

- 本轮代码变更命中 `src/core/config/**` 与测试/文档路径，未命中仓库规则列出的 deploy-relevant runtime paths。
- 因此本轮未执行 Test Vault 部署；最近 Test Vault 部署仍为 `R120`，`BUILD_ID` `autopilot-maintainability.202604160156`。

## 6. 文件变更

- `src/core/config/modelConfig.ts`
- `src/core/config/ModelConfigService.ts`
- `tests/unit/core/config/modelConfig.test.ts`
- `docs/modules/core/config/modelConfig.md`
- `docs/modules/core/config/ModelConfigService.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-456.md`

## 7. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R121` 标记为 `[DONE]`。
- 下一项 `R122 - Checkpoint after secondary core seams` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 `[NEXT]` 与最近验证状态。

## 8. 下一步

- 下一推荐切片：`R122 - Checkpoint after secondary core seams`
- 从 `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-round-roadmap.md` 入手，复盘 `R118-R121` 的 secondary core residual 收益，并决定进入 settings/main residual lane 前是否需要额外人工调整。

一句话总结第四百五十六阶段本轮：

> 第四百五十六阶段完成 `R121`，将 modelConfig server catalog state assembly、provider resolution follow-up 与 effective projection residual 继续收束到 `modelConfig.ts`，并把 queue 顺序推进到 `R122` 的 secondary core checkpoint。

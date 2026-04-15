# 可维护性改进：第四百八十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-479.md`
> **推进的 master-plan lane**: Maintainability / model config
> **完成的 roadmap queue item**: `R145 - Model config layering residual seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R145 - Model config layering residual seam`。范围只限 model config layering residual：沿 `modelConfig`、`ModelConfigService` 与直接相关测试，把 catalog merge、provider disable layering、`baseEffective` / filtered `effective` projection 与 probe planning 压回相邻 config owner，没有改变 local/server catalog precedence、disabled provider/model layering、directory-scoped config lookup、Windows directory normalization 或 title-generation catalog filtering。

## 1. 本轮范围

- 将原 `src/core/config/modelConfig.ts` 收束成稳定 deep-path barrel，并把共享解析/清洗、catalog 构建、availability layering、catalog assembly/probe planning、selection fallback 分别压回相邻 owner。
- 保持 `src/core/config/modelConfig.ts` 的导入面不变，让 `ModelConfigService`、settings picker 与 chat runtime 无需改深路径调用。
- 将 `tests/unit/core/config/modelConfig.test.ts` 拆成 availability/inherited 与 catalog/selection 两个 focused suites，并将 `ModelConfigService` 的 catalog/inheritance 与 runtime/probe 场景拆到两个 suites，消化 config lane 的 test max-lines residual。
- 更新直接相关 module docs，记录 `modelConfig` 现在是 barrel，新的 config owner 边界分别覆盖 shared/catalog/availability/assembly/selection。

## 2. Refactor 结果

- `src/core/config/modelConfig.ts` 从 `1223` 行收缩成 barrel；新增的 `modelConfigShared.ts`、`modelConfigCatalog.ts`、`modelConfigAvailability.ts`、`modelConfigAssembly.ts` 与 `modelConfigSelection.ts` 分别承接单一 config 责任，全部保持在 lint file-length 限制内。
- `ModelConfigService` 继续只做 IO 编排、日志与真实 probe 调用；catalog merge、inherited resolution、probe plan 与 selection fallback 不再共享一个 monolith helper 文件。
- `tests/unit/core/config/modelConfig.test.ts` 与 `tests/unit/core/config/ModelConfigService.test.ts` 的 `max-lines` / `max-lines-per-function` residual 被 focused split 吸收；新增的 focused suites 保留原断言覆盖，不改变测试语义。
- full lint 从 `0 errors / 48 warnings` 收敛到 `0 errors / 44 warnings`，完成 model config lane 的可量化下降。

## 3. 回归边界

- `assembleServerModelCatalog()` 仍然以 directory-scoped runtime provider 集合作为 server catalog 真值，不把 metadata-only provider 扩进服务器目录。
- `assembleModelCatalog()` 仍然严格区分 `baseEffective` 与 filtered `effective`，且 `disabledModelRefs` 只在插件侧过滤模型。
- inherited provider availability resolution 仍保留 local-disk 优先、remote default-scope fallback、project override 可清空/收窄 inherited disable arrays 的语义。
- provider availability probe 仍保留 project-disabled 优先于 server-disabled、默认测试模型优先级与真实 `probeProviderResponse()` 调用门槛。

## 4. 验证

- Focused tests: `npm test -- modelConfig.test.ts modelConfigCatalog.test.ts ModelConfigService.test.ts ModelConfigServiceRuntimeScope.test.ts`
- Lint metrics: `npm run lint -- --format unix`
- Full test: `npm test`
- Build: `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M); echo "$BUILD_ID"; BUILD_ID=$BUILD_ID npm run build`

验证结果：

- focused tests：通过，`4 passed, 4 total` suites；`30 passed, 30 total` tests
- `npm run lint -- --format unix`：通过，`0 errors / 44 warnings`
- `npm test`：通过，`285 passed, 285 total` suites；`1189 passed, 1189 total` tests；用时 `5.758 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604160734`

## 5. 部署

- 本轮只修改 `src/core/config/**`、tests 与 docs，未命中 deploy-relevant paths。
- 因此本轮未执行 Test Vault 部署；最近一次部署仍为 `R144`，`BUILD_ID` `autopilot-maintainability.202604160711`。

## 6. 文件变更

- `src/core/config/modelConfig.ts`
- `src/core/config/modelConfigShared.ts`
- `src/core/config/modelConfigCatalog.ts`
- `src/core/config/modelConfigAvailability.ts`
- `src/core/config/modelConfigAssembly.ts`
- `src/core/config/modelConfigSelection.ts`
- `tests/unit/core/config/modelConfig.test.ts`
- `tests/unit/core/config/modelConfigCatalog.test.ts`
- `tests/unit/core/config/ModelConfigService.test.ts`
- `tests/unit/core/config/ModelConfigServiceRuntimeScope.test.ts`
- `docs/modules/core/config/modelConfig.md`
- `docs/modules/core/config/modelConfigShared.md`
- `docs/modules/core/config/modelConfigCatalog.md`
- `docs/modules/core/config/modelConfigAvailability.md`
- `docs/modules/core/config/modelConfigAssembly.md`
- `docs/modules/core/config/modelConfigSelection.md`
- `docs/modules/core/config/ModelConfigService.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-480.md`

## 7. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R145` 标记为 `[DONE]`。
- 下一项 `R146 - Startup locale/settings normalization residual seam` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新 lint 基线、最近验证与当前 queue 入口。

## 8. 下一步

- 下一推荐切片：`R146 - Startup locale/settings normalization residual seam`
- 从 `src/main.ts`、`src/core/types/settings.ts`、`src/i18n/locales/en.ts`、`src/i18n/locales/zh.ts`、`tests/unit/main/themeSettingsMigration.test.ts` 与 `tests/unit/core/types/settings.test.ts` 入手，沿 startup、settings normalization 与 locale/theme bootstrap residual 收束现有 owner；本轮不要改变 conversation preload、settings migration/defaults、locale keys、theme/background startup 或 plugin load order。

一句话总结第四百八十阶段本轮：

> 第四百八十阶段完成 `R145`，把 model config monolith 收束成 shared/catalog/availability/assembly/selection 相邻 owner，并拆分 config focused suites，使 lint 从 `48` 收敛到 `44` warnings，并将 queue 推进到 `R146`。

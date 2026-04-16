# 可维护性改进：第四百阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-399.md`
> **推进的 master-plan lane**: Warning cleanup / config-core
> **完成的 roadmap queue item**: `R65 - Warning cleanup batch B (config and opencode core)`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R65 - Warning cleanup batch B (config and opencode core)`。范围保持在 config/opencode core warning cleanup：把 `OpenCodeMessageNormalizationMapper` 的 context/OMO seam 收束到邻近厚 owner，缩小 `modelConfig` 与 mapper 的直接相关 tests scope，并只做恢复 live lint `0 errors` 所需的 import-sort 修复；未混入 model merge 语义、message normalization 结果、external API shape 或 queue 之外的 freestyle cleanup。

## 1. 本轮范围

- 新增 `src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`，承接 `OpenCodeMessageNormalizationMapper` 中的 context attachment、inline Read tool context 与 OMO normalization lifecycle。
- 更新 `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`，保留 question normalization 与 tool/content seam，同时委托新的 context/OMO owner，受控消化 mapper 的 `max-lines` warning。
- 更新 `tests/unit/core/config/modelConfig.test.ts` 与 `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`，把超长 describe scope 拆成更窄的同文件 suite，消化两处直接相关 test 的 `max-lines-per-function` warning。
- 更新 `docs/modules/core/opencode/OpenCodeMessageNormalizationMapper.md`、新增 `docs/modules/core/opencode/OpenCodeMessageContextOmoAssembler.md`，并同步 `docs/modules/README.md` 的模块计数与 tree。
- 更新 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md`，推进 queue、最新 lint 基线与下一切片指向。

## 2. R65 收益

- `OpenCodeMessageNormalizationMapper` 不再直接铺开 context attachment / inline Read / OMO metadata 的整段 hydration 细节，消息归一化职责更接近 “tool/content + question normalization” 单一 owner。
- `modelConfig` 与 mapper focused tests 现在按更窄职责分组，不再把所有 config-core 断言都压在一个超长 describe 中。
- live lint 基线从文档记录的 `0 errors / 87 warnings` 降到 `0 errors / 84 warnings`，完成 roadmap 对 “config/opencode core” warning cleanup B 的量化下降要求。

## 3. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R65` 标记为 `[DONE]`。
- `docs/status/maintainability-round-roadmap.md` 已将 `R66 - Warning cleanup batch C (server, icons, and heavy tests)` 提升为新的 `[NEXT]`。
- 下一推荐切片：`R66 - Warning cleanup batch C (server, icons, and heavy tests)`。

## 4. 验证

- Focused:
  - `npm test -- tests/unit/core/config/modelConfig.test.ts tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`：通过，`2 passed, 2 total` suites；`23 passed, 23 total` tests
  - `npm run lint`：通过，`0 errors / 84 warnings`
- Full:
  - `npm test`：通过，`262 passed, 262 total` suites；`1126 passed, 1126 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604150615`

## 5. 部署

- 本轮变更未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 6. 文件变更

- `src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`
- `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
- `tests/unit/core/config/modelConfig.test.ts`
- `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`
- `docs/modules/core/opencode/OpenCodeMessageContextOmoAssembler.md`
- `docs/modules/core/opencode/OpenCodeMessageNormalizationMapper.md`
- `docs/modules/README.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-400.md`

## 7. 下一步

- 继续按 queue 执行 `R66 - Warning cleanup batch C (server, icons, and heavy tests)`。
- 从 `src/core/opencode/ServerManager.ts`、`src/utils/icons/ProviderIconService.ts` 与其 heavy tests 开始，在保持 server lifecycle 与 icon fallback/cache 语义不变的前提下继续压低 warning baseline。

一句话总结第四百阶段本轮：

> 第四百阶段完成 `R65`，把 `OpenCodeMessageNormalizationMapper` 的 context/OMO hydration seam 委托给新的邻近 owner、缩小 config-core focused test scope，并在测试与构建通过后把 live lint 基线压到 `0 errors / 84 warnings`，将 maintainability queue 顺延到 `R66`。

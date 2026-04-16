# 可维护性改进：第三百七十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-372.md`
> **推进的 master-plan lane**: Lint housekeeping / unblocker
> **完成的 roadmap queue item**: `R38 - Import-sort lint housekeeping`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R38 - Import-sort lint housekeeping`。范围只修复 `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts` 与 `src/core/opencode/OpenCodeService.ts` 的 `simple-import-sort/imports` 错误，没有改动 catalog query、service façade、SDK-first / legacy fallback 或 scoped-directory 语义，也没有展开新的 `OpenCodeService` maintainability 拆分。

## 1. 本轮范围

- 只调整 `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts` 与 `src/core/opencode/OpenCodeService.ts` 的 import 排序、分组与 type-only import 位置，清除 `R36` 遗留的两条 lint error。
- 同步更新 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md`，将 `R38` 标记为完成，并把 `R39` 提升为新的 `[NEXT]`。
- 新增 `docs/status/maintainability-phase-373.md` 记录本轮结果；没有读取或修改 `docs/modules/**`，因为本轮没有模块边界变化。

## 2. 结果

- `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`：import 顺序恢复为 lint 期望的稳定分组，未改动 coordinator 逻辑。
- `src/core/opencode/OpenCodeService.ts`：import 分组与 type-only import 形式恢复一致，未改动服务运行语义。
- maintainability queue 已从一次性 unblocker 回到厚切口：新的 `[NEXT]` 为 `R39 - OpenCodianSettings server section owner seam`。
- 当前 live lint 基线恢复为 `0 errors / 89 warnings`。

## 3. 验证

- Focused:
  - `npx eslint --fix src/core/opencode/OpenCodeCatalogQueryCoordinator.ts src/core/opencode/OpenCodeService.ts`
  - `npm test -- --runTestsByPath tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
- Full:
  - `npm run lint`：通过，`0 errors / 89 warnings`
  - `npm test`：通过，`252 passed, 252 total` suites；`1075 passed, 1075 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604142150`

## 4. 部署

- 本轮修改命中 `src/core/opencode/` 与 `docs/status/`，未命中仓库约定的 Test Vault 部署路径。
- 因此未执行 Test Vault 部署；`dist/main.js` 仅作为 build 产物验证。

## 5. 文件变更

- `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
- `src/core/opencode/OpenCodeService.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-373.md`

## 6. 下一步

- 下一推荐切片：`R39 - OpenCodianSettings server section owner seam`
- 执行时继续以 `docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md` 为入口，只处理 `addServerSettings` 的完整 section lifecycle 收束。

一句话总结第三百七十三阶段本轮：

> 第三百七十三阶段完成 `R38` import-sort housekeeping，恢复 lint error 为零，并把 maintainability autopilot 顺利切回 `OpenCodianSettings` 的 server section 厚切口。

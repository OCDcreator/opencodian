# 可维护性改进：第四百八十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-488.md`
> **完成的 roadmap queue item**: `R154 - OpenCodeService coordinator stack defragmentation seam`

## 1. 本轮范围

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R154 - OpenCodeService coordinator stack defragmentation seam`。范围只限 `OpenCodeService` 相邻 opencode owner 的过薄 query gateway seam：把 `OpenCodeQueryGateway` 的 provider/project/file/find/path/VCS/formatter/LSP 与 MCP status/auth surface 并回已有较厚 owner `OpenCodeCatalogQueryCoordinator`，同步删减 `OpenCodeService.ts` 的 direct import / constructor assembly / façade wiring；没有把碎片回灌到 `OpenCodeService.ts` 主文件本体，也没有改动 `OpenCodeServiceLifecycleCoordinator`、`OpenCodeSessionLifecycleCoordinator`、`OpenCodeSessionControlOrchestrator` 或 `ServerManager` 的行为边界。

## 2. Maintainability 结果

- 删除了 `1` 个 opencode 纯转发薄层源码文件：`src/core/opencode/OpenCodeQueryGateway.ts`
- 对应的 `1` 份模块文档与 `1` 份专属测试也已删除或回并：
  - 删除 `docs/modules/core/opencode/OpenCodeQueryGateway.md`
  - 删除 `tests/unit/core/opencode/OpenCodeQueryGateway.test.ts`
  - 新增 `tests/unit/core/opencode/OpenCodeCatalogQueryCoordinator.test.ts`，把原 query gateway surface 改为验证回并后的 catalog/query owner
- `OpenCodeCatalogQueryCoordinator` 现在同时拥有 directory-scoped config/tool-catalog lookup、MCP status/auth snapshot 写回，以及 provider/project/file/find/path/VCS/formatter/LSP query/admin SDK surface；不再额外挂一层 query gateway。
- `OpenCodeService` 的 direct coordinator assembly / import surface 明显收缩：构造函数不再单独装配 `queryGateway`，相关 public façade 统一直接委托给 `catalogQueries`；`src/core/opencode/OpenCodeService.ts` 行数从 `1454` 行降到当前实测的 `1437` 行。
- SDK-first / legacy fallback、directory scope、session-scoped abort/detach、managed server adoption/restart 与 sync-event bridge 语义保持不变；本轮只调整 broad query/admin owner 的落点。

## 3. 回归边界

- 不改变 `OpenCodeCatalogQueryCoordinator` 既有的 `config.providers()` / `provider.list()` / `config.get()` / `tool.*` 目录作用域语义。
- 不改变 provider auth、project/file/find/path/VCS/formatter/LSP 查询或 MCP status/auth 的输入输出语义，只改变其 owner 归属。
- 不改变 `OpenCodeService` 的 SDK-first / legacy fallback、managed server adoption/restart、auth fallback、session-scoped abort/detach、sync-event bridge 或 streaming completion 行为。
- 不改变 deploy-relevant 路径、glass/demo 行为或 `OpenCodianView` chat runtime。

## 4. 验证

- Focused test: `npm test -- OpenCodeCatalogQueryCoordinator OpenCodeService.sdkCompat`
- Full test: `npm test`
- Build: `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M); echo "$BUILD_ID"; BUILD_ID="$BUILD_ID" npm run build`

结果：

- Focused test：通过，`3 passed, 3 total` suites；`6 passed, 6 total` tests。
- Full test：通过，`286 passed, 286 total` suites；`1190 passed, 1190 total` tests。
- Build：通过，最新 `BUILD_ID` 为 `autopilot-maintainability.202604161502`。

## 5. 部署

- 本轮只触及 `src/core/opencode/**`、相关 tests 与 `docs/modules/**` / `docs/status/**`；未命中仓库定义的 Test Vault deploy-relevant paths，因此未执行 Test Vault 部署。

## 6. 文件变更

- `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeQueryGateway.ts`（删除）
- `tests/unit/core/opencode/OpenCodeCatalogQueryCoordinator.test.ts`
- `tests/unit/core/opencode/OpenCodeQueryGateway.test.ts`（删除）
- `docs/modules/core/opencode/OpenCodeCatalogQueryCoordinator.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeQueryGateway.md`（删除）
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-489.md`

## 7. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R154` 标记为 `[DONE]`。
- 下一项 `R155 - Heavy tests and glass/demo hotspot closeout after core-owner recovery` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 queue、最新验证与 opencode defragmentation 收益。

## 8. 下一步

- 下一推荐切片：`R155 - Heavy tests and glass/demo hotspot closeout after core-owner recovery`。
- 仅沿 roadmap 已列出的 heavy tests / glass/demo 热点做最小 justified cleanup；如果 hotspot 已自然下降，则改做最小 checkpoint note，不自动切回新的 owner seam。

> 第四百八十九阶段完成 `R154`，把 `OpenCodeQueryGateway` 并回 `OpenCodeCatalogQueryCoordinator`，删除 `1` 个源码薄层、`1` 份模块文档与 `1` 份专属测试，并把 roadmap 推进到 `R155`。

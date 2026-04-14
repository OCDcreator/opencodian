# 可维护性改进：第三百七十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-370.md`
> **推进的 master-plan lane**: Maintainability / OpenCodeService residual seam
> **完成的 roadmap queue item**: `R36 - OpenCodeService residual seam feasibility`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R36 - OpenCodeService residual seam feasibility`。本轮没有走 docs-only skip，而是在 `src/core/opencode/OpenCodeService.ts` 中确认 directory-scoped provider/model/config lookup 与 tool-catalog cache/scope 管理仍然能形成一个较厚 owner，于是把这组 residual seam 收束到新的 `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`。整个改动保持 `OpenCodeService` 作为对外 façade，没有改变 SDK-first / legacy HTTP/SSE fallback、scoped-directory config semantics、managed server adoption/restart 规则或 public API shape。

## 1. 本轮范围

- 新增 `OpenCodeCatalogQueryCoordinator`，集中承接 `getAvailableModels()`、`getProviderDirectory()`、`getResolvedModelConfig()`、`refreshToolIds()`、`listTools()`、tool identity context 与 tool schema cache scope invalidation。
- 将 `OpenCodeService` 中与 directory-scoped config/tool-catalog 相关的 normalization、fallback、cache key 与 scope invalidation 逻辑迁移到该 coordinator，服务层保留 façade、host seam 与其他 runtime owner 协调职责。
- 保留 `OpenCodeCatalogStateStore` 作为 registry ids、tool schema cache、observed external tools 与 MCP snapshot 的状态 owner；新 coordinator 只集中调度 transport/scope lifecycle，不回搬已有 state ownership。
- 更新直接相关 module docs：新增 `docs/modules/core/opencode/OpenCodeCatalogQueryCoordinator.md`，并同步 `docs/modules/core/opencode/OpenCodeService.md` 对新的 ownership 边界描述。

## 2. Owner seam 收益

- `OpenCodeService` 不再直接铺开 directory-scoped config/provider/tool catalog 的 SDK-vs-legacy transport、debug logging、tool schema cache key 与 scope invalidation 细节。
- provider/model runtime 目录、connect-provider 目录、resolved model config 与 tool catalog lifecycle 现在拥有单独的较厚 owner，而不是继续散落成多个私有 helper。
- tool identity context、runtime observed tool names 与 tool schema cache 继续复用 `OpenCodeCatalogStateStore`，因此历史 message hydration、stream tool classification 与 catalog snapshot 语义保持不变。
- `OpenCodeService` 的 public API、`OpenCodeSdkFacade` 的 request option injection/unwrap/error normalization、以及 `ServerManager` 的 lifecycle 规则保持不变。

## 3. 队列推进

- 将 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md` 同步更新为 `R36` 已完成。
- 按 roadmap 队列规则把 `R37 - Maintainability checkpoint` 提升为新的 `[NEXT]`。
- `R37` 仍是本批最后的 checkpoint；完成后若没有新的人工追加 queue item，必须重新停回“当前没有可自动执行的 `[NEXT]`”。

## 4. 验证

- Focused:
  - `npm test -- tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`：通过，`2 passed, 2 total` suites；`98 passed, 98 total` tests
- Full:
  - `npm test`：通过，`252 passed, 252 total` suites；`1075 passed, 1075 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604142042`

## 5. 部署

- 本轮代码变更命中 `src/core/opencode/` 与 `docs/status/` / `docs/modules/`，没有命中本轮要求的 Test Vault deploy-relevant 路径。
- 因此未执行 Test Vault 部署；`deploy_ran=false`。

## 6. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeCatalogQueryCoordinator.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-371.md`

## 7. 下一步

- 当前可自动执行的 `[NEXT]` 是 `R37 - Maintainability checkpoint`。
- 下一轮应只复盘 `R33-R36` 的 owner 收束收益、验证成本与下一批建议，不得自动扩展 `R38+` 或回切 warning cleanup。

一句话总结第三百七十一阶段本轮：

> 第三百七十一阶段把 `OpenCodeService` 的 directory-scoped config/tool-catalog residual seam 收束到新的 `OpenCodeCatalogQueryCoordinator`，保持服务 façade 与运行语义稳定，并将 maintainability 自动队列推进到 `R37 - Maintainability checkpoint`。

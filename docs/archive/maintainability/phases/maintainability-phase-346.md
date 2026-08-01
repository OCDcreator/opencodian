# 可维护性改进：第三百四十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-345.md`
> **推进的 master-plan lane**: OpenCodeService `broad query gateway`
> **完成的 roadmap queue item**: `R31 - Conditional query gateway`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R31 - Conditional query gateway`。评估后确认 provider auth、project/file/find/path/VCS/formatter/LSP 与 MCP status/auth 这组 query/admin APIs 可以形成一个明显较厚 owner，因此本轮没有跳过；新 owner 统一落在 `OpenCodeQueryGateway`，`OpenCodeService` 继续保留对外 façade。

## 1. 本轮范围

- 新增 `src/core/opencode/OpenCodeQueryGateway.ts`
  - 集中承接 MCP status、server add/connect/disconnect 与 auth start/callback/authenticate/remove
  - 集中承接 provider auth / OAuth、project、file、find、path、VCS、formatter 与 LSP query/admin wrapper
  - 通过 host seam 复用 `OpenCodeCatalogStateStore` 的 MCP status normalization/writeback，避免把 snapshot owner 搬出 catalog store
- 缩减 `src/core/opencode/OpenCodeService.ts`
  - 新增 `queryGateway` 内部 owner wiring
  - `refreshMcpServerStatus()`、`getMcpStatus()`、MCP auth/server methods、provider/project/file/find/path/VCS/formatter/LSP methods 改为委托给 gateway
  - 保持 `OpenCodeService` 作为上层唯一公开入口
- 补充 focused coverage
  - 新增 `tests/unit/core/opencode/OpenCodeQueryGateway.test.ts`
  - 扩展 `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`，覆盖服务 façade 仍暴露 broad query/admin wrapper
- 更新直接相关模块文档
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodeQueryGateway.md`
- 推进 maintainability 路线文档
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`

## 2. 本轮刻意没有动的边界

- 没有改动 `OpenCodeSdkFacade`；SDK request option injection、response unwrapping 与 error normalization 继续集中在 facade
- 没有改动 `ServerManager` 或本地 managed server 生命周期
- 没有把 broad gateway 再拆成 provider/file/find/MCP auth 等多个薄 wrapper
- 没有改动 session lifecycle、session control、question/permission negotiation、streaming runtime 或 model catalog/config fallback 语义
- 没有部署到 Test Vault；本轮命中的代码路径不在 AGENTS 约定的 deploy-relevant runtime/style/settings 范围内

## 3. 验证

- Targeted:
  - `npm test -- OpenCodeQueryGateway.test.ts OpenCodeService.sdkCompat.test.ts`（首次运行暴露 focused test 调用名错误；修复后重跑通过）
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604141420`

## 4. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeQueryGateway.ts`
- `tests/unit/core/opencode/OpenCodeQueryGateway.test.ts`
- `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeQueryGateway.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-346.md`

## 5. 下一步建议

下一轮继续执行 roadmap 已晋升的 `[NEXT]`：`R32 - Gateway checkpoint`。该轮只做 checkpoint 复盘：统计 R28-R31 对 `OpenCodeService` 的 ownership 缩减效果、评估剩余 session/config/query gateway 是否仍有继续拆分价值，并在完成后暂停等待人工确认，不自动扩展 R33+。

一句话总结第三百四十六阶段本轮：

> 第三百四十六阶段完成 R31，把 `OpenCodeService` 的 broad query/admin surface 收束到 `OpenCodeQueryGateway`，并将受控队列推进到 `R32 - Gateway checkpoint`。

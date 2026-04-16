# 可维护性改进：第四百四十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-445.md`
> **推进的 master-plan lane**: Maintainability / opencode diagnostics
> **完成的 roadmap queue item**: `R111 - OpenCodeService transient logging/error normalization seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R111 - OpenCodeService transient logging/error normalization seam`。范围限定在 `OpenCodeService` / `OpenCodeSdkFacade` 的 diagnostics seam、直接相关单测、直接关联模块文档与 maintainability 状态文档；没有提前进入 `R112` 的 checkpoint 复盘正文，也没有扩散到 streaming batch、settings 或 chat runtime。

## 1. 本轮范围

- 沿 `OpenCodeService` 现有 owner seam 收束 transient connectivity suppression、assistant/probe 错误文本整形与 assistant finalization debug payload logging。
- 把 prompt / stream / health follow-up 的 SDK error normalization 继续收回 `OpenCodeSdkFacade`，避免 service follow-up 再各自手写一份 structured error 提取逻辑。
- 保留错误归一化口径、logging 开关与 SDK facade 的 baseUrl/auth/directory 注入规则，不改 feature-flag 路由语义。
- 没有新增薄 helper / adapter / factory 文件；diagnostics seam 保持在现有 `OpenCodeService.ts` 与 `OpenCodeSdkFacade.ts` 邻域内。
- 因为 `OpenCodeSdkFacade` 与 `OpenCodeService` 的职责边界有直接收束，同步更新了直接相关模块文档。

## 2. 本轮改动

- `src/core/opencode/OpenCodeSdkFacade.ts` 新增共享 `extractSdkErrorMessage()` / `describeSdkError()` helper，并让 `normalizeSdkError()` 复用同一套 message/status 解析规则。
- `src/core/opencode/OpenCodeService.ts` 引入 service-local `OpenCodeServiceDiagnostics`，集中 transient offline 日志抑制、assistant/probe error shaping 与 assistant finalization debug logging。
- `src/core/opencode/OpenCodeService.ts` 的 SDK prompt、SDK stream subscribe/promptAsync 与 SDK health follow-up 继续回到 façade seam，raw SDK non-Error rejection 不再把 object shape 直接泄漏给 prompt/probe follow-up。
- `tests/unit/core/opencode/OpenCodeSdkFacade.test.ts` 与 `tests/unit/core/opencode/OpenCodeService.sdkPromptTransport.test.ts` 新增 shared diagnostics/error-normalization 覆盖。
- `docs/modules/core/opencode/OpenCodeService.md` 与 `docs/modules/core/opencode/OpenCodeSdkFacade.md` 同步标记新的 diagnostics / shared helper 边界。

## 3. 验证

- `npm test -- OpenCodeSdkFacade OpenCodeService.sdkPromptTransport`
- `npm test`
- `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M) npm run build`

验证结果：

- targeted suites：通过，`2` 个 suites / `14` 个 tests 全部通过，用时 `0.422 s`
- `npm test`：通过，`276 passed, 276 total` suites；`1163 passed, 1163 total` tests；用时 `2.561 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604160031`

## 4. 部署

- 本轮修改位于 `src/core/opencode/`、`tests/unit/core/opencode/`、`docs/modules/core/opencode/` 与 maintainability 状态文档，未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 5. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSdkFacade.ts`
- `tests/unit/core/opencode/OpenCodeSdkFacade.test.ts`
- `tests/unit/core/opencode/OpenCodeService.sdkPromptTransport.test.ts`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeSdkFacade.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-446.md`

## 6. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R111` 标记为 `[DONE]`。
- 下一项 `R112 - Checkpoint after OpenCodeService residual seams` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 `[NEXT]`、最近验证与 checkpoint 入口。

## 7. 下一步

- 下一推荐切片：`R112 - Checkpoint after OpenCodeService residual seams`
- 从 `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-round-roadmap.md` 入手，复盘 `R108-R111` 的 service residual 收益、验证成本与 streaming lane 准备度，不提前进入 `R113` 的 streaming residual seam。

一句话总结第四百四十六阶段本轮：

> 第四百四十六阶段完成 `R111`，把 transient logging 与 shared error normalization follow-up 继续收束到 `OpenCodeService` diagnostics seam 和 `OpenCodeSdkFacade` helper 入口。

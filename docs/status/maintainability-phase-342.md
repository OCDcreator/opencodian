# 可维护性改进：第三百四十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-341.md`
> **推进的 master-plan lane**: Checkpoint
> **完成的 roadmap queue item**: `R27 - OpenCodeService checkpoint`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R27 - OpenCodeService checkpoint`。本轮没有开启新的代码重构，也没有自动扩展 `R28+`；只完成 R19-R26 批次复盘、热点指标统计与状态文档调整。目标是确认这一批对 `OpenCodeService` 的实际削弱幅度，并把 autopilot 状态切换回需要人工确认后再继续。

本轮刻意**没有**新增 `[QUEUED]` 或 `[NEXT]` 项。R27 完成后，当前受控队列已经结束；下一批 roadmap 必须由人工确认后再写入。

## 1. 本轮范围

- 复盘 R19-R26 phase 文档与当前 hotspot 指标
  - `src/core/opencode/OpenCodeService.ts`：当前 **2858** 行；R18 checkpoint baseline **4733** 行；累计减少 **1875** 行（约 **39.6%**）
  - 已迁出的八个 owner：`OpenCodeSyncEventRuntimeCoordinator`、`OpenCodeEventSubscriptionCoordinator`、`OpenCodeCatalogStateStore`、`OpenCodePromptRequestBuilder`、`OpenCodeContextPartSerializer`、`OpenCodeStreamingRuntimeCoordinator`、`OpenCodeStreamEventTransformer`、`OpenCodeMessageNormalizationMapper`
  - 相邻高风险 owner 保持稳定：`src/core/opencode/OpenCodeSdkFacade.ts` 当前 **257** 行，`src/core/opencode/ServerManager.ts` 当前 **1171** 行
- 更新 maintainability 状态文档
  - `docs/status/maintainability-master-plan.md` 改为 `[REVIEW_REQUIRED]`，明确 R19-R27 完成后等待人工确认
  - `docs/status/maintainability-round-roadmap.md` 将 `R27` 标记为 `[DONE]`，同时明确当前没有可自动执行的 `[NEXT]`
  - `docs/status/maintainability-lane-map.md` 改为暂停态，并把后续候选收束到待人工确认的 session/config/query gateway

## 2. Checkpoint 结论

### `OpenCodeService`

- R19-R26 已按计划迁出八块完整 ownership：sync-event runtime、open-code event runtime、tool/MCP catalog state、prompt request assembly、context/image request parts、streaming runtime state、stream event transform、message normalization。
- 当前 `OpenCodeService` 仍集中持有的高风险边界主要是：
  - SDK-first / legacy HTTP fallback transport 与 finish/fetch orchestration
  - session CRUD、fork/revert、assistant response 与 post-stream finalize
  - config/providers/provider-directory normalization 与 scoped-directory request wiring
  - MCP / permission / project / file / find / path / vcs / formatter / lsp 等广域 gateway wrapper
- 这些剩余职责更像跨域兼容门面，而不是适合继续无人值守拆成更多小块的低风险 ownership；如果继续自动推进，很容易把 session/config/query API 粉碎成新的薄 facade。

### 下一批决策

- **当前建议：到此暂停，等待人工确认。**
- 如果人工决定继续 maintainability，应该先手工设计新的 queue，明确 session/config/query gateway 是否还能按较厚 owner 收束，以及哪些 SDK-first / legacy fallback 语义绝不能在无人值守轮次中触碰。
- 在新的人工确认 queue 写入前，autopilot 不应自动创建或推进 `R28+`。

## 3. 刻意没有动的边界

- 没有修改任何 TypeScript runtime、tests、styles、manifest 或 bundled assets。
- 没有读取或更新 `docs/modules/**`，因为本轮没有新的模块边界变化。
- 没有部署到 Test Vault，因为变更仅命中 `docs/status/**`，未命中 deploy-relevant runtime/style/settings 路径。

## 4. 验证

- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604140208`

## 5. 文件变更

- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-342.md`

## 6. 下一步建议

当前没有自动下一轮。建议人工先确认是否还要继续处理 `OpenCodeService` 剩余的 session/config/query gateway；如果继续，先手工写出新的受控 queue，再恢复 autopilot。

一句话总结第三百四十二阶段本轮：

> 第三百四十二阶段完成 R27 checkpoint，确认 `OpenCodeService` 在 R19-R26 期间已显著收缩，并将 maintainability autopilot 切换回 [REVIEW_REQUIRED] 暂停态，等待人工确认后再决定是否继续 session/config/query gateway lane。

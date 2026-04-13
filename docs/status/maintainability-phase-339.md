# 可维护性改进：第三百三十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-338.md`
> **推进的 master-plan lane**: OpenCodeService `streaming runtime state`
> **完成的 roadmap queue item**: `R24 - Streaming runtime state coordinator`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R24 - Streaming runtime state coordinator`。目标是把 active stream registry、session-scoped abort controller、part type tracking，以及 `create/release/cancel/detach` 的运行时状态 ownership 从 `OpenCodeService` 收束到单一 coordinator，同时保持 `OpenCodeService` 继续作为 SDK-first / legacy fallback 的 transport 门面，不提前混入 R25 的 event→chunk transform。

## 1. 本轮范围

- 新增 `OpenCodeStreamingRuntimeCoordinator`
  - 持有 `activeStreams` registry，按 `sessionId` 隔离活动流
  - 通过 `OpenCodeStreamingRuntimeContext` 收束 `AbortSignal`、abort 行为与 `partId -> partType` 运行时映射
  - 集中同 session 替换、identity-safe release、`cancelStream()` 与 `detachStream()` 的差异语义
- 精简 `OpenCodeService`
  - `cancelStream()` / `detachStream()` 改为委托给 coordinator
  - legacy `sendMessage()`、SDK `sendMessageWithSdk()` 与 `consumeLegacyEventStream()` 改为消费 coordinator 提供的 runtime context
  - 删除 service 内部的 `activeStreams` 字段以及 `createActiveStreamContext()` / `releaseActiveStreamContext()` 实现
  - 保留 `createStreamingState()`、transport 调用、fallback 策略与 `handleStreamingEvent()` chunk 归一化；这些仍留给后续 R25
- 更新直接相关模块文档
  - `docs/modules/README.md`
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodeStreamingRuntimeCoordinator.md`

## 2. 兼容性边界

- 保持 SDK / legacy streaming transport 分流不变；本轮没有改 `sendMessage()`、`sendMessageWithSdk()`、`consumeLegacyEventStream()` 的入口语义。
- 保持 server abort 语义不变：`cancelStream()` 仍会 best-effort 调用 `abortSessionOnServer()`，`detachStream()` 仍只终止本地观察。
- 保持多 session 并发语义不变：每个 session 仍只保留一条活动流，同 session 新流会中断旧流，不同 session 的 runtime context 继续相互隔离。
- 保持 `handleStreamingEvent()` 的 part type 跟踪语义不变：`message.part.updated` / `message.part.delta` 之间仍共享同一条流的 reasoning/tool/text 分类信息。
- 刻意没有迁出 `StreamingState`、SSE parser 或 event→chunk transform；这些仍属于 R25，不在本轮混入。

## 3. Focused coverage

- 新增 `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts`
  - 覆盖并发 session 的 part type 隔离
  - 覆盖同 session replacement + identity-safe release
  - 覆盖 `cancelStream()` 与 `detachStream()` 的 server abort 差异
  - 覆盖空 session / 无活动流 guard
- 保留并通过 `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 证明 service 的 public cancel/detach 行为与 stream tool classification 保持不变
- 保留并通过 `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
  - 证明 service 的 SDK compat public API 行为保持不变

## 4. 验证

- Targeted:
  - `npm test -- tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604140123`

## 5. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/core/opencode/**`、`tests/unit/core/opencode/**` 与文档路径，未命中 AGENTS 规定需要部署的 `src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/` 或 `src/features/settings/`

## 6. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
- `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts`
- `docs/modules/README.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeStreamingRuntimeCoordinator.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-339.md`

## 7. 下一步建议

下一轮按 roadmap 当前 `[NEXT]` 执行：

- `R25 - Stream event transformer`

建议从 `OpenCodeService.ts` 里的 `handleStreamingEvent()`、`transformEventToChunks()`、`transformPartToChunks()` 与 `parseSSEEvents()` 开始，把 SDK/legacy 事件到 `StreamChunk` 的转换和 parser 收束到单一 transformer，但不要顺带改 SDK 首事件失败才 fallback 的现有策略。

一句话总结第三百三十九阶段本轮：

> 第三百三十九阶段完成 R24 streaming runtime state coordinator，把 `OpenCodeService` 的 active stream runtime registry、abort lifecycle 与 part type tracking 收束到 `OpenCodeStreamingRuntimeCoordinator`，并将 roadmap 推进到 R25。

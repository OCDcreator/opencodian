# 可维护性改进：第三百四十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-339.md`
> **推进的 master-plan lane**: OpenCodeService `stream event transform`
> **完成的 roadmap queue item**: `R25 - Stream event transformer`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R25 - Stream event transformer`。目标是把 SDK / legacy SSE event → chunk transform、part-aware delta routing 与 SSE parser 从 `OpenCodeService` 收束到单一 transformer owner，同时保持 `OpenCodeService` 继续负责 transport 分流、SDK 首事件失败才 fallback 到 legacy 的既有策略，以及最终 assistant message 补拉。

## 1. 本轮范围

- 新增 `OpenCodeStreamEventTransformer`
  - 收束 `handleStreamingEvent()` 的 session guard、usage / text / thinking / tool / permission / file / question chunk 映射
  - 保留 per-stream part type 感知，继续复用 `OpenCodeStreamingRuntimeContext` 里的 `partId -> partType` 状态
  - 收束 tool-use 去重、tool-result 补发、`session.error` / `session.idle` stop 判断
  - 收束 legacy `/event` 的 `parseSSEEvents()` buffer parser
  - 保留 `transformEventToChunks()` / `transformPartToChunks()` 作为通用 payload→chunk helper
- 精简 `OpenCodeService`
  - `consumeLegacyEventStream()`、`sendMessageWithSdk()` 与 `connectSSE()` 改为委托给 transformer
  - 删除 service 内部的 event→chunk transform、part-type helper 与 SSE parser 实现
  - 保留 streaming runtime registry、transport 分流、fallback 策略与 `finishStreamingResponse()` 收尾逻辑
- 更新直接相关模块文档
  - `docs/modules/README.md`
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`

## 2. 兼容性边界

- 保持 SDK 首事件失败才 fallback 到 legacy SSE 的现有策略不变；本轮没有改 `sendMessageWithSdk()` 的 transport decision。
- 保持 chunk schema 不变：`usage`、`text`、`thinking`、`tool_use`、`tool_result`、`permission_request`、`file_edited`、`question_request`、`error` 的形状保持原样。
- 保持 `OpenCodeStreamingRuntimeCoordinator` 的 ownership 不变：active stream registry、abort lifecycle 与 part type map 仍由 R24 coordinator 持有，transformer 只是消费当前流状态。
- 保持 question normalization、tool identity 与 debug log 的 service-level 语义不变；transformer 通过 host seam 复用原有 owner，而没有把这些规则搬成新的薄 facade。
- 刻意没有改 `finishStreamingResponse()`、message normalization 或 `ChatMessage` 组装；这些仍属于后续 R26。

## 3. Focused coverage

- 新增 `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
  - 覆盖 `question.asked` → `question_request` 的 host-seam 委托
  - 覆盖 `file.edited` chunk 映射
  - 覆盖 MCP tool kind、tool-use 去重、tool-result 补发
  - 覆盖 reasoning part type 记忆与 thinking delta routing
  - 覆盖 SSE parser 的 event-name 推断与 incomplete tail 保留
  - 覆盖通用 `transformEventToChunks()` / `transformPartToChunks()` helper
- 保留并通过 `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 证明 service 的 public streaming/fallback/error 行为保持不变
- 保留并通过 `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
  - 证明 service 的 SDK compat public API 行为保持不变

## 4. 验证

- Targeted:
  - `npm test -- tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604140139`

## 5. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/core/opencode/**`、`tests/unit/core/opencode/**` 与文档路径，未命中 AGENTS 规定需要部署的 `src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/` 或 `src/features/settings/`

## 6. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeStreamEventTransformer.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
- `docs/modules/README.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-340.md`

## 7. 下一步建议

下一轮按 roadmap 当前 `[NEXT]` 执行：

- `R26 - Message normalization mapper`

建议从 `OpenCodeService.ts` 里的 `openCodeMessageToChatMessage()` 附近开始，把 `ChatMessage` 归一化、context attachment 提取、tool metadata / OMO 处理收束到单一 mapper，但不要顺带改 `ChatMessage` 形状或 UI 层的 tool/icon summary 规则。

一句话总结第三百四十阶段本轮：

> 第三百四十阶段完成 R25 stream event transformer，把 `OpenCodeService` 里的 SDK / legacy stream event→chunk transform、part-aware delta routing 与 SSE parser 收束到 `OpenCodeStreamEventTransformer`，并将 roadmap 推进到 R26。

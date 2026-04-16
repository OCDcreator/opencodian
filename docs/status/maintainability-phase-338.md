# 可维护性改进：第三百三十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-337.md`
> **推进的 master-plan lane**: OpenCodeService `context / image request parts`
> **完成的 roadmap queue item**: `R23 - Context part serializer`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R23 - Context part serializer`。目标是把 `buildPromptRequestParts()`、`createPromptContextPart()` 与本地/远程 context、image part 序列化从 `OpenCodeService` 收束到单一 serializer，同时保持 `OpenCodeService` 继续作为 SDK-first / legacy fallback 的对外 transport 门面，不混入 R24 的 streaming runtime state。

## 1. 本轮范围

- 新增 `OpenCodeContextPartSerializer`
  - 持有 prompt 输入文本、context items、images 的 request-part 组装顺序
  - 统一负责 local file context part、remote synthetic text part、selection `source.text` 与 image data URL part 序列化
  - 继续通过 host seam 读取当前 server mode 与 vault path，不直接持有 `OpenCodeService` settings 副本
- 精简 `OpenCodeService`
  - `requestAssistantResponse()`、legacy `sendMessage()` 与 `sendMessageWithSdk()` 改为委托给 serializer 生成 request parts
  - 删除 service 内部的 `buildPromptRequestParts()` 与 `createPromptContextPart()`
  - 保留 prompt option builder、stream runtime、event transform 与 message normalization 边界，明确与 R22 / R24-R26 分离
- 更新直接相关模块文档
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodePromptRequestBuilder.md`
  - `docs/modules/core/opencode/OpenCodeContextPartSerializer.md`
  - `docs/modules/core/opencode/types.md`
  - `docs/modules/README.md`

## 2. 兼容性边界

- 保持 `OpenCodeService` 对外 API 门面和 SDK / legacy transport 分流不变；本轮没有改 `requestAssistantResponse()` / `sendMessage()` / `sendMessageWithSdk()` 的入口语义。
- 保持 context tag 文本格式继续由 `buildObsidianContextTag()` 生成，没有改 remote synthetic text 内容。
- 保持 local mode 继续通过 `resolveContextPath()` + `toFileContextUrl()` 生成跨平台稳定的 `file://` URL，Windows vault path normalization 语义不变。
- 保持 remote mode 继续拒绝 binary context、缺失 `textSnapshot` 和超过 `64 * 1024` 字节的文本快照。
- 保持 prompt option assembly 继续留在 `OpenCodePromptRequestBuilder`，没有把 builder 与 serializer 混成单个 owner。

## 3. Focused coverage

- 新增 `tests/unit/core/opencode/OpenCodeContextPartSerializer.test.ts`
  - 覆盖本地 file/selection/image part 顺序与 Windows-style `file://` URL 序列化
  - 覆盖 remote synthetic text part 的 context tag 与 metadata
  - 覆盖 remote binary、缺失 `textSnapshot`、超限文本的 guard
- 保留并通过 `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 证明 `OpenCodeService` 继续通过原有 public API 消费 request parts
- 保留并通过 `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
  - 证明 service 的 SDK compat public API 行为保持不变

## 4. 验证

- Targeted:
  - `npm test -- tests/unit/core/opencode/OpenCodeContextPartSerializer.test.ts tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604140105`

## 5. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/core/opencode/**`、`tests/unit/core/opencode/**` 与文档路径，未命中 AGENTS 规定需要部署的 `src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/` 或 `src/features/settings/`

## 6. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeContextPartSerializer.ts`
- `tests/unit/core/opencode/OpenCodeContextPartSerializer.test.ts`
- `docs/modules/README.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodePromptRequestBuilder.md`
- `docs/modules/core/opencode/OpenCodeContextPartSerializer.md`
- `docs/modules/core/opencode/types.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-338.md`

## 7. 下一步建议

下一轮按 roadmap 当前 `[NEXT]` 执行：

- `R24 - Streaming runtime state coordinator`

建议从 `OpenCodeService.ts` 里的 `activeStreams`、`createActiveStreamContext()`、`releaseActiveStreamContext()`、`cancelStream()` 与 `detachStream()` 开始，把 session-scoped abort controller / runtime registry 收束到单一 coordinator，但不要顺带混入 R25 的 event→chunk transform。

一句话总结第三百三十八阶段本轮：

> 第三百三十八阶段完成 R23 context part serializer，把 `OpenCodeService` 的 context/image request-part serialization 收束到 `OpenCodeContextPartSerializer`，并将 roadmap 推进到 R24。

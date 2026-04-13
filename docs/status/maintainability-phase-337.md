# 可维护性改进：第三百三十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-336.md`
> **推进的 master-plan lane**: OpenCodeService `prompt request assembly`
> **完成的 roadmap queue item**: `R22 - Prompt request builder`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R22 - Prompt request builder`。目标是把 SDK prompt parameters、legacy shared prompt options、allowed-tools / output-format / variant / reasoning 映射从 `OpenCodeService` 收束到单一 builder，同时保持 `OpenCodeService` 继续作为 SDK-first / legacy fallback 的对外 transport 门面，不混入 R23 的 context/image request-part serialization。

## 1. 本轮范围

- 新增 `OpenCodePromptRequestBuilder`
  - 持有默认 provider/model 回退、allowed-tools 记录、shared prompt options、SDK output format 与 legacy stream model options 组装
  - 统一负责 `requestAssistantResponse()`、legacy `prompt_async` 与 SDK `prompt/promptAsync` 的 prompt option assembly
  - 继续通过 host seam 观察 runtime tool names，不直接持有 catalog state
- 精简 `OpenCodeService`
  - `requestAssistantResponse()`、`sendMessage()`、`sendMessageWithSdk()` 改为委托给 builder 生成 SDK / legacy payload
  - 删除 service 内部的 `buildSdkPromptParameters()`、`buildAllowedToolsRecord()`、`buildSharedPromptOptions()`、`resolveLocalOutputFormat()`、`resolveSdkOutputFormat()`、`resolveSdkVariant()`
  - 保留 `buildPromptRequestParts()` / `createPromptContextPart()` 和 transport 分流，明确与 R23 保持边界
- 更新直接相关模块文档
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodePromptRequestBuilder.md`
  - `docs/modules/README.md`

## 2. 兼容性边界

- 保持 `OpenCodeService` 对外 API 门面和 SDK / legacy transport 分流不变；本轮没有改 `sendMessage()` / `requestAssistantResponse()` 的入口语义。
- 保持 SDK 路径继续忽略 `thinkingBudget` payload 写入，只记录 debug log；没有把它提前并入 SDK v2 prompt 参数。
- 保持 legacy `/session/:id/message` 仍不写 `model.options`，同时 legacy `/session/:id/prompt_async` 继续写入 `reasoningEffort` / `thinkingBudget` 到 `model.options`。
- 保持 `buildPromptRequestParts()`、`createPromptContextPart()`、本地/远程 context 及 image serialization 仍留在 `OpenCodeService`，不提前混入 R23。

## 3. Focused coverage

- 新增 `tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts`
  - 覆盖 SDK prompt parameter 组装、default model fallback、allowed-tools/runtime-tool observation
  - 覆盖 legacy `/message` 保持无 async-only `model.options`
  - 覆盖 legacy `/prompt_async` 的 reasoning / thinking model option 映射
- 保留并通过 `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
  - 证明 `OpenCodeService` 继续通过原有 public API 包装 SDK compat 行为
- 保留并通过 `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 证明 SDK prompt / promptAsync integration 仍按既有 shared prompt option 语义工作

## 4. 验证

- Targeted:
  - `npm test -- tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts tests/unit/core/opencode/OpenCodeService.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604140054`

## 5. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/core/opencode/**`、`tests/unit/core/opencode/**` 与文档路径，未命中 AGENTS 规定需要部署的 `src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/` 或 `src/features/settings/`

## 6. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodePromptRequestBuilder.ts`
- `tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts`
- `docs/modules/README.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodePromptRequestBuilder.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-337.md`

## 7. 下一步建议

下一轮按 roadmap 当前 `[NEXT]` 执行：

- `R23 - Context part serializer`

建议从 `OpenCodeService.ts` 中 `buildPromptRequestParts()`、`createPromptContextPart()` 与 image part 组装开始，把本地/远程 context、synthetic text 与 image serialization 收束到单一 serializer，但不要顺带混入 R24 的 streaming runtime state。

一句话总结第三百三十七阶段本轮：

> 第三百三十七阶段完成 R22 prompt request builder，把 `OpenCodeService` 的 SDK / legacy prompt option assembly 收束到 `OpenCodePromptRequestBuilder`，并将 roadmap 推进到 R23。

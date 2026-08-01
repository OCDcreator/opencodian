# 可维护性改进：第三百四十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-340.md`
> **推进的 master-plan lane**: OpenCodeService `message normalization`
> **完成的 roadmap queue item**: `R26 - Message normalization mapper`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R26 - Message normalization mapper`。目标是把 message → `ChatMessage` 归一化、question prompt normalization、context attachment 提取，以及 tool identity / OMO metadata 处理从 `OpenCodeService` 收束到单一 mapper owner，同时保持 `OpenCodeService` 继续提供 `openCodeMessageToChatMessage()` / `hydrateOpenCodeMessage()` 的公共门面，不改 `ChatMessage` 形状，也不把 tool icon / summary 规则搬回 UI。

## 1. 本轮范围

- 新增 `OpenCodeMessageNormalizationMapper`
  - 收束 `normalizeQuestionRequest()` / `normalizeQuestionPrompt()` 的结构化归一化
  - 收束 `openCodeMessageToChatMessage()` 的 text / reasoning / tool part → `contentBlocks` 组装
  - 收束 `file` part、Obsidian context tag、inline Read tool 文本的 `contextAttachments` 提取与去重
  - 收束历史消息的 builtin / MCP / custom tool kind 判定，以及 assistant `modelId` 规范化
  - 继续通过 `detectOmoMessageMeta()` 处理 OMO user injection / system reminder，并保持 notice 显示语义不变
- 精简 `OpenCodeService`
  - `openCodeMessageToChatMessage()` 改为委托给 mapper
  - `getPendingQuestions()` 与 `OpenCodeStreamEventTransformer` host seam 改为复用 mapper 的 question normalization / tool identity 逻辑
  - 删除 service 内部展开的 message hydration、inline Read tool 解析、context attachment 去重与 question prompt helper 实现
- 更新直接相关模块文档
  - `docs/modules/README.md`
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`
  - `docs/modules/core/opencode/OpenCodeMessageNormalizationMapper.md`

## 2. 兼容性边界

- 保持 `OpenCodeService` 的对外 hydration/fetch API 形状不变；调用方仍通过 service 门面读取 `ChatMessage`。
- 保持 `ChatMessage` schema、OMO metadata 结构、notice tone / display style 语义不变。
- 保持 tool identity 规则继续来自 `shared/toolIdentity`，没有把 icon / summary 规则搬回 UI。
- 保持 SDK-first / legacy fallback transport 不变；本轮没有改 `sendMessage()`、`sendMessageWithSdk()`、`requestAssistantResponse()` 或 SSE/SDK 事件路径。
- 保持 `OpenCodeCatalogStateStore`、`OpenCodeStreamEventTransformer` 与 `omoCompat` 的 owner 边界不变；mapper 只消费 tool identity context、question normalization 与 OMO helper。

## 3. Focused coverage

- 新增 `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`
  - 覆盖 question request trimming / option normalization
  - 覆盖 inline Read tool 文本 → `contextAttachments`
  - 覆盖历史 tool metadata 的 custom / MCP 判定
  - 覆盖内部 `structured_output` tool 过滤
  - 覆盖 OMO user injection 与 system reminder hydration
- 保留并通过：
  - `tests/unit/core/opencode/OpenCodeService.test.ts`
  - `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
  - 证明 service 公共 hydration / SDK compat 行为保持不变

## 4. 验证

- Targeted:
  - `npm test -- tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604140159`

## 5. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/core/opencode/**`、`tests/unit/core/opencode/**` 与文档路径，未命中 AGENTS 规定需要部署的 `src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/` 或 `src/features/settings/`

## 6. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
- `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`
- `docs/modules/README.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`
- `docs/modules/core/opencode/OpenCodeMessageNormalizationMapper.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-341.md`

## 7. 下一步建议

下一轮按 roadmap 当前 `[NEXT]` 执行：

- `R27 - OpenCodeService checkpoint`

建议只做 checkpoint 复盘：统计 R19-R26 对 `OpenCodeService` 的体量/owner 收缩，梳理仍留在 service 的 session/config/query gateway 风险，并在 phase 文档里明确本批结束后需要人工确认才能继续。

一句话总结第三百四十一阶段本轮：

> 第三百四十一阶段完成 R26 message normalization mapper，把 `OpenCodeService` 里的 question normalization、历史消息 → `ChatMessage` hydration、context attachment 提取，以及 tool identity / OMO metadata 处理收束到 `OpenCodeMessageNormalizationMapper`，并将 roadmap 推进到 R27 checkpoint。

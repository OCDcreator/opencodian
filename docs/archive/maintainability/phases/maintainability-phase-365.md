# 可维护性改进：第三百六十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-364.md`
> **推进的 master-plan lane**: Warning cleanup / opencode normalization hotspot
> **完成的 roadmap queue item**: `W13 - OpenCodeMessageNormalizationMapper complexity trim`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`W13 - OpenCodeMessageNormalizationMapper complexity trim`。范围只处理 `src/core/opencode/OpenCodeMessageNormalizationMapper.ts` 中 `openCodeMessageToChatMessage` 的复杂度 warning，并同步推进 maintainability 状态文档到下一队列项 `W14`；没有扩展到 `OpenCodeService`、OMO compat、stream event transformer、SDK facade，或新的 opencode owner 拆分。

## 1. 本轮范围

- 在 `src/core/opencode/OpenCodeMessageNormalizationMapper.ts` 内将 `openCodeMessageToChatMessage` 收束为同文件私有 helper 链，拆分出文本可见内容归一化、file/inline context attachment 汇总、tool call / tool content block 构建，以及 OMO 内容归一化逻辑。
- 保持既有 message normalization 顺序：先聚合 text/file/tool parts，再构建 thinking/tool/text content blocks，最后应用 OMO notice / user-injection 内容归一化。
- 未修改 `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`，因为现有 normalization tests 已覆盖 inline read-tool context、tool metadata、structured payload、OMO user injection 与 system reminder 路径；本轮没有模块边界变化，也没有读取或更新 `docs/modules/**`。

## 2. Warning cleanup 收益

- `openCodeMessageToChatMessage` 的 `complexity` warning 已移除，且 `OpenCodeMessageNormalizationMapper` 当前仅剩既有文件级 `max-lines` warning。
- full lint 已确认仓库基线从 `0 errors / 93 warnings` 降为 `0 errors / 92 warnings`。
- 本轮保持 OMO compatibility、context attachment 提取、pending toolCalls、hydrated tool_use content blocks 与 structured payload 保留语义不变。

## 3. 队列推进

- 将 `docs/status/maintainability-master-plan.md`、`docs/status/maintainability-round-roadmap.md` 与 `docs/status/maintainability-lane-map.md` 同步更新为 `W13` 已完成。
- 按 roadmap 队列规则把 `W14 - BackgroundTaskTimelineService collectSegments trim` 提升为新的 `[NEXT]`，保留 `W15` 为后续 `[QUEUED]`。
- 未新增 `W16+`，也没有恢复 `R33+` maintainability queue。

## 4. 验证

- Focused:
  - `npm test -- tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`
  - `npx eslint src/core/opencode/OpenCodeMessageNormalizationMapper.ts tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`
- Metrics:
  - `npm run lint`：通过，`0 errors / 92 warnings`
- Full:
  - `npm test`：通过，`251 passed, 251 total` suites；`1071 passed, 1071 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604141909`

## 5. 部署

- 本轮修改了 `src/core/opencode/OpenCodeMessageNormalizationMapper.ts` 与 maintainability 状态文档，未命中本仓库约定的 Test Vault 部署路径。
- 因此未执行 Test Vault 部署；`dist/main.js` 仅作为 build 产物验证。

## 6. 文件变更

- `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-365.md`

## 7. 下一步

- 当前可自动执行的 `[NEXT]` 是 `W14 - BackgroundTaskTimelineService collectSegments trim`。
- 下一轮应只处理 `src/features/chat/services/BackgroundTaskTimelineService.ts` 中 `collectSegments` 的复杂度 warning，并保持 background-task timeline、hydration 与 suppression 语义不变。

一句话总结第三百六十五阶段本轮：

> 第三百六十五阶段在 `OpenCodeMessageNormalizationMapper` 现有 owner 内收掉了 `openCodeMessageToChatMessage` 的 `complexity` warning，把 lint 基线降到 `0 errors / 92 warnings`，并将自动队列推进到 `W14 - BackgroundTaskTimelineService collectSegments trim`。

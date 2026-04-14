# Maintainability Master Plan

> **状态**: [CONFIRMED_NEXT_BATCH]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `W14 - BackgroundTaskTimelineService collectSegments trim` 已完成；当前 `[NEXT]` 是 `W15 - Warning cleanup checkpoint`。`W15` 完成后必须再次暂停并等待人工确认，不得自动恢复 `R33+` maintainability queue。

## 1. 当前判断

**当前判断：R28-R32、L1-L5 与 W1-W14 均已完成，文档主入口已确认 `W14` 收益并继续锁定后续路线。仓库当前 lint 基线保持 `0 errors / 91 warnings`；`W6-W10` 已把 warning 基线从 `103` 收敛到 `94`，`W12-W14` 再将其收敛到 `91`。当前只剩 `W15` checkpoint 可自动执行：复盘 `W12-W14` 的 warning cleanup 收益，然后重新停住等待下一次人工确认。**

当前最重要的事实：

- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 仍是长期 maintainability 热点，但是否继续 owner 收束仍需人工判断
- 剩余 warnings 主要集中在大型 owner 与长测试文件的 `max-lines-per-function` / `max-lines` / `complexity` / `max-params`
- 这意味着后续 autopilot 仍应优先做“受控小批次”，而不是自动切回大规模结构重构
- `W14` 已在 `BackgroundTaskTimelineService` 现有 owner 内收掉 `collectSegments` 的 complexity warning；当前 `[NEXT]` 是 `W15 - Warning cleanup checkpoint`
- 后续只允许推进已排队的 `W15`，完成后若无人追加 queue item，必须重新停回“当前没有可自动执行的 `[NEXT]`”

## 2. 当前基线

- **Lint 基线**: `0 errors / 91 warnings`
- **当前热点**:
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `tests/unit/core/opencode/OpenCodeService.test.ts`
  - `src/features/settings/ModelConfigModal.ts`
  - `src/core/storage/StorageService.ts`
  - `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
  - `src/features/chat/services/BackgroundTaskTimelineService.ts`（仅剩文件级 `max-lines`）
  - `src/main.ts`（仅剩文件级 `max-lines`）
- **已完成历史摘要**: 见 `docs/status/maintainability-completed-batches.md`

## 3. 当前批次结论（W6-W15）

当前 warning-cleanup 主批次仍不恢复 `R33+`。`W6-W12` 已完成，且当前受控小批次余下 `W13-W15`：

1. **W6 `ModelConfigModal` render trim**：收掉 `renderEditor` / `renderModelCard` 的 3 条 warning，lint 基线 `103 -> 100`
2. **W7 `main.ts` loadSettings trim**：收掉 `loadSettings` 的 2 条 warning，lint 基线 `100 -> 98`
3. **W8 `OpenCodianView` sync complexity trim**：收掉三处消息同步复杂度 warning，lint 基线 `98 -> 95`
4. **W9 checkpoint**：确认 `W6-W8` 的 8-warning 收益；建议下一批继续受控 warning cleanup
5. **W10 `ToolCallRenderer` summary complexity trim**：已通过同文件内 summary resolver dispatch 收掉 `defaultGetToolSummary` 的 `complexity` warning，lint 基线 `95 -> 94`，并保持 MCP summary、`custom` 工具行为与顶层输入字段规则不变
6. **W11 route checkpoint**：已复盘 `W10` 的 warning 收益，并确认 `W12-W15` 继续沿受控 warning cleanup 小批次推进，不恢复 `R33+`
7. **W12 `StorageService` theme background mime trim**：已在 `StorageService` 现有 owner 内通过 hint / SVG sniff / binary signature / extension fallback 的同文件私有 helper 收掉 `detectThemeBackgroundMimeType` 的 `complexity` warning，lint 基线 `94 -> 93`，同时保持 theme background MIME detection、持久化语义与 fallback 顺序不变
8. **W13 `OpenCodeMessageNormalizationMapper` complexity trim**：已在 mapper 现有 owner 内通过文本归一化、tool block 构建与 OMO 内容归一化 helper 收掉 `openCodeMessageToChatMessage` 的 `complexity` warning，lint 基线 `93 -> 92`，并保持 OMO compatibility、context attachment 提取与 message normalization 输出语义不变
9. **W14 `BackgroundTaskTimelineService` collectSegments trim**：已在 service 现有 owner 内通过 segment collection、tool launch collection、completion reminder matching、runtime merge 与 finalize helper 收掉 `collectSegments` 的 `complexity` warning，lint 基线 `92 -> 91`，并保持 background-task timeline / hydration / suppression 语义不变
10. **W15 checkpoint**：当前 `[NEXT]`，复盘 `W12-W14` 的 warning 收益，并在完成后再次停回人工确认态

## 4. 长期边界

- 不为清 warning 新增薄 facade / adapter / provider / factory 文件
- 优先在现有 owner 内做参数收束、局部 helper、guard clause 或测试结构整理
- `OpenCodianView`、`OpenCodianSettings`、`OpenCodeService` 的大型 owner 拆分仍需人工确认，不因 warning cleanup 自动触发
- `ConversationRenderService` trailing-assistant helper 链继续保持降优先级；除非正确性、测试或构建直接阻塞，否则不作为默认切口

## 5. 何时恢复 maintainability 重构

只有满足以下任一条件，才考虑恢复 `R33+`：

- 当前 warning cleanup 再继续已明显进入低收益区
- 某个剩余 hotspot 已形成清晰、较厚的 owner 收束机会
- 人工明确要求从 warning cleanup 切回 maintainability 提升

## 6. 阅读顺序

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. `docs/status/maintainability-round-roadmap.md`
4. 最近的 `docs/status/maintainability-phase-XXX.md`
5. 如需历史上下文，再读 `docs/status/maintainability-completed-batches.md`

# Maintainability Master Plan

> **状态**: [REVIEW_REQUIRED]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R33-R37` maintainability queue 已完成；`R37` 已复盘 `R33-R36` 的 owner 收束收益、验证成本与后续方向。当前没有可自动执行的 `[NEXT]`，如需继续必须由人工追加新的 queue item 并重新确认路线。

## 1. 当前判断

**当前判断：R28-R32、L1-L5、W1-W15 与 R33-R37 均已完成。最近一批较厚 maintainability owner 收束已经落地：`OpenCodianSettings` 的 style/background subsection lifecycle 已迁入 `SettingsStyleBackgroundSection`，`SettingsModelCatalogPresenter` 的 render lifecycle 已在同 owner 内完成分段收束，`OpenCodianView` constructor/runtime wiring 已收束为同文件 lifecycle helpers，`OpenCodeService` 的 directory-scoped config/tool-catalog residual seam 也已迁入 `OpenCodeCatalogQueryCoordinator`。本轮 checkpoint 之后，autopilot 已重新停回等待人工确认态；当前 live lint 输出为 `2 errors / 89 warnings`，其中两条 error 都是 R36 相关文件中的 import sort 回归，`npm test` 与 `npm run build` 仍保持通过。**

当前最重要的事实：

- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 仍是长期 maintainability 热点，但 `R33-R36` 已分别削弱 settings subsection、settings presenter、chat constructor wiring 与 opencode catalog seam 的 ownership 集中度
- 当前 live lint 基线是 `2 errors / 89 warnings`；新增 error 来自 `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts` 与 `src/core/opencode/OpenCodeService.ts` 的 import order，说明下一批如果恢复自动推进，需先人工确认是否把 lint housekeeping 单列成受控 queue
- 当前没有可自动执行的 `[NEXT]`；在人工追加新 queue 之前，不得自动扩展 `R38+` 或回切 `W16+`
- 新增 owner 仍必须足够厚：覆盖完整 lifecycle / section / runtime seam；不要新增只包一层的 provider / factory / adapter
- 下一步建议是先人工确认：是先修复 lint 基线中的 import-sort 回归，还是重新设计新的厚 owner 收束批次

## 2. 当前基线

- **Lint 基线**: `2 errors / 89 warnings`
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

当前 warning-cleanup 主批次已在 `W15` checkpoint 处完成并重新暂停，不恢复 `R33+`。`W6-W15` 的结论如下：

1. **W6 `ModelConfigModal` render trim**：收掉 `renderEditor` / `renderModelCard` 的 3 条 warning，lint 基线 `103 -> 100`
2. **W7 `main.ts` loadSettings trim**：收掉 `loadSettings` 的 2 条 warning，lint 基线 `100 -> 98`
3. **W8 `OpenCodianView` sync complexity trim**：收掉三处消息同步复杂度 warning，lint 基线 `98 -> 95`
4. **W9 checkpoint**：确认 `W6-W8` 的 8-warning 收益；建议下一批继续受控 warning cleanup
5. **W10 `ToolCallRenderer` summary complexity trim**：已通过同文件内 summary resolver dispatch 收掉 `defaultGetToolSummary` 的 `complexity` warning，lint 基线 `95 -> 94`，并保持 MCP summary、`custom` 工具行为与顶层输入字段规则不变
6. **W11 route checkpoint**：已复盘 `W10` 的 warning 收益，并确认 `W12-W15` 继续沿受控 warning cleanup 小批次推进，不恢复 `R33+`
7. **W12 `StorageService` theme background mime trim**：已在 `StorageService` 现有 owner 内通过 hint / SVG sniff / binary signature / extension fallback 的同文件私有 helper 收掉 `detectThemeBackgroundMimeType` 的 `complexity` warning，lint 基线 `94 -> 93`，同时保持 theme background MIME detection、持久化语义与 fallback 顺序不变
8. **W13 `OpenCodeMessageNormalizationMapper` complexity trim**：已在 mapper 现有 owner 内通过文本归一化、tool block 构建与 OMO 内容归一化 helper 收掉 `openCodeMessageToChatMessage` 的 `complexity` warning，lint 基线 `93 -> 92`，并保持 OMO compatibility、context attachment 提取与 message normalization 输出语义不变
9. **W14 `BackgroundTaskTimelineService` collectSegments trim**：已在 service 现有 owner 内通过 segment collection、tool launch collection、completion reminder matching、runtime merge 与 finalize helper 收掉 `collectSegments` 的 `complexity` warning，lint 基线 `92 -> 91`，并保持 background-task timeline / hydration / suppression 语义不变
10. **W15 checkpoint**：已复盘 `W12-W14` 的 warning 收益，确认 `StorageService`、`OpenCodeMessageNormalizationMapper` 与 `BackgroundTaskTimelineService` 各收掉 1 条 warning，使 lint 基线稳定在 `0 errors / 91 warnings`；当前没有后续 `[QUEUED]`，自动推进已停回人工确认态

## 4. 长期边界

- 不为清 warning 新增薄 facade / adapter / provider / factory 文件
- 优先在现有 owner 内做参数收束、局部 helper、guard clause 或测试结构整理
- `OpenCodianView`、`OpenCodianSettings`、`OpenCodeService` 的大型 owner 拆分仍需人工确认，不因 warning cleanup 自动触发
- `ConversationRenderService` trailing-assistant helper 链继续保持降优先级；除非正确性、测试或构建直接阻塞，否则不作为默认切口

## 5. R33-R37 执行边界

本批已满足恢复 `R33+` 的条件：warning cleanup 继续推进已进入低收益区，且人工明确要求切回 maintainability 提升。执行边界如下：

- 每轮只执行当前 `[NEXT]`，不得自由切回 warning cleanup 或新增 `W16+`
- `OpenCodianSettings` 的 settings UI 变化必须同步默认值 / normalization / locale / style / tests 中直接相关部分
- `OpenCodianView` constructor/runtime wiring 只能收束初始化与 service wiring，不改 streaming/concurrent tab 语义
- `OpenCodeService` 的 R36 已通过 `OpenCodeCatalogQueryCoordinator` 收束 directory-scoped config/tool-catalog seam；`R37` 只做 checkpoint 复盘，没有继续自动扩展新的 `OpenCodeService` 拆分
- `R37` checkpoint 已完成；是否继续 `R38+`、是否先处理 lint import-sort 回归，均由下一次人工确认决定

## 6. 阅读顺序

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. `docs/status/maintainability-round-roadmap.md`
4. 最近的 `docs/status/maintainability-phase-XXX.md`
5. 如需历史上下文，再读 `docs/status/maintainability-completed-batches.md`

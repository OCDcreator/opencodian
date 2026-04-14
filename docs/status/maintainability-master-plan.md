# Maintainability Master Plan

> **状态**: [CONFIRMED_NEXT_BATCH]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: 文档已做人工压缩归档；当前可自动执行的 `[NEXT]` 是 `W7 - main.ts loadSettings trim`。本批只继续受控 warning cleanup，不自动恢复 `R33+` maintainability queue。

## 1. 当前判断

**当前判断：R28-R32、L1-L5 与 W1-W6 均已完成，文档主入口已压缩。仓库当前 lint 基线是 `0 errors / 100 warnings`；后续应继续一小批受控 warning cleanup，优先清理仍能在现有 owner 内稳定收束的热点，再决定是否恢复新的 maintainability 重构。**

当前最重要的事实：

- `OpenCodeService`、`OpenCodianView`、`OpenCodianSettings` 仍是长期 maintainability 热点，但是否继续 owner 收束仍需人工判断
- 剩余 warnings 主要集中在大型 owner 与长测试文件的 `max-lines-per-function` / `max-lines` / `complexity` / `max-params`
- 这意味着后续 autopilot 仍应优先做“受控小批次”，而不是自动切回大规模结构重构

## 2. 当前基线

- **Lint 基线**: `0 errors / 100 warnings`
- **当前热点**:
  - `src/main.ts`
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `tests/unit/core/opencode/OpenCodeService.test.ts`
  - `src/features/settings/ModelConfigModal.ts`
- **已完成历史摘要**: 见 `docs/status/maintainability-completed-batches.md`

## 3. 当前批次（W7-W9）

本批只做 warning cleanup，不恢复 `R33+`。`W6` 已完成并把 lint 基线从 `103` 收敛到 `100` warnings，当前继续推进剩余 queue：

1. **W7 `main.ts` loadSettings trim**：只处理 `loadSettings` 的长度与复杂度热点
2. **W8 `OpenCodianView` sync complexity trim**：只处理三处消息同步相关复杂度热点
3. **W9 checkpoint**：复盘 `W6-W8` 的 warning 收益，并决定下一批是继续 warning cleanup，还是恢复新的 maintainability queue

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

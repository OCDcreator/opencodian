# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [CONFIRMED_NEXT_BATCH] 文档压缩已完成；当前可自动执行的 `[NEXT]` 是 `W8 - OpenCodianView sync complexity trim`。

## 当前优先级

- **当前 `[NEXT]`**：`W8 - OpenCodianView sync complexity trim`
- **本批目标**：继续受控 warning cleanup，优先处理现有 owner 内可稳定收束的长度 / 复杂度热点
- **当前 lint 基线**：`0 errors / 98 warnings`
- **本批热点顺序**：
  1. `src/features/chat/OpenCodianView.ts`
  2. `src/main.ts`（本批只观察剩余文件级 `max-lines`）
- **观察但暂不自动切入**：`src/features/settings/OpenCodianSettings.ts`、`tests/unit/core/opencode/OpenCodeService.test.ts`

## 本批边界

- 不自动恢复 `R33+` maintainability queue
- 不新增薄 helper / adapter / factory 文件
- 允许在现有 owner 内做局部 helper、guard clause、参数收束、条件分支整理
- 如遇到必须扩大为 owner 拆分的大改动，立即停止并在 phase 文档里说明原因

## 回归观察点

- `OpenCodianView`：消息同步、hydration、send pipeline 相关行为
- `main.ts`：settings 加载、初始化顺序、conversation preload 行为
- settings 相关 owner：`ModelConfigModal` 已完成 W6 render trim；不要把 model catalog / section lifecycle 已迁出的责任搬回主类
- `OpenCodeService`：保持 SDK-first / legacy fallback 与 scoped-directory 兼容语义不变

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近 checkpoint：`docs/status/maintainability-phase-357.md`

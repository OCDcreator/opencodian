# BatchOrganizeCoordinator

> **源码**: `src/app/batchOrganize/BatchOrganizeCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`app.batch-organize` owner 的运行时协调器（`main.ts` 仅构造，不 dispose 持有资源）。职责：把模板 + 用户参数编译为真实预览（基于 metadataCache 与 `vault.cachedRead` 的当前库状态，含文件数与具体清单）；执行前重算计划并与用户确认的签名比对（**stale-plan 规则：漂移即零写入拒绝**）；强制 R-B3 快照（`beginBatchCapture` 对全部受影响文件预捕获，无回合预算；快照层不可用/被禁用时拒绝执行）；写操作只经 `app.fileManager.renameFile`（引用自动更新）与 `app.fileManager.processFrontMatter`（YAML 格式与属性类型保持）；逐操作目标占用复检，绝不覆盖。

## 关键导出

| 导出 | 说明 |
|------|------|
| `buildPreview(template)` | 从当前库状态计算预览（计划 + 冲突 + `matchedCount` + 签名）；无写入 |
| `execute(template, confirmedSignature)` | fail-closed 握手：stale-plan / empty / snapshot-unavailable 三种零写入出口；成功路径 = 快照 → 逐操作执行 → `endBatchCapture` → 立即可回退 |
| `revertLastBatch()` / `hasLastBatch()` / `getLastBatchId()` | 一键回退最近一次批量（R-B3 `revertAll`，合成会话 id `batch-organize-…`） |

## 边界与约束

- 通过 `EditRevertServicePort`（core.types）消费 R-B3，不直接 import `core.storage`；批量回合不影响并发聊天回合的归属。
- 单一批量任务只做一类操作（移动 / 改属性 / 重命名）；移动条目 `status:'moved'` 记录 `movedTo`，回退 = 经 `renameFile` 改回（引用一并还原）。
- 逐操作失败如实进入 `failures` 并继续其余操作（快照仍在，状态诚实）；快照与回退契约测试见 `tests/unit/app/batchOrganize/**` 与 `tests/unit/core/storage/EditRevertService.batch.test.ts`。

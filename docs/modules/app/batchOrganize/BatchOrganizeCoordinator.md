# BatchOrganizeCoordinator

> **源码**: `src/app/batchOrganize/BatchOrganizeCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`app.batch-organize` owner 的运行时协调器（`main.ts` 仅构造，不 dispose 持有资源）。职责：把模板 + 用户参数编译为真实预览（基于 metadataCache 与 `vault.cachedRead` 的当前库状态，含文件数与具体清单）；执行前重算计划并与用户确认的签名比对（**stale-plan 规则：漂移即零写入拒绝**）；强制 R-B3 快照（`beginBatchCapture` 对全部受影响文件预捕获，无回合预算；快照层不可用/被禁用时拒绝执行）；写操作只经 `app.fileManager.renameFile`（引用自动更新）与 `app.fileManager.processFrontMatter`（YAML 格式与属性类型保持）；逐操作目标占用复检，绝不覆盖。

## 关键导出

| 导出 | 说明 |
|------|------|
| `buildPreview(template)` | 从当前库状态计算预览（计划 + 冲突 + `matchedCount` + 签名 + `foldersToCreate` 将新建目录清单）；无写入 |
| `execute(template, confirmedSignature)` | fail-closed 握手：stale-plan / empty / snapshot-unavailable / **folder-unavailable** 四种零写入出口；成功路径 = 快照 → 确保目标目录存在 → 逐操作执行 → `endBatchCapture` → 立即可回退 |
| `revertLastBatch()` / `hasLastBatch()` / `getLastBatchId()` | 一键回退最近一次批量（R-B3 `revertAll`，合成会话 id `batch-organize-…`），随后清理本批次创建且现已为空的目录 |

## 边界与约束

- 通过 `EditRevertServicePort`（core.types）消费 R-B3，不直接 import `core.storage`；批量回合不影响并发聊天回合的归属。
- 单一批量任务只做一类操作（移动 / 改属性 / 重命名）；移动条目 `status:'moved'` 记录 `movedTo`，回退 = 经 `renameFile` 改回（引用一并还原）。
- **目标目录（R-B5-D1）**：`FileManager.renameFile` 不创建父目录——执行在快照门之后、首个写操作之前逐一确保目标目录存在（`vault.createFolder`，按父先子后的确定性排序幂等创建）；任一目录创建失败即 fail-closed（回滚刚创建的目录、返回 `folder-unavailable`，UI 显式提示，零写入）。预览如实列出"将新建目录"；回退后移除本批次创建且现已为空的目录（最深优先，`adapter.list` 空判定，**绝不删除非空目录/用户内容**），库形态恢复到操作前；全部操作失败（changed=0）时立即清理刚建目录。目录存在性不参与 stale-plan 签名（建目录幂等，用户中途自建的目标目录会被直接采用）。
- `edit-properties`（目标即源文件所在目录）与 `rename-by-rule`（同目录重命名）不涉及目标目录创建；二者失败同样经 `failures` 如实上报。
- 逐操作失败如实进入 `failures` 并继续其余操作（快照仍在，状态诚实）；快照与回退契约测试见 `tests/unit/app/batchOrganize/**` 与 `tests/unit/core/storage/EditRevertService.batch.test.ts`。

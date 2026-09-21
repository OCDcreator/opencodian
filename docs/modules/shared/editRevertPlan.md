# editRevertPlan

> **源码**: `src/shared/editRevertPlan.ts`
> **状态**: [REVIEW]

## 概述

`EditRevertPlan` 是 R-B3 编辑回退的**纯规划核心**（shared.foundation owner）：全部逻辑确定性、不依赖 Obsidian，可直接单测。有状态的 vault 侧 owner 是 `src/core/storage/EditRevertService.ts`；本模块持有它消费的规则与数据模型。

## 导入关系

```text
上游: 无（零依赖纯模块）
下游: src/core/storage/EditRevertService.ts, src/core/storage/EditRevertVaultWriteback.ts, src/core/types/editRevert.ts, src/shared/index.ts, src/features/chat/ui/ModifiedFilesSidebar.ts（视图模型类型）
```

## 常量（硬约束的数值载体）

| 常量 | 值 | 含义 |
|------|----|------|
| `EDIT_REVERT_SNAPSHOT_BUDGET_MS` | 200 | 回合开始预快照墙钟预算，超时降级 |
| `EDIT_REVERT_MAX_SNAPSHOT_BYTES` | 2 MiB | 单文件快照上限，超限标"未纳入回退" |
| `EDIT_REVERT_MAX_ROUNDS_TOTAL` | 30 | 全局 round 保留上限 |
| `EDIT_REVERT_MAX_ROUNDS_PER_CONVERSATION` | 10 | 每会话 round 上限 |
| `EDIT_REVERT_IDLE_CACHE_MAX_FILES/BYTES` | 64 / 8 MiB | 空闲内容缓存上限 |
| `EDIT_REVERT_POST_TURN_GRACE_MS` | 10 min | 回合结束后写入仍归属该轮的宽限窗 |
| `EDIT_REVERT_POST_BASELINE_BUDGET_MS` | 500 | 回合结束 post baseline 冻结的墙钟预算；超预算的剩余 active 条目标 `postImageUnavailable`（R-F3 质量修复） |

## R-B5 增量

- `EditRevertFileStatus` 新增 `'moved'`（插件发起的移动/重命名条目：内容未变，回退 = 经 `fileManager.renameFile` 改回并还原引用，不需要内容 pre-image）；`EditRevertFileEntry` 新增 `movedTo?: string`；`EditRevertSidebarEntry` 新增 `movedTo: string | null`。
- `isEntryRevertible`：`'moved'` 条目在 `movedTo` 存在即可回退（无需 pre-image）；`isEntryRestorable`：`'moved'` 条目 revert 后可对称恢复。
- `EditRevertEntrySource` 新增 `'plugin'`（插件发起批量的显式登记来源）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `isMarkdownPath(path)` | 快照范围只覆盖 Markdown 文本文件 |
| `isRevertibleTextPath(path)` | markdown **+ `.canvas`**（文本 JSON，预像可快照/恢复）；仅用于批次捕获与插件写记录（R-C5）。vault 事件漏斗、引用改写、二进制排除仍用 `isMarkdownPath` |
| `classifyWriteTool(toolName)` | 把四后端工具名分类为 `structured` / `shell` / `null`（大小写不敏感、`str_replace*` 前缀容错） |
| `extractWriteToolTargets(toolName, input)` | 从写工具声明提取目标路径：结构化字段（`file_path`/`path`/…）、apply_patch / unified-diff 文本、shell 重定向（只认字面 `.md` 目标，忽略变量与 `/dev`） |
| `parseApplyPatchPaths` / `parseShellRedirectionTargets` | 上述两条路径的独立解析器 |
| `extractCandidatePathsFromPrompt(text)` | 预算化预快照的候选集：wikilink / markdown 链接 / 裸 `*.md` token（排除 URL、协议相对 leftover、非 markdown） |
| `planRoundEvictions(rounds, limits)` | 保留规划：先每会话溢出，再全局条数，再全局字节；总是最旧先淘汰 |
| `computeRoundBytes` / `computeBlobRefCounts` | 内容寻址字节核算（round 内去重）与 blob 引用计数 |
| `countTextLines` | R-F3 预览纯行数语义：空内容为 0；末尾换行不额外算空行 |
| `isEntryRevertible` / `isEntryRestorable` | 条目可回退 / 可恢复判定（fail-closed） |
| `buildSidebarModel(round, enabled, now)` | 侧栏视图模型推导：`revertible`、`restorable`、`excludedReason`（`oversize` / `no-preimage`）、`roundOpen`、`degraded`、`revertibleCount` |
| 数据类型 | `EditRevertFileEntry` / `EditRevertRoundMeta` / `EditRevertSidebarModel` / `EditRevertActionResult` 等 |

## 数据模型要点

- `EditRevertFileEntry.status`：`modified` / `created` / `deleted`；`created` 语义为"回合内新建"，回退 = 进回收站。
- `EditRevertFileEntry.state`：`active` / `reverted`；`reverted` 条目靠 `restoreHash` 支持恢复回退。
- `EditRevertSidebarEntry.excludedReason` 只对**未回退且不可回退**的条目给出（回退条目不标"未纳入"，这是 UI 诚实性契约）。
- R-F3：`EditRevertFileEntry` 额外保存冻结后的 `postImageHash/postImageBytes`，或 `postImageMissing/postImageUnavailable`；这些是 preview/conflict 元数据，不改变 pre-image 回退写语义。`EditRevertPreviewRow` 的 before/after 行数允许为 `null`，以保留二进制/超限/读取失败的诚实边界；任何无 post baseline 条目必须由 service 标为 conflict。

## 注意事项

- 本模块是纯函数层：不得引入 obsidian / node API 依赖（`EditRevertStore` 的 sha256 在 storage 层）。
- 修改工具分类或路径解析时，先跑 `tests/unit/shared/editRevertPlan.test.ts`（四后端工具面已逐一固化）。
- 侧栏模型字段被 `ModifiedFilesSidebar` 的 R-B3 区块直接消费，改动需同步样式与 locale 文案。

## R-C2 扩展

2026-09-18 `EditRevertFileEntry` 新增可选 `binaryAsset?: boolean`（插件生成的二进制资产标记：无文本快照、回退=trash、restore 构造性不可用）。`isEntryRevertible`/`buildSidebarModel` 无需特判（created 条目本就可回退）。

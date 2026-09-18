# EditRevertVaultWriteback

> **源码**: `src/core/storage/EditRevertVaultWriteback.ts`
> **状态**: [REVIEW]

## 概述

`EditRevertVaultWriteback` 是 R-B3 回退操作的**唯一** vault 写缝（destructive-write seam）。单文件回退、整轮回退、恢复回退的所有文件写回都必须经过这里；隔离成独立类是为了让"破坏性写"的审计面最小。三条硬规则：

1. 每次写都走 Obsidian vault API —— `vault.process()`（已有文件，保持原子性）/ `vault.create()`（文件消失时重建）/ `vault.trash()`（回合内新建文件的回退进回收站，绝不物理删除）—— 绝不绕过 vault API 直接写文件系统。
2. 每次写之前先把回退前的当前内容存为 `restoreHash` blob（回退可再撤销的依据）。
3. 每次写都布防 self-write guard（5 秒窗口），让 `EditRevertService` 的 vault 事件漏斗吞掉回退自身触发的事件，不把回退误记为新的 agent 编辑。

## 导入关系

```text
上游: obsidian(App/normalizePath/TFile), src/core/storage/EditRevertStore.ts, src/core/types
下游: src/core/storage/EditRevertService.ts（唯一调用方）
```

## 对外 API

```typescript
class EditRevertVaultWriteback {
  constructor(app: App, store: EditRevertStore, now: () => number);
  captureCurrentContent(path): Promise<StoredImage | null>;  // 读当前内容并存 blob
  applyRevert(entry): Promise<EditRevertActionResult>;
  applyRestore(entry): Promise<EditRevertActionResult>;
  consumeSelfWrite(path, now): boolean;                      // service 的事件漏斗调用
}
```

## 核心逻辑

### applyRevert（按条目状态分流）

- `status === 'created'`：先捕获当前内容为 restore blob，再 `vault.trash(file, false)` 进 Obsidian 回收站；文件缺失时如实返回 `file-missing` 失败。
- `modified` / `deleted`：读 `preImageHash` blob 内容（缺失返回 `preimage-blob-missing`），捕获当前内容为 restore blob，然后 `vault.process()` 写回 pre-image；文件已不存在时用 `vault.create()` 重建（`deleted` 回退的恢复路径）。

### applyRestore（恢复回退）

读 `restoreHash` blob 写回（文件不在则 `vault.create` 重建——覆盖"新建文件被回退进回收站后恢复"），成功后条目回到 `active`。

## 注意事项

- 失败信息写入条目的 `lastError` 并随 `EditRevertActionResult.error` 返回，UI 以 notice 如实呈现；不静默降级、不部分应用。
- 修改本类时必须保持"写前捕获 restore blob"的顺序，否则回退将不可撤销（R-B3 验收标准 5）。

## R-B5 扩展：moved 条目与 renameFile 写回

- `applyRevert` 对 `status:'moved'` 条目走新分支：经 `app.fileManager.renameFile(movedTo → path)` 改回原路径（renameFile 会同步还原 Obsidian 在移动时改写的引用，内容不变故无需 pre-image blob）；`applyRestore` 对称地再次前移（`path → movedTo`），实现"回退可再撤销"。
- 新增 `renameVaultFile` 私有写路径：源不存在（`file-missing`）或目标已占用（`target-exists`）一律拒绝——**绝不覆盖**。
- 该路径仅供 R-B3/R-B5 的回退/恢复使用；批量执行期间的首次移动不走这里（批量协调器直接调 `fileManager.renameFile` 并以 `notePluginMove` 登记）。

## R-C2 扩展：binaryAsset 条目

2026-09-18 `applyRevert` 的 created 分支对 `entry.binaryAsset === true` 的条目（图片生成资产）**跳过** `captureCurrentContent`：不产生任何文本误读快照，`restoreHash` 保持未设置 → restore 如实不可用；回退仍为纯 `vault.trash`。

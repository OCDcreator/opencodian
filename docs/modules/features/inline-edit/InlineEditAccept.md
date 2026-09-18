# InlineEditAccept

> **源码**: `src/features/inline-edit/InlineEditAccept.ts`
> **状态**: [REVIEW]

## 概述

单个行内编辑「接受」路径的实现（docs/requirements/inline-edit.md §7.5 + flowtext-parity R-A5/R-A6），从 `InlineEditController` 抽出以守住控制器行数上限。写契约全部落在此文件：

- 按 `editId` 读该编辑自己的装饰范围，与**该编辑自己的快照**全等比对——兄弟编辑既无法移动这次比对，也不会被它误伤（R-A5 脏检查互不误伤，契约测试显式锁定）；
- 快照不一致 → 提示「生成期间笔记已被修改」并**只拒绝该编辑**；
- 整篇形态在接受前必须二次确认，取消则无任何写入（R-A6，无 confirmer 时 fail closed 不写入）；
- 接受文本经**单次** `editor.replaceRange` 落盘——Obsidian undo 栈视为一步，整篇编辑也可一步 Ctrl+Z 恢复。

## 公开接口

```typescript
interface InlineEditAcceptEdit { editId; anchor; editorView; editor; preview }
interface InlineEditAcceptDeps {
  notify(message): void;
  confirmDocumentReplace?(info: { notePath; charCount }): Promise<boolean>;
  isCurrent(edit): boolean;      // await 之后确认编辑仍存活
  closeEdit(editId): Promise<void>;
  rejectEdit(editId): void;
}
executeInlineEditAccept(edit, deps): Promise<void>
```

## 依赖

- `./InlineEditWidgets`（`readInlineEditRange`）、`./InlineEditService`（`canApplyEdit`）、`./InlineEditPrompt`（`normalizeInsertionText`）

## 维护约束

- 任何新增写路径都必须保持「单次 replaceRange 覆盖请求范围」的语义；分块/多次写入会破坏单步撤销与脏检查。
- await 之后必须经 `deps.isCurrent` 复核编辑存活（确认弹窗是异步的，期间编辑可能被关闭）。

## R-C2 扩展

2026-09-18 W-ref 失败语义：`InlineEditAcceptEdit` 新增 `pendingImageAssetPath` 与 `preserveWhitespace`。脏检查失败或 `replaceRange` 抛错时：携带资产路径的编辑**保留资产**并以 Notice 报告实际路径（不静默丢弃、不自动清理）；成功路径在 closeEdit 前接管（清空）`pendingImageAssetPath`，使 teardown 不误删已引用资产。`preserveWhitespace` 为 true 时跳过 `normalizeInsertionText`（独占一行形态的空行填充是特性行为）。非图像编辑的 replaceRange 抛错也改为可见的 `inlineEdit.error.applyFailed`（原为未处理 rejection）。

# InlineEditAttachments
> 2026-09-18 (R-B2): adds `attachContextGroupToEdit` (planned via `planContextGroupAttach` with the remaining per-edit cap room; existing entries dedupe), `buildContextGroupAttachNotices` (attached/omitted/missing user-facing messages), `attachContextGroupById` (lookup + attach + notify), and `InlineEditAttachmentCoordinator` — the controller-side orchestration (picker open/toggle/drop/group/image plus the edit→adapter view), extracted so `InlineEditController` stays under the file-size gate.

> **源码**: `src/features/inline-edit/InlineEditAttachments.ts`
> **状态**: [REVIEW]

## 概述

单个行内编辑的附加上下文与图片附件管理，从 `InlineEditController` 抽出（R-A4 / R-A7）。控制器以 `attachmentEdit()` 适配视图委托给本模块，状态机本身不在这层。

两条规则住在这里：

- 上限语义（R-A7）：每个条目——文件或目录——各计 1（`INLINE_EDIT_MAX_ATTACHED_NOTES`），超限**提示不静默截断**；
- 图片 fail-closed（R-A4）：超大/类型不符/超张数的图片一律带原因拒绝，文件只读进内存，永不落 vault。

## 公开接口

```typescript
interface InlineEditAttachmentEdit {
  contextFiles; image; hasSession; rerender(): void; refreshPicker(): void;
}
contextPickerCandidates(edit, host): readonly InlineEditContextFile[] | null
toggleContextEntry(edit, host, path): void
attachContextEntryToEdit(edit, host, entry): void   // R-A7 拖拽入口
attachImageToEdit(edit, host, files): Promise<void> // R-A4 粘贴/拖拽
removeImageFromEdit(edit): void
inlineEditImageChipModel(image): InlineEditImageChipModel
```

## 依赖

- `obsidian`（仅类型/图标无关）、`./InlineEditPrompt`（上限常量）、`./InlineEditImageChip`

## 维护约束

- 目录条目与文件条目同规则：路径 ≤500 字符、不含 `<>`（构建器侧 fail-closed 兜底，见 `InlineEditPrompt`）。

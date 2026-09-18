# InlineEditConfirmModal

> **源码**: `src/features/inline-edit/InlineEditConfirmModal.ts`
> **状态**: [REVIEW]

## 概述

整篇行内编辑接受前的**二次确认**弹窗（flowtext-parity R-A6 验收 6）。整篇替换几乎必然触发 diff 降级视图（词级 LCS 预算覆盖不了整篇），审阅体验弱于选区形态，所以单次 `replaceRange` 写入之前由本弹窗把关：取消 = 无任何写入，预览保留（用户仍可拒绝）；只有显式点击「替换整篇」才 resolve `true`。`main.ts` 在构造控制器时把本模块接入 `confirmDocumentReplace`；控制器侧无 confirmer 时 fail closed（不写入）。

## 公开接口

```typescript
confirmInlineEditDocumentReplace(app, { notePath, charCount }): Promise<boolean>
```

## 依赖

- `obsidian`（Modal / Setting）、`../../i18n`

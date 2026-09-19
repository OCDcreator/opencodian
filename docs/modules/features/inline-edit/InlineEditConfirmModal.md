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

## 样式合同（R-A6，2026-09-18）

`modal.modalEl` 挂 `opencodian-inline-edit-confirm-modal` 弹窗级类：确认按钮是 `Setting().addButton(...)` 的产物、与消息 div 互为兄弟，破坏性按钮对比度契约（`setWarning()` 实测 4.22:1 → 加深 rose + 浅标签 ~7.3:1）必须经弹窗级类命中，规则在 `src/style/modals/inline-edit-confirm-modal.css`（详见该样式模块文档的对比度契约段）。
